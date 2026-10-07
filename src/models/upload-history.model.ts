import mongoose, { Schema } from "mongoose";

// Round 48 -- one row per bulk-upload import (who / when / file / rows ok / failed).
const uploadHistorySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    toolKey: { type: String, required: true, index: true },
    fileName: { type: String, default: "" },
    uploadedBy: { type: String, default: "" },
    totalRows: { type: Number, default: 0 },
    okRows: { type: Number, default: 0 },
    failedRows: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    fileErrors: { type: [String], default: [] },
    rowErrors: { type: [new Schema({ row: Number, field: String, reason: String }, { _id: false })], default: [] }
  },
  { timestamps: true }
);

uploadHistorySchema.index({ tenantSlug: 1, toolKey: 1, createdAt: -1 });

export const UploadHistoryModel = mongoose.model("UploadHistory", uploadHistorySchema, "uploadHistories");
