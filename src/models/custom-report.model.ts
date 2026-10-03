import mongoose, { Schema } from "mongoose";

// Round 35 Item 7 -- Customized Report module (sanpharma.info's standalone
// "CUSTOM REPORT CREATION" section, Cusomized_Report_Name_Creation.aspx +
// Customized_Report_Generation.aspx). Real persistence for both screens:
// Screen A saves `name` + `defaultParams` (which of the fixed demographic
// columns are included -- the first 5 are always locked on); Screen B
// saves `metrics` (the selected metric checkbox keys from the big category
// grid). The admin's "Parameter" list column is literally `metrics.length`
// -- no separate counter field, so it can never drift from the real array.
const customReportSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    // The 5 locked defaults (sno/fieldForceName/hq/designation/employeeCode)
    // are always included even if a caller omits them -- enforced in the
    // route handler, not here, so this field stays a plain source of truth.
    defaultParams: { type: [String], default: [] },
    // Screen B's selected metric keys (see custom-report-metrics.ts for the
    // full catalog each key must come from).
    metrics: { type: [String], default: [] },
    createdBy: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

customReportSchema.index({ tenantSlug: 1, name: 1 });

export const CustomReportModel = mongoose.model("CustomReport", customReportSchema, "custom_reports");
