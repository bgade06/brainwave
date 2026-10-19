import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    csrfToken: { type: String, required: true, select: false },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    activeOrganizationId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true,
    },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, versionKey: false },
);

export const Session = mongoose.model("Session", sessionSchema);
