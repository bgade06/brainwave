import mongoose from "mongoose";

const actionItemSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },
    analysisId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Analysis",
      index: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 5_000 },
    provenance: {
      type: String,
      enum: ["ai", "manual"],
      required: true,
      default: "manual",
    },
    priority: { type: String, enum: ["low", "medium", "high"] },
    rationale: { type: String, trim: true, maxlength: 2_000 },
    assigneeUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    claimedAt: { type: Date },
    status: {
      type: String,
      enum: ["open", "in_progress", "done"],
      default: "open",
    },
    jiraIssueId: { type: String },
    jiraIssueKey: { type: String },
    jiraIssueUrl: { type: String },
    jiraSyncStatus: {
      type: String,
      enum: ["not_synced", "pending", "synced", "error"],
      default: "not_synced",
    },
    jiraSyncedAt: { type: Date },
    jiraLastUpdatedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

actionItemSchema.pre("validate", function requireAnalysisForAi(next) {
  if (this.provenance === "ai" && !this.analysisId) {
    return next(new Error("AI action items require an analysisId"));
  }
  next();
});

actionItemSchema.index({ organizationId: 1, analysisId: 1, createdAt: 1 });
actionItemSchema.index({ organizationId: 1, topicId: 1, createdAt: 1 });
export const ActionItem = mongoose.model("ActionItem", actionItemSchema);
