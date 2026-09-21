import mongoose, { Schema } from "mongoose";

const productGroupSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    moleculeName: { type: String, required: true, trim: true },
    therapyName: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

productGroupSchema.index({ tenantSlug: 1, moleculeName: 1 }, { unique: true });

export const ProductGroupModel = mongoose.model("ProductGroup", productGroupSchema, "productGroups");
