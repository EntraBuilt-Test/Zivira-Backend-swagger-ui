import mongoose, { Schema } from "mongoose";

const productCatalogSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    productCode: { type: String, trim: true, default: null },
    productName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    brandName: { type: String, trim: true },
    molecule: { type: String, trim: true, default: null },
    therapy: { type: String, trim: true },
    saleUnit: { type: String, trim: true, default: null },
    noOfSlides: { type: Number, default: null },
    sortOrder: { type: Number, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

productCatalogSchema.index({ tenantSlug: 1, productName: 1 }, { unique: true });

export const ProductCatalogModel = mongoose.model("ProductCatalog", productCatalogSchema, "productCatalog");
