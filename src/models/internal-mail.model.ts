import mongoose, { Schema } from "mongoose";

// Real internal mail system backing the "Mail Box" / "Mail Folder Creation"
// Options screens (previously headers-only generic-master logs with no
// actual send/receive path). Folder names are free text here — validated
// against mailFolderCreation's active rows + the fixed system folders
// (Inbox/Sent Mails/Viewed Mails) in mail.routes.ts, not by a schema enum,
// since folders are admin-configurable.
const internalMailSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    fromEmployeeCode: { type: String, trim: true, default: "ADMIN" },
    fromName: { type: String, trim: true, default: "Admin" },
    toEmployeeCode: { type: String, trim: true, index: true },
    toName: { type: String, trim: true, default: null },
    subject: { type: String, required: true, trim: true },
    body: { type: String, trim: true, default: "" },
    folder: { type: String, required: true, trim: true, default: "Inbox", index: true },
    sentAt: { type: Date, default: Date.now, index: true },
    readAt: { type: Date, default: null }
  },
  { timestamps: true }
);

internalMailSchema.index({ tenantSlug: 1, toEmployeeCode: 1, folder: 1, sentAt: -1 });

export const InternalMailModel = mongoose.model("InternalMail", internalMailSchema, "internal_mail");
