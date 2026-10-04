// src/utils/coverage-analysis.ts
//
// Round 19 item 4 — extracted from masters-actions.routes.ts's
// "Coverage Analysis 2" handler (Round 8 items 1 & 2) so the exact same
// real aggregation (TC/DW/Met/Seen/Coverage%/Cal Avg by territory type,
// from real DcrModel visits grouped by the doctor's real territoryType) can
// be reused by a field-scoped variant (GET /field/coverage — "My
// Coverage") instead of being duplicated. The admin route already accepted
// an optional employeeCode filter (Round 12 item 8); this just pulls that
// same computation out into one place both routes call.
import { EmployeeModel } from "../models/employee.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { loadRateMap, docPobValue } from "./mis-reports-compute.js";

export type CoverageAnalysisRow = {
  empCode: string;
  doj: unknown;
  fieldForceName: string;
  designation: string;
  hq: string;
  firstLevelManager: string;
  secondLevelManager: string;
  noOfFwd: number;
  noOfFwdExp: number;
  ttlDrs: number;
  territoryTypes: Record<string, unknown>;
};

export async function computeCoverageAnalysis2(
  tenantSlug: string,
  opts: { month: number; year: number; employeeCode?: string }
): Promise<CoverageAnalysisRow[]> {
  const { month, year, employeeCode } = opts;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const employeeFilter: Record<string, unknown> = { tenantSlug };
  if (employeeCode && employeeCode.trim()) {
    employeeFilter.employeeCode = employeeCode.trim();
  }
  const employees = await EmployeeModel.find(employeeFilter).lean();
  const byEmpCode = new Map(employees.map((e: any) => [e.employeeCode, e]));

  const doctors = await DoctorModel.find({ tenantSlug }).lean();
  const mappedDoctorsByEmpAndType = new Map<string, Map<string, Set<string>>>();
  for (const d of doctors as any[]) {
    const code = d.mappedEmployeeCode;
    if (!code) continue;
    const tt = d.territoryType || "HQ";
    if (!mappedDoctorsByEmpAndType.has(code)) mappedDoctorsByEmpAndType.set(code, new Map());
    const byType = mappedDoctorsByEmpAndType.get(code)!;
    if (!byType.has(tt)) byType.set(tt, new Set());
    byType.get(tt)!.add(String(d._id));
  }
  const territoryTypeByDoctorId = new Map((doctors as any[]).map((d) => [String(d._id), d.territoryType || "HQ"]));

  const dcrRows = await DcrModel.find({
    tenantSlug,
    month: monthStr,
    status: { $in: ["SUBMITTED", "MANAGER_APPROVED", "APPROVED", "AUTO_APPROVED"] }
  }).lean();

  type Bucket = { calls: number; days: Set<string>; doctors: Set<string>; amount: number };
  const rates = await loadRateMap(tenantSlug);
  const fwdDays = new Map<string, Set<string>>();
  const buckets = new Map<string, Map<string, Bucket>>();
  for (const row of dcrRows as any[]) {
    const tt = row.doctorId ? territoryTypeByDoctorId.get(String(row.doctorId)) || "HQ" : "HQ";
    if (!buckets.has(row.employeeCode)) buckets.set(row.employeeCode, new Map());
    const byType = buckets.get(row.employeeCode)!;
    if (!byType.has(tt)) byType.set(tt, { calls: 0, days: new Set(), doctors: new Set(), amount: 0 });
    const b = byType.get(tt)!;
    b.calls += 1;
    b.amount += docPobValue(row, rates); // Round 41 Gap B -- real POB amount
    if (row.visitDateOnly) {
      b.days.add(row.visitDateOnly);
      const fd = fwdDays.get(row.employeeCode) || new Set<string>();
      fd.add(row.visitDateOnly); fwdDays.set(row.employeeCode, fd);
    }
    if (row.doctorId) b.doctors.add(String(row.doctorId));
  }

  return employees.map((emp: any) => {
    const empByType = buckets.get(emp.employeeCode) || new Map();
    const mappedByType = mappedDoctorsByEmpAndType.get(emp.employeeCode) || new Map();
    const territoryTypes: Record<string, unknown> = {};
    for (const tt of ["HQ", "EX", "OS"]) {
      const b = empByType.get(tt);
      const totalMapped = mappedByType.get(tt)?.size || 0;
      const tc = b?.calls || 0;
      const dw = b?.days.size || 0;
      const seen = b?.doctors.size || 0;
      territoryTypes[tt] = {
        tc,
        dw,
        met: seen,
        seen,
        coverage: totalMapped > 0 ? Number(((seen / totalMapped) * 100).toFixed(1)) : "-",
        calAvg: dw > 0 ? Number((tc / dw).toFixed(1)) : "-",
        amt: b && b.amount > 0 ? Number(b.amount.toFixed(2)) : "-",
        amtPerCall: b && b.amount > 0 && tc > 0 ? Number((b.amount / tc).toFixed(2)) : "-"
      };
    }
    let firstLevelManager = "-";
    let secondLevelManager = "-";
    const l1 = emp.reportingManager ? byEmpCode.get(emp.reportingManager) : null;
    if (l1) {
      firstLevelManager = (l1 as any).name || "-";
      const l2 = (l1 as any).reportingManager ? byEmpCode.get((l1 as any).reportingManager) : null;
      if (l2) secondLevelManager = (l2 as any).name || "-";
    }
    return {
      empCode: emp.employeeCode,
      doj: emp.joinDate || null,
      fieldForceName: emp.name,
      designation: emp.designation || "-",
      hq: emp.territory || "-",
      firstLevelManager,
      secondLevelManager,
      noOfFwd: fwdDays.get(emp.employeeCode)?.size || 0, // Round 41 -- real distinct field-work days
      noOfFwdExp: 0,
      ttlDrs: (mappedByType.get("HQ")?.size || 0) + (mappedByType.get("EX")?.size || 0) + (mappedByType.get("OS")?.size || 0),
      territoryTypes
    };
  });
}
