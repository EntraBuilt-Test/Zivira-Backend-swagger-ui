// src/utils/payroll.ts
// Zivira_Project_Basic.docx Topic 3 — Salary Integration Engine
//
// Keeps PayrollStatusModel in sync with the live compliance signal
// (utils/compliance.ts's `salaryHold`, itself driven by Topic 4's chronic-
// defaulter rule) without ever downgrading a status a human has already
// worked through this month. Shared by company.routes.ts (tenant-wide) and
// manager.routes.ts (team-scoped) so both read the same up-to-date state.
import { PayrollStatusModel } from "../models/payroll-status.model.js";
import { computeComplianceRows } from "./compliance.js";

export async function syncPayrollStatuses(
  tenantSlug: string,
  employees: { employeeCode: string; name?: string; joinDate?: Date | null }[],
  month: string
) {
  if (!employees.length) return [];

  const complianceRows = await computeComplianceRows(tenantSlug, employees, { month });
  const complianceByCode = new Map(complianceRows.map(r => [r.employeeCode, r]));

  const existing = await PayrollStatusModel.find({
    tenantSlug, month, employeeCode: { $in: employees.map(e => e.employeeCode) }
  });
  const existingByCode = new Map(existing.map(p => [p.employeeCode, p]));

  const results = [];
  for (const emp of employees) {
    const compliance = complianceByCode.get(emp.employeeCode);
    if (!compliance) continue;
    const record = existingByCode.get(emp.employeeCode);
    const holdReason = `Missed ${compliance.missedLast30Days} working-day DCR(s) in the last 30 days — chronic defaulter threshold exceeded.`;

    if (!record) {
      results.push(await PayrollStatusModel.create({
        tenantSlug, employeeCode: emp.employeeCode, month,
        status: compliance.salaryHold ? "HOLD" : "RELEASED",
        holdReason: compliance.salaryHold ? holdReason : null,
        missedDaysSnapshot: compliance.missedLast30Days,
        releasedAt: compliance.salaryHold ? null : new Date()
      }));
      continue;
    }

    // Only auto-transition RELEASED → HOLD if this month's record has never
    // been through a hold yet (holdReason null). Once a human has moved it
    // through the workflow (hold → explanation → approval), later polls
    // just refresh the missed-day snapshot rather than re-triggering it.
    if (record.status === "RELEASED" && !record.holdReason && compliance.salaryHold) {
      record.status = "HOLD";
      record.holdReason = holdReason;
      record.missedDaysSnapshot = compliance.missedLast30Days;
      record.releasedAt = null;
      await record.save();
    } else {
      record.missedDaysSnapshot = compliance.missedLast30Days;
      await record.save();
    }
    results.push(record);
  }
  return results;
}
