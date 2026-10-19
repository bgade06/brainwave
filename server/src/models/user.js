import mongoose from "mongoose";

const identitySchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, enum: ["github", "google"] },
    providerUserId: { type: String, required: true },
    accessToken: { type: String, required: true, select: false },
    refreshToken: { type: String, select: false },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    avatarUrl: { type: String },
    identities: { type: [identitySchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index(
  { "identities.provider": 1, "identities.providerUserId": 1 },
  { unique: true, sparse: true },
);

export const User = mongoose.model("User", userSchema);
