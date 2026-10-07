import mongoose, { Schema } from "mongoose";

// Round 48 -- rate history uploaded through Options > Upload > Product Rate.
// One row per product per effective date; Product.rate (used for POB / Rx
// values) is kept equal to the PTR of the latest rate effective today.
const productRateSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    productCode: { type: String, required: true, trim: true, index: true },
    productName: { type: String, trim: true, default: "" },
    ptr: { type: Number, default: null, min: 0 },
    pts: { type: Number, default: null, min: 0 },
    mrp: { type: Number, default: null, min: 0 },
    effectiveFrom: { type: Date, required: true }
  },
  { timestamps: true }
);

productRateSchema.index({ tenantSlug: 1, productCode: 1, effectiveFrom: 1 }, { unique: true });

export const ProductRateModel = mongoose.model("ProductRate", productRateSchema, "productRates");
