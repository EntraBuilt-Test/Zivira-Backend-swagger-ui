// src/models/payroll-status.model.ts
// Zivira_Project_Basic.docx Topic 3 — Salary Integration Engine
//
// Business rule from the transcript: "IF Employee missed DCR THEN Payroll
// Status = Hold." Read literally that would put almost every employee on
// hold after a single missed day, so this ties the auto-hold trigger to the
// same "chronic defaulter" signal as Topic 4 (missed > 5 working days in the
// trailing 30) — utils/compliance.ts already computes `salaryHold` for
// exactly this purpose, this model just persists the workflow state around
// it.
//
// Workflow (docx): Employee → No DCR → HR Notification → Employee
// Explanation → Manager Approval → Payroll Released.
import mongoose, { Schema } from "mongoose";

const payrollStatusSchema = new Schema(
  {
    tenantSlug:   { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    month:        { type: String, required: true, index: true }, // 'YYYY-MM'
    status: {
      type: String,
      enum: ["RELEASED", "HOLD", "EXPLANATION_SUBMITTED"],
      default: "RELEASED",
      index: true
    },
    holdReason:              { type: String, default: null },
    missedDaysSnapshot:      { type: Number, default: 0 },
    employeeExplanation:     { type: String, default: null },
    explanationSubmittedAt:  { type: Date, default: null },
    managerApprovedBy:       { type: String, default: null },
    managerApprovedByName:   { type: String, default: null },
    managerApprovedAt:       { type: Date, default: null },
    releasedAt:              { type: Date, default: null }
  },
  { timestamps: true }
);

payrollStatusSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1 }, { unique: true });

export const PayrollStatusModel = mongoose.model("PayrollStatus", payrollStatusSchema);
