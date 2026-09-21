import mongoose, { Schema } from "mongoose";

// One row per employee per payroll month. Generated as DRAFT from the
// employee's latest ACTIVE salary structure plus attendance-derived LWP
// (Loss of Pay) days, then moves through HR_APPROVED -> LOCKED. Once
// LOCKED a row is treated as immutable (routes must refuse further edits).
const payrollRunSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    month: { type: String, required: true, trim: true, index: true }, // "YYYY-MM"
    basic: { type: Number, required: true },
    hra: { type: Number, required: true },
    allowance: { type: Number, required: true },
    grossEarnings: { type: Number, required: true },
    workingDays: { type: Number, required: true },
    lwpDays: { type: Number, default: 0 },
    lwpDeduction: { type: Number, default: 0 },
    // Phase 1 MVP items: Incentive, Loan, Arrears, Basic Tax Visibility
    // (Zivira_HR_Client_Requirement_1A.docx §32). "Basic" tax visibility
    // means a visible, editable figure — not an automated slab calculation,
    // which the doc explicitly defers to Phase 2 ("Automated Tax").
    incentive: { type: Number, default: 0 },
    incentiveNote: { type: String, default: null },
    loanDeduction: { type: Number, default: 0 },
    loanId: { type: Schema.Types.ObjectId, ref: "Loan", default: null },
    arrears: { type: Number, default: 0 },
    estimatedTax: { type: Number, default: 0 },
    // Phase 2 "Advanced Statutory Calculations" (Zivira_HR_Client_Requirement_1A.docx
    // §32) — computed at generation time from whichever StatutoryRule was
    // ACTIVE that month (see statutory-rule.model.ts). Baked in here rather
    // than recomputed live so a past payslip never silently changes if HR
    // edits the rules later.
    pfEmployee: { type: Number, default: 0 },
    pfEmployer: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    esiEmployee: { type: Number, default: 0 },
    esiEmployer: { type: Number, default: 0 },
    // Phase 2 "OT" item — extra hours beyond the ACTIVE StatutoryRule's
    // standardShiftHours/day, summed from Attendance checkInAt/checkOutAt
    // across the month, paid at otRatePerHour (or a derived hourly rate).
    otHours: { type: Number, default: 0 },
    otAmount: { type: Number, default: 0 },
    netPay: { type: Number, required: true },
    roundingRule: { type: String, default: "NEAREST_RUPEE" },
    status: { type: String, enum: ["DRAFT", "HR_APPROVED", "LOCKED"], default: "DRAFT", index: true },
    approvedBy: { type: String, trim: true, default: null },
    approvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

payrollRunSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1 }, { unique: true });

export const PayrollRunModel = mongoose.model("PayrollRun", payrollRunSchema, "payroll_runs");
