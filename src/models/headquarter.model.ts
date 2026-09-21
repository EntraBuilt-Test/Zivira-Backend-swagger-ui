import mongoose, { Schema } from "mongoose";

const headQuarterSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    headQuarterName: { type: String, required: true, trim: true },
    stateName: { type: String, trim: true, default: null },
    metroType: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

headQuarterSchema.index({ tenantSlug: 1, headQuarterName: 1 }, { unique: true });

export const HeadQuarterModel = mongoose.model("HeadQuarter", headQuarterSchema, "headQuarters");
