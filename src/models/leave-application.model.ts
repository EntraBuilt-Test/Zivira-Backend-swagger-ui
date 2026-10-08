import mongoose, { Schema } from "mongoose";
import { approvalTrailFields } from "./approval-trail.fragment.js";

// Zivira_HR_Client_Requirement_1A.docx §25 Leave Management: Leave Types ->
// Leave Balance -> Leave Request -> Manager Approval -> HR Approval -> LWP
// Conversion -> Attendance Impact -> Payroll Impact. Phase 1 keeps this to a
// single HR-approval step (no separate manager step yet — Manager portal
// wasn't in scope for this HR build) but the status enum leaves room for it.
const leaveApplicationSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, index: true },
    leaveType: { type: String, required: true }, // matches a LeaveType master name
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true },
    reason: { type: String, trim: true, default: null },
    // Round 41 item 7 -- legend code (L, LP, MD, MR...) from WorkTypeCode.
    workTypeCode: { type: String, default: null },
    // LWP = counts as unpaid Loss-of-Pay for the Payroll Run's LWP calc.
    // Any other leave type is treated as paid.
    isLWP: { type: Boolean, default: false },
    // Phase 2 "Comp-Off" item: when true, this application spends an
    // AVAILABLE CompOff credit instead of drawing from a leave-type
    // balance — see comp-off.model.ts and ess.routes.ts leave/apply.
    isCompOff: { type: Boolean, default: false },
    compOffId: { type: Schema.Types.ObjectId, ref: "CompOff", default: null },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING", index: true },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
    // Round 59 -- cancellation after approval (status CANCELLED stops counting everywhere that reads APPROVED leave)
    cancelledBy: { type: new Schema({ id: String, name: String, role: { type: String, enum: ["ADMIN", "MANAGER"] } }, { _id: false }), default: undefined },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    ...approvalTrailFields
  },
  { timestamps: true }
);

leaveApplicationSchema.index({ tenantSlug: 1, employeeCode: 1, fromDate: 1 });

export const LeaveApplicationModel = mongoose.model("LeaveApplication", leaveApplicationSchema, "leave_applications");
