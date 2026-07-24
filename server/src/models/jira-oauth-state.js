import mongoose from "mongoose";

const jiraOAuthStateSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true, unique: true, select: false },
    browserNonceHash: { type: String, required: true, select: false },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    requestedCloudId: { type: String },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, versionKey: false },
);

export const JiraOAuthState = mongoose.model("JiraOAuthState", jiraOAuthStateSchema);
