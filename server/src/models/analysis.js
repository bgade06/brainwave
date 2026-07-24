import mongoose from "mongoose";

const tokenUsageSchema = new mongoose.Schema(
  {
    input: { type: Number, required: true, min: 0 },
    output: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const analysisSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },
    themes: { type: [String], required: true },
    suggestions: { type: [String], required: true },
    actionItems: { type: [String], required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    promptVersion: { type: String, required: true },
    sourceFingerprint: { type: String, required: true },
    sourceIdeaCount: { type: Number, required: true, min: 0 },
    tokenUsage: { type: tokenUsageSchema, required: true },
    generation: { type: Number, required: true, min: 1, default: 1 },
    status: {
      type: String,
      enum: ["pending", "complete", "failed"],
      default: "pending",
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

analysisSchema.index(
  { organizationId: 1, topicId: 1, generation: 1 },
  { unique: true },
);
analysisSchema.index({
  organizationId: 1, topicId: 1, sourceFingerprint: 1, generation: -1,
});

export const Analysis = mongoose.model("Analysis", analysisSchema);
