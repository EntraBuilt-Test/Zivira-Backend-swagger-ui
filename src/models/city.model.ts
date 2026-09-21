import mongoose, { Schema } from "mongoose";

const citySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    cityName: { type: String, required: true, trim: true },
    stateName: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

citySchema.index({ tenantSlug: 1, cityName: 1 }, { unique: true });

export const CityModel = mongoose.model("City", citySchema, "cities");
