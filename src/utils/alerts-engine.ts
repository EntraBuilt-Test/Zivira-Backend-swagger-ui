// src/utils/alerts-engine.ts
// Zivira_Project_Basic.docx Topic 15 — Alert & Notification Engine
//
// A unified feed over signals every earlier topic already computes —
// DCR Not Submitted (Topic 2), Doctor Not Visited 90 Days (Topic 7),
// Product Not Promoted (Topic 9/10), Low Coverage (Topic 14), Sample Stock
// Low (Topic 11), Salary Hold (Topic 3), Territory Inactive (Topic 5/6) —
// rather than a new alerting subsystem. This is intentionally read-only
// (computed fresh on each request); a scheduled digest can be layered on
// top of notifyManager() later without changing this shape.
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { ProductModel } from "../models/product.model.js";
import { PayrollStatusModel } from "../models/payroll-status.model.js";
import { computeComplianceRows } from "./compliance.js";
import { computeProductExposureRows } from "./product-analytics.js";
import { computeSampleDistribution } from "./sample-distribution.js";
import { computeRepAnalysisRows } from "./rep-manager-analysis.js";

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";
export type Alert = {
  type: "DCR_NOT_SUBMITTED" | "DOCTOR_NOT_VISITED_90_DAYS" | "PRODUCT_NOT_PROMOTED" | "LOW_COVERAGE" | "SAMPLE_STOCK_LOW" | "SALARY_HOLD" | "TERRITORY_INACTIVE";
  severity: AlertSeverity;
  message: string;
  subjectCode?: string; // employeeCode / doctorId / productCode, whichever applies
  subjectLabel?: string;
};

const SAMPLE_STOCK_LOW_THRESHOLD = 10;
const LOW_COVERAGE_THRESHOLD_PERCENT = 50;

export async function computeAlerts(tenantSlug: string, month: string): Promise<Alert[]> {
  const alerts: Alert[] = [];

  const employees = await EmployeeModel.find(
    { tenantSlug, status: "ACTIVE" },
    { employeeCode: 1, name: 1, joinDate: 1, reportingManager: 1, territory: 1 }
  ).lean();

  // ── DCR Not Submitted (today, pending) — Topic 2 ──────────────────────
  const complianceRows = await computeComplianceRows(tenantSlug, employees, { month });
  for (const row of complianceRows) {
    if (row.pendingDCR) {
      alerts.push({ type: "DCR_NOT_SUBMITTED", severity: "MEDIUM", message: `${row.employeeName ?? row.employeeCode} has not submitted a DCR today.`, subjectCode: row.employeeCode, subjectLabel: row.employeeName });
    }
    if (row.salaryHold) {
      // handled below from PayrollStatusModel directly (authoritative workflow state)
    }
  }

  // ── Salary Hold — Topic 3 ──────────────────────────────────────────────
  const onHold = await PayrollStatusModel.find({ tenantSlug, month, status: { $in: ["HOLD", "EXPLANATION_SUBMITTED"] } }).lean();
  const nameByCode = new Map(employees.map(e => [e.employeeCode, e.name]));
  for (const p of onHold) {
    alerts.push({ type: "SALARY_HOLD", severity: "HIGH", message: `Payroll on hold for ${nameByCode.get(p.employeeCode) ?? p.employeeCode} — ${p.holdReason ?? "chronic DCR defaulter"}.`, subjectCode: p.employeeCode, subjectLabel: nameByCode.get(p.employeeCode) });
  }

  // ── Doctor Not Visited 90 Days — Topic 7 ───────────────────────────────
  const now = Date.now();
  const [doctors, lastVisitRows] = await Promise.all([
    DoctorModel.find({ tenantSlug, status: "ACTIVE" }, { name: 1 }).lean(),
    DcrModel.aggregate([
      { $match: { tenantSlug, status: { $ne: "REJECTED" } } },
      { $group: { _id: "$doctorId", lastVisitDate: { $max: "$visitDate" } } }
    ])
  ]);
  const lastVisitByDoctorId = new Map(lastVisitRows.map(r => [String(r._id), r.lastVisitDate as Date]));
  for (const doctor of doctors) {
    const last = lastVisitByDoctorId.get(String(doctor._id));
    const daysSince = last ? Math.floor((now - new Date(last).getTime()) / 86400000) : null;
    if (daysSince === null || daysSince >= 90) {
      alerts.push({
        type: "DOCTOR_NOT_VISITED_90_DAYS", severity: daysSince === null || daysSince >= 180 ? "HIGH" : "MEDIUM",
        message: `${doctor.name} has ${daysSince === null ? "never been visited" : `not been visited in ${daysSince} days`}.`,
        subjectCode: String(doctor._id), subjectLabel: doctor.name
      });
    }
  }

  // ── Product Not Promoted — Topic 9/10 ──────────────────────────────────
  const [products, exposureRows] = await Promise.all([
    ProductModel.find({ tenantSlug, status: "ACTIVE" }, { name: 1, code: 1 }).lean(),
    computeProductExposureRows(tenantSlug, month)
  ]);
  const promotedCodes = new Set(exposureRows.map(r => r.productCode));
  for (const product of products) {
    const code = product.code ?? undefined;
    const name = product.name ?? undefined;
    if (!code || !promotedCodes.has(code)) {
      alerts.push({ type: "PRODUCT_NOT_PROMOTED", severity: "LOW", message: `${name ?? "A product"} has not been promoted (no samples logged) this month.`, subjectCode: code, subjectLabel: name });
    }
  }

  // ── Sample Stock Low — Topic 11 ─────────────────────────────────────────
  const distribution = await computeSampleDistribution(tenantSlug, month);
  for (const row of distribution.byRep) {
    if (row.totalRemaining <= SAMPLE_STOCK_LOW_THRESHOLD && row.totalIssued > 0) {
      alerts.push({ type: "SAMPLE_STOCK_LOW", severity: row.totalRemaining <= 0 ? "HIGH" : "MEDIUM", message: `${row.employeeName ?? row.employeeCode} has only ${row.totalRemaining} sample unit(s) remaining.`, subjectCode: row.employeeCode, subjectLabel: row.employeeName });
    }
  }

  // ── Low Coverage / Territory Inactive — Topic 5/6/14 ────────────────────
  const repRows = await computeRepAnalysisRows(tenantSlug, employees, month);
  for (const row of repRows) {
    if (row.totalVisits === 0) {
      alerts.push({ type: "TERRITORY_INACTIVE", severity: "HIGH", message: `${row.employeeName ?? row.employeeCode} has logged zero DCRs this month — territory may be inactive.`, subjectCode: row.employeeCode, subjectLabel: row.employeeName });
    }
  }

  const territoryVisits = new Map<string, number>();
  const territoryDoctorCount = new Map<string, number>();
  for (const emp of employees) {
    if (!emp.territory) continue;
    territoryDoctorCount.set(emp.territory, (territoryDoctorCount.get(emp.territory) ?? 0) + 1);
  }
  for (const row of repRows) {
    const emp = employees.find(e => e.employeeCode === row.employeeCode);
    if (!emp?.territory) continue;
    territoryVisits.set(emp.territory, (territoryVisits.get(emp.territory) ?? 0) + row.doctorsVisited);
  }
  // Low coverage: fewer doctors visited than active doctors mapped to that territory's reps would suggest.
  const doctorsByTerritory = await DoctorModel.aggregate([
    { $match: { tenantSlug, status: "ACTIVE" } },
    { $lookup: { from: "employees", localField: "mappedEmployeeCode", foreignField: "employeeCode", as: "emp" } },
    { $unwind: { path: "$emp", preserveNullAndEmptyArrays: true } },
    { $group: { _id: "$emp.territory", totalDoctors: { $sum: 1 } } }
  ]);
  for (const t of doctorsByTerritory) {
    if (!t._id) continue;
    const totalDoctors = t.totalDoctors as number;
    const visited = territoryVisits.get(t._id) ?? 0;
    const coveragePercent = totalDoctors > 0 ? Math.round((visited / totalDoctors) * 100) : 100;
    if (coveragePercent < LOW_COVERAGE_THRESHOLD_PERCENT) {
      alerts.push({ type: "LOW_COVERAGE", severity: coveragePercent < 25 ? "HIGH" : "MEDIUM", message: `Territory ${t._id} coverage is ${coveragePercent}% (${visited}/${totalDoctors} doctors visited) this month.`, subjectCode: t._id, subjectLabel: t._id });
    }
  }

  const severityRank: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
