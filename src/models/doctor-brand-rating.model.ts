// Round 45 -- star rating (1-5) a rep gives a listed doctor for a brand he
// detailed, captured on the field DCR form. Brand Wise Star Rating reads the
// latest rating per doctor+brand in the month. Historical months have no
// rows and are not backfilled (their doctors show as NIL).
import mongoose, { Schema } from "mongoose";

const doctorBrandRatingSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    doctorId: { type: String, required: true, index: true },
    brandName: { type: String, required: true, trim: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    ratedBy: { type: String, required: true, trim: true }, // employeeCode
    month: { type: String, required: true, index: true }, // YYYY-MM
    dcrId: { type: String, default: null },
    ratedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);
doctorBrandRatingSchema.index({ tenantSlug: 1, month: 1, doctorId: 1, brandName: 1, ratedAt: -1 });

export const DoctorBrandRatingModel = mongoose.model("DoctorBrandRating", doctorBrandRatingSchema, "doctor_brand_ratings");
