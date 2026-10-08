// src/models/notice.model.ts
// NEW FILE — Task 3: Post Notice button
// Place alongside stockist.model.ts and doctor.model.ts

import mongoose, { Schema } from "mongoose";

const noticeSchema = new Schema(
  {
    tenantSlug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    audience: {
      type: String,
      enum: ["ALL", "MR", "MANAGER", "ADMIN"],
      default: "ALL",
      index: true
    },
    priority: {
      type: String,
      enum: ["NORMAL", "URGENT"],
      default: "NORMAL"
    },
    postedBy: { type: String, trim: true }, // user id of the admin who posted
    // Optional — set when a notice targets one specific manager/employee
    // (e.g. Tour Plan voided-by-another-manager alert, Section 12.1) instead
    // of the whole audience. Left blank for normal broadcast notices.
    targetEmployeeCode: { type: String, trim: true, default: null },
    readBy: { type: [String], default: [] },
    // Round 59 -- approval / cancellation notifications: machine-readable type, the record they refer to, a portal deep link, and a dedupe key
    type: { type: String, trim: true, default: null },
    refKind: { type: String, trim: true, default: null },
    refId: { type: String, trim: true, default: null },
    link: { type: String, trim: true, default: null },
    dedupeKey: { type: String, trim: true, default: null, index: true }
  },
  { timestamps: true }
);

noticeSchema.index({ tenantSlug: 1, createdAt: -1 });

export const NoticeModel = mongoose.model("Notice", noticeSchema);
