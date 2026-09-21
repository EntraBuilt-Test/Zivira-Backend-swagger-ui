import mongoose, { Schema } from "mongoose";

const productSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, trim: true },
    code: { type: String, trim: true },
    description: { type: String, trim: true },
    saleUnit: { type: String, trim: true, default: null },
    category: { type: String, required: true, trim: true },
    group: { type: String, trim: true, default: null },
    subDivision: { type: String, trim: true, index: true },
    division: { type: String, trim: true, index: true },
    productName: { type: String, trim: true },
    brandName: { type: String, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

// code is now a legacy optional field — no longer enforced unique.
// natural key for subdivision-scoped products: same name is allowed across different subdivisions.
// A plain `sparse` index does NOT exclude these docs (tenantSlug is always present, so the doc
// isn't "missing all fields"), so a partial index is used instead to only enforce uniqueness
// when subDivision actually exists on the document.
productSchema.index(
  { tenantSlug: 1, subDivision: 1, name: 1 },
  { unique: true, partialFilterExpression: { subDivision: { $exists: true } } }
);

// natural key for bulk-imported catalog products (Product sheet): brandName + productName,
// only enforced when productName exists — legacy single-entry products (name/code path) are unaffected.
productSchema.index(
  { tenantSlug: 1, brandName: 1, productName: 1 },
  { unique: true, partialFilterExpression: { productName: { $exists: true } } }
);

export const ProductModel = mongoose.model("Product", productSchema);
