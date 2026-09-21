import mongoose, { Schema } from "mongoose";

const dealerSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    sourceSNo: { type: Number, index: true },
    employeeName: { type: String, trim: true, default: null },
    employeeCode: { type: String, trim: true, default: null },
    patchName: { type: String, trim: true, default: null },
    dealerName: { type: String, required: true, trim: true },
    contactPersonName: { type: String, trim: true, default: null },
    dealerPhone: { type: String, trim: true, default: null },
    dealerEmail: { type: String, trim: true, lowercase: true, default: null },
    country: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    location: { type: String, trim: true, default: null },
    pincode: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

dealerSchema.index({ tenantSlug: 1, sourceSNo: 1 }, { unique: true, partialFilterExpression: { sourceSNo: { $exists: true } } });

export const DealerModel = mongoose.model("Dealer", dealerSchema, "dealers");
