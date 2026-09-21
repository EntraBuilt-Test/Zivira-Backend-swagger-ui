import mongoose, { Schema } from "mongoose";

const attendanceSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    attendanceDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ["PRESENT", "ABSENT", "LEAVE"], default: "PRESENT", index: true },
    checkInAt: { type: Date },
    checkOutAt: { type: Date }
  },
  { timestamps: true }
);

attendanceSchema.index({ tenantSlug: 1, employeeCode: 1, attendanceDate: 1 }, { unique: true });

export const AttendanceModel = mongoose.model("Attendance", attendanceSchema);
