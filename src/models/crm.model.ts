import mongoose, { Schema } from "mongoose";

// Round 41 item 4 -- CRM given to a doctor (conference sponsorship, gift,
// support...). Entered by the rep (status PENDING) and approved by the
// manager/admin. Feeds Single Doctor Analysis > CRM Details.
const crmSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    doctorId: { type: String, required: true, index: true },
    doctorName: { type: String, trim: true, default: "" },
    date: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    type: { type: String, required: true, trim: true },
    amountRs: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
crmSchema.index({ tenantSlug: 1, employeeCode: 1, month: 1 });

export const CrmModel = mongoose.model("Crm", crmSchema, "crm_entries");
