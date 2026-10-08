// src/utils/day-status.ts
// Round 34 -- shared per-day classification for one employee, reused by
// every TP/DCR legacy-parity report that needs to know what a given
// calendar date "was" for a rep: a real planned Tour Plan location, a
// state holiday, the weekly off, approved leave, or genuinely nothing
// planned. Mirrors the same simplification already established in
// computeWorkingDays (company.routes.ts) -- Sunday is the weekly off
// (this schema has no other weekly-off-day concept anywhere), and state
// holidays come from HolidayModel.otherHolidayDate for the employee's own
// `state` field.

import { HolidayModel } from "../models/holiday.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";

export type DayStatus =
  | { kind: "tour"; area: string; town: string; purpose: string }
  | { kind: "holiday"; name: string }
  | { kind: "weeklyOff" }
  | { kind: "leave"; leaveType: string; workTypeCode?: string }
  | { kind: "notPlanned" };

export type DayStatusContext = {
  holidaysByDate: Map<string, string>; // 'YYYY-MM-DD' -> description
  leaveRangesByEmployee: Map<string, { from: Date; to: Date; leaveType: string; workTypeCode?: string }[]>;
  tourPlanByEmployee: Map<string, Map<string, { area: string; town: string; purpose: string }>>; // employeeCode -> date -> location
};

export async function buildDayStatusContext(tenantSlug: string, month: string, employeeCodes: string[], states: (string | null | undefined)[]): Promise<DayStatusContext> {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  const monthStart = new Date(Date.UTC(year, mon - 1, 1));
  const monthEnd = new Date(Date.UTC(year, mon, 1));

  const distinctStates = Array.from(new Set(states.filter((s): s is string => !!s)));
  const holidaysByDate = new Map<string, string>();
  if (distinctStates.length > 0) {
    const holidays = await HolidayModel.find({
      tenantSlug,
      stateName: { $in: [...distinctStates, "All", "ALL", "all"] },   // a holiday uploaded for State "All" (national) applies to every state
      status: "ACTIVE",
      otherHolidayDate: { $gte: monthStart, $lt: monthEnd }
    }).lean();
    for (const h of holidays as any[]) {
      if (!h.otherHolidayDate) continue;
      const hd = new Date(h.otherHolidayDate);
      const key = `${hd.getUTCFullYear()}-${String(hd.getUTCMonth() + 1).padStart(2, "0")}-${String(hd.getUTCDate()).padStart(2, "0")}`;
      holidaysByDate.set(key, h.otherHolidayDescription || "Holiday");
    }
  }

  const leaves = employeeCodes.length
    ? await LeaveApplicationModel.find({
        tenantSlug,
        employeeCode: { $in: employeeCodes },
        status: "APPROVED",
        fromDate: { $lt: monthEnd },
        toDate: { $gte: monthStart }
      }).lean()
    : [];
  const leaveRangesByEmployee = new Map<string, { from: Date; to: Date; leaveType: string; workTypeCode?: string }[]>();
  for (const l of leaves as any[]) {
    const arr = leaveRangesByEmployee.get(l.employeeCode) || [];
    arr.push({ from: new Date(l.fromDate), to: new Date(l.toDate), leaveType: l.leaveType, workTypeCode: l.workTypeCode || undefined });
    leaveRangesByEmployee.set(l.employeeCode, arr);
  }

  const tourPlans = employeeCodes.length
    ? await TourPlanModel.find({ tenantSlug, employeeCode: { $in: employeeCodes }, month, status: { $ne: "VOIDED" } }).lean()
    : [];
  const tourPlanByEmployee = new Map<string, Map<string, { area: string; town: string; purpose: string }>>();
  for (const tp of tourPlans as any[]) {
    const dateMap = tourPlanByEmployee.get(tp.employeeCode) || new Map();
    for (const loc of tp.locations || []) {
      dateMap.set(loc.date, { area: loc.area, town: loc.town, purpose: loc.purpose || "" });
    }
    tourPlanByEmployee.set(tp.employeeCode, dateMap);
  }

  return { holidaysByDate, leaveRangesByEmployee, tourPlanByEmployee };
}

export function classifyDay(ctx: DayStatusContext, employeeCode: string, dateStr: string): DayStatus {
  const date = new Date(`${dateStr}T00:00:00Z`);

  const tourEntry = ctx.tourPlanByEmployee.get(employeeCode)?.get(dateStr);
  if (tourEntry) return { kind: "tour", ...tourEntry };

  const holidayName = ctx.holidaysByDate.get(dateStr);
  if (holidayName) return { kind: "holiday", name: holidayName };

  if (date.getUTCDay() === 0) return { kind: "weeklyOff" };

  const leaveRanges = ctx.leaveRangesByEmployee.get(employeeCode) || [];
  for (const range of leaveRanges) {
    if (date >= range.from && date <= range.to) return { kind: "leave", leaveType: range.leaveType, workTypeCode: range.workTypeCode };
  }

  return { kind: "notPlanned" };
}

export function dayStatusLabel(status: DayStatus): string {
  switch (status.kind) {
    case "tour": {
      const tag = status.area ? ` (${status.area})` : "";
      return `${status.town}${tag}`;
    }
    case "holiday": return status.name;
    case "weeklyOff": return "Weekly Off";
    case "leave": return "Leave";
    case "notPlanned": return "";
  }
}
