import { describe, expect, it } from "vitest";
import { createActionItemService } from "../src/services/action-item-service.js";

const orgA = "507f1f77bcf86cd799439002";
const orgB = "507f1f77bcf86cd799439003";
const topicId = "507f1f77bcf86cd799439011";
const itemId = "507f191e810c19729de860ea";

function harness() {
  const topics = [{ id: topicId, organizationId: orgA }];
  const items = [];
  const topicRepository = {
    async findById(organizationId, id) {
      return topics.find((topic) =>
        topic.organizationId === organizationId && topic.id === id) ?? null;
    },
  };
  const actionItemRepository = {
    async create(organizationId, input) {
      const item = {
        id: itemId, organizationId, status: "open", assigneeUserId: undefined, ...input,
      };
      items.push(item);
      return { ...item };
    },
    async listByTopic(organizationId, id) {
      return items.filter((item) =>
        item.organizationId === organizationId && item.topicId === id);
    },
    async findById(organizationId, id) {
      const item = items.find((candidate) =>
        candidate.organizationId === organizationId && candidate.id === id);
      return item ? { ...item } : null;
    },
    async updatePriority(organizationId, id, priority, rationale) {
      const item = items.find((candidate) =>
        candidate.organizationId === organizationId && candidate.id === id);
      if (!item) return null;
      if (priority !== undefined) item.priority = priority;
      if (rationale !== undefined) item.rationale = rationale;
      return { ...item };
    },
    async claim(organizationId, id, userId, claimedAt) {
      // No await before compare-and-set: mirrors one atomic findOneAndUpdate.
      const item = items.find((candidate) =>
        candidate.organizationId === organizationId &&
        candidate.id === id &&
        candidate.assigneeUserId === undefined);
      if (!item) return null;
      item.assigneeUserId = userId;
      item.claimedAt = claimedAt;
      return { ...item };
    },
    async unclaim(organizationId, id, userId) {
      const item = items.find((candidate) =>
        candidate.organizationId === organizationId &&
        candidate.id === id &&
        candidate.assigneeUserId === userId);
      if (!item) return null;
      delete item.assigneeUserId;
      delete item.claimedAt;
      return { ...item };
    },
    async updateStatus(organizationId, id, currentStatus, status) {
      const item = items.find((candidate) =>
        candidate.organizationId === organizationId &&
        candidate.id === id &&
        candidate.status === currentStatus);
      if (!item) return null;
      item.status = status;
      return { ...item };
    },
    async patch(organizationId, id, currentStatus, updates) {
      const item = items.find((candidate) =>
        candidate.organizationId === organizationId &&
        candidate.id === id &&
        candidate.status === currentStatus);
      if (!item) return null;
      Object.assign(item, updates);
      return { ...item };
    },
  };
  return {
    items,
    service: createActionItemService({ topicRepository, actionItemRepository }),
  };
}

describe("action-item service", () => {
  it("creates manual items with server-owned provenance", async () => {
    const { service } = harness();
    const item = await service.createManual(orgA, topicId, {
      text: "Interview customers",
      priority: "high",
      rationale: "Reduce product risk",
    });
    expect(item).toMatchObject({
      organizationId: orgA,
      topicId,
      provenance: "manual",
      text: "Interview customers",
    });
    expect(item.analysisId).toBeUndefined();
  });

  it("allows only one winner in a concurrent claim race", async () => {
    const { service } = harness();
    await service.createManual(orgA, topicId, { text: "Claim me" });
    const results = await Promise.allSettled([
      service.claim(orgA, itemId, "user-a"),
      service.claim(orgA, itemId, "user-b"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason).toMatchObject({
      status: 409, code: "ACTION_ITEM_ALREADY_CLAIMED",
    });
  });

  it("enforces explicit forward transitions and deliberate reopening", async () => {
    const { service } = harness();
    await service.createManual(orgA, topicId, { text: "Transition me" });
    await expect(service.transition(orgA, itemId, { status: "done" }))
      .rejects.toMatchObject({ status: 409, code: "ACTION_ITEM_TRANSITION_INVALID" });
    await service.transition(orgA, itemId, { status: "in_progress" });
    await service.transition(orgA, itemId, { status: "done" });
    await expect(service.transition(orgA, itemId, { status: "in_progress" }))
      .rejects.toMatchObject({ status: 409, code: "ACTION_ITEM_TRANSITION_INVALID" });
    const reopened = await service.transition(
      orgA, itemId, { status: "in_progress", reopen: true },
    );
    expect(reopened.status).toBe("in_progress");
  });

  it("applies combined patch updates atomically after validating status", async () => {
    const { service, items } = harness();
    await service.createManual(orgA, topicId, {
      text: "Patch me", priority: "low",
    });
    await expect(service.patch(orgA, itemId, {
      priority: "high", status: "done",
    })).rejects.toMatchObject({ code: "ACTION_ITEM_TRANSITION_INVALID" });
    expect(items[0].priority).toBe("low");

    const updated = await service.patch(orgA, itemId, {
      priority: "high",
      rationale: "Now urgent",
      status: "in_progress",
    });
    expect(updated).toMatchObject({
      priority: "high", rationale: "Now urgent", status: "in_progress",
    });
  });

  it("returns 404 rather than exposing cross-tenant items", async () => {
    const { service } = harness();
    await service.createManual(orgA, topicId, { text: "Tenant A only" });
    await expect(service.claim(orgB, itemId, "intruder")).rejects.toMatchObject({
      status: 404, code: "ACTION_ITEM_NOT_FOUND",
    });
  });
});
