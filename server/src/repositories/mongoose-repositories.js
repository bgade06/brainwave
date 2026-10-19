import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Idea } from "../models/idea.js";
import { Topic } from "../models/topic.js";
import { Analysis } from "../models/analysis.js";
import { ActionItem } from "../models/action-item.js";
import { AnalysisLock } from "../models/analysis-lock.js";

function toObject(document) {
  if (!document) return null;
  const object = typeof document.toObject === "function"
    ? document.toObject()
    : { ...document };
  const { _id, ...rest } = object;
  return {
    ...rest,
    ...(_id === undefined ? {} : { id: String(_id) }),
    ...(rest.topicId === undefined ? {} : { topicId: String(rest.topicId) }),
    ...(rest.analysisId === undefined ? {} : { analysisId: String(rest.analysisId) }),
    ...(rest.organizationId === undefined
      ? {}
      : { organizationId: String(rest.organizationId) }),
  };
}

export const mongooseTopicRepository = {
  async create(organizationId, input) {
    return toObject(await Topic.create({ ...input, organizationId }));
  },
  async list(organizationId) {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const topics = await Topic.aggregate([
      { $match: { organizationId: orgId } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: Idea.collection.name,
          let: { topicId: "$_id", organizationId: "$organizationId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$topicId", "$$topicId"] },
                    { $eq: ["$organizationId", "$$organizationId"] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "ideaSummary",
        },
      },
      {
        $lookup: {
          from: Analysis.collection.name,
          let: { topicId: "$_id", organizationId: "$organizationId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$topicId", "$$topicId"] },
                    { $eq: ["$organizationId", "$$organizationId"] },
                    { $eq: ["$status", "complete"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "analysisSummary",
        },
      },
      {
        $addFields: {
          ideaCount: {
            $ifNull: [{ $arrayElemAt: ["$ideaSummary.count", 0] }, 0],
          },
          hasAnalysis: { $gt: [{ $size: "$analysisSummary" }, 0] },
        },
      },
      { $unset: ["ideaSummary", "analysisSummary"] },
    ]);
    return topics.map(toObject);
  },
  async findById(organizationId, id) {
    return toObject(await Topic.findOne({ _id: id, organizationId }));
  },
};

export const mongooseIdeaRepository = {
  async create(organizationId, input) {
    return toObject(await Idea.create({ ...input, organizationId }));
  },
  async listByTopic(organizationId, topicId) {
    const ideas = await Idea.find({ organizationId, topicId }).sort({ createdAt: 1, _id: 1 });
    return ideas.map(toObject);
  },
};

export const mongooseAnalysisRepository = {
  async findLatestByFingerprint(organizationId, topicId, sourceFingerprint) {
    return toObject(await Analysis.findOne({
      organizationId, topicId, sourceFingerprint, status: "complete",
    }).sort({ generation: -1 }));
  },
  async nextGeneration(organizationId, topicId) {
    const latest = await Analysis.findOne({ organizationId, topicId })
      .sort({ generation: -1 }).select("generation");
    return (latest?.generation ?? 0) + 1;
  },
  async create(organizationId, input) {
    return toObject(await Analysis.create({
      ...input,
      organizationId,
      status: input.status ?? "pending",
    }));
  },
  async findLatest(organizationId, topicId) {
    return toObject(await Analysis.findOne({
      organizationId, topicId, status: "complete",
    }).sort({ generation: -1 }));
  },
  async markComplete(organizationId, analysisId) {
    return toObject(await Analysis.findOneAndUpdate(
      { _id: analysisId, organizationId, status: "pending" },
      { $set: { status: "complete" } },
      { new: true },
    ));
  },
  async markFailed(organizationId, analysisId) {
    await Analysis.updateOne(
      { _id: analysisId, organizationId, status: "pending" },
      { $set: { status: "failed" } },
    );
  },
  async acquireLock(organizationId, topicId, ttlMs) {
    const key = `${organizationId}:${topicId}`;
    const ownerToken = randomUUID();
    const now = new Date();
    const expiresAt = new Date(Date.now() + ttlMs);
    try {
      const lock = await AnalysisLock.findOneAndUpdate(
        {
          key,
          $or: [
            { expiresAt: { $lte: now } },
            { ownerToken },
          ],
        },
        { $set: { ownerToken, expiresAt } },
        { upsert: true, new: true },
      );
      return lock?.ownerToken === ownerToken ? ownerToken : null;
    } catch (error) {
      if (error?.code === 11000) return null;
      throw error;
    }
  },
  releaseLock(organizationId, topicId, ownerToken) {
    return AnalysisLock.deleteOne({
      key: `${organizationId}:${topicId}`,
      ownerToken,
    });
  },
};

export const mongooseActionItemRepository = {
  async create(organizationId, input) {
    return toObject(await ActionItem.create({ ...input, organizationId }));
  },
  async createMany(organizationId, inputs) {
    if (inputs.length === 0) return [];
    const documents = await ActionItem.insertMany(
      inputs.map((input) => ({ ...input, organizationId })),
    );
    return documents.map(toObject);
  },
  async listByAnalysis(organizationId, analysisId) {
    const items = await ActionItem.find({ organizationId, analysisId })
      .sort({ createdAt: 1, _id: 1 });
    return items.map(toObject);
  },
  async deleteByAnalysis(organizationId, analysisId) {
    return ActionItem.deleteMany({ organizationId, analysisId });
  },
  async listByTopic(organizationId, topicId) {
    const items = await ActionItem.find({ organizationId, topicId })
      .sort({ createdAt: 1, _id: 1 });
    return items.map(toObject);
  },
  async findById(organizationId, id) {
    return toObject(await ActionItem.findOne({ _id: id, organizationId }));
  },
  async updatePriority(organizationId, id, priority, rationale) {
    const updates = {
      ...(priority === undefined ? {} : { priority }),
      ...(rationale === undefined ? {} : { rationale }),
    };
    return toObject(await ActionItem.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: updates },
      { new: true, runValidators: true },
    ));
  },
  async claim(organizationId, id, userId, claimedAt) {
    return toObject(await ActionItem.findOneAndUpdate(
      { _id: id, organizationId, assigneeUserId: { $exists: false } },
      { $set: { assigneeUserId: userId, claimedAt } },
      { new: true },
    ));
  },
  async unclaim(organizationId, id, userId) {
    return toObject(await ActionItem.findOneAndUpdate(
      { _id: id, organizationId, assigneeUserId: userId },
      { $unset: { assigneeUserId: 1, claimedAt: 1 } },
      { new: true },
    ));
  },
  async updateStatus(organizationId, id, currentStatus, status) {
    return toObject(await ActionItem.findOneAndUpdate(
      { _id: id, organizationId, status: currentStatus },
      { $set: { status } },
      { new: true, runValidators: true },
    ));
  },
  async patch(organizationId, id, currentStatus, updates) {
    return toObject(await ActionItem.findOneAndUpdate(
      { _id: id, organizationId, status: currentStatus },
      { $set: updates },
      { new: true, runValidators: true },
    ));
  },
};
