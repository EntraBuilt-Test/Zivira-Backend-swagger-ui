// src/utils/kpi-engine.ts
// Zivira_Project_Basic.docx Topic 14 — KPI Engine
//
// Composes the aggregation utilities already built for Topics 2/5/6 rather
// than re-deriving anything from scratch: computeComplianceRows (DCR
// submitted / compliance %) and computeRepAnalysisRows (doctors visited /
// joint calls) are both reused here. The only new aggregation is
// products-promoted / samples-distributed per rep, and prescription-based
// "conversion rate" — this system has no real sales/prescription data, so
// conversion rate is explicitly a proxy: the % of DCR visits this month
// where prescriptionInterest was HIGH or MEDIUM.
import { DcrModel } from "../models/dcr.model.js";
import { computeComplianceRows } from "./compliance.js";
import { computeRepAnalysisRows, computeManagerJointWorkRows } from "./rep-manager-analysis.js";

export type RepKpiRow = {
  employeeCode: string;
  employeeName?: string;
  doctorsVisited: number;
  dcrSubmitted: number;
  productsPromoted: number;
  samplesDistributed: number;
  conversionRatePercent: number; // proxy: % of visits with HIGH/MEDIUM prescriptionInterest
  compliancePercent: number;
};

export type ManagerKpiRow = {
  managerCode: string;
  managerName?: string;
  teamSize: number;
  jointCallPercent: number;
  teamCompliancePercent: number;
  doctorCoveragePercent: number; // % of team's DCR visits that were to distinct doctors (proxy for spread vs repeat-visiting the same few)
  managerEffectivenessScore: number; // simple composite: avg(jointCallPercent, teamCompliancePercent)
};

export async function computeKpiEngine(
  tenantSlug: string,
  employees: { employeeCode: string; name?: string; reportingManager?: string | null; joinDate?: Date | null }[],
  month: string
) {
  const [complianceRows, repRows, promoStats] = await Promise.all([
    computeComplianceRows(tenantSlug, employees, { month }),
    computeRepAnalysisRows(tenantSlug, employees, month),
    DcrModel.aggregate([
      { $match: { tenantSlug, employeeCode: { $in: employees.map(e => e.employeeCode) }, month, status: { $ne: "REJECTED" } } },
      { $unwind: "$samplesGiven" },
      { $group: {
          _id: "$employeeCode",
          productCodes: { $addToSet: "$samplesGiven.productCode" },
          samplesDistributed: { $sum: "$samplesGiven.qty" },
          highOrMediumInterest: { $sum: { $cond: [{ $in: ["$prescriptionInterest", ["HIGH", "MEDIUM"]] }, 1, 0] } },
          totalVisitsWithSamples: { $sum: 1 }
      } }
    ])
  ]);

  const complianceByCode = new Map(complianceRows.map(r => [r.employeeCode, r]));
  const repByCode = new Map(repRows.map(r => [r.employeeCode, r]));
  const promoByCode = new Map(promoStats.map(r => [r._id as string, r]));

  const repKpis: RepKpiRow[] = employees.map(emp => {
    const compliance = complianceByCode.get(emp.employeeCode);
    const rep = repByCode.get(emp.employeeCode);
    const promo = promoByCode.get(emp.employeeCode);
    const totalVisitsWithSamples = promo?.totalVisitsWithSamples ?? 0;
    return {
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      doctorsVisited: rep?.doctorsVisited ?? 0,
      dcrSubmitted: rep?.totalVisits ?? 0,
      productsPromoted: promo?.productCodes?.filter((c: unknown) => c).length ?? 0,
      samplesDistributed: promo?.samplesDistributed ?? 0,
      conversionRatePercent: totalVisitsWithSamples > 0 ? Math.round((promo!.highOrMediumInterest / totalVisitsWithSamples) * 100) : 0,
      compliancePercent: compliance?.compliancePercent ?? 100
    };
  });

  const managerNameByCode = new Map(employees.map(e => [e.employeeCode, e.name]));
  const jointWorkRows = computeManagerJointWorkRows(repRows, managerNameByCode);

  const teamComplianceByManager = new Map<string, number[]>();
  for (const emp of employees) {
    if (!emp.reportingManager) continue;
    const compliance = complianceByCode.get(emp.employeeCode);
    if (!compliance) continue;
    if (!teamComplianceByManager.has(emp.reportingManager)) teamComplianceByManager.set(emp.reportingManager, []);
    teamComplianceByManager.get(emp.reportingManager)!.push(compliance.compliancePercent);
  }

  const managerKpis: ManagerKpiRow[] = jointWorkRows.map(m => {
    const complianceScores = teamComplianceByManager.get(m.managerCode) ?? [];
    const teamCompliancePercent = complianceScores.length ? Math.round(complianceScores.reduce((s, v) => s + v, 0) / complianceScores.length) : 100;
    const teamReps = repRows.filter(r => r.reportingManager === m.managerCode);
    const totalDoctorsVisited = teamReps.reduce((s, r) => s + r.doctorsVisited, 0);
    const totalVisits = teamReps.reduce((s, r) => s + r.totalVisits, 0);
    const doctorCoveragePercent = totalVisits > 0 ? Math.round((totalDoctorsVisited / totalVisits) * 100) : 0;
    return {
      managerCode: m.managerCode,
      managerName: m.managerName,
      teamSize: m.teamSize,
      jointCallPercent: m.jointCallPercent,
      teamCompliancePercent,
      doctorCoveragePercent,
      managerEffectivenessScore: Math.round((m.jointCallPercent + teamCompliancePercent) / 2)
    };
  });

  return { repKpis, managerKpis };
}
