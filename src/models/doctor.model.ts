import mongoose, { Schema } from "mongoose";

const doctorSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    specialty: { type: String, required: true, trim: true, index: true },
    category: { type: String, enum: ["A", "B", "C"], default: "C", index: true },
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    territory: { type: String, required: true, trim: true, index: true },
    mappedEmployeeCode: { type: String, trim: true },
    mappedEmployeeName: { type: String, trim: true, default: null },
    doctorCode: { type: String, trim: true, index: true },
    dob: { type: Date, default: null },
    anniversaryDate: { type: Date, default: null },
    gender: { type: String, trim: true, default: null },
    registrationNo: { type: String, trim: true, default: null },
    maritalStatus: { type: String, trim: true, default: null },
    qualification: { type: String, trim: true, default: null },
    specialityCode: { type: String, trim: true, default: null },
    categoryCode: { type: String, trim: true, default: null },
    address1: { type: String, trim: true, default: null },
    location: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    postalCode: { type: String, trim: true, default: null },
    clinicName: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    grade: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

doctorSchema.index({ tenantSlug: 1, name: 1, city: 1, specialty: 1 });
doctorSchema.index({ tenantSlug: 1, doctorCode: 1 }, { unique: true, partialFilterExpression: { doctorCode: { $exists: true } } });

export const DoctorModel = mongoose.model("Doctor", doctorSchema);
