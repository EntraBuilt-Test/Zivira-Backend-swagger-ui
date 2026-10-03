// src/utils/manager-analysis-compute.ts
// Round 37 Items 3/4/5 -- Manager Analysis: HQ-Coveragewise, Coverage
// Analysis 1, Joint Workwise. Reuses the same real data sources and
// per-day classification already built in Rounds 34-36
// (day-status.ts/buildDayStatusContext+classifyDay, DcrModel,
// ChemistCallModel, managerwiseCoreDoctorMap, custom-report-compute.ts)
// rather than reimplementing any of it. Everything below is computed from
// real documents; a field with no real backing anywhere in this schema
// (Nil/SUPER CORE's 4th tier, UnListed Drs Met, per-sub-HQ breakdown
// beyond one row per real team member) is explicitly called out in the
// comment next to it and returned as 0 / "-" rather than fabricated.

import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";
import { computeCustomReportMetrics } from "./custom-report-compute.js";
import { getDirectReports, getAllDescendants, getUpwardChain, type OrgEmployee } from "./org-hierarchy.js";

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

// Every "YYYY-MM" month string from fromMonth(inclusive) to toMonth(inclusive).
export function monthRange(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = fromMonth.split("-").map((v) => parseInt(v, 10));
  const [toY, toM] = toMonth.split("-").map((v) => parseInt(v, 10));
  let guard = 0;
  while ((y < toY || (y === toY && m <= toM)) && guard < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
    guard++;
  }
  return out.length > 0 ? out : [fromMonth];
}

export type DayCallsSummary = {
  calendarDays: number;
  sundaysHolidays: number;
  workingDaysExclHolSun: number;
  fieldworkDays: number;
  noFieldworkDays: number;
  leave: number;
  tpDeviationDays: number;
  listedDrsMet: number;
  listedDrsSeen: number;
  callAverage: number;
  morningCalls: number;
  eveningCalls: number;
  bothCalls: number;
  nilDrsMet: number; // unsupported -- see note below
  coreDrsMet: number;
  nCoreDrsMet: number;
  sCoreDrsMet: number; // unsupported -- see note below
};

// ── Item 3 -- "Day Wise Detail" + "Doctor Details" summary (shared by
// Days/Calls Only AND HQ/EX/OS wise modes) ──────────────────────────────
export async function computeDayCallsSummary(tenantSlug: string, employeeCode: string, month: string): Promise<DayCallsSummary> {
  const emp = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean() as any;
  const numDays = daysInMonth(month);
  if (!emp) {
    return { calendarDays: numDays, sundaysHolidays: 0, workingDaysExclHolSun: numDays, fieldworkDays: 0, noFieldworkDays: numDays, leave: 0, tpDeviationDays: 0, listedDrsMet: 0, listedDrsSeen: 0, callAverage: 0, morningCalls: 0, eveningCalls: 0, bothCalls: 0, nilDrsMet: 0, coreDrsMet: 0, nCoreDrsMet: 0, sCoreDrsMet: 0 };
  }
  const ctx = await buildDayStatusContext(tenantSlug, month, [employeeCode], [emp.state]);
  const dcrs = await DcrModel.find({ tenantSlug, employeeCode, month }).populate("doctorId").lean();
  const submittedDates = new Set((dcrs as any[]).map((d) => d.visitDateOnly));

  let fieldworkDays = 0, sundaysHolidays = 0, leave = 0, tpDeviationDays = 0;
  for (let d = 1; d <= numDays; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const status = classifyDay(ctx, employeeCode, key);
    if (status.kind === "tour") {
      fieldworkDays++;
      if (!submittedDates.has(key)) tpDeviationDays++;
    } else if (status.kind === "holiday" || status.kind === "weeklyOff") sundaysHolidays++;
    else if (status.kind === "leave") leave++;
  }
  const workingDaysExclHolSun = numDays - sundaysHolidays;
  const noFieldworkDays = workingDaysExclHolSun - fieldworkDays - leave;

  const listedDoctorIds = new Set((dcrs as any[]).map((d) => String(d.doctorId?._id || d.doctorId)));
  const listedDrsMet = listedDoctorIds.size;
  const listedDrsSeen = listedDrsMet;
  const callAverage = fieldworkDays > 0 ? +(dcrs.length / fieldworkDays).toFixed(2) : 0;
  let morningCalls = 0, eveningCalls = 0, bothCalls = 0;
  const sessionsByDate = new Map<string, Set<string>>();
  for (const d of dcrs as any[]) {
    if (d.callSession === "MORNING") morningCalls++;
    else if (d.callSession === "EVENING") eveningCalls++;
    const set = sessionsByDate.get(d.visitDateOnly) || new Set<string>();
    set.add(d.callSession);
    sessionsByDate.set(d.visitDateOnly, set);
  }
  for (const set of sessionsByDate.values()) {
    if (set.has("MORNING") && set.has("EVENING")) bothCalls++;
  }

  // Core/Non-Core via real managerwiseCoreDoctorMap isCore flag. Nil and
  // SUPER CORE have no distinct real tier in this schema -- the only real
  // classification here is a binary isCore Yes/No, not a 4-tier scheme --
  // so both stay honestly 0 rather than guessed.
  let coreDrsMet = 0, nCoreDrsMet = 0;
  try {
    const CoreMapModel = getMasterModel("managerwiseCoreDoctorMap");
    const coreRows = await CoreMapModel.find({ tenantSlug, mrName: emp.name }).lean();
    const coreCodes = new Set((coreRows as any[]).filter((r) => r.isCore === "Yes").map((r) => r.doctorCode));
    const nonCoreCodes = new Set((coreRows as any[]).filter((r) => r.isCore === "No").map((r) => r.doctorCode));
    const metCodes = new Set((dcrs as any[]).map((d) => d.doctorId?.doctorCode).filter(Boolean));
    coreDrsMet = Array.from(coreCodes).filter((c) => metCodes.has(c)).length;
    nCoreDrsMet = Array.from(nonCoreCodes).filter((c) => metCodes.has(c)).length;
  } catch { /* managerwiseCoreDoctorMap not configured for this tenant */ }

  return {
    calendarDays: numDays, sundaysHolidays, workingDaysExclHolSun, fieldworkDays, noFieldworkDays: Math.max(noFieldworkDays, 0),
    leave, tpDeviationDays, listedDrsMet, listedDrsSeen, callAverage, morningCalls, eveningCalls, bothCalls,
    nilDrsMet: 0, coreDrsMet, nCoreDrsMet, sCoreDrsMet: 0
  };
}

function sumSummaries(rows: DayCallsSummary[]): DayCallsSummary {
  const out: DayCallsSummary = { calendarDays: 0, sundaysHolidays: 0, workingDaysExclHolSun: 0, fieldworkDays: 0, noFieldworkDays: 0, leave: 0, tpDeviationDays: 0, listedDrsMet: 0, listedDrsSeen: 0, callAverage: 0, morningCalls: 0, eveningCalls: 0, bothCalls: 0, nilDrsMet: 0, coreDrsMet: 0, nCoreDrsMet: 0, sCoreDrsMet: 0 };
  for (const r of rows) {
    out.calendarDays += r.calendarDays; out.sundaysHolidays += r.sundaysHolidays; out.workingDaysExclHolSun += r.workingDaysExclHolSun;
    out.fieldworkDays += r.fieldworkDays; out.noFieldworkDays += r.noFieldworkDays; out.leave += r.leave; out.tpDeviationDays += r.tpDeviationDays;
    out.listedDrsMet += r.listedDrsMet; out.listedDrsSeen += r.listedDrsSeen; out.morningCalls += r.morningCalls; out.eveningCalls += r.eveningCalls; out.bothCalls += r.bothCalls;
    out.coreDrsMet += r.coreDrsMet; out.nCoreDrsMet += r.nCoreDrsMet;
  }
  out.callAverage = rows.length > 0 ? +(rows.reduce((s, r) => s + r.callAverage, 0) / rows.length).toFixed(2) : 0;
  return out;
}

export async function computeDayCallsSummaryRange(tenantSlug: string, employeeCode: string, months: string[]) {
  const perMonth: Record<string, DayCallsSummary> = {};
  for (const m of months) perMonth[m] = await computeDayCallsSummary(tenantSlug, employeeCode, m);
  const total = sumSummaries(Object.values(perMonth));
  return { perMonth, total };
}

// ── Item 3 -- "HQ/EX/OS wise" second table: one real row per team member,
// labeled by that member's own real HQ/territory, their own name in
// parens (legacy's "Alleppey (Akhil Thankachan)" format) ────────────────
export async function computeHqExOsRow(tenantSlug: string, member: OrgEmployee, months: string[]) {
  const perMonth: Record<string, { daysWorked: { hq: number; ex: number; os: number; total: number }; totalDoctorCalls: { hq: number; ex: number; os: number; total: number } }> = {};
  const totals = { daysWorked: { hq: 0, ex: 0, os: 0, total: 0 }, totalDoctorCalls: { hq: 0, ex: 0, os: 0, total: 0 } };
  for (const month of months) {
    const metrics = await computeCustomReportMetrics(tenantSlug, member.employeeCode, month);
    const hqDays = Number(metrics.hqDays || 0), exDays = Number(metrics.exDays || 0), osDays = Number(metrics.osDays || 0);
    const hqMet = Number(metrics.hqMet || 0), exMet = Number(metrics.exMet || 0), osMet = Number(metrics.osMet || 0);
    const daysWorked = { hq: hqDays, ex: exDays, os: osDays, total: hqDays + exDays + osDays };
    const totalDoctorCalls = { hq: hqMet, ex: exMet, os: osMet, total: hqMet + exMet + osMet };
    perMonth[month] = { daysWorked, totalDoctorCalls };
    totals.daysWorked.hq += daysWorked.hq; totals.daysWorked.ex += daysWorked.ex; totals.daysWorked.os += daysWorked.os; totals.daysWorked.total += daysWorked.total;
    totals.totalDoctorCalls.hq += totalDoctorCalls.hq; totals.totalDoctorCalls.ex += totalDoctorCalls.ex; totals.totalDoctorCalls.os += totalDoctorCalls.os; totals.totalDoctorCalls.total += totalDoctorCalls.total;
  }
  return {
    hqName: member.territory || "-",
    repName: member.name,
    employeeCode: member.employeeCode,
    perMonth,
    totals
  };
}

// ── Item 3 -- "Detail" mode: one real row per team member ───────────────
export async function computeDetailRow(tenantSlug: string, member: OrgEmployee, months: string[]) {
  const perMonth: Record<string, { fwDays: number; nfwDays: number; v1: number; v2: number; missed: number; morningCalls: number; eveningCalls: number; bothCalls: number; met: number; totalCalls: number; avgCalls: number }> = {};
  let startDcrDate: string | null = null, lastDcrDate: string | null = null;
  for (const month of months) {
    const summary = await computeDayCallsSummary(tenantSlug, member.employeeCode, month);
    const metrics = await computeCustomReportMetrics(tenantSlug, member.employeeCode, month);
    const dcrs = await DcrModel.find({ tenantSlug, employeeCode: member.employeeCode, month }).sort({ visitDateOnly: 1 }).lean();
    if (dcrs.length > 0) {
      const first = (dcrs[0] as any).visitDateOnly, last = (dcrs[dcrs.length - 1] as any).visitDateOnly;
      if (!startDcrDate || first < startDcrDate) startDcrDate = first;
      if (!lastDcrDate || last > lastDcrDate) lastDcrDate = last;
    }
    const v1 = Number(metrics.visit1Drs || 0);
    const v2Plus = Number(metrics.visit2Drs || 0) + Number(metrics.visit3Drs || 0) + Number(metrics.visitMoreThan3Drs || 0);
    const totalDoctorsInList = Number(metrics.totalDoctorsInList || 0);
    const missed = Math.max(totalDoctorsInList - summary.listedDrsMet, 0);
    perMonth[month] = {
      fwDays: summary.fieldworkDays, nfwDays: summary.noFieldworkDays,
      v1, v2: v2Plus, missed,
      morningCalls: summary.morningCalls, eveningCalls: summary.eveningCalls, bothCalls: summary.bothCalls,
      met: summary.listedDrsMet, totalCalls: dcrs.length, avgCalls: summary.callAverage
    };
  }
  return {
    employeeCode: member.employeeCode, name: member.name, designation: member.designation, hq: member.territory,
    doj: member.joinDate || null, startDcrDate, lastDcrDate, perMonth
  };
}

// ── Item 4 -- Coverage Analysis 1 pivot (curated subset of real metrics
// already computed elsewhere in custom-report-compute.ts) ───────────────
export async function computeCoverageAnalysis1(tenantSlug: string, employeeCode: string, month: string) {
  const metrics = await computeCustomReportMetrics(tenantSlug, employeeCode, month);
  const masterListDoctors = Number(metrics.totalDoctorsInList || 0);
  const doctorsMet = Number(metrics.listedDrsMet || 0);
  const coveragePct = Number(metrics.lstDrCoveragePct || 0);
  const listedDrsMissed = Number(metrics.lstDrMissedCall || 0);
  const visit2Plus = Number(metrics.visit2Drs || 0) + Number(metrics.visit3Drs || 0) + Number(metrics.visitMoreThan3Drs || 0);
  const repeatedCallsMet = visit2Plus;
  const repeatedCoveragePct = masterListDoctors > 0 ? +((repeatedCallsMet / masterListDoctors) * 100).toFixed(1) : 0;
  return {
    callDetails: {
      masterListDoctors, doctorsMet, coveragePct, listedDrsMissed,
      // No real unlisted-doctor-visit linkage exists anywhere in this
      // schema -- DcrModel.doctorId only ever references the listed
      // DoctorModel, never UnlistedDoctorModel -- so this is honestly 0.
      unlistedDrsMet: 0
    },
    attendance: {
      daysWorked: Number(metrics.fwDays || 0), daysField: Number(metrics.fwDays || 0),
      daysNonField: Number(metrics.nfwDays || 0), daysOnLeave: Number(metrics.leave || 0)
    },
    summary: {
      doctorsCallsSeen: doctorsMet, doctorsCallAverage: Number(metrics.lstDrCallAverage || 0),
      chemistCallsSeen: Number(metrics.chemistsMet || 0), chemistCallAverage: Number(metrics.chemCallAverage || 0)
    },
    jointWork: {
      days: Number(metrics.jointWorkDays || 0), callsMet: Number(metrics.jointCallsMet || 0),
      callsSeen: Number(metrics.jointCallsSeen || 0), callAverage: Number(metrics.jointCallAvg || 0)
    },
    repeatedCalls: { met: repeatedCallsMet, coveragePct: repeatedCoveragePct }
  };
}

// ── Item 5 -- Joint Work Analysis: reuses the exact same real
// jointWork.accompanyingManager data custom-report-compute.ts's Join Work
// Info already sources ────────────────────────────────────────────────
export async function computeJointWorkForEmployee(tenantSlug: string, employeeCode: string, month: string) {
  const dcrs = await DcrModel.find({ tenantSlug, employeeCode, month, "jointWork.accompanyingManager": { $exists: true, $ne: null } }).lean();
  const real = (dcrs as any[]).filter((d) => d.jointWork?.accompanyingManager);
  if (real.length === 0) return null; // genuinely no joint-work entries this period -- "-"
  const dates = [...new Set(real.map((d) => d.visitDateOnly))].sort();
  return { days: dates.length, dates, calls: real.length };
}

// Joint work specifically attributed to one named manager (matched against
// jointWork.accompanyingManager free-text field) -- used by Item 5's
// MR-DCR mode nested upward-chain rows.
export async function computeJointWorkWithManager(tenantSlug: string, employeeCode: string, managerName: string, month: string) {
  const dcrs = await DcrModel.find({ tenantSlug, employeeCode, month, "jointWork.accompanyingManager": managerName }).lean();
  if (dcrs.length === 0) return null;
  const dates = [...new Set((dcrs as any[]).map((d) => d.visitDateOnly))].sort();
  return { days: dates.length, dates, calls: dcrs.length };
}

export { getDirectReports, getAllDescendants, getUpwardChain };
