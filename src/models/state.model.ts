import mongoose, { Schema } from "mongoose";

const stateSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    stateName: { type: String, required: true, trim: true },
    countryName: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

stateSchema.index({ tenantSlug: 1, stateName: 1 }, { unique: true });

export const StateModel = mongoose.model("State", stateSchema, "states");
