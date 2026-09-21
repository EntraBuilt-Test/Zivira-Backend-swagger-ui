// src/models/doctor-visit-exception.model.ts
// Zivira_Project_Basic.docx Topic 8 — Doctor Exception Management
//
// "Every missed visit requires a reason... This prevents management from
// assuming poor performance without evidence." Logged by the MR against a
// doctor they haven't visited this month, using a fixed Reason Master
// (docx's list) — same "no free-text-only category" philosophy as the
// gift-item picker (GIFT_ITEM_TYPES).
import mongoose, { Schema } from "mongoose";

export const DOCTOR_EXCEPTION_REASONS = [
  "Doctor Shifted",
  "Doctor Retired",
  "Doctor Refused Visit",
  "No Business Potential",
  "Clinic Closed",
  "Hospital Closed",
  "Doctor Sick",
  "Personal Leave",
  "Other"
] as const;

const doctorVisitExceptionSchema = new Schema(
  {
    tenantSlug:   { type: String, required: true, lowercase: true, trim: true, index: true },
    doctorId:     { type: Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    month:        { type: String, required: true, index: true }, // 'YYYY-MM'
    reason:       { type: String, enum: DOCTOR_EXCEPTION_REASONS, required: true },
    notes:        { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

doctorVisitExceptionSchema.index({ tenantSlug: 1, doctorId: 1, employeeCode: 1, month: 1 }, { unique: true });

export const DoctorVisitExceptionModel = mongoose.model("DoctorVisitException", doctorVisitExceptionSchema);
