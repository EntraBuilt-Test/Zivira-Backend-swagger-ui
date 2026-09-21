import mongoose, { Schema } from "mongoose";

const productCategorySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    shortName: { type: String, trim: true, default: null },
    categoryName: { type: String, required: true, trim: true },
    noOfProducts: { type: Number, default: 0 },
    sortOrder: { type: Number, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

productCategorySchema.index({ tenantSlug: 1, categoryName: 1 }, { unique: true });

export const ProductCategoryModel = mongoose.model("ProductCategory", productCategorySchema, "productCategories");
