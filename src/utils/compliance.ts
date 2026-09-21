// Zivira_Project_Basic.docx Topic 2 — Attendance & Compliance Analytics
// Topic 4 — Chronic Defaulter Detection
//
// Shared aggregation so Admin (tenant-wide, company.routes.ts) and Manager
// (team-scoped, manager.routes.ts) don't duplicate this Mongo logic — same
// pattern already used for enrich-employee-names.ts / enrich-tour-plans.ts.
//
// Simplifying assumption (no per-tenant holiday-calendar join yet): a
// "working day" is any calendar day that isn't a Sunday. HolidayModel exists
// for state-level weekend/holiday config but wiring that in per-employee is
// out of scope for v1 — this can be layered on without changing the shape
// of EmployeeComplianceRow.
import { DcrModel } from "../models/dcr.model.js";

function isWorkingDay(date: Date) {
  return date.getUTCDay() !== 0; // 0 = Sunday
}

function toDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function workingDaysBetween(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= last) {
    if (isWorkingDay(cur)) days.push(toDateOnly(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export type ComplianceWarningLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type EmployeeComplianceRow = {
  employeeCode: string;
  employeeName?: string;
  submittedToday: boolean;
  pendingDCR: boolean;
  missedYesterday: boolean;
  missedThisWeek: number;
  missedThisMonth: number;
  expectedThisMonth: number;
  submittedThisMonth: number;
  compliancePercent: number;
  // Topic 4 — "Missed DCR > 5 Within 30 Days" → Chronic Defaulter
  missedLast30Days: number;
  chronicDefaulter: boolean;
  warningLevel: ComplianceWarningLevel;
  salaryHold: boolean;
};

function warningLevelFor(missed: number): ComplianceWarningLevel {
  if (missed > 5) return "HIGH";
  if (missed >= 4) return "MEDIUM";
  if (missed >= 2) return "LOW";
  return "NONE";
}

export async function computeComplianceRows(
  tenantSlug: string,
  employees: { employeeCode: string; name?: string; joinDate?: Date | null }[],
  opts: { month?: string; asOf?: Date } = {}
): Promise<EmployeeComplianceRow[]> {
  const now = opts.asOf ?? new Date();
  const today = toDateOnly(now);
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterday = toDateOnly(yesterdayDate);

  const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthStr = opts.month ?? currentMonthStr;
  const [monthYear, monthNum] = monthStr.split("-").map(Number);
  const monthStart = new Date(Date.UTC(monthYear, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(monthYear, monthNum, 0));
  const isCurrentMonth = monthStr === currentMonthStr;
  const monthWindowEnd = isCurrentMonth ? now : monthEnd;

  // Week start = most recent Monday on/before "now"
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = weekStart.getUTCDay();
  weekStart.setUTCDate(weekStart.getUTCDate() - (dow === 0 ? 6 : dow - 1));

  const last30Start = new Date(now.getTime() - 29 * 86400000);
  const queryStart = monthStart < last30Start ? monthStart : last30Start;

  const employeeCodes = employees.map(e => e.employeeCode);
  const dcrDates = employeeCodes.length ? await DcrModel.aggregate([
    { $match: {
        tenantSlug, employeeCode: { $in: employeeCodes },
        status: { $ne: "REJECTED" },
        visitDateOnly: { $gte: toDateOnly(queryStart), $lte: today }
    } },
    { $group: { _id: { employeeCode: "$employeeCode", day: "$visitDateOnly" } } }
  ]) : [];

  const submittedByEmployee = new Map<string, Set<string>>();
  for (const row of dcrDates as { _id: { employeeCode: string; day: string } }[]) {
    const { employeeCode: code, day } = row._id;
    if (!submittedByEmployee.has(code)) submittedByEmployee.set(code, new Set());
    submittedByEmployee.get(code)!.add(day);
  }

  return employees.map(emp => {
    const submitted = submittedByEmployee.get(emp.employeeCode) ?? new Set<string>();
    const joinDate = emp.joinDate ?? undefined;
    const effFrom = (from: Date) => (joinDate && joinDate > from ? joinDate : from);

    const monthWorkingDays = workingDaysBetween(effFrom(monthStart), monthWindowEnd);
    const submittedThisMonth = monthWorkingDays.filter(d => submitted.has(d)).length;
    const missedThisMonth = monthWorkingDays.length - submittedThisMonth;
    const compliancePercent = monthWorkingDays.length > 0 ? Math.round((submittedThisMonth / monthWorkingDays.length) * 100) : 100;

    const weekWorkingDays = workingDaysBetween(effFrom(weekStart), now).filter(d => d <= today);
    const missedThisWeek = weekWorkingDays.filter(d => !submitted.has(d)).length;

    const last30WorkingDays = workingDaysBetween(effFrom(last30Start), now);
    const missedLast30Days = last30WorkingDays.filter(d => !submitted.has(d)).length;

    const todayIsWorking = isWorkingDay(now);
    const submittedToday = todayIsWorking ? submitted.has(today) : true;
    const pendingDCR = todayIsWorking && !submittedToday;

    const missedYesterday = isWorkingDay(yesterdayDate) && (!joinDate || joinDate <= yesterdayDate)
      ? !submitted.has(yesterday)
      : false;

    const chronicDefaulter = missedLast30Days > 5;

    return {
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      submittedToday,
      pendingDCR,
      missedYesterday,
      missedThisWeek,
      missedThisMonth,
      expectedThisMonth: monthWorkingDays.length,
      submittedThisMonth,
      compliancePercent,
      missedLast30Days,
      chronicDefaulter,
      warningLevel: warningLevelFor(missedLast30Days),
      salaryHold: chronicDefaulter
    };
  });
}
