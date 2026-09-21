// src/models/tour-plan.model.ts
// PRD Section 12.1 — Tour Plan: Cross-Manager Assignment & Void/Reassign
//
// A Tour Plan (TP) is the monthly travel schedule an MR submits to their
// primary manager. When a second manager needs the same MR for a joint tour,
// the original TP is VOIDED (never deleted — full audit trail preserved) and
// a brand new TP is created under the new manager's approval chain, linked
// back to the voided one via parentTpId.

import mongoose, { Schema } from "mongoose";

const tourPlanLocationSchema = new Schema(
  {
    date: { type: String, required: true },   // 'YYYY-MM-DD'
    area: { type: String, required: true },
    town: { type: String, required: true },
    purpose: { type: String, default: "" }
  },
  { _id: false }
);

const tourPlanSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    tpId: { type: String, required: true, unique: true },       // e.g. TP-2026-06-MR001-003
    employeeCode: { type: String, required: true, trim: true, index: true }, // MR's code
    employeeName: { type: String, trim: true },
    primaryManager: { type: String, required: true, trim: true },  // originally assigned manager
    assignedManager: { type: String, required: true, trim: true, index: true }, // current approving manager
    month: { type: String, required: true, index: true },       // '2026-06'
    locations: { type: [tourPlanLocationSchema], default: [] },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOIDED"],
      default: "SUBMITTED",
      index: true
    },
    rejectReason: { type: String },
    approvedBy: { type: String },
    approvedAt: { type: Date },
    voidedBy: { type: String },      // manager who voided it
    voidedAt: { type: Date },
    voidReason: { type: String },
    reassignedToTpId: { type: String },  // set on the OLD tp once it's voided+reassigned
    parentTpId: { type: String, index: true },   // links a new TP back to the voided one it replaced
    gstBranchCode: { type: String },     // linked to CompanyBranch (Section 12.5)
    gstBranchName: { type: String },
    managerNotifiedAt: { type: Date },
    managerNotificationRead: { type: Boolean, default: false }
  },
  { timestamps: true }
);

tourPlanSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1 });
tourPlanSchema.index({ tenantSlug: 1, assignedManager: 1, status: 1 });

export const TourPlanModel = mongoose.model("TourPlan", tourPlanSchema);
