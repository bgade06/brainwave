import mongoose from "mongoose";

const jiraConnectionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, unique: true,
    },
    connectedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cloudId: { type: String, required: true },
    siteName: { type: String, required: true },
    siteUrl: { type: String, required: true },
    scopes: { type: [String], default: [] },
    accessToken: { type: String, required: true, select: false },
    refreshToken: { type: String, required: true, select: false },
    accessTokenExpiresAt: { type: Date, required: true },
    webhookSecret: { type: String, required: true, select: false },
    webhookId: { type: String },
  },
  { timestamps: true, versionKey: false },
);

export const JiraConnection = mongoose.model("JiraConnection", jiraConnectionSchema);
