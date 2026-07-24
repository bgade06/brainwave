import { AppError } from "../errors/app-error.js";

export function createTopicService({
  topicRepository,
  ideaRepository,
  analysisRepository,
  actionItemRepository,
}) {
  async function requireTopic(organizationId, id) {
    const topic = await topicRepository.findById(organizationId, id);
    if (!topic) {
      throw new AppError(404, "TOPIC_NOT_FOUND", "Topic not found");
    }
    return topic;
  }

  return {
    createTopic(organizationId, input) {
      return topicRepository.create(organizationId, input);
    },
    listTopics(organizationId) {
      return topicRepository.list(organizationId);
    },
    async getTopic(organizationId, id) {
      const topic = await requireTopic(organizationId, id);
      const ideas = typeof ideaRepository.listByTopic === "function"
        ? await ideaRepository.listByTopic(organizationId, id)
        : [];
      const latestAnalysis = typeof analysisRepository?.findLatest === "function"
        ? await analysisRepository.findLatest(organizationId, id)
        : null;
      const currentAnalysis = latestAnalysis &&
        latestAnalysis.sourceIdeaCount === ideas.length
        ? latestAnalysis
        : null;
      const actionItems = currentAnalysis &&
        typeof actionItemRepository?.listByAnalysis === "function"
        ? await actionItemRepository.listByAnalysis(organizationId, currentAnalysis.id)
        : [];
      return {
        ...topic,
        ideas,
        analysis: currentAnalysis
          ? { ...currentAnalysis, actionItems, cached: true }
          : null,
      };
    },
    async addIdea(organizationId, topicId, input) {
      await requireTopic(organizationId, topicId);
      return ideaRepository.create(organizationId, { ...input, topicId });
    },
  };
}
