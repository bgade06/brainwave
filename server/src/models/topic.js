import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 5_000 },
    goal: { type: String, default: "", trim: true, maxlength: 1_000 },
  },
  { timestamps: true, versionKey: false },
);

topicSchema.index({ organizationId: 1, createdAt: -1 });
export const Topic = mongoose.model("Topic", topicSchema);
