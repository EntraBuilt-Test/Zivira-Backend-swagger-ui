// src/models/expense-claim.model.ts
// PRD Section 12.5 follow-up — GST Branch → Expense Claim linkage.
//
// The FieldRepo Tour Plan form lets an MR pick a GST Branch ("optional — for
// expense/claims linkage") but nothing ever consumed that link: there was no
// claimable-expense workflow at all, so the branch picker was a dead end.
// This model is that missing workflow — an MR files a claim against a Tour
// Plan (inheriting its GST branch), their manager approves/rejects it, and
// Admin gets a branch-wise expense report.

import mongoose, { Schema } from "mongoose";

const expenseClaimSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    claimId: { type: String, required: true, unique: true },     // e.g. EXP-2026-08-MR-001-002
    employeeCode: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, trim: true },
    assignedManager: { type: String, required: true, trim: true, index: true },
    tpId: { type: String, required: true, index: true },         // Tour Plan this claim is filed against
    month: { type: String, required: true, index: true },        // 'YYYY-MM'
    gstBranchCode: { type: String, index: true },                 // inherited from the Tour Plan at submit time
    gstBranchName: { type: String },
    category: {
      type: String,
      enum: ["Travel", "Lodging", "Food", "Local Conveyance", "Other"],
      required: true
    },
    expenseDate: { type: String, required: true },                // 'YYYY-MM-DD'
    amountRs: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ["SUBMITTED", "APPROVED", "REJECTED"],
      default: "SUBMITTED",
      index: true
    },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    rejectedBy: { type: String },
    rejectReason: { type: String },
    rejectedAt: { type: Date }
  },
  { timestamps: true }
);

expenseClaimSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1 });
expenseClaimSchema.index({ tenantSlug: 1, assignedManager: 1, status: 1 });
expenseClaimSchema.index({ tenantSlug: 1, gstBranchCode: 1 });

export const ExpenseClaimModel = mongoose.model("ExpenseClaim", expenseClaimSchema);
