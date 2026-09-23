// src/models/mail-auto-rule.model.ts
// Backs the "Auto Mail Setup > Fieldforce" tab (sanpharma.info's own
// Auto Mail Setup screen has an Admin tab — a fixed list of reports with a
// starting date / mode / mail-ids / status toggle each, stored as a single
// per-tenant config blob via CompanyConfigModel — and a Fieldforce tab,
// which is a real, growable list of named mail rules the admin creates one
// at a time via "Create Rule": Rule Name, Report Name, Mail To (Subdivision
// / State / Designation / Fieldforce multi-selects), a recurrence (start
// date, repeat frequency, grace period, end date) and an email
// subject/body template. That's a genuine list with its own ids, so it
// gets its own small collection rather than being folded into the config
// blob.

import mongoose, { Schema } from "mongoose";

const mailAutoRuleSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    ruleName: { type: String, required: true, trim: true },
    reportName: { type: String, required: true, trim: true },
    subdivisions: { type: [String], default: [] },
    states: { type: [String], default: [] },
    designations: { type: [String], default: [] },
    fieldforces: { type: [String], default: [] },
    startDate: { type: String, required: true },
    repeats: { type: String, required: true, trim: true },
    gracePeriod: { type: Number, default: 0 },
    endDate: { type: String, required: true },
    emailSubject: { type: String, trim: true, default: "" },
    emailBody: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" }
  },
  { timestamps: true }
);

mailAutoRuleSchema.index({ tenantSlug: 1, createdAt: -1 });

export const MailAutoRuleModel = mongoose.model("MailAutoRule", mailAutoRuleSchema);
