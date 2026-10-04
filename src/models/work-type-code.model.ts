import mongoose, { Schema } from "mongoose";

// Round 41 item 7 -- WorkTypeCode master: the DCR Status legend (code, name,
// category). Seeded per tenant from the legacy legend by the boot upgrader;
// DCR / leave / attendance records carry a `workTypeCode` that references it.
const workTypeCodeSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ["Field", "Leave", "Holiday", "Office", "Meeting", "Training", "Travel", "Other"], default: "Other" },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" }
  },
  { timestamps: true }
);
workTypeCodeSchema.index({ tenantSlug: 1, code: 1 }, { unique: true });

export const WorkTypeCodeModel = mongoose.model("WorkTypeCode", workTypeCodeSchema, "work_type_codes");

// The legacy DCR Status legend. `FW`, `H`, `WO`, `L` were already emitted by
// the existing grid; the rest are the legacy codes that had no backing.
export const DEFAULT_WORK_TYPE_CODES: { code: string; name: string; category: string }[] = [
  { code: "FW", name: "Field Work", category: "Field" },
  { code: "H", name: "Holiday", category: "Holiday" },
  { code: "WO", name: "Weekly Off", category: "Holiday" },
  { code: "L", name: "Leave", category: "Leave" },
  { code: "LP", name: "Leave Planned", category: "Leave" },
  { code: "MD", name: "Medical Leave", category: "Leave" },
  { code: "MR", name: "Marriage Leave", category: "Leave" },
  { code: "NA", name: "Not Available", category: "Other" },
  { code: "R", name: "Review", category: "Meeting" },
  { code: "M", name: "Meeting", category: "Meeting" },
  { code: "TR", name: "Training", category: "Training" },
  { code: "T", name: "Transit", category: "Travel" },
  { code: "CF", name: "Conference", category: "Meeting" },
  { code: "SS", name: "Stockist Visit", category: "Field" },
  { code: "CW", name: "Camp Work", category: "Field" },
  { code: "IW", name: "Interior Work", category: "Field" },
  { code: "CM", name: "Chemist Meet", category: "Field" },
  { code: "SW", name: "Special Work", category: "Other" },
  { code: "AW", name: "Admin Work", category: "Office" },
  { code: "DS", name: "Depot Stock Work", category: "Office" },
  { code: "WFH", name: "Work From Home", category: "Office" },
  { code: "S", name: "Sunday Work", category: "Other" }
];

// DCR.workType (existing enum) -> legend code.
export const WORK_TYPE_TO_CODE: Record<string, string> = {
  "Field Work": "FW", "Holiday": "H", "Weekly Off": "WO", "Transit": "T", "Meeting": "M",
  "Admin Work": "AW", "Training": "TR", "Camp Work": "CW", "Work From Home": "WFH"
};
