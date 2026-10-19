import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  },
  { timestamps: true, versionKey: false },
);

export const Organization = mongoose.model("Organization", organizationSchema);
