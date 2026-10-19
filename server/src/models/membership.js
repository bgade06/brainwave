import mongoose from "mongoose";

const membershipSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, required: true, enum: ["owner", "member"] },
  },
  { timestamps: true, versionKey: false },
);

membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const Membership = mongoose.model("Membership", membershipSchema);
