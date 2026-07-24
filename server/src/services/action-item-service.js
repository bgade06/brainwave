import { AppError } from "../errors/app-error.js";

const allowedTransitions = new Set([
  "open:in_progress",
  "in_progress:done",
]);

export function createActionItemService({ topicRepository, actionItemRepository }) {
  async function requireTopic(organizationId, topicId) {
    const topic = await topicRepository.findById(organizationId, topicId);
    if (!topic) throw new AppError(404, "TOPIC_NOT_FOUND", "Topic not found");
    return topic;
  }

  async function requireItem(organizationId, id) {
    const item = await actionItemRepository.findById(organizationId, id);
    if (!item) throw new AppError(404, "ACTION_ITEM_NOT_FOUND", "Action item not found");
    return item;
  }

  return {
    async list(organizationId, topicId) {
      await requireTopic(organizationId, topicId);
      return actionItemRepository.listByTopic(organizationId, topicId);
    },
    async createManual(organizationId, topicId, input) {
      await requireTopic(organizationId, topicId);
      return actionItemRepository.create(organizationId, {
        ...input,
        topicId,
        provenance: "manual",
      });
    },
    async updatePriority(organizationId, id, { priority, rationale }) {
      await requireItem(organizationId, id);
      return actionItemRepository.updatePriority(
        organizationId, id, priority, rationale,
      );
    },
    async patch(organizationId, id, input) {
      const item = await requireItem(organizationId, id);
      if (input.status !== undefined && item.status !== input.status) {
        const deliberateReopen =
          item.status === "done" && input.status === "in_progress" && input.reopen;
        if (!allowedTransitions.has(`${item.status}:${input.status}`) && !deliberateReopen) {
          throw new AppError(
            409,
            "ACTION_ITEM_TRANSITION_INVALID",
            `Cannot transition action item from ${item.status} to ${input.status}`,
          );
        }
      }
      const updates = {
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
        ...(input.status === undefined ? {} : { status: input.status }),
      };
      const updated = typeof actionItemRepository.patch === "function"
        ? await actionItemRepository.patch(organizationId, id, item.status, updates)
        : null;
      if (!updated) {
        throw new AppError(
          409,
          "ACTION_ITEM_STATE_CHANGED",
          "Action item changed while the update was being applied",
        );
      }
      return updated;
    },
    async claim(organizationId, id, userId) {
      const claimed = await actionItemRepository.claim(
        organizationId, id, userId, new Date(),
      );
      if (claimed) return claimed;
      const item = await requireItem(organizationId, id);
      if (String(item.assigneeUserId) === String(userId)) return item;
      throw new AppError(409, "ACTION_ITEM_ALREADY_CLAIMED", "Action item is already claimed");
    },
    async unclaim(organizationId, id, userId) {
      const unclaimed = await actionItemRepository.unclaim(organizationId, id, userId);
      if (unclaimed) return unclaimed;
      const item = await requireItem(organizationId, id);
      if (!item.assigneeUserId) return item;
      throw new AppError(
        409,
        "ACTION_ITEM_CLAIMED_BY_ANOTHER_USER",
        "Only the current assignee can unclaim this action item",
      );
    },
    async transition(organizationId, id, { status, reopen = false }) {
      const item = await requireItem(organizationId, id);
      if (item.status === status) return item;
      const deliberateReopen =
        item.status === "done" && status === "in_progress" && reopen;
      if (!allowedTransitions.has(`${item.status}:${status}`) && !deliberateReopen) {
        throw new AppError(
          409,
          "ACTION_ITEM_TRANSITION_INVALID",
          `Cannot transition action item from ${item.status} to ${status}`,
        );
      }
      const updated = await actionItemRepository.updateStatus(
        organizationId, id, item.status, status,
      );
      if (!updated) {
        throw new AppError(
          409,
          "ACTION_ITEM_STATE_CHANGED",
          "Action item changed while the transition was being applied",
        );
      }
      return updated;
    },
  };
}
