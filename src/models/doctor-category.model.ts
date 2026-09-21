import mongoose, { Schema } from "mongoose";

const doctorCategorySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    shortName: { type: String, trim: true, default: null },
    categoryName: { type: String, required: true, trim: true },
    noOfDoctors: { type: Number, default: 0 },
    noOfVisit: { type: Number, default: null },
    sortOrder: { type: Number, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

doctorCategorySchema.index({ tenantSlug: 1, categoryName: 1 }, { unique: true });

export const DoctorCategoryModel = mongoose.model("DoctorCategory", doctorCategorySchema, "doctorCategories");
