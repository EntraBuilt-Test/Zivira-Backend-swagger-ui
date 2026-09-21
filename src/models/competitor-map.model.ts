import mongoose, { Schema } from "mongoose";

const competitorMapSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    competitorBrandName: { type: String, required: true, trim: true },
    competitorCompanyName: { type: String, trim: true, default: null },
    ourBrandName: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

competitorMapSchema.index({ tenantSlug: 1, competitorBrandName: 1, ourBrandName: 1 }, { unique: true });

export const CompetitorMapModel = mongoose.model("CompetitorMap", competitorMapSchema, "competitorMaps");
