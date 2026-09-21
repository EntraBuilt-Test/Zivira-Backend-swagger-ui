// src/utils/rep-manager-analysis.ts
// Zivira_Project_Basic.docx Topic 5 — Representative vs Manager Analysis
// Topic 6 — Joint Field Work Analysis
//
// "Joint Visit" (docx's proposed Visit ID / Manager ID / MR ID / Doctor ID /
// Date / GPS / Duration table) is already captured on every DCR via
// jointWork + Topic 1's checkInTime/gpsLocation/visitDurationMinutes — no
// separate collection needed, this just aggregates DcrModel where
// jointWork.accompanyingManager is set. Joint-work attribution uses the
// employee's actual reportingManager (Employee model), not the free-text
// jointWork.accompanyingManager string an MR types on the DCR form, since
// that field isn't guaranteed to match an employeeCode/name exactly.
import { DcrModel } from "../models/dcr.model.js";

export type RepAnalysisRow = {
  employeeCode: string;
  employeeName?: string;
  reportingManager?: string | null;
  reportingManagerName?: string;
  doctorsVisited: number;
  totalVisits: number;
  jointVisits: number;
  jointVisitPercent: number;
};

export type ManagerJointWorkRow = {
  managerCode: string;
  managerName?: string;
  teamSize: number;
  totalTeamVisits: number;
  totalJointCalls: number;
  avgJointCallsPerRep: number;
  jointCallPercent: number;
  rank: number;
};

export async function computeRepAnalysisRows(
  tenantSlug: string,
  employees: { employeeCode: string; name?: string; reportingManager?: string | null }[],
  month: string
): Promise<RepAnalysisRow[]> {
  if (!employees.length) return [];
  const codes = employees.map(e => e.employeeCode);

  const stats = await DcrModel.aggregate([
    { $match: { tenantSlug, employeeCode: { $in: codes }, month, status: { $ne: "REJECTED" } } },
    { $group: {
        _id: "$employeeCode",
        totalVisits: { $sum: 1 },
        doctorIds: { $addToSet: "$doctorId" },
        jointVisits: { $sum: { $cond: [{ $ifNull: ["$jointWork.accompanyingManager", false] }, 1, 0] } }
    } }
  ]);
  const statsByCode = new Map(stats.map(s => [s._id as string, s]));

  return employees.map(emp => {
    const s = statsByCode.get(emp.employeeCode);
    const totalVisits = s?.totalVisits ?? 0;
    const jointVisits = s?.jointVisits ?? 0;
    return {
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      reportingManager: emp.reportingManager,
      doctorsVisited: s?.doctorIds?.filter((d: unknown) => d).length ?? 0,
      totalVisits,
      jointVisits,
      jointVisitPercent: totalVisits > 0 ? Math.round((jointVisits / totalVisits) * 100) : 0
    };
  });
}

// Rolls per-rep rows up to a per-manager view — "identifies managers who
// are not adequately supporting their teams" (docx, Topic 5).
export function computeManagerJointWorkRows(
  repRows: RepAnalysisRow[],
  managerNameByCode: Map<string, string | undefined>
): ManagerJointWorkRow[] {
  const byManager = new Map<string, RepAnalysisRow[]>();
  for (const row of repRows) {
    if (!row.reportingManager) continue;
    if (!byManager.has(row.reportingManager)) byManager.set(row.reportingManager, []);
    byManager.get(row.reportingManager)!.push(row);
  }

  const rows: Omit<ManagerJointWorkRow, "rank">[] = Array.from(byManager.entries()).map(([managerCode, reps]) => {
    const teamSize = reps.length;
    const totalTeamVisits = reps.reduce((s, r) => s + r.totalVisits, 0);
    const totalJointCalls = reps.reduce((s, r) => s + r.jointVisits, 0);
    return {
      managerCode,
      managerName: managerNameByCode.get(managerCode),
      teamSize,
      totalTeamVisits,
      totalJointCalls,
      avgJointCallsPerRep: teamSize > 0 ? Math.round((totalJointCalls / teamSize) * 10) / 10 : 0,
      jointCallPercent: totalTeamVisits > 0 ? Math.round((totalJointCalls / totalTeamVisits) * 100) : 0
    };
  });

  return rows
    .sort((a, b) => b.jointCallPercent - a.jointCallPercent)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
