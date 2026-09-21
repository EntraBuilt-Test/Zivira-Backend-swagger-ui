import mongoose, { Schema } from "mongoose";

const stockistSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    erpCode: { type: String, trim: true, index: true },
    state: { type: String, required: true, trim: true, index: true },
    hqName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    fieldForceName: { type: String, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

stockistSchema.index({ tenantSlug: 1, state: 1, hqName: 1 });

export const StockistModel = mongoose.model("Stockist", stockistSchema);
