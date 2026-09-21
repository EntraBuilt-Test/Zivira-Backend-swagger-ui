import mongoose, { Schema } from "mongoose";

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
    // LWP = counts as unpaid Loss-of-Pay for the Payroll Run's LWP calc.
    // Any other leave type is treated as paid.
    isLWP: { type: Boolean, default: false },
    // Phase 2 "Comp-Off" item: when true, this application spends an
    // AVAILABLE CompOff credit instead of drawing from a leave-type
    // balance — see comp-off.model.ts and ess.routes.ts leave/apply.
    isCompOff: { type: Boolean, default: false },
    compOffId: { type: Schema.Types.ObjectId, ref: "CompOff", default: null },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null }
  },
  { timestamps: true }
);

leaveApplicationSchema.index({ tenantSlug: 1, employeeCode: 1, fromDate: 1 });

export const LeaveApplicationModel = mongoose.model("LeaveApplication", leaveApplicationSchema, "leave_applications");
