import mongoose, { Schema } from "mongoose";

const subdivisionSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    division: { type: String, required: true, trim: true },
    subdivisionName: { type: String, trim: true, default: null },
    productwiseCount: { type: Number, default: 0 },
    fieldforcewiseCount: { type: Number, default: 0 },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

subdivisionSchema.index({ tenantSlug: 1, division: 1 }, { unique: true });

export const SubdivisionModel = mongoose.model("Subdivision", subdivisionSchema);
