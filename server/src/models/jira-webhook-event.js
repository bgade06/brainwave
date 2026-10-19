import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    deliveryKey: { type: String, required: true },
    jiraIssueId: { type: String },
    jiraUpdatedAt: { type: Date },
    eventType: { type: String },
    status: { type: String, enum: ["received", "processed", "ignored", "failed"], default: "received" },
    processingExpiresAt: { type: Date },
    processedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

eventSchema.index({ connectionId: 1, deliveryKey: 1 }, { unique: true });
export const JiraWebhookEvent = mongoose.model("JiraWebhookEvent", eventSchema);
