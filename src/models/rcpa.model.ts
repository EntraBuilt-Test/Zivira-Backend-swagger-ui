import mongoose, { Schema } from "mongoose";

// Round 41 item 4 -- doctor-linked RCPA (Retail Chemist Prescription Audit)
// entry: for one doctor (and optionally the chemist where it was audited)
// the rep records how many of OUR product vs. a COMPETITOR product were
// prescribed/sold. Feeds Single Doctor Analysis > RCPA Details, DCR View
// "RCPA View", Review and Assessment reports.
const rcpaSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    doctorId: { type: String, required: true, index: true },
    doctorName: { type: String, trim: true, default: "" },
    chemistId: { type: String, default: null },
    chemistName: { type: String, trim: true, default: "" },
    date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
    month: { type: String, required: true, index: true },
    ourProduct: { type: String, required: true, trim: true },
    ourQty: { type: Number, required: true, min: 0 },
    competitorProduct: { type: String, trim: true, default: "" },
    competitorQty: { type: Number, default: 0, min: 0 },
    // Round 46 -- RCPA Dump columns: PTR of our product, competitor company and PTR.
    ourPtr: { type: Number, default: null, min: 0 },
    competitorName: { type: String, trim: true, default: "" },
    competitorPtr: { type: Number, default: null, min: 0 }
  },
  { timestamps: true }
);
rcpaSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1 });

export const RcpaModel = mongoose.model("Rcpa", rcpaSchema, "rcpa_entries");
