import mongoose, { Schema } from "mongoose";

const unlistedDoctorSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    tempCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    specialty: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    mr: { type: String, trim: true, default: null },
    
    clinicName: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    area: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    pinCode: { type: String, trim: true, default: null },
    
    patch: { type: String, trim: true, default: null },
    hq: { type: String, trim: true, default: null },
    
    mobile: { type: String, trim: true, default: null },
    email: { type: String, trim: true, default: null },
    
    visitFrequency: { type: String, trim: true, default: null },
    potential: { type: String, trim: true, default: null },
    
    remarks: { type: String, trim: true, default: null },
    approvedBy: { type: String, trim: true, default: null },
    
    dob: { type: String, trim: true, default: null },
    anniversaryDate: { type: String, trim: true, default: null },
    
    status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending", index: true }
  },
  { timestamps: true }
);

unlistedDoctorSchema.index({ tenantSlug: 1, tempCode: 1 }, { unique: true });

export const UnlistedDoctorModel = mongoose.model("UnlistedDoctor", unlistedDoctorSchema, "unlisted_doctors");
