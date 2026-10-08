import mongoose, { Schema } from "mongoose";

// Round 61 review 2 -- one row per Listed Doctor upload (success, partial or fully rejected), per company.
// The Not Uploaded List (with the row errors) is kept inline as a small xlsx buffer, capped by the route (NOT_UPLOADED_MAX_BYTES).
const doctorUploadLogSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
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
doctorUploadLogSchema.index({ tenantSlug: 1, uploadedAt: -1 });

export const DoctorUploadLogModel = mongoose.model("DoctorUploadLog", doctorUploadLogSchema, "doctorUploadLogs");
