import mongoose from "mongoose";

const analysisLockSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    ownerToken: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, versionKey: false },
);

export const AnalysisLock = mongoose.model("AnalysisLock", analysisLockSchema);
