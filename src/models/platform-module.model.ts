import mongoose, { Schema } from "mongoose";

const platformModuleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["CORE", "FIELD", "AI", "REPORTING", "ADMIN", "COMPLIANCE"],
      required: true,
      index: true
    },
    defaultEnabled: { type: Boolean, default: false },
    featureKeys: [{ type: String }]
  },
  { timestamps: true }
);

export const PlatformModuleModel = mongoose.model("PlatformModule", platformModuleSchema);
