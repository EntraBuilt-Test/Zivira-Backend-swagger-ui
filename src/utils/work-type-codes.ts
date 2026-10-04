// Round 41 item 7 -- WorkTypeCode master helpers.
import { WorkTypeCodeModel, DEFAULT_WORK_TYPE_CODES } from "../models/work-type-code.model.js";

// Idempotent per-tenant seed of the DCR Status legend.
export async function ensureWorkTypeCodes(tenantSlug: string): Promise<number> {
  const have = new Set(((await WorkTypeCodeModel.find({ tenantSlug }).select("code").lean()) as any[]).map((r) => r.code));
  const missing = DEFAULT_WORK_TYPE_CODES.filter((c) => !have.has(c.code));
  if (missing.length === 0) return 0;
  try {
    await WorkTypeCodeModel.insertMany(missing.map((c) => ({ ...c, tenantSlug })), { ordered: false });
  } catch { /* concurrent seeds: duplicate keys are fine */ }
  return missing.length;
}

export async function listWorkTypeCodes(tenantSlug: string) {
  await ensureWorkTypeCodes(tenantSlug);
  const rows = (await WorkTypeCodeModel.find({ tenantSlug, status: "ACTIVE" }).lean()) as any[];
  const order = new Map(DEFAULT_WORK_TYPE_CODES.map((c, i) => [c.code, i]));
  return rows
    .map((r) => ({ code: r.code as string, name: r.name as string, category: r.category as string }))
    .sort((a, b) => (order.get(a.code) ?? 999) - (order.get(b.code) ?? 999) || a.code.localeCompare(b.code));
}
