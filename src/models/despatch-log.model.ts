import mongoose, { Schema } from "mongoose";

// Round 8 items 3-6 — Sample/Input Despatch View & Status screens have no
// backing transaction model anywhere in this codebase. Rather than leave
// those columns permanently hardcoded to "-" forever, this is the minimal
// real persisted collection they read from: one row per despatch batch to
// one employee, of one item, in one month. Today it will genuinely have zero
// rows for most tenants (0/"-" is the honest, non-fabricated result), but
// once an Admin records a real despatch through the POST below, the View/
// Status screens will show real numbers from then on.
const despatchLogSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    despatchType: { type: String, enum: ["SAMPLE", "INPUT"], required: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true },
    month: { type: String, required: true, index: true }, // "YYYY-MM"
    openingBalance: { type: Number, default: 0, min: 0 },
    despatchQty: { type: Number, default: 0, min: 0 },
    issuedQty: { type: Number, default: 0, min: 0 },
    closingBalance: { type: Number, default: 0, min: 0 },
    despatchDate: { type: Date, default: null },
    remarks: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

despatchLogSchema.index({ tenantSlug: 1, despatchType: 1, employeeCode: 1, month: 1, itemName: 1 });

export const DespatchLogModel = mongoose.model("DespatchLog", despatchLogSchema, "despatch_logs");
