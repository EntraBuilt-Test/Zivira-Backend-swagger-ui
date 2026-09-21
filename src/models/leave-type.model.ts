import mongoose, { Schema } from "mongoose";

const leaveTypeSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    leaveTypeDesc: { type: String, required: true, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

leaveTypeSchema.index({ tenantSlug: 1, leaveTypeDesc: 1 }, { unique: true });

export const LeaveTypeModel = mongoose.model("LeaveType", leaveTypeSchema, "leaveTypes");
