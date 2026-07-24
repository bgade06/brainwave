import mongoose from "mongoose";

const mappingSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actionItemId: { type: mongoose.Schema.Types.ObjectId, ref: "ActionItem", required: true },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: "JiraConnection", required: true },
    jiraIssueId: { type: String },
    jiraIssueKey: { type: String },
    jiraIssueUrl: { type: String },
    projectKey: { type: String, required: true },
    issueTypeId: { type: String, required: true },
    syncStatus: {
      type: String,
      enum: ["creating", "synced", "error", "ambiguous"],
      required: true,
      default: "creating",
    },
    lastJiraUpdatedAt: { type: Date },
    lastPushedStatus: { type: String },
    errorCode: { type: String },
    reconciliationMisses: { type: Number, default: 0 },
    lastReconciledAt: { type: Date },
    correlationLabel: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

mappingSchema.index({ organizationId: 1, actionItemId: 1 }, { unique: true });
mappingSchema.index({ connectionId: 1, jiraIssueId: 1 }, { unique: true, sparse: true });
export const JiraIssueMapping = mongoose.model("JiraIssueMapping", mappingSchema);
