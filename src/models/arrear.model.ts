import mongoose, { Schema } from "mongoose";

// Zivira_HR_Client_Requirement_1A.docx Phase 1 MVP item "Arrears" — a one-off
// adjustment (positive or negative) applied to a specific employee's
// Payroll Run for a specific month, e.g. a backdated salary revision or a
// correction. Picked up automatically when that month's Payroll Run is
// generated (see company.routes.ts).
const arrearSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, index: true },
    month: { type: String, required: true }, // "YYYY-MM" — the payroll month this arrear applies to
    amount: { type: Number, required: true },
    reason: { type: String, trim: true, default: null },
    status: { type: String, enum: ["PENDING", "APPLIED"], default: "PENDING", index: true }
  },
  { timestamps: true }
);

arrearSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1 });

export const ArrearModel = mongoose.model("Arrear", arrearSchema, "arrears");
