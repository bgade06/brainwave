import mongoose from "mongoose";

const oauthStateSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true, unique: true, select: false },
    browserNonceHash: { type: String, required: true, select: false },
    provider: { type: String, required: true, enum: ["github", "google"] },
    codeVerifier: { type: String, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, versionKey: false },
);

export const OAuthState = mongoose.model("OAuthState", oauthStateSchema);
