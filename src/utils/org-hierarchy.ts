// src/utils/org-hierarchy.ts
// Round 34 -- shared real-reporting-hierarchy helpers for the TP/DCR
// legacy-parity report screens (Consolidated View, Status, Datewise, DCR
// Status). All of them need "this manager + their team, direct or
// recursive" against the real Employee.reportingManager chain -- built
// once here instead of duplicated per-endpoint.

import { EmployeeModel } from "../models/employee.model.js";

export type OrgEmployee = {
  _id: unknown;
  tenantSlug: string;
  name: string;
  employeeCode: string;
  designation: string;
  territory: string;
  role: string;
  reportingManager?: string;
  status: "ACTIVE" | "INACTIVE";
  joinDate?: Date | null;
  state?: string | null;
};

const MANAGER_ROLES = new Set(["ABM", "RBM", "ZBM", "BH", "NBH"]);

export function isManagerRole(role: string | undefined) {
  return !!role && MANAGER_ROLES.has(role);
}

// "Vacant manager" -- there is no dedicated vacancy flag on Employee
// anywhere in this schema (confirmed against the existing "Without Vacant"
// convention in masters-actions.routes.ts, which also has no separate
// vacant-territory field). The closest honest real equivalent: a manager
// role employee record marked INACTIVE while subordinates still point at
// their employeeCode via reportingManager -- i.e. the seat is structurally
// still referenced but nobody active currently holds it.
export async function findVacantManagerCodes(tenantSlug: string): Promise<Set<string>> {
  const inactiveManagers = await EmployeeModel.find({ tenantSlug, status: "INACTIVE", role: { $in: Array.from(MANAGER_ROLES) } }).select("employeeCode").lean();
  if (inactiveManagers.length === 0) return new Set();
  const codes = inactiveManagers.map((m: any) => m.employeeCode);
  const stillReferenced = await EmployeeModel.distinct("reportingManager", { tenantSlug, reportingManager: { $in: codes } });
  return new Set(stillReferenced as string[]);
}

// Direct reports of one employee.
export async function getDirectReports(tenantSlug: string, employeeCode: string): Promise<OrgEmployee[]> {
  return EmployeeModel.find({ tenantSlug, reportingManager: employeeCode }).sort({ name: 1 }).lean() as unknown as OrgEmployee[];
}

// Every descendant (direct + indirect) of one employee, via a real BFS walk
// down reportingManager -- bounded to 8 levels as a sane recursion guard
// (this org chart is nowhere near that deep in practice).
export async function getAllDescendants(tenantSlug: string, employeeCode: string): Promise<OrgEmployee[]> {
  const seen = new Set<string>([employeeCode]);
  const out: OrgEmployee[] = [];
  let frontier = [employeeCode];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const children = await EmployeeModel.find({ tenantSlug, reportingManager: { $in: frontier } }).sort({ name: 1 }).lean() as unknown as OrgEmployee[];
    const next: string[] = [];
    for (const child of children) {
      if (seen.has(child.employeeCode)) continue;
      seen.add(child.employeeCode);
      out.push(child);
      next.push(child.employeeCode);
    }
    frontier = next;
  }
  return out;
}

// "All Base Level" semantics confirmed from the legacy screenshot: unchecked
// = the selected manager's own column plus their DIRECT reports only;
// checked = the full recursive tree underneath them.
export async function resolveTeam(tenantSlug: string, employeeCode: string, allBaseLevel: boolean): Promise<OrgEmployee[]> {
  return allBaseLevel ? getAllDescendants(tenantSlug, employeeCode) : getDirectReports(tenantSlug, employeeCode);
}
