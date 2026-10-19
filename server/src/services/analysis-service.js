import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import {
  ANALYSIS_PROMPT_VERSION,
  buildAnalysisPrompt,
} from "../lib/prompts.js";
import { providerOutputSchema } from "../providers/analysis-provider.js";

const inFlight = new Map();

function fingerprint({ topic, ideas, promptVersion, model }) {
  const source = {
    title: topic.title,
    description: topic.description ?? "",
    goal: topic.goal ?? "",
    ideas: ideas.map(({ text, author }) => ({ text, author: author ?? "" })),
    promptVersion,
    model,
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

async function publicAnalysis(organizationId, analysis, cached, actionItemRepository) {
  const analysisId = analysis.id ?? analysis._id;
  const actionItems = typeof actionItemRepository.listByAnalysis === "function"
    ? await actionItemRepository.listByAnalysis(organizationId, analysisId)
    : analysis.actionItems.map((text) => ({ text }));
  return { ...analysis, actionItems, cached };
}

export function createAnalysisService({
  topicRepository,
  ideaRepository,
  analysisRepository,
  actionItemRepository,
  provider,
  promptVersion = ANALYSIS_PROMPT_VERSION,
  timeoutMs = 30_000,
}) {
  async function generate({ organizationId, topicId, topic, ideas, sourceFingerprint }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let raw;
    try {
      const providerPromise = provider.analyze({
        topic,
        ideas,
        prompt: buildAnalysisPrompt({ topic, ideas }),
        promptVersion,
        signal: controller.signal,
      });
      const timeoutPromise = new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(
          new AppError(504, "AI_PROVIDER_TIMEOUT", "The AI provider timed out"),
        ), { once: true });
      });
      raw = await Promise.race([providerPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted || error?.name === "AbortError") {
        throw new AppError(504, "AI_PROVIDER_TIMEOUT", "The AI provider timed out");
      }
      throw new AppError(502, "AI_PROVIDER_ERROR", "The AI provider request failed");
    } finally {
      clearTimeout(timeout);
    }

    let output;
    try {
      output = providerOutputSchema.parse(raw);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(
          502,
          "AI_INVALID_RESPONSE",
          "The AI provider returned an invalid response",
        );
      }
      throw error;
    }

    const generation = await analysisRepository.nextGeneration(organizationId, topicId);
    const analysis = await analysisRepository.create(organizationId, {
      topicId,
      themes: output.themes,
      suggestions: output.suggestions,
      actionItems: output.actionItems.map(({ text }) => text),
      provider: provider.name,
      model: provider.model,
      promptVersion,
      sourceFingerprint,
      sourceIdeaCount: ideas.length,
      generation,
      status: "pending",
      tokenUsage: {
        ...output.tokenUsage,
        total: output.tokenUsage.input + output.tokenUsage.output,
      },
    });
    try {
      const actionItems = await actionItemRepository.createMany(
        organizationId,
        output.actionItems.map((item) => ({
          topicId,
      analysisId: analysis.id ?? analysis._id,
      provenance: "ai",
      ...item,
        })),
      );
      const completed = typeof analysisRepository.markComplete === "function"
        ? await analysisRepository.markComplete(
            organizationId,
            analysis.id ?? analysis._id,
          )
        : { ...analysis, status: "complete" };
      return { ...completed, actionItems, cached: false };
    } catch (error) {
      if (typeof actionItemRepository.deleteByAnalysis === "function") {
        await actionItemRepository.deleteByAnalysis(
          organizationId,
          analysis.id ?? analysis._id,
        );
      }
      if (typeof analysisRepository.markFailed === "function") {
        await analysisRepository.markFailed(
          organizationId,
          analysis.id ?? analysis._id,
        );
      }
      throw error;
    }
  }

  return {
    async analyzeTopic({ organizationId, topicId, regenerate = false }) {
      const topic = await topicRepository.findById(organizationId, topicId);
      if (!topic) throw new AppError(404, "TOPIC_NOT_FOUND", "Topic not found");
      const ideas = await ideaRepository.listByTopic(organizationId, topicId);
      const sourceFingerprint = fingerprint({
        topic,
        ideas,
        promptVersion,
        model: provider.model,
      });

      if (!regenerate) {
        const cached = await analysisRepository.findLatestByFingerprint(
          organizationId,
          topicId,
          sourceFingerprint,
        );
        if (cached) {
          return publicAnalysis(organizationId, cached, true, actionItemRepository);
        }
      }

      const key = `${organizationId}:${topicId}:${sourceFingerprint}`;
      if (inFlight.has(key)) {
        if (regenerate) {
          throw new AppError(
            409,
            "ANALYSIS_IN_PROGRESS",
            "Analysis generation is already in progress for this topic",
          );
        }
        return inFlight.get(key);
      }
      const promise = (async () => {
        let lockToken;
        if (typeof analysisRepository.acquireLock === "function") {
          lockToken = await analysisRepository.acquireLock(
            organizationId,
            topicId,
            timeoutMs + 60_000,
          );
          if (!lockToken) {
            throw new AppError(
              409,
              "ANALYSIS_IN_PROGRESS",
              "Analysis generation is already in progress for this topic",
            );
          }
        }
        try {
          if (!regenerate) {
            const cachedAfterLock =
              await analysisRepository.findLatestByFingerprint(
                organizationId,
                topicId,
                sourceFingerprint,
              );
            if (cachedAfterLock) {
              return publicAnalysis(
                organizationId,
                cachedAfterLock,
                true,
                actionItemRepository,
              );
            }
          }
          return await generate({
            organizationId,
            topicId,
            topic,
            ideas,
            sourceFingerprint,
          });
        } finally {
          if (lockToken) {
            await analysisRepository.releaseLock(
              organizationId,
              topicId,
              lockToken,
            );
          }
        }
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    },
  };
}

export class UnconfiguredAnalysisService {
  async analyzeTopic() {
    throw new AppError(
      503,
      "AI_PROVIDER_UNCONFIGURED",
      "Topic analysis is unavailable until an AI provider is configured",
    );
  }
}
