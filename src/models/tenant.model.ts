import mongoose, { Schema } from "mongoose";

const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: {
      type: String,
      enum: ["SETUP", "SANDBOX", "PILOT", "LIVE", "SUSPENDED"],
      default: "SETUP",
      index: true
    },
    subscriptionPlan: {
      type: String,
      enum: ["SANDBOX", "GROWTH", "ENTERPRISE"],
      default: "SANDBOX"
    },
    licenseLimit: { type: Number, default: 25 },
    activeUsers: { type: Number, default: 0 },
    enabledModuleKeys: [{ type: String }],
    storageUsedMb: { type: Number, default: 0 },
    onboarding: {
      currentStep: { type: Number, default: 1 },
      completedSteps: [{ type: Number }],
      goLiveChecklist: [{ key: String, complete: Boolean }]
    }
  },
  { timestamps: true }
);

export const TenantModel = mongoose.model("Tenant", tenantSchema);
