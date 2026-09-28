import mongoose, { Schema } from "mongoose";

// Round 8 item 7 — MSIS (Monthly Sales Information Statement) has no
// backing sales-transaction model anywhere in this codebase. This is the
// minimal real persisted collection it reads from: one row per product per
// employee per month, split into the four real sanpharma MSIS buckets
// (HQ Sales / Less Infiltration / Add Infiltration / Total Sales), each with
// a Qty and a Val (Qty * Product.rate, computed at read time so a later
// rate correction doesn't silently invalidate old rows). Genuinely zero rows
// today means genuinely 0 in the report — not fabricated.
const msisSaleSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    productName: { type: String, required: true, trim: true },
    month: { type: String, required: true, index: true }, // "YYYY-MM"
    hqSalesQty: { type: Number, default: 0, min: 0 },
    lessInfiltrationQty: { type: Number, default: 0, min: 0 },
    addInfiltrationQty: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

msisSaleSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1, productName: 1 }, { unique: true });

export const MsisSaleModel = mongoose.model("MsisSale", msisSaleSchema, "msis_sales");
