import mongoose, { Schema } from "mongoose";

const doctorSpecialitySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    shortName: { type: String, trim: true, default: null },
    specialityName: { type: String, required: true, trim: true },
    noOfDoctors: { type: Number, default: 0 },
    noOfSlides: { type: Number, default: null },
    sortOrder: { type: Number, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

doctorSpecialitySchema.index({ tenantSlug: 1, specialityName: 1 }, { unique: true });

export const DoctorSpecialityModel = mongoose.model("DoctorSpeciality", doctorSpecialitySchema, "doctorSpecialities");
