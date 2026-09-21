import mongoose, { Schema } from "mongoose";

const featureFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    enabledGlobally: { type: Boolean, default: false },
    enabledTenantSlugs: [{ type: String, lowercase: true }],
    rolloutStage: {
      type: String,
      enum: ["INTERNAL", "BETA", "GA", "PAUSED"],
      default: "INTERNAL",
      index: true
    }
  },
  { timestamps: true }
);

export const FeatureFlagModel = mongoose.model("FeatureFlag", featureFlagSchema);
