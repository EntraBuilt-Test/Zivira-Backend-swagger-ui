import mongoose, { Schema } from "mongoose";

// Phase 2 MVP item "Comp-Off" (Zivira_HR_Client_Requirement_1A.docx §32).
// HR grants a compensatory-off credit to an employee (e.g. for working a
// holiday/weekend, cross-referenced against HolidayModel/attendance), and
// the employee can later spend it via ESS the same way a leave day is
// applied — see ess.routes.ts leave/apply and leave-application.model.ts's
// `isCompOff` flag, which marks an application as spending one of these
// credits instead of drawing from a leave-type balance.
const compOffSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    earnedDate: { type: Date, required: true }, // the worked holiday/weekend date
    reason: { type: String, trim: true, required: true },
    expiresOn: { type: Date, default: null }, // optional validity window; null = no expiry
    status: { type: String, enum: ["AVAILABLE", "USED", "EXPIRED"], default: "AVAILABLE", index: true },
    usedInLeaveId: { type: Schema.Types.ObjectId, ref: "LeaveApplication", default: null },
    grantedBy: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

compOffSchema.index({ tenantSlug: 1, employeeCode: 1, status: 1 });

export const CompOffModel = mongoose.model("CompOff", compOffSchema, "comp_offs");
