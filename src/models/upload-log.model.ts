import mongoose, { Schema } from "mongoose";

// Round 62 -- one row per Generate-Excel tool upload (Listed Doctor, Chemists, ...); the Listed Doctor rows written before this model existed stay in doctorUploadLogs (still read, see upload-tools.routes.ts) (success, partial or fully rejected), per company.
// The Not Uploaded List (with the row errors) is kept inline as a small xlsx buffer, capped by the route (NOT_UPLOADED_MAX_BYTES).
const uploadLogSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    toolKey: { type: String, required: true, index: true },
    fileName: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: "" },
    read: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    note: { type: String, default: "" },
    topReason: { type: String, default: "" },
    topReasonRows: { type: Number, default: 0 },
    notUploadedFile: { type: Buffer, default: undefined },
    notUploadedTruncated: { type: Boolean, default: false }
  },
  { timestamps: true }
);
uploadLogSchema.index({ tenantSlug: 1, toolKey: 1, uploadedAt: -1 });

export const UploadLogModel = mongoose.model("UploadLog", uploadLogSchema, "uploadLogs");
