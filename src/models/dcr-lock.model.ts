import mongoose, { Schema } from "mongoose";

// Round 41 Gap A -- real DCR lock record. One row per (employee, DCR date)
// that has locked (auto-delay: the date passed the company's delay window
// without any submission; manual: an admin locked it). Persisted the first
// time the lock is detected (lazily, on any read/submit that touches the
// date, plus a daily background sweep -- see utils/dcr-lock.ts). Release
// stamps releasedAt/releasedBy and re-opens submission for that date.
const dcrLockSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    dcrDate: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    lockedAt: { type: Date, required: true },               // the moment the lock took effect
    detectedAt: { type: Date, default: () => new Date() },  // when the system first persisted it
    lockReason: { type: String, enum: ["auto-delay", "manual"], default: "auto-delay" },
    delayDays: { type: Number, default: null },             // the window that applied when locked
    releasedAt: { type: Date, default: null },
    releasedBy: { type: String, default: null },
    releaseRequestedAt: { type: Date, default: null },
    releaseRequestNote: { type: String, default: null }
  },
  { timestamps: true }
);

dcrLockSchema.index({ tenantSlug: 1, employeeCode: 1, dcrDate: 1 }, { unique: true });

export const DcrLockModel = mongoose.model("DcrLock", dcrLockSchema, "dcr_locks");
