import mongoose, { Schema } from "mongoose";

const countrySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    countryName: { type: String, required: true, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

countrySchema.index({ tenantSlug: 1, countryName: 1 }, { unique: true });

export const CountryModel = mongoose.model("Country", countrySchema, "countries");
