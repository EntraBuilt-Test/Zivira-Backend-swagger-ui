import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    role: {
      type: String,
      // Must stay in sync with EmployeeModel's role enum (NBH/BH/RBM/ZBM/ABM/
      // SR_MR/MR) plus the two portal-owner roles. Missing roles here caused
      // login-account creation to fail silently for RBM/SR_MR/BH/ZBM
      // employees — PRD 8.1 requires ABM AND RBM to both work as managers.
      enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "NBH", "BH", "RBM", "ZBM", "ABM", "SR_MR", "MR", "EMPLOYEE"],
      required: true,
      index: true
    },
    portal: {
      type: String,
      // EMPLOYEE = the HR portal's Employee Self-Service login (Zivira_HR_
      // Client_Requirement_1B.docx "Employee Login" screen) — distinct from
      // COMPANY_ADMIN (the HR/Admin staff login) and FIELD_FORCE (the
      // Manager/Field apps' MR/SR_MR login).
      enum: ["SUPER_ADMIN", "COMPANY_ADMIN", "FIELD_FORCE", "EMPLOYEE"],
      required: true,
      index: true
    },
    tenantSlug: { type: String, lowercase: true, trim: true },
    // EMPLOYEE-portal users only: which Employee Master record this login
    // belongs to, and whether they're still on the HR-issued temp password
    // (doc: "CREATE PASSWORD" is a forced first step after temp-credential
    // login, before the onboarding form unlocks).
    employeeCode: { type: String, trim: true },
    mustChangePassword: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const UserModel = mongoose.model("User", userSchema);
