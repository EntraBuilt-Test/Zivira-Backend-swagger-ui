// src/models/field-visit-log.model.ts
// Round 36 Item C -- Chemist/Doctor/Hospital visits already have real
// check-in/out capture (ChemistCallModel now carries it below; Doctor/
// Hospital visits go through DcrModel.checkInTime/checkOutTime +
// hospitalClinic). Stockist, Unlisted Doctor and CIP had no capture
// mechanism anywhere in the field app at all -- not even a flow to log
// that a visit happened, let alone its time. This is genuinely new,
// minimal real schema: one shared visit-log collection (timestamp +
// location + which entity was visited), wired into one new minimal field
// app screen so these three categories go from "cannot be logged at all"
// to "really logged, with real check-in/out timestamps" starting now.
import mongoose, { Schema } from "mongoose";

const fieldVisitLogSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    visitType: { type: String, enum: ["Stockist", "UnlistedDoctor", "CIP", "Hospital"], required: true, index: true },
    // Free-text entity reference -- a real Stockist/UnlistedDoctor name the
    // rep typed or picked, or a CIP (Camp/Institution Program) location
    // name. Not foreign-keyed to StockistModel/UnlistedDoctorModel: those
    // masters are not tenant-scoped search endpoints exposed to the field
    // app today, and CIP has no master at all (registry.ts label only), so
    // free text is the honest real capture rather than a fabricated link.
    entityName: { type: String, required: true, trim: true },
    checkInTime: { type: String, default: null }, // "HH:MM"
    checkOutTime: { type: String, default: null },
    gpsLocation: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      label: { type: String, default: null }
    },
    visitDate: { type: Date, required: true, index: true },
    visitDateOnly: { type: String, index: true }, // 'YYYY-MM-DD', derived server-side
    notes: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

fieldVisitLogSchema.pre("save", function (next) {
  if (this.visitDate) {
    const d = this.visitDate as Date;
    this.visitDateOnly = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  next();
});

fieldVisitLogSchema.index({ tenantSlug: 1, employeeCode: 1, visitDateOnly: -1 });

export const FieldVisitLogModel = mongoose.model("FieldVisitLog", fieldVisitLogSchema, "field_visit_logs");
