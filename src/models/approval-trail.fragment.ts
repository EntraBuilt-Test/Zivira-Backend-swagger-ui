// Round 59 -- shared approval trail fields (DCR, Tour Plan, Leave). `approval` is the CURRENT decision with who took it;
// `approvalHistory` is append-only. The older approvedBy (string) / approvedAt fields on TourPlan and LeaveApplication stay as they were.
import { Schema } from "mongoose";

const actorFields = {
  id: { type: String, default: "" },
  name: { type: String, default: "" },
  role: { type: String, enum: ["ADMIN", "MANAGER"] }
};
export const approvalSubSchema = new Schema(
  {
    status: { type: String, enum: ["Approved", "Rejected"] },
    approvedBy: { type: new Schema(actorFields, { _id: false }) },   // { id, name, role: ADMIN | MANAGER }
    approvedAt: { type: Date },
    remarks: { type: String, default: "" }
  },
  { _id: false }
);
export const approvalHistorySchema = new Schema(
  {
    action: { type: String, enum: ["Approved", "Rejected", "Cancelled"], required: true },
    byId: { type: String, default: "" },
    byName: { type: String, default: "" },
    byRole: { type: String, enum: ["ADMIN", "MANAGER"] },
    at: { type: Date, default: Date.now },
    remarks: { type: String, default: "" }
  },
  { _id: false }
);
export const approvalTrailFields = {
  approval: { type: approvalSubSchema, default: undefined },
  approvalHistory: { type: [approvalHistorySchema], default: [] }
};
