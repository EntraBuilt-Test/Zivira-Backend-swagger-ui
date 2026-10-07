import mongoose, { Schema } from "mongoose";

// Round 48 Part D -- Flash News ticker items, Notice Board cards and the Quote of the Week.
// Audience lists are optional filters (empty = everyone); a published item is shown while
// active and inside its start/end window. `version` is bumped on every edit so a field/manager
// user's "don't show again" only suppresses the version they dismissed.
const infoItemSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    kind: { type: String, enum: ["FLASH", "NOTICE", "QUOTE"], required: true, index: true },
    title: { type: String, trim: true, default: "" },
    body: { type: String, required: true, trim: true },
    author: { type: String, trim: true, default: "" }, // quote attribution
    priority: { type: String, enum: ["NORMAL", "HIGH", "URGENT"], default: "NORMAL" },
    pinned: { type: Boolean, default: false },
    designations: { type: [String], default: [] },
    divisions: { type: [String], default: [] },
    hqs: { type: [String], default: [] },
    startDate: { type: String, default: null }, // YYYY-MM-DD
    endDate: { type: String, default: null },
    active: { type: Boolean, default: true },
    attachmentUrl: { type: String, trim: true, default: "" },
    attachmentName: { type: String, trim: true, default: "" },
    version: { type: Number, default: 1 },
    createdBy: { type: String, default: "" }
  },
  { timestamps: true }
);
infoItemSchema.index({ tenantSlug: 1, kind: 1, active: 1 });

export const InfoItemModel = mongoose.model("InfoItem", infoItemSchema, "info_items");
