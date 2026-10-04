// Round 45 -- one e-detailing slide presentation to a listed doctor, logged by
// the field "Present slides" flow. Backs Listed Doctor Slide Analysis, Drs
// Analyis (e-detailing done) and the DCR "E-detailing" channel tag.
import mongoose, { Schema } from "mongoose";

const slideViewSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    doctorId: { type: String, required: true, index: true },
    slideId: { type: String, default: null },
    brandName: { type: String, trim: true, default: "" },
    productName: { type: String, trim: true, default: "" },
    startedAt: { type: Date, required: true },
    durationSec: { type: Number, required: true, min: 0, default: 0 },
    visitDateOnly: { type: String, required: true, index: true }, // YYYY-MM-DD (UTC, from startedAt)
    month: { type: String, required: true, index: true }
  },
  { timestamps: true }
);
slideViewSchema.index({ tenantSlug: 1, employeeCode: 1, visitDateOnly: 1, doctorId: 1 });

export const SlideViewModel = mongoose.model("SlideView", slideViewSchema, "slide_views");
