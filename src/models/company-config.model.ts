// src/models/company-config.model.ts
// PRD Section 12.3B — key/value platform settings, scoped per tenant.
// Used for GIFT_VALUE_THRESHOLD_RS (MCI compliance alert threshold) and any
// future admin-configurable single-value settings, so we don't need a new
// Mongoose model every time the CEO asks for one more configurable number.

import mongoose, { Schema } from "mongoose";

const companyConfigSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    key: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, trim: true }
  },
  { timestamps: true }
);

companyConfigSchema.index({ tenantSlug: 1, key: 1 }, { unique: true });

export const CompanyConfigModel = mongoose.model("CompanyConfig", companyConfigSchema);

export const DEFAULT_CONFIG: Record<string, unknown> = {
  GIFT_VALUE_THRESHOLD_RS: 500,
  AUTO_APPROVE_HOURS: 24
};

export async function getConfigValue(tenantSlug: string, key: string): Promise<unknown> {
  const row = await CompanyConfigModel.findOne({ tenantSlug, key }).lean();
  if (row) return row.value;
  return DEFAULT_CONFIG[key] ?? null;
}
