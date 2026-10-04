// Round 41 item 2 -- the real 4-tier doctor category.
//   DoctorModel.doctorCategory is the source of truth (NIL | CORE | N CORE |
//   S CORE). Doctors that have not been migrated/edited yet (field is
//   unset) fall back to the legacy managerwiseCoreDoctorMap.isCore flag
//   (Yes -> CORE, No -> N CORE, none -> Nil) so old rows keep working.
import { getMasterModel } from "../models/master-record.model.js";

export type Tier = "Nil" | "CORE" | "N CORE" | "S CORE";
export const TIERS: Tier[] = ["Nil", "CORE", "N CORE", "S CORE"];
export const TIER_ENUM = ["NIL", "CORE", "N CORE", "S CORE"] as const;

export function tierFromEnum(v: unknown): Tier | null {
  if (v === "NIL") return "Nil";
  if (v === "CORE" || v === "N CORE" || v === "S CORE") return v;
  return null;
}
export function enumFromTier(t: Tier): (typeof TIER_ENUM)[number] {
  return t === "Nil" ? "NIL" : t;
}

export type CoreMap = Map<string, string>; // `${mrName}|${doctorCode}` -> "Yes" | "No"

export async function loadCoreMap(tenantSlug: string, mrNames: string[]): Promise<CoreMap> {
  const map: CoreMap = new Map();
  try {
    const rows = (await getMasterModel("managerwiseCoreDoctorMap").find({ tenantSlug, mrName: { $in: mrNames } }).lean()) as any[];
    for (const r of rows) map.set(`${r.mrName}|${r.doctorCode}`, r.isCore);
  } catch { /* master not configured for this tenant */ }
  return map;
}

// doc: a (lean) Doctor; mrName: the mapped rep's name (for the legacy fallback).
export function tierOfDoctor(doc: { doctorCategory?: unknown; doctorCode?: string } | null | undefined, core: CoreMap, mrName: string): Tier {
  const explicit = tierFromEnum(doc?.doctorCategory);
  if (explicit) return explicit;
  const v = core.get(`${mrName}|${doc?.doctorCode}`);
  return v === "Yes" ? "CORE" : v === "No" ? "N CORE" : "Nil";
}

// Legacy-flag -> enum value used by the migration and by the master hooks.
export function enumFromIsCore(isCore: unknown): (typeof TIER_ENUM)[number] {
  return isCore === "Yes" ? "CORE" : isCore === "No" ? "N CORE" : "NIL";
}
