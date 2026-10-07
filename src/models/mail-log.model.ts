import mongoose, { Schema } from "mongoose";

// Round 53 -- every outgoing e-mail (HR notices, onboarding credentials, manager alerts) is logged here by
// notify.ts so MIS Reports > Status > Mail can show real history. Nothing before this model existed is recoverable.
const mailLogSchema = new Schema(
  {
    // "" when the recipient is not an employee of any tenant; such rows are never shown in a tenant's report.
    tenantSlug: { type: String, lowercase: true, trim: true, default: "", index: true },
    to: { type: String, required: true, trim: true },
    toName: { type: String, trim: true, default: "" },
    subject: { type: String, trim: true, default: "" },
    mailType: { type: String, trim: true, default: "general" },
    status: { type: String, enum: ["sent", "failed"], required: true, index: true },
    channel: { type: String, trim: true, default: "" },
    error: { type: String, default: "" },
    sentBy: { type: String, trim: true, default: "system" },
    sentAt: { type: Date, default: () => new Date(), index: true }
  },
  { timestamps: true }
);
mailLogSchema.index({ tenantSlug: 1, sentAt: -1 });

export const MailLogModel = mongoose.model("MailLog", mailLogSchema, "mail_logs");
