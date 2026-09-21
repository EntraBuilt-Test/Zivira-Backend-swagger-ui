// src/models/sample-allocation.model.ts
// Zivira_Project_Basic.docx Topic 11 — Sample Distribution Analytics
//
// The "Distributed" half of this topic (samples actually handed to a
// doctor) is already captured on every DCR via samplesGiven (Topic 1's
// structured picker). What's missing is the "Issued" half — sample stock
// handed to an MR before they ever see a doctor — so this model is just
// that stock-issue ledger; "Remaining" is Issued minus Distributed,
// computed at report time rather than stored (avoids a running-balance
// field going stale).
import mongoose, { Schema } from "mongoose";

const sampleAllocationSchema = new Schema(
  {
    tenantSlug:   { type: String, required: true, lowercase: true, trim: true, index: true },
    allocationId: { type: String, required: true, unique: true }, // e.g. SA-2026-08-MR-001-001
    employeeCode: { type: String, required: true, trim: true, index: true },
    productCode:  { type: String, required: true, trim: true, index: true },
    productName:  { type: String, required: true, trim: true },
    batchNumber:  { type: String, trim: true, default: null },
    qtyIssued:    { type: Number, required: true, min: 0 },
    month:        { type: String, required: true, index: true }, // 'YYYY-MM'
    issuedBy:     { type: String, trim: true, default: null },
    notes:        { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

sampleAllocationSchema.index({ tenantSlug: 1, employeeCode: 1, productCode: 1, month: 1 });

export const SampleAllocationModel = mongoose.model("SampleAllocation", sampleAllocationSchema);
