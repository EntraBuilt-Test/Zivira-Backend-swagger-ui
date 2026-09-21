import mongoose, { Schema } from "mongoose";

const sfcSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    sourceSNo: { type: Number, index: true },
    employeeName: { type: String, trim: true, default: null },
    employeeCode: { type: String, trim: true, default: null },
    hq: { type: String, trim: true, default: null },
    patchName: { type: String, trim: true, default: null },
    typeRaw: { type: String, trim: true, default: null },
    oneWayKms: { type: Number, default: null },
    region: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

sfcSchema.index({ tenantSlug: 1, sourceSNo: 1 }, { unique: true, partialFilterExpression: { sourceSNo: { $exists: true } } });

export const SfcModel = mongoose.model("Sfc", sfcSchema, "sfc");
