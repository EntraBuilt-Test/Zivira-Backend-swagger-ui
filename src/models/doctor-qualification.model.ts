import mongoose, { Schema } from "mongoose";

const doctorQualificationSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    qualificationName: { type: String, required: true, trim: true },
    noOfDoctors: { type: Number, default: 0 },
    sortOrder: { type: Number, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

doctorQualificationSchema.index({ tenantSlug: 1, qualificationName: 1 }, { unique: true });

export const DoctorQualificationModel = mongoose.model("DoctorQualification", doctorQualificationSchema, "doctorQualifications");
