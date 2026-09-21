import mongoose, { Schema } from "mongoose";

// Zivira_HR_Client_Requirement_1A.docx Phase 1 MVP item "Loan". A simple
// fixed-EMI ledger per employee — each Payroll Run generation deducts one
// EMI (see company.routes.ts payroll/runs) and decrements remainingBalance
// until it reaches 0, at which point the loan is CLOSED automatically.
const loanSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, index: true },
    principal: { type: Number, required: true },
    emiAmount: { type: Number, required: true },
    remainingBalance: { type: Number, required: true },
    reason: { type: String, trim: true, default: null },
    startMonth: { type: String, required: true }, // "YYYY-MM" — first month an EMI is deducted
    status: { type: String, enum: ["ACTIVE", "CLOSED"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

export const LoanModel = mongoose.model("Loan", loanSchema, "loans");
