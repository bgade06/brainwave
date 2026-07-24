import { describe, expect, it } from "vitest";
import { DeterministicAnalysisProvider } from "../src/providers/analysis-provider.js";
import { createAnalysisService } from "../src/services/analysis-service.js";

const topicId = "507f1f77bcf86cd799439011";
const organizationId = "507f1f77bcf86cd799439002";

function harness({
  provider = new DeterministicAnalysisProvider(),
  timeoutMs,
  failFinalization = false,
} = {}) {
  const topic = {
    _id: topicId,
    title: "Improve onboarding",
    description: "Current flow is confusing",
    goal: "Reduce time to value",
  };
  const ideas = [{ text: "Add a checklist", author: "Sam" }];
  const analyses = [];
  const actionItems = [];
  const service = createAnalysisService({
    topicRepository: {
      async findById(orgId, id) {
        return orgId === organizationId && id === topicId ? topic : null;
      },
    },
    ideaRepository: { async listByTopic() { return ideas; } },
    analysisRepository: {
      async findLatestByFingerprint(orgId, id, fingerprint) {
        return analyses
          .filter((item) => orgId === organizationId &&
            item.topicId === id && item.sourceFingerprint === fingerprint)
          .at(-1) ?? null;
      },
      async nextGeneration() { return analyses.length + 1; },
      async create(orgId, input) {
        expect(orgId).toBe(organizationId);
        const value = { _id: `analysis-${analyses.length + 1}`, ...input };
        analyses.push(value);
        return value;
      },
      async markComplete(orgId, analysisId) {
        expect(orgId).toBe(organizationId);
        if (failFinalization) throw new Error("database unavailable");
        const analysis = analyses.find((item) => item._id === analysisId);
        analysis.status = "complete";
        return analysis;
      },
      async markFailed(orgId, analysisId) {
        expect(orgId).toBe(organizationId);
        const analysis = analyses.find((item) => item._id === analysisId);
        analysis.status = "failed";
      },
    },
    actionItemRepository: {
      async createMany(orgId, inputs) {
        expect(orgId).toBe(organizationId);
        const created = inputs.map((input, index) => ({
          id: `action-${actionItems.length + index + 1}`,
          ...input,
        }));
        actionItems.push(...created);
        return created;
      },
      async listByAnalysis(orgId, analysisId) {
        expect(orgId).toBe(organizationId);
        return actionItems.filter((item) => item.analysisId === analysisId);
      },
      async deleteByAnalysis(orgId, analysisId) {
        expect(orgId).toBe(organizationId);
        const retained = actionItems.filter((item) => item.analysisId !== analysisId);
        actionItems.splice(0, actionItems.length, ...retained);
      },
    },
    provider,
    timeoutMs,
  });
  return { service, provider, topic, ideas, analyses, actionItems };
}

describe("analysis service", () => {
  it("persists a validated immutable snapshot and action-item documents", async () => {
    const { service, analyses, actionItems } = harness();
    const result = await service.analyzeTopic({ organizationId, topicId });

    expect(result).toMatchObject({
      generation: 1,
      cached: false,
      provider: "deterministic",
      model: "deterministic-test-v1",
      promptVersion: "topic-analysis-v1",
      tokenUsage: { input: 11, output: 12, total: 23 },
    });
    expect(result.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(analyses).toHaveLength(1);
    expect(actionItems).toEqual([{
      topicId,
      analysisId: "analysis-1",
      provenance: "ai",
      id: "action-1",
      text: "Schedule a prioritization review",
      priority: "medium",
    }]);
  });

  it("returns the matching snapshot by default and regenerates explicitly", async () => {
    const { service, provider, analyses } = harness();
    const first = await service.analyzeTopic({ organizationId, topicId });
    const cached = await service.analyzeTopic({ organizationId, topicId });
    const regenerated = await service.analyzeTopic({ organizationId, topicId, regenerate: true });

    expect(cached).toMatchObject({ _id: first._id, cached: true, generation: 1 });
    expect(regenerated).toMatchObject({ cached: false, generation: 2 });
    expect(provider.calls).toBe(2);
    expect(analyses).toHaveLength(2);
  });

  it("invalidates the cache when ideas change", async () => {
    const test = harness();
    await test.service.analyzeTopic({ organizationId, topicId });
    test.ideas.push({ text: "Offer templates" });
    const result = await test.service.analyzeTopic({ organizationId, topicId });
    expect(result.cached).toBe(false);
    expect(test.provider.calls).toBe(2);
  });

  it("rejects malformed provider output without persistence", async () => {
    const provider = new DeterministicAnalysisProvider({
      output: {
        themes: ["Theme"],
        suggestions: [],
        actionItems: [{ text: "" }],
        tokenUsage: { input: 1, output: 1 },
      },
    });
    const { service, analyses, actionItems } = harness({ provider });

    await expect(service.analyzeTopic({ organizationId, topicId })).rejects.toMatchObject({
      status: 502,
      code: "AI_INVALID_RESPONSE",
    });
    expect(analyses).toHaveLength(0);
    expect(actionItems).toHaveLength(0);
  });

  it("deduplicates normal concurrent generation and conflicts on regeneration", async () => {
    let release;
    const provider = new DeterministicAnalysisProvider();
    provider.analyze = async () => {
      provider.calls += 1;
      await new Promise((resolve) => { release = resolve; });
      return {
        themes: [], suggestions: [], actionItems: [],
        tokenUsage: { input: 1, output: 1 },
      };
    };
    const { service } = harness({ provider });
    const first = service.analyzeTopic({ organizationId, topicId });
    await new Promise((resolve) => setImmediate(resolve));
    const joined = service.analyzeTopic({ organizationId, topicId });
    await expect(service.analyzeTopic({
      organizationId, topicId, regenerate: true,
    })).rejects.toMatchObject({
      status: 409,
      code: "ANALYSIS_IN_PROGRESS",
    });
    release();
    const [one, two] = await Promise.all([first, joined]);
    expect(two._id).toBe(one._id);
    expect(provider.calls).toBe(1);
  });

  it("returns a stable timeout without persisting", async () => {
    const provider = new DeterministicAnalysisProvider();
    provider.analyze = () => new Promise(() => {});
    const { service, analyses } = harness({ provider, timeoutMs: 5 });
    await expect(service.analyzeTopic({ organizationId, topicId })).rejects.toMatchObject({
      status: 504,
      code: "AI_PROVIDER_TIMEOUT",
    });
    expect(analyses).toHaveLength(0);
  });

  it("removes generated action items when analysis finalization fails", async () => {
    const { service, analyses, actionItems } = harness({ failFinalization: true });
    await expect(service.analyzeTopic({ organizationId, topicId }))
      .rejects.toThrow("database unavailable");
    expect(analyses).toMatchObject([{ status: "failed" }]);
    expect(actionItems).toHaveLength(0);
  });
});
