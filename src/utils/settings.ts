// Round 41 -- typed accessors for the new company settings (stored in the
// existing CompanyConfig key/value store, so no new collection is needed).
import { CompanyConfigModel } from "../models/company-config.model.js";

export const DCR_DELAY_DAYS_KEY = "DCR_DELAY_DAYS";
export const CATEGORY_NORMS_KEY = "CATEGORY_NORMS";
export const COMPANY_TIMEZONE_KEY = "COMPANY_TIMEZONE";

export type CategoryNorms = { NIL: number; CORE: number; "N CORE": number; "S CORE": number };
export const DEFAULT_CATEGORY_NORMS: CategoryNorms = { NIL: 2, CORE: 2, "N CORE": 2, "S CORE": 1 };
export const DEFAULT_DCR_DELAY_DAYS = 3;

async function readKey(tenantSlug: string, key: string): Promise<unknown> {
  const row = (await CompanyConfigModel.findOne({ tenantSlug, key }).lean()) as { value?: unknown } | null;
  return row ? row.value : undefined;
}

export async function getDcrDelayDays(tenantSlug: string): Promise<number> {
  const v = Number(await readKey(tenantSlug, DCR_DELAY_DAYS_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 60 ? Math.floor(v) : DEFAULT_DCR_DELAY_DAYS;
}

export async function getCategoryNorms(tenantSlug: string): Promise<CategoryNorms> {
  const raw = (await readKey(tenantSlug, CATEGORY_NORMS_KEY)) as Partial<CategoryNorms> | undefined;
  const out = { ...DEFAULT_CATEGORY_NORMS };
  if (raw && typeof raw === "object") {
    for (const k of Object.keys(out) as (keyof CategoryNorms)[]) {
      const n = Number(raw[k]);
      if (Number.isFinite(n) && n >= 0 && n <= 31) out[k] = Math.floor(n);
    }
  }
  return out;
}

export async function getCompanyTimezone(tenantSlug: string): Promise<string> {
  const v = await readKey(tenantSlug, COMPANY_TIMEZONE_KEY);
  return typeof v === "string" && v ? v : "Asia/Kolkata";
}

export async function saveSetting(tenantSlug: string, key: string, value: unknown, updatedBy?: string) {
  await CompanyConfigModel.findOneAndUpdate({ tenantSlug, key }, { $set: { value, updatedBy } }, { upsert: true, new: true });
}
