import mongoose, { Schema } from "mongoose";

const locationSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    locationName: { type: String, required: true, trim: true },
    cityName: { type: String, trim: true, default: null },
    pincode: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

locationSchema.index({ tenantSlug: 1, locationName: 1, cityName: 1 }, { unique: true });

export const LocationModel = mongoose.model("Location", locationSchema, "locations");
