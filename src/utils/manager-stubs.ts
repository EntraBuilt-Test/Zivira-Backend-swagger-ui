// Round 60 -- manager stubs for the Salesforce upload.
// A reporting-manager NAME that exists nowhere (no employee, not in the file) used to leave the employee without a manager.
// Now a stub Employee is created per distinct unresolved name: placeholder code MGR-PENDING-NNN, ACTIVE, codePending=true,
// autoCreatedSource "auto-created from Salesforce upload". Role/designation are INFERRED from the people who report to the stub
// (the tier above the most senior report), and the stub's own manager comes from "Reporting Manager II Name" when the file gives it.
import { EmployeeModel } from "../models/employee.model.js";
import { clearCache } from "./ttl-cache.js";

export const STUB_SOURCE = "auto-created from Salesforce upload";
export const STUB_PREFIX = "MGR-PENDING-";
export const STUB_TERRITORY = "Not provided (code pending)";

const ORDER = ["MR", "SR_MR", "ABM", "RBM", "ZBM", "BH", "NBH"];
const rank = (r: string) => ORDER.indexOf(r);                      // OTHER / unknown = -1
const UP: Record<string, string> = { MR: "ABM", SR_MR: "ABM", ABM: "RBM", RBM: "ZBM", ZBM: "BH", BH: "NBH", NBH: "NBH" };
export const tierAbove = (r: string): string => UP[r] || "ABM";
export const DESIGNATION_FOR: Record<string, string> = {
  ABM: "Area Business Manager", RBM: "Regional Business Manager", ZBM: "Zonal Business Manager", BH: "Business Head", NBH: "National Business Head"
};

export type StubPlan = { key: string; name: string; division: string; reportRoles: string[]; mn2: string; mgrKey: string | null; mgrCode: string | null; role: string; code: string };

/** Infer each planned stub's role from its reports: file employees (roles) and other stubs that report to it. Fixed point, max 8 passes. */
export function inferStubRoles(plans: Map<string, StubPlan>) {
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const p of plans.values()) {
      const roles = [...p.reportRoles, ...[...plans.values()].filter((c) => c.mgrKey === p.key).map((c) => c.role)];
      const top = roles.reduce((m, r) => (rank(r) > rank(m) ? r : m), "OTHER");
      const role = rank(top) < 0 ? "ABM" : tierAbove(top);   // nobody known below: the lowest manager tier, ABM
      if (role !== p.role) { p.role = role; changed = true; }
    }
    if (!changed) break;
  }
}

/** Drop a stub->stub manager link that would create a loop. */
export function breakStubCycles(plans: Map<string, StubPlan>) {
  for (const p of plans.values()) {
    const seen = new Set<string>([p.key]);
    let cur = p.mgrKey ? plans.get(p.mgrKey) : undefined;
    while (cur) {
      if (seen.has(cur.key)) { p.mgrKey = null; break; }
      seen.add(cur.key);
      cur = cur.mgrKey ? plans.get(cur.mgrKey) : undefined;
    }
  }
}

export async function nextStubNumber(tenant: string): Promise<number> {
  const rows = (await EmployeeModel.find({ tenantSlug: tenant, employeeCode: { $regex: `^${STUB_PREFIX}` } }).select("employeeCode").lean()) as any[];
  return rows.reduce((m, r) => Math.max(m, parseInt(String(r.employeeCode).slice(STUB_PREFIX.length), 10) || 0), 0) + 1;
}
export const stubCode = (n: number) => `${STUB_PREFIX}${String(n).padStart(3, "0")}`;

/**
 * Change an employee's code and rewrite every reportingManager that pointed at the old code.
 * Links are stored by code, so this cascade is what keeps all reports attached (the employee's own _id never changes).
 */
export async function renameEmployeeCode(tenant: string, oldCode: string, newCode: string, extra: Record<string, unknown> = {}) {
  const clash = await EmployeeModel.findOne({ tenantSlug: tenant, employeeCode: newCode }).lean();
  if (clash) throw new Error(`employee code "${newCode}" already exists`);
  const emp = (await EmployeeModel.findOneAndUpdate({ tenantSlug: tenant, employeeCode: oldCode }, { $set: { employeeCode: newCode, ...extra } }, { new: true })) as any;
  if (!emp) throw new Error(`employee "${oldCode}" not found`);
  const moved = await EmployeeModel.updateMany({ tenantSlug: tenant, reportingManager: oldCode }, { $set: { reportingManager: newCode } });
  clearCache();
  return { employee: emp, relinked: (moved as any)?.modifiedCount ?? (moved as any)?.nModified ?? 0 };
}
