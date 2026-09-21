import mongoose, { Schema } from "mongoose";

const productBrandSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    shortName: { type: String, trim: true, default: null },
    brandName: { type: String, required: true, trim: true },
    division: { type: String, trim: true, default: null },
    moleculeName: { type: String, trim: true, default: null },
    noOfProducts: { type: Number, default: 0 },
    noOfSlides: { type: Number, default: null },
    sortOrder: { type: Number, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

productBrandSchema.index({ tenantSlug: 1, brandName: 1 }, { unique: true });

export const ProductBrandModel = mongoose.model("ProductBrand", productBrandSchema, "productBrands");
