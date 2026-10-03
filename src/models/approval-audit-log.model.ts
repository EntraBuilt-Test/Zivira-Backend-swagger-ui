import mongoose, { Schema } from "mongoose";

// Round 36 Item B -- a real append-only approve/reject audit log, one row
// per action, so DCR > Reject/Approval View (and any future consumer) can
// show genuine multi-event history instead of the approvalDcr mirror's
// single mutable "current status" snapshot. masterKey lets this same
// collection back approvalDcr/approvalTp/approvalLeave going forward
// without three near-identical collections.
const approvalAuditLogSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    masterKey: { type: String, required: true, trim: true, index: true }, // e.g. "approvalDcr"
    recordId: { type: String, required: true, trim: true, index: true }, // the mirror row's _id
    sfName: { type: String, trim: true, default: "" },
    activityDate: { type: Date, default: null },
    action: { type: String, enum: ["Approved", "Rejected"], required: true },
    reason: { type: String, trim: true, default: "" },
    actedBy: { type: String, trim: true, default: "Admin" },
    actedAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

approvalAuditLogSchema.index({ tenantSlug: 1, masterKey: 1, actedAt: -1 });

export const ApprovalAuditLogModel = mongoose.model("ApprovalAuditLog", approvalAuditLogSchema, "approval_audit_log");
