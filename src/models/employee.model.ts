import mongoose, { Schema } from "mongoose";

const employeeSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    employeeCode: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    division: { type: String, required: true, trim: true },
    reportingManager: { type: String, trim: true },
    territory: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["NBH", "BH", "RBM", "ZBM", "ABM", "SR_MR", "MR", "OTHER"],
      required: true,
      index: true
    },
    dob: { type: Date, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    // Item 2 — a SEPARATE personal/gmail address (distinct from `email`
    // above, which is the employee's official/work email already used by
    // notifyOnboardingCredentials). Trigger Onboarding sends the Zivira HR
    // portal link + employee code + temp password here as well, so the
    // employee always gets their login details even if the official email
    // inbox isn't set up yet.
    personalEmail: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },
    joinDate: { type: Date, default: null },
    address1: { type: String, trim: true, default: null },
    landmark: { type: String, trim: true, default: null },
    location: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    postalCode: { type: String, trim: true, default: null },
    l1Division: { type: String, trim: true, default: null },
    l1Role: { type: String, trim: true, default: null },
    drivingLicense: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

employeeSchema.index({ tenantSlug: 1, employeeCode: 1 }, { unique: true });

export const EmployeeModel = mongoose.model("Employee", employeeSchema);
