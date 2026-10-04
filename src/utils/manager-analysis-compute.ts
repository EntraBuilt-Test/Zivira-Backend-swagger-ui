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
import { DoctorModel } from "../models/doctor.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";
import { computeCustomReportMetrics } from "./custom-report-compute.js";
import { getDirectReports, getAllDescendants, getUpwardChain, type OrgEmployee } from "./org-hierarchy.js";
import { loadCoreMap, tierOfDoctor, type Tier } from "./doctor-tier.js";

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
  // Round 41 item 2 -- real 4-tier DoctorModel.doctorCategory (legacy isCore
  // flag only as a fallback for never-migrated doctors), so Nil and S CORE
  // are real counts now.
  const coreMap = await loadCoreMap(tenantSlug, [emp.name]);
  const metByTier: Record<Tier, Set<string>> = { Nil: new Set(), CORE: new Set(), "N CORE": new Set(), "S CORE": new Set() };
  for (const d of dcrs as any[]) {
    if (!d.doctorId) continue;
    metByTier[tierOfDoctor(d.doctorId, coreMap, emp.name)].add(String(d.doctorId._id));
  }
  const nilDrsMet = metByTier.Nil.size, coreDrsMet = metByTier.CORE.size, nCoreDrsMet = metByTier["N CORE"].size, sCoreDrsMet = metByTier["S CORE"].size;

  return {
    calendarDays: numDays, sundaysHolidays, workingDaysExclHolSun, fieldworkDays, noFieldworkDays: Math.max(noFieldworkDays, 0),
    leave, tpDeviationDays, listedDrsMet, listedDrsSeen, callAverage, morningCalls, eveningCalls, bothCalls,
    nilDrsMet, coreDrsMet, nCoreDrsMet, sCoreDrsMet
  };
}

function sumSummaries(rows: DayCallsSummary[]): DayCallsSummary {
  const out: DayCallsSummary = { calendarDays: 0, sundaysHolidays: 0, workingDaysExclHolSun: 0, fieldworkDays: 0, noFieldworkDays: 0, leave: 0, tpDeviationDays: 0, listedDrsMet: 0, listedDrsSeen: 0, callAverage: 0, morningCalls: 0, eveningCalls: 0, bothCalls: 0, nilDrsMet: 0, coreDrsMet: 0, nCoreDrsMet: 0, sCoreDrsMet: 0 };
  for (const r of rows) {
    out.calendarDays += r.calendarDays; out.sundaysHolidays += r.sundaysHolidays; out.workingDaysExclHolSun += r.workingDaysExclHolSun;
    out.fieldworkDays += r.fieldworkDays; out.noFieldworkDays += r.noFieldworkDays; out.leave += r.leave; out.tpDeviationDays += r.tpDeviationDays;
    out.listedDrsMet += r.listedDrsMet; out.listedDrsSeen += r.listedDrsSeen; out.morningCalls += r.morningCalls; out.eveningCalls += r.eveningCalls; out.bothCalls += r.bothCalls;
    out.coreDrsMet += r.coreDrsMet; out.nCoreDrsMet += r.nCoreDrsMet; out.nilDrsMet += r.nilDrsMet; out.sCoreDrsMet += r.sCoreDrsMet;
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

// Round 38 Item 1 -- FieldWork Manager - Analysis. Reuses the exact same
// real jointWork.accompanyingManager data Joint Workwise (Round 37) reads,
// bucketed by the REAL designation of whichever manager accompanied each
// rep (resolved by matching the free-text accompanyingManager name to a
// real EmployeeModel row and reading its real designation field).
export const FIELDWORK_DESIGNATION_CODES = ["BM", "BH", "BDE", "RBM", "Sr.RBM", "ABM", "ZBM", "BDM", "BRM", "NBM", "Sr ABM", "HM", "MH", "SM"];

export async function computeFieldworkManagerRow(tenantSlug: string, member: OrgEmployee, months: string[]) {
  // Round 41 item 6 -- First / Second Level Manager names from the real
  // upward reporting chain (was the raw manager employee CODE).
  const chain = await getUpwardChain(tenantSlug, member.employeeCode);
  // Build a name -> designation lookup once per rep's real DCR set (most
  // tenants have a small manager roster, so this stays cheap).
  const perMonth: Record<string, Record<string, number>> = {};
  for (const month of months) {
    const dcrs = await DcrModel.find({ tenantSlug, employeeCode: member.employeeCode, month, "jointWork.accompanyingManager": { $exists: true, $ne: null } }).lean();
    const real = (dcrs as any[]).filter((d) => d.jointWork?.accompanyingManager);
    const byDesignation: Record<string, number> = {};
    if (real.length > 0) {
      const names = [...new Set(real.map((d) => d.jointWork.accompanyingManager as string))];
      const managers = await EmployeeModel.find({ tenantSlug, name: { $in: names } }).select("name designation").lean();
      const designationByName = new Map((managers as any[]).map((m) => [m.name, m.designation]));
      const daysByDesignation = new Map<string, Set<string>>();
      for (const d of real) {
        const designation = designationByName.get(d.jointWork.accompanyingManager);
        if (!designation || !FIELDWORK_DESIGNATION_CODES.includes(designation)) continue;
        const set = daysByDesignation.get(designation) || new Set<string>();
        set.add(d.visitDateOnly);
        daysByDesignation.set(designation, set);
      }
      for (const [designation, dates] of daysByDesignation) byDesignation[designation] = dates.size;
    }
    perMonth[month] = byDesignation;
  }
  return {
    employeeCode: member.employeeCode, name: member.name, designation: member.designation, hq: member.territory,
    joinDate: member.joinDate || null,
    firstLevelManager: chain[0]?.name || null,
    secondLevelManager: chain[1]?.name || null,
    perMonth
  };
}

// Round 38 Item 2 -- Manager Wise - Coverage Analysis. The coordinator's
// own message says the legacy result shape for this screen was cut off
// mid-description with no screenshot -- this is a disclosed INFERENCE,
// not a confirmed legacy match: since this is literally "Manager Wise"
// of Round 37's single-rep Coverage Analysis 1 pivot, it reuses that
// exact same real column structure (Call Details/Attendance/Summary/
// Joint Work/Repeated Calls) as one row per real team member, aggregated
// across the selected date range (counts summed, rates/averages
// re-derived from the summed counts rather than averaging an average).
export async function computeManagerWiseCoverageRow(tenantSlug: string, member: OrgEmployee, months: string[]) {
  const perMonthPivots: Awaited<ReturnType<typeof computeCoverageAnalysis1>>[] = [];
  for (const month of months) perMonthPivots.push(await computeCoverageAnalysis1(tenantSlug, member.employeeCode, month));
  const sum = (key: "masterListDoctors" | "doctorsMet" | "listedDrsMissed" | "unlistedDrsMet") => perMonthPivots.reduce((s, p) => s + p.callDetails[key], 0);
  const masterListDoctors = perMonthPivots.length > 0 ? perMonthPivots[perMonthPivots.length - 1].callDetails.masterListDoctors : 0; // list size isn't additive across months -- real list, latest month's real snapshot
  const doctorsMet = sum("doctorsMet");
  const listedDrsMissed = Math.max(masterListDoctors - doctorsMet, 0);
  const unlistedDrsMet = sum("unlistedDrsMet");
  const coveragePct = masterListDoctors > 0 ? +((doctorsMet / masterListDoctors) * 100).toFixed(1) : 0;
  const attendance = {
    daysWorked: perMonthPivots.reduce((s, p) => s + p.attendance.daysWorked, 0),
    daysField: perMonthPivots.reduce((s, p) => s + p.attendance.daysField, 0),
    daysNonField: perMonthPivots.reduce((s, p) => s + p.attendance.daysNonField, 0),
    daysOnLeave: perMonthPivots.reduce((s, p) => s + p.attendance.daysOnLeave, 0)
  };
  const doctorsCallsSeen = perMonthPivots.reduce((s, p) => s + p.summary.doctorsCallsSeen, 0);
  const chemistCallsSeen = perMonthPivots.reduce((s, p) => s + p.summary.chemistCallsSeen, 0);
  const summary = {
    doctorsCallsSeen,
    doctorsCallAverage: attendance.daysField > 0 ? +(doctorsCallsSeen / attendance.daysField).toFixed(2) : 0,
    chemistCallsSeen,
    chemistCallAverage: attendance.daysField > 0 ? +(chemistCallsSeen / attendance.daysField).toFixed(2) : 0
  };
  const jwDays = perMonthPivots.reduce((s, p) => s + p.jointWork.days, 0);
  const jwCallsMet = perMonthPivots.reduce((s, p) => s + p.jointWork.callsMet, 0);
  const jwCallsSeen = perMonthPivots.reduce((s, p) => s + p.jointWork.callsSeen, 0);
  const jointWork = { days: jwDays, callsMet: jwCallsMet, callsSeen: jwCallsSeen, callAverage: jwDays > 0 ? +(jwCallsMet / jwDays).toFixed(2) : 0 };
  const repeatedCallsMet = perMonthPivots.reduce((s, p) => s + p.repeatedCalls.met, 0);
  const repeatedCalls = { met: repeatedCallsMet, coveragePct: masterListDoctors > 0 ? +((repeatedCallsMet / masterListDoctors) * 100).toFixed(1) : 0 };
  return {
    employeeCode: member.employeeCode, name: member.name, designation: member.designation, hq: member.territory,
    callDetails: { masterListDoctors, doctorsMet, coveragePct, listedDrsMissed, unlistedDrsMet },
    attendance, summary, jointWork, repeatedCalls
  };
}

// Round 38 Item 3 -- Speciality/Category Visit Wise. Real distinct
// specialities scoped to the selected manager's real team's listed
// doctors; real per-doctor visit-count buckets (V1/V2/V3/>V3), same
// bucket logic as custom-report-compute.ts's Drs Visit section, grouped
// by speciality and by month.
export async function computeSpecialityVisitWise(tenantSlug: string, team: OrgEmployee[], months: string[]) {
  const teamCodes = team.map((m) => m.employeeCode);
  const myDoctors = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: teamCodes }, status: "ACTIVE" }).select("specialty").lean();
  const specialtyByDoctorId = new Map((myDoctors as any[]).map((d) => [String(d._id), d.specialty || "(Unspecified)"]));
  const specialties = [...new Set((myDoctors as any[]).map((d) => d.specialty).filter(Boolean))].sort();

  const perMonth: Record<string, Record<string, { v1: number; v2: number; v3: number; vMore: number }>> = {};
  for (const month of months) {
    const dcrs = await DcrModel.find({ tenantSlug, employeeCode: { $in: teamCodes }, month }).lean();
    const visitCountBySpecialityDoctor = new Map<string, Map<string, number>>(); // specialty -> doctorId -> count
    for (const d of dcrs as any[]) {
      const docId = String(d.doctorId);
      const specialty = specialtyByDoctorId.get(docId);
      if (!specialty) continue;
      const inner = visitCountBySpecialityDoctor.get(specialty) || new Map<string, number>();
      inner.set(docId, (inner.get(docId) || 0) + 1);
      visitCountBySpecialityDoctor.set(specialty, inner);
    }
    const bySpecialty: Record<string, { v1: number; v2: number; v3: number; vMore: number }> = {};
    for (const specialty of specialties) {
      const inner = visitCountBySpecialityDoctor.get(specialty);
      const bucket = { v1: 0, v2: 0, v3: 0, vMore: 0 };
      if (inner) {
        for (const count of inner.values()) {
          if (count === 1) bucket.v1++;
          else if (count === 2) bucket.v2++;
          else if (count === 3) bucket.v3++;
          else if (count > 3) bucket.vMore++;
        }
      }
      bySpecialty[specialty] = bucket;
    }
    perMonth[month] = bySpecialty;
  }
  return { specialties, perMonth };
}

export async function computeCategoryVisitWise(tenantSlug: string, team: OrgEmployee[], months: string[]) {
  // Nil / CORE / NON CORE / SUPER CORE -- Round 41 item 2: the real 4-tier
  // DoctorModel.doctorCategory (legacy isCore flag only as a fallback for
  // never-migrated doctors), so Nil and SUPER CORE are real counts.
  const categories = ["Nil", "CORE", "NON CORE", "SUPER CORE"] as const;
  const display: Record<Tier, (typeof categories)[number]> = { Nil: "Nil", CORE: "CORE", "N CORE": "NON CORE", "S CORE": "SUPER CORE" };
  const perMonth: Record<string, Record<string, { v1: number; v2: number; v3: number; vMore: number }>> = {};
  const coreMap = await loadCoreMap(tenantSlug, team.map((m) => m.name));
  for (const month of months) {
    const byCategory: Record<string, { v1: number; v2: number; v3: number; vMore: number }> = {
      Nil: { v1: 0, v2: 0, v3: 0, vMore: 0 }, CORE: { v1: 0, v2: 0, v3: 0, vMore: 0 },
      "NON CORE": { v1: 0, v2: 0, v3: 0, vMore: 0 }, "SUPER CORE": { v1: 0, v2: 0, v3: 0, vMore: 0 }
    };
    for (const member of team) {
      const dcrs = await DcrModel.find({ tenantSlug, employeeCode: member.employeeCode, month }).populate("doctorId").lean();
      const visitCountByDoctor = new Map<string, number>();
      const doctorById = new Map<string, any>();
      for (const d of dcrs as any[]) {
        if (!d.doctorId) continue;
        const docId = String(d.doctorId._id);
        visitCountByDoctor.set(docId, (visitCountByDoctor.get(docId) || 0) + 1);
        doctorById.set(docId, d.doctorId);
      }
      // Count each real visited doctor once, into the bucket matching their
      // real total visit count that month, under their real category.
      for (const [docId, count] of visitCountByDoctor) {
        const bucket = byCategory[display[tierOfDoctor(doctorById.get(docId), coreMap, member.name)]];
        if (count === 1) bucket.v1++; else if (count === 2) bucket.v2++; else if (count === 3) bucket.v3++; else if (count > 3) bucket.vMore++;
      }
    }
    perMonth[month] = byCategory;
  }
  return { categories: [...categories], perMonth };
}

export { getDirectReports, getAllDescendants, getUpwardChain };
