import mongoose from "mongoose";

const ideaSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },
    text: { type: String, required: true, trim: true, maxlength: 5_000 },
    author: { type: String, trim: true, maxlength: 160 },
  },
  { timestamps: true, versionKey: false },
);

ideaSchema.index({ organizationId: 1, topicId: 1, createdAt: 1 });
export const Idea = mongoose.model("Idea", ideaSchema);
