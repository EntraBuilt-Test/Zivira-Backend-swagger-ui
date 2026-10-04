// src/utils/mis-reports-2-compute.ts
// Round 40 -- eight legacy-parity MIS screens: Work Hygiene, Class Wise View,
// DCR Analysis Dump, Missed Call, Single Doctor Analysis, Rep Vs Manager,
// Review Report, Assessment Report. Same real sources and honesty rules as
// mis-reports-compute.ts (Round 39) and custom-report-compute.ts:
// Round 41 update -- the previously disclosed gaps are closed:
//   Category -> DoctorModel.doctorCategory (real NIL / CORE / N CORE / S CORE
//               enum); legacy managerwiseCoreDoctorMap.isCore only as a
//               fallback for doctors that were never migrated.
//   Class    -> doctorClassification.doctorCategory, else DoctorModel.category
//   Campaign -> DoctorModel.campaign (synced from the Doctor - Campaign Map)
//   POB      -> DcrModel.pob rows / pobAmountRs captured by the field app
//               (see docPobValue); historic calls without POB stay blank
//   Delays   -> DcrLock rows + late-submission detection (utils/dcr-lock.ts)
//   Session  -> derived from the call time of day (M < 12:00, else E)

import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";
import { computeCustomReportMetrics } from "./custom-report-compute.js";
import { getAllDescendants, getUpwardChain, findVacantManagerCodes, isManagerRole, type OrgEmployee } from "./org-hierarchy.js";
import { loadRateMap, docPobValue, hasPob } from "./mis-reports-compute.js";
import { loadCoreMap, tierOfDoctor, TIERS, type Tier } from "./doctor-tier.js";
import { getCategoryNorms } from "./settings.js";
import { computeDelayStats, computeExpenseSplit, computeSpend, computeRcpaCrm, computeOtherVisits, computeTierStats, computeSecondaryRows } from "./r41-metrics.js";
import { RcpaModel } from "../models/rcpa.model.js";
import { CrmModel } from "../models/crm.model.js";

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}
function ymd(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function dmySlash(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}
function round2(n: number) { return Number(n.toFixed(2)); }
function pct(n: number, d: number) { return d > 0 ? round2((n / d) * 100) : 0; }
function dayDiff(a: string, b: string) {
  return Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
}

async function safeMasterRows(key: string, filter: Record<string, unknown>): Promise<any[]> {
  try { return (await getMasterModel(key).find(filter).lean()) as any[]; } catch { return []; }
}

type Category = Tier;
const CATEGORIES: Category[] = TIERS;

// Session of a call from its recorded time of day: M before 12:00, else E.
// Falls back to the recorded callSession only when no usable time exists.
export function sessionOfCall(time: string, recorded: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (m) return parseInt(m[1], 10) < 12 ? "M" : "E";
  return recorded === "MORNING" ? "M" : recorded ? "E" : "";
}

// Org-ordered list: every employee under rootCode (or the whole company when
// rootCode is empty), parent first then their reports, depth-first.
export async function orgOrdered(tenantSlug: string, rootCode: string, activeOnly = true): Promise<(OrgEmployee & { depth: number })[]> {
  const filter: Record<string, unknown> = { tenantSlug };
  if (activeOnly) filter.status = "ACTIVE";
  const all = (await EmployeeModel.find(filter).sort({ name: 1 }).lean()) as unknown as OrgEmployee[];
  const byCode = new Map(all.map((e) => [e.employeeCode, e]));
  const children = new Map<string, OrgEmployee[]>();
  const roots: OrgEmployee[] = [];
  for (const e of all) {
    if (e.reportingManager && byCode.has(e.reportingManager) && e.reportingManager !== e.employeeCode) {
      const arr = children.get(e.reportingManager) || [];
      arr.push(e); children.set(e.reportingManager, arr);
    } else roots.push(e);
  }
  const out: (OrgEmployee & { depth: number })[] = [];
  const seen = new Set<string>();
  const walk = (e: OrgEmployee, depth: number) => {
    if (seen.has(e.employeeCode) || depth > 8) return;
    seen.add(e.employeeCode);
    out.push({ ...e, depth });
    for (const c of children.get(e.employeeCode) || []) walk(c, depth + 1);
  };
  if (rootCode) {
    const root = byCode.get(rootCode);
    if (root) walk(root, 0);
  } else for (const r of roots) walk(r, 0);
  return out;
}

// ═══ Item 1 -- Work Hygiene ═══════════════════════════════════════════════
export const HYGIENE_DESIGNATIONS = ["ABM", "BDE", "BDM", "BH", "BM", "BRM", "HM", "MH", "NBM", "RBM", "SM", "Sr ABM", "Sr.RBM", "ZBM"];

export async function computeWorkHygiene(tenantSlug: string, manager: OrgEmployee, month: string) {
  const team = await getAllDescendants(tenantSlug, manager.employeeCode);
  const members = [...team, manager]; // manager LAST, as in the legacy report
  const codes = members.map((m) => m.employeeCode);
  const numDays = daysInMonth(month);
  const monthRegex = new RegExp(`^${month}`);
  const [dcrs, unlisted, lastRows] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).select("employeeCode visitDateOnly workType status createdAt jointWork").lean(),
    FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitType: "UnlistedDoctor", visitDateOnly: monthRegex }).select("employeeCode").lean(),
    DcrModel.aggregate([{ $match: { tenantSlug, employeeCode: { $in: codes } } }, { $group: { _id: "$employeeCode", last: { $max: "$visitDateOnly" } } }])
  ]);
  const lastByCode = new Map<string, string>((lastRows as any[]).map((r) => [r._id, r.last]));
  const jointNames = Array.from(new Set((dcrs as any[]).map((d) => d.jointWork?.accompanyingManager).filter(Boolean)));
  const named = jointNames.length ? ((await EmployeeModel.find({ tenantSlug, name: { $in: jointNames } }).select("name designation").lean()) as any[]) : [];
  const desigByName = new Map<string, string>(named.map((n) => [n.name, n.designation]));
  const ctx = await buildDayStatusContext(tenantSlug, month, codes, members.map((m) => m.state));

  const rows = [];
  for (const m of members) {
    const chain = await getUpwardChain(tenantSlug, m.employeeCode);
    const mine = (dcrs as any[]).filter((d) => d.employeeCode === m.employeeCode);
    const fwdDates = new Set(mine.filter((d) => (d.workType || "Field Work") === "Field Work").map((d) => d.visitDateOnly));
    const submittedDates = new Set(mine.map((d) => d.visitDateOnly));
    let leave = 0;
    for (let d = 1; d <= numDays; d++) {
      if (classifyDay(ctx, m.employeeCode, `${month}-${String(d).padStart(2, "0")}`).kind === "leave") leave++;
    }
    const pendingDates = new Set(mine.filter((d) => d.status === "SUBMITTED").map((d) => d.visitDateOnly));
    // Round 41 Gap A -- delayed dates = late submissions + still-locked,
    // never-submitted dates (real DcrLock rows, see computeDelayStats).
    const delay = await computeDelayStats(tenantSlug, m, month);
    const unl = (unlisted as any[]).filter((u) => u.employeeCode === m.employeeCode).length;
    const fwd = fwdDates.size;
    const jointDays: Record<string, Set<string>> = {};
    for (const d of mine) {
      const desig = desigByName.get(d.jointWork?.accompanyingManager);
      if (!desig || !HYGIENE_DESIGNATIONS.includes(desig)) continue;
      (jointDays[desig] = jointDays[desig] || new Set()).add(d.visitDateOnly);
    }
    rows.push({
      employeeCode: m.employeeCode, name: m.name, designation: m.designation, hq: m.territory,
      doj: ymd(m.joinDate), firstLevelManager: chain[0]?.name || null, secondLevelManager: chain[1]?.name || null,
      lastDcrDate: lastByCode.get(m.employeeCode) || null,
      fwd, leave, listedVisits: mine.length, listedCallAvg: fwd > 0 ? round2(mine.length / fwd) : 0,
      unlistedVisits: unl, unlistedCallAvg: fwd > 0 ? round2(unl / fwd) : 0,
      cumulativeCallAvg: fwd > 0 ? round2((mine.length + unl) / fwd) : 0,
      dcrSubmittedDays: submittedDates.size, approvalPendingDates: pendingDates.size,
      delayReportingDates: delay.delayedDates.length, totalDelayReporting: delay.total,
      joint: Object.fromEntries(Object.entries(jointDays).map(([k, v]) => [k, v.size])),
      isSelected: m.employeeCode === manager.employeeCode
    });
  }
  return { month, designations: HYGIENE_DESIGNATIONS, rows };
}

// ═══ Item 2 -- Class Wise View ════════════════════════════════════════════
export async function computeClassWiseView(tenantSlug: string, emp: OrgEmployee, months: string[]) {
  const team = await getAllDescendants(tenantSlug, emp.employeeCode);
  const members = [emp, ...team];
  const codes = members.map((m) => m.employeeCode);
  const nameByCode = new Map(members.map((m) => [m.employeeCode, m.name]));
  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).sort({ name: 1 }).lean()) as any[];
  const docCodes = doctors.map((d) => d.doctorCode).filter(Boolean);
  const [classRows, core, rates, dcrs] = await Promise.all([
    safeMasterRows("doctorClassification", { tenantSlug, doctorCode: { $in: docCodes } }),
    loadCoreMap(tenantSlug, members.map((m) => m.name)),
    loadRateMap(tenantSlug),
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months }, $or: [{ "pob.0": { $exists: true } }, { pobAmountRs: { $gt: 0 } }] }).select("doctorId month pob pobAmountRs").lean()
  ]);
  const classByCode = new Map<string, string>(classRows.filter((r) => r.doctorCategory).map((r) => [r.doctorCode, r.doctorCategory]));
  const business = new Map<string, number>(); // `${doctorId}|${month}`
  for (const d of dcrs as any[]) {
    const k = `${String(d.doctorId)}|${d.month}`;
    business.set(k, (business.get(k) || 0) + docPobValue(d, rates));
  }
  const rows = doctors.map((d) => {
    const klass = classByCode.get(d.doctorCode) || (["A", "B", "C"].includes(d.category) ? d.category : "Nil");
    const perMonth: Record<string, { amount: number; className: string }> = {};
    let total = 0;
    for (const m of months) {
      const amount = round2(business.get(`${String(d._id)}|${m}`) || 0);
      total += amount;
      perMonth[m] = { amount, className: klass };
    }
    const cat = tierOfDoctor(d, core, nameByCode.get(d.mappedEmployeeCode) || "");
    return { doctorName: d.name, speciality: d.specialty, category: cat, className: klass, territory: d.territory, perMonth, total: round2(total) };
  });
  return { months, rows, grandTotal: round2(rows.reduce((s, r) => s + r.total, 0)) };
}

// ═══ Item 3 -- DCR Analysis Dump ══════════════════════════════════════════
export const DUMP_HEADERS = [
  "SLNo", "Fieldforce Name", "Designation", "HQ", "Employee Id", "DOJ", "Reporting Manager I", "Reporting Manager II", "DCR Date", "Submission Date",
  "Daywise Remarks", "Work Type", "Territory", "Saneforce Dr Code", "Customer Type", "Customer", "Address", "Session", "Time", "Category", "Speciality",
  "Qualification", "Worked With Name", "POB", "Lat - long", "Address1", "Call Remark", "Product Detail", "Product Sample", "Product Rx", "Input Sample",
  "Territory_As_Per_TP", "Geo tagged drs", ""
];

function hhmm(t: string | null | undefined): string {
  if (!t) return "";
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

export async function buildDcrDump(tenantSlug: string, rootCode: string, month: string, days: number[], includeVacant: boolean): Promise<string[][]> {
  let scope = (await orgOrdered(tenantSlug, rootCode, true)) as OrgEmployee[];
  if (includeVacant) {
    const vacant = await findVacantManagerCodes(tenantSlug);
    if (vacant.size > 0) {
      const inactive = (await EmployeeModel.find({ tenantSlug, status: "INACTIVE", role: { $in: ["ABM", "RBM", "ZBM", "BH", "NBH"] } }).lean()) as unknown as OrgEmployee[];
      const have = new Set(scope.map((s) => s.employeeCode));
      scope = [...scope, ...inactive.filter((i) => !have.has(i.employeeCode))];
    }
  }
  const codes = scope.map((e) => e.employeeCode);
  const monthRegex = new RegExp(`^${month}`);
  const wanted = (date: string) => days.length === 0 || days.includes(parseInt(date.slice(8, 10), 10));
  const [dcrs, chem, logs, leaves, dealers, rates] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).populate("doctorId").lean(),
    ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: monthRegex }).lean(),
    FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: monthRegex }).lean(),
    LeaveApplicationModel.find({ tenantSlug, employeeCode: { $in: codes }, status: "APPROVED" }).lean(),
    DealerModel.find({ tenantSlug, employeeCode: { $in: codes } }).select("sourceSNo dealerName address city").lean(),
    loadRateMap(tenantSlug)
  ]);
  const ctx = await buildDayStatusContext(tenantSlug, month, codes, scope.map((s) => s.state));
  const core = await loadCoreMap(tenantSlug, scope.map((s) => s.name));
  const dealerById = new Map<string, any>((dealers as any[]).map((d) => [String(d._id), d]));
  const sorted = [...scope].sort((a, b) => a.name.localeCompare(b.name));
  const chainCache = new Map<string, OrgEmployee[]>();
  const monthStart = `${month}-01`;
  const monthEndDay = daysInMonth(month);

  type Raw = { time: string; cells: (d: { emp: OrgEmployee }) => string[] };
  const out: string[][] = [];
  let sl = 0;
  const clean = (v: unknown) => String(v ?? "").replace(/[,\r\n]+/g, ";");

  for (const emp of sorted) {
    let chain = chainCache.get(emp.employeeCode);
    if (!chain) { chain = await getUpwardChain(tenantSlug, emp.employeeCode); chainCache.set(emp.employeeCode, chain); }
    const head = [emp.name, emp.designation, emp.territory, emp.employeeCode, dmySlash(ymd(emp.joinDate)), chain[0]?.name || "", chain[1]?.name || ""];
    const mine = (dcrs as any[]).filter((d) => d.employeeCode === emp.employeeCode && wanted(d.visitDateOnly));
    const myChem = (chem as any[]).filter((c) => c.employeeCode === emp.employeeCode && wanted(c.visitDateOnly));
    const myLogs = (logs as any[]).filter((l) => l.employeeCode === emp.employeeCode && wanted(l.visitDateOnly));
    const dates = new Set<string>([...mine.map((d) => d.visitDateOnly), ...myChem.map((c) => c.visitDateOnly), ...myLogs.map((l) => l.visitDateOnly)]);
    const plannedTerritory = (date: string) => {
      const st = classifyDay(ctx, emp.employeeCode, date);
      return st.kind === "tour" ? `${st.area};` : "";
    };

    type Row = { date: string; time: string; cells: string[] };
    const rows: Row[] = [];
    const workedWith = (d: any) => (d?.jointWork?.accompanyingManager ? `${d.jointWork.accompanyingManager}; ` : "");
    const submission = (created: unknown, date: string) => dmySlash(ymd(created as Date) || date);
    for (const d of mine) {
      const doc = d.doctorId || {};
      const time = hhmm(d.callTime) || hhmm(d.checkInTime);
      const gps = d.gpsLocation || {};
      const hasGps = typeof gps.latitude === "number" && typeof gps.longitude === "number";
      const category = tierOfDoctor(doc, core, emp.name);
      rows.push({
        date: d.visitDateOnly, time,
        cells: [
          dmySlash(d.visitDateOnly), submission(d.createdAt, d.visitDateOnly), "", d.workType || "Field Work", doc.territory || emp.territory, doc.doctorCode || "", "Listed Doctor",
          doc.name || "", doc.address1 || doc.location || doc.city || "", sessionOfCall(time, d.callSession), time, category, doc.specialty || "", doc.qualification || "",
          workedWith(d), String(round2(docPobValue(d, rates))), hasGps ? `${gps.latitude} - ${gps.longitude}` : "0.0 - 0.0", "NA", d.notes || "",
          (d.productsDetailed || []).join(";"), (d.samplesGiven || []).map((s: any) => `${s.productName} - ${Number(s.qty || 0).toFixed(2)}`).join(";"),
          (d.rxItems || []).map((r: any) => `${r.productName} - ${Number(r.qty || 0).toFixed(2)}`).join(";"),
          (d.inputsGiven || []).map((i: any) => i.inputName).join(";"), plannedTerritory(d.visitDateOnly), hasGps ? "YES" : "NO"
        ]
      });
    }
    for (const c of myChem) {
      const dealer = dealerById.get(String(c.chemistId));
      const time = hhmm(c.checkInTime);
      rows.push({
        date: c.visitDateOnly, time,
        cells: [
          dmySlash(c.visitDateOnly), submission(c.createdAt, c.visitDateOnly), "", "Field Work", emp.territory, dealer?.sourceSNo != null ? String(dealer.sourceSNo) : "", "Chemist",
          c.chemistName || dealer?.dealerName || "", dealer?.address || dealer?.city || "", "", time, "", "", "", "",
          String(round2(docPobValue(c, rates))), "0.0 - 0.0", "NA", "", "", "", "", "", plannedTerritory(c.visitDateOnly), "NO"
        ]
      });
    }
    for (const l of myLogs) {
      const time = hhmm(l.checkInTime);
      const gps = l.gpsLocation || {};
      const hasGps = typeof gps.latitude === "number" && typeof gps.longitude === "number";
      rows.push({
        date: l.visitDateOnly, time,
        cells: [
          dmySlash(l.visitDateOnly), submission(l.createdAt, l.visitDateOnly), "", "Field Work", emp.territory, "", l.visitType === "Stockist" ? "Stockist" : l.visitType === "UnlistedDoctor" ? "Unlisted Doctor" : l.visitType === "Hospital" ? "Hospital" : l.visitType,
          l.entityName || "", "", "", time, "", "", "", "", "0", hasGps ? `${gps.latitude} - ${gps.longitude}` : "0.0 - 0.0", "NA", l.notes || "", "", "", "", "", plannedTerritory(l.visitDateOnly), hasGps ? "YES" : "NO"
        ]
      });
    }
    // Leave days (approved leave overlapping the month) have no customer.
    for (const lv of (leaves as any[]).filter((x) => x.employeeCode === emp.employeeCode)) {
      const from = ymd(lv.fromDate)!, to = ymd(lv.toDate)!;
      for (let day = 1; day <= monthEndDay; day++) {
        const date = `${month}-${String(day).padStart(2, "0")}`;
        if (date < from || date > to || date < monthStart || !wanted(date) || dates.has(date)) continue;
        rows.push({
          date, time: "",
          cells: [dmySlash(date), dmySlash(ymd(lv.createdAt) || date), lv.reason || lv.leaveType || "", "Leave", ...Array<string>(11).fill(""), "0", ...Array<string>(9).fill("")]
        });
      }
    }
    rows.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
    for (const r of rows) {
      sl++;
      // cells layout: [DCR Date .. Geo tagged]; head fills cols 2-8, SLNo col 1.
      const line = [String(sl), ...head, ...r.cells, ""];
      out.push(line.map(clean));
    }
  }
  return out;
}

export function dumpToCsv(rows: string[][]): string {
  const lines = [DUMP_HEADERS.join(","), ...rows.map((r) => r.join(","))];
  return lines.join("\r\n") + "\r\n";
}

// ═══ Item 4 -- Missed Call ════════════════════════════════════════════════
export async function computeMissedCallListed(tenantSlug: string, rootCode: string, months: string[]) {
  const scope = await orgOrdered(tenantSlug, rootCode, true);
  const codes = scope.map((e) => e.employeeCode);
  const [doctors, dcrs] = await Promise.all([
    DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).select("mappedEmployeeCode").lean(),
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).select("employeeCode doctorId month").lean()
  ]);
  const rows = scope.map((e) => {
    const isManager = isManagerRole(e.role);
    const list = (doctors as any[]).filter((d) => d.mappedEmployeeCode === e.employeeCode).length;
    const perMonth: Record<string, { list: number; met: number; missed: number }> = {};
    for (const m of months) {
      const met = new Set((dcrs as any[]).filter((d) => d.employeeCode === e.employeeCode && d.month === m).map((d) => String(d.doctorId))).size;
      perMonth[m] = { list, met, missed: Math.max(list - met, 0) };
    }
    return { employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, depth: e.depth, isManager, perMonth };
  });
  return { months, rows };
}

export async function computeMissedCallDetailed(tenantSlug: string, emp: OrgEmployee, month: string) {
  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: emp.employeeCode, status: "ACTIVE" }).lean()) as any[];
  const dcrs = (await DcrModel.find({ tenantSlug, employeeCode: emp.employeeCode, month }).select("doctorId").lean()) as any[];
  const core = await loadCoreMap(tenantSlug, [emp.name]);
  const visits = new Map<string, number>();
  for (const d of dcrs) visits.set(String(d.doctorId), (visits.get(String(d.doctorId)) || 0) + 1);
  const withCat = doctors.map((d) => ({ id: String(d._id), name: d.name, category: tierOfDoctor(d, core, emp.name) }));
  const missedDoctors = withCat.filter((d) => !visits.has(d.id));
  const per = (cat: Category) => {
    const all = withCat.filter((d) => d.category === cat);
    const met = all.filter((d) => visits.has(d.id));
    return { total: all.length, met: met.length, missed: all.length - met.length };
  };
  const counts = Array.from(visits.values());
  return {
    employee: { employeeCode: emp.employeeCode, name: emp.name, designation: emp.designation, hq: emp.territory },
    month,
    missedDoctors: missedDoctors.map((d) => ({ name: d.name, category: d.category })),
    summary: {
      listedDrsInList: doctors.length, callsMet: visits.size, callsSeen: dcrs.length, listedDrsMissed: missedDoctors.length,
      byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, per(c)]))
    },
    visitDetails: {
      one: counts.filter((n) => n === 1).length, two: counts.filter((n) => n === 2).length,
      three: counts.filter((n) => n === 3).length, moreThanThree: counts.filter((n) => n > 3).length
    }
  };
}

// ═══ Item 5 -- Single Doctor Analysis ═════════════════════════════════════
export async function listDoctorsForForce(tenantSlug: string, emp: OrgEmployee) {
  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: emp.employeeCode, status: "ACTIVE" }).sort({ name: 1 }).select("name").lean()) as any[];
  return doctors.map((d) => ({ id: String(d._id), name: d.name }));
}

export async function computeSingleDoctor(tenantSlug: string, emp: OrgEmployee, doctorId: string, months: string[]) {
  const doctor = (await DoctorModel.findOne({ tenantSlug, _id: doctorId }).lean()) as any;
  if (!doctor) return null;
  const [classRows, campaignRows, core, rates, dcrs, rcpaRows, crmRows] = await Promise.all([
    safeMasterRows("doctorClassification", { tenantSlug, doctorCode: doctor.doctorCode }),
    safeMasterRows("doctorCampaignMap", { tenantSlug, doctorCode: doctor.doctorCode }),
    loadCoreMap(tenantSlug, [emp.name]),
    loadRateMap(tenantSlug),
    DcrModel.find({ tenantSlug, doctorId: doctor._id, month: { $in: months } }).sort({ visitDate: 1 }).lean(),
    // Round 41 item 4 -- real doctor-linked RCPA and CRM entries.
    RcpaModel.find({ tenantSlug, doctorId: String(doctor._id), month: { $in: months } }).sort({ date: 1 }).lean(),
    CrmModel.find({ tenantSlug, doctorId: String(doctor._id), month: { $in: months } }).sort({ date: 1 }).lean()
  ]);
  const klass = classRows[0]?.doctorCategory || (["A", "B", "C"].includes(doctor.category) ? doctor.category : "Nil");
  const perMonth: Record<string, any> = {};
  for (const m of months) {
    const mine = (dcrs as any[]).filter((d) => d.month === m);
    const count = (list: string[]) => { const mp = new Map<string, number>(); for (const n of list) mp.set(n, (mp.get(n) || 0) + 1); return Array.from(mp.entries()).map(([name, n]) => ({ name, count: n })); };
    const sampled = new Map<string, number>(); const inputs = new Map<string, number>();
    for (const d of mine) {
      for (const s of d.samplesGiven || []) sampled.set(s.productName, (sampled.get(s.productName) || 0) + (s.qty || 0));
      for (const i of d.inputsGiven || []) inputs.set(i.inputName, (inputs.get(i.inputName) || 0) + (i.qty || 0));
    }
    perMonth[m] = {
      visits: mine.map((d) => ({ date: d.visitDateOnly, time: d.callTime || d.checkInTime || "", session: d.callSession, workedWith: d.jointWork?.accompanyingManager || "" })),
      detailed: count(mine.flatMap((d) => d.productsDetailed || [])),
      sampled: Array.from(sampled.entries()).map(([name, qty]) => ({ name, qty })),
      inputs: Array.from(inputs.entries()).map(([name, qty]) => ({ name, qty })),
      remarks: mine.map((d) => d.notes || d.productFeedback).filter(Boolean) as string[],
      rcpa: (rcpaRows as any[]).filter((r) => r.month === m).map((r) => ({ date: r.date, chemist: r.chemistName || "", ourProduct: r.ourProduct, ourQty: r.ourQty, competitorProduct: r.competitorProduct || "", competitorQty: r.competitorQty || 0 })),
      crm: (crmRows as any[]).filter((c) => c.month === m).map((c) => ({ date: c.date, type: c.type, amountRs: c.amountRs, status: c.status, approvedBy: c.approvedBy || "" })),
      rx: (() => { const mp = new Map<string, number>(); for (const d of mine) for (const r of d.rxItems || []) mp.set(r.productName, (mp.get(r.productName) || 0) + (r.qty || 0)); return Array.from(mp.entries()).map(([name, qty]) => ({ name, qty })); })(),
      business: round2(mine.reduce((s, d) => s + docPobValue(d, rates), 0))
    };
  }
  return {
    employee: { employeeCode: emp.employeeCode, name: emp.name, designation: emp.designation, hq: emp.territory },
    months,
    profile: {
      doctorName: doctor.name, address: [doctor.address1, doctor.location, doctor.city].filter(Boolean).join(", "), mobile: doctor.phone || "", email: doctor.email || "",
      hospitalAddress: [doctor.clinicName, doctor.location].filter(Boolean).join(", "), category: tierOfDoctor(doctor, core, emp.name),
      speciality: doctor.specialty || "", className: klass, qualification: doctor.qualification || "",
      campaignName: doctor.campaign || campaignRows[0]?.campaignSubCategory || "", drUniqueCode: doctor.uniqueSlNo || doctor.doctorCode || "",
      supportiveChemists: ((doctor.supportiveChemists || []) as any[]).map((c) => c.dealerName).filter(Boolean)
    },
    perMonth
  };
}

// ═══ Item 6 -- Rep Vs Manager ═════════════════════════════════════════════
export async function computeRepVsManager(tenantSlug: string, manager: OrgEmployee, month: string) {
  const reps = (await getAllDescendants(tenantSlug, manager.employeeCode)).filter((r) => !isManagerRole(r.role));
  const pick = (m: Record<string, number | string>) => ({
    fwDays: Number(m.fwDays || 0), doctorsMet: Number(m.listedDrsMet || 0), coveragePct: Number(m.lstDrCoveragePct || 0),
    callAverage: Number(m.lstDrCallAverage || 0), chemistsMet: Number(m.chemistsMet || 0), jointWorkDays: Number(m.jointWorkDays || 0)
  });
  const mgrMetrics = pick(await computeCustomReportMetrics(tenantSlug, manager.employeeCode, month));
  const rows = [];
  for (const r of reps) {
    const metrics = pick(await computeCustomReportMetrics(tenantSlug, r.employeeCode, month));
    const jointDcrs = (await DcrModel.find({ tenantSlug, employeeCode: r.employeeCode, month, "jointWork.accompanyingManager": manager.name }).select("visitDateOnly").lean()) as any[];
    rows.push({
      employeeCode: r.employeeCode, name: r.name, designation: r.designation, hq: r.territory, rep: metrics,
      withThisManager: { jointDays: new Set(jointDcrs.map((d) => d.visitDateOnly)).size, jointCalls: jointDcrs.length }
    });
  }
  return { month, manager: { employeeCode: manager.employeeCode, name: manager.name, designation: manager.designation, hq: manager.territory, metrics: mgrMetrics }, rows };
}


// ═══ Item 7 -- Review Report ══════════════════════════════════════════════
export async function computeReviewReport(tenantSlug: string, emp: OrgEmployee, month: string) {
  const base = await computeCustomReportMetrics(tenantSlug, emp.employeeCode, month);
  const monthRegex = new RegExp(`^${month}`);
  const [dcrs, chem, rates, delay, expense, others, rcpaCrm, tiers, secondary, full] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: emp.employeeCode, month }).lean() as unknown as Promise<any[]>,
    ChemistCallModel.find({ tenantSlug, employeeCode: emp.employeeCode, visitDateOnly: monthRegex }).lean() as unknown as Promise<any[]>,
    loadRateMap(tenantSlug),
    computeDelayStats(tenantSlug, emp, month),
    computeExpenseSplit(tenantSlug, emp.employeeCode, month),
    computeOtherVisits(tenantSlug, emp.employeeCode, month),
    computeRcpaCrm(tenantSlug, emp.employeeCode, month),
    (async () => computeTierStats(tenantSlug, emp, (await DcrModel.find({ tenantSlug, employeeCode: emp.employeeCode, month }).select("doctorId").lean()) as any[]))(),
    computeSecondaryRows(tenantSlug, emp.territory, month),
    EmployeeModel.findOne({ tenantSlug, employeeCode: emp.employeeCode }).lean() as Promise<any>
  ]);
  const counts = new Map<string, number>();
  for (const d of dcrs) for (const p of d.productsDetailed || []) counts.set(p, (counts.get(p) || 0) + 1);
  const top5 = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
  const spend = await computeSpend(tenantSlug, dcrs, rates, emp.employeeCode, month);
  const fw = Number(base.fwDays || 0);
  const num = (k: string) => Number(base[k] || 0);
  const m: Record<string, number | string> = { ...base };

  m.delayedDays = delay.delayedDates.length;
  m.delayedTotalDays = delay.total;
  m.lockedOutstanding = delay.delayedDates.filter((d) => d.kind === "locked-outstanding").length;
  m.chemistPobCount = chem.filter((c) => hasPob(c)).length;
  m.chemistPobValue = round2(chem.reduce((s, c) => s + docPobValue(c, rates), 0));
  m.doctorPobValue = round2(dcrs.reduce((s, d) => s + docPobValue(d, rates), 0));

  const key: Record<Tier, string> = { Nil: "nil", CORE: "core", "N CORE": "nCore", "S CORE": "sCore" };
  for (const t of TIERS) {
    const st = tiers.stats[t];
    m[`${key[t]}List`] = st.list; m[`${key[t]}Met`] = st.met; m[`${key[t]}Missed`] = st.missed;
    m[`${key[t]}Adhered`] = st.adhered; m[`${key[t]}AdherPct`] = st.list ? pct(st.adhered, st.list) : 0;
  }
  m.unlistedDrsMet = others.unlisted.met; m.unlistedDrsSeen = others.unlisted.seen;
  m.unlstCallAverage = fw > 0 ? round2(others.unlisted.seen / fw) : 0;
  m.unlstMissedCall = Math.max(num("totalUnlistedDrsInList") - others.unlisted.met, 0);
  m.stockistMet = others.stockist.met; m.stockistSeen = others.stockist.seen;
  m.hospitalMet = others.hospital.met; m.hospitalSeen = others.hospital.seen;
  m.cipMet = others.cip.met; m.cipSeen = others.cip.seen;
  m.noOfDetailingDrs = new Set(dcrs.filter((d) => (d.productsDetailed || []).length > 0).map((d) => String(d.doctorId))).size;
  m.noOfRxDrs = new Set(dcrs.filter((d) => (d.rxItems || []).some((r: any) => (r.qty || 0) > 0)).map((d) => String(d.doctorId))).size;
  m.sampleSpentRs = spend.sample; m.inputSpentRs = spend.input; m.drServiceSpentRs = spend.drService;
  m.hqAmountRs = expense.hq; m.exAmountRs = expense.ex; m.osAmountRs = expense.os;
  m.miscellaneous = expense.misc; m.totalAmount = expense.total;
  Object.assign(m, rcpaCrm);

  return {
    month,
    employee: { name: emp.name, employeeCode: emp.employeeCode, designation: emp.designation, hq: emp.territory, state: full?.state || "", division: full?.division || "", isManager: isManagerRole(emp.role) },
    metrics: m, top5, inputSpent: spend.input, secondaryRows: secondary,
    delayedDates: delay.delayedDates
  };
}

// ═══ Item 8 -- Assessment Report ══════════════════════════════════════════
export const ASSESS_DESIGNATIONS = ["BH", "ZBM", "ABM", "RBM"];

export async function computeAssessment(tenantSlug: string, emp: OrgEmployee, months: string[]) {
  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: emp.employeeCode, status: "ACTIVE" }).lean()) as any[];
  const core = await loadCoreMap(tenantSlug, [emp.name]);
  const norms = await getCategoryNorms(tenantSlug);
  const NORMS: Record<Category, number> = { Nil: norms.NIL, CORE: norms.CORE, "N CORE": norms["N CORE"], "S CORE": norms["S CORE"] };
  const catById = new Map<string, Category>(doctors.map((d) => [String(d._id), tierOfDoctor(d, core, emp.name)]));
  const chemTotal = await DealerModel.countDocuments({ tenantSlug, employeeCode: emp.employeeCode, status: "ACTIVE" });
  const rates = await loadRateMap(tenantSlug);
  const cols: Record<string, Record<number, string>> = {};

  for (const month of months) {
    const v: Record<number, string> = {};
    const set = (n: number, val: number | string | null | undefined) => { v[n] = val === 0 || val == null ? "" : String(val); };
    const numDays = daysInMonth(month);
    const monthRegex = new RegExp(`^${month}`);
    const [dcrs, chem, delay] = await Promise.all([
      DcrModel.find({ tenantSlug, employeeCode: emp.employeeCode, month }).populate("doctorId").lean() as unknown as Promise<any[]>,
      ChemistCallModel.find({ tenantSlug, employeeCode: emp.employeeCode, visitDateOnly: monthRegex }).lean() as unknown as Promise<any[]>,
      computeDelayStats(tenantSlug, emp, month)
    ]);
    const ctx = await buildDayStatusContext(tenantSlug, month, [emp.employeeCode], [(emp as any).state]);
    let holiday = 0, leave = 0;
    for (let d = 1; d <= numDays; d++) {
      const st = classifyDay(ctx, emp.employeeCode, `${month}-${String(d).padStart(2, "0")}`);
      if (st.kind === "holiday" || st.kind === "weeklyOff") holiday++;
      else if (st.kind === "leave") leave++;
    }
    const fieldDates = new Set(dcrs.map((d) => d.visitDateOnly));
    const typeDates: Record<string, Set<string>> = { HQ: new Set(), EX: new Set(), OS: new Set() };
    for (const d of dcrs) { const t = d.doctorId?.territoryType || "HQ"; (typeDates[t] || typeDates.HQ).add(d.visitDateOnly); }
    set(1, numDays); set(2, holiday); set(3, fieldDates.size); set(4, leave);
    set(5, Math.max(numDays - holiday - fieldDates.size - leave, 0));
    set(6, typeDates.HQ.size); set(7, typeDates.EX.size); set(8, typeDates.OS.size);
    set(9, delay.delayedDates.length); // Round 41 Gap A -- real late + locked dates

    const visits = new Map<string, number>();
    for (const d of dcrs) { const id = String(d.doctorId?._id || d.doctorId); visits.set(id, (visits.get(id) || 0) + 1); }
    set(10, doctors.length); set(11, visits.size); set(12, dcrs.length);
    set(13, doctors.length ? pct(visits.size, doctors.length) : 0);
    set(14, fieldDates.size ? round2(dcrs.length / fieldDates.size) : 0);
    set(15, Math.max(doctors.length - visits.size, 0));
    const chemMet = new Set(chem.map((c) => c.chemistId)).size;
    set(16, chemTotal); set(17, chemMet); set(18, chem.length);
    set(19, chemTotal ? pct(chemMet, chemTotal) : 0);
    set(20, fieldDates.size ? round2(chem.length / fieldDates.size) : 0);
    set(21, Math.max(chemTotal - chemMet, 0));
    // Round 41 Gap B -- real chemist POB (per-row value, order amount, or
    // qty x product rate); historic calls without POB stay blank / "-".
    const chemPob = chem.filter((c) => hasPob(c));
    set(22, chemPob.length);
    const chemValue = round2(chemPob.reduce((s, c) => s + docPobValue(c, rates), 0));
    v[23] = chemValue > 0 ? String(chemValue) : "-";

    const counts = Array.from(visits.values());
    set(25, counts.filter((n) => n === 1).length); set(26, counts.filter((n) => n === 2).length);
    set(27, counts.filter((n) => n === 3).length); set(28, counts.filter((n) => n > 3).length);

    // Category blocks (rows 30-61) and frequency blocks (68-90), driven by
    // the real doctorCategory tier and the configurable visit norms.
    let totalNorm = 0, visitNorm = 0;
    const freqStart: Record<Category, number> = { Nil: 68, CORE: 74, "N CORE": 80, "S CORE": 86 };
    CATEGORIES.forEach((cat, ci) => {
      const ids = Array.from(catById.entries()).filter(([, c]) => c === cat).map(([id]) => id);
      const met = ids.filter((id) => visits.has(id));
      const seen = ids.reduce((s, id) => s + (visits.get(id) || 0), 0);
      const base = 30 + ci * 8;
      set(base, ids.length); set(base + 1, met.length); set(base + 2, seen); set(base + 3, ids.length - met.length);
      const n = (id: string) => visits.get(id) || 0;
      set(base + 4, ids.filter((id) => n(id) === 1).length); set(base + 5, ids.filter((id) => n(id) === 2).length);
      set(base + 6, ids.filter((id) => n(id) === 3).length); set(base + 7, ids.filter((id) => n(id) > 3).length);
      const norm = NORMS[cat];
      const f = freqStart[cat];
      set(f, ids.length);
      set(f + 1, ids.filter((id) => n(id) === 0).length);
      set(f + 2, ids.filter((id) => n(id) === 1).length);
      if (cat !== "S CORE") {
        set(f + 3, ids.filter((id) => n(id) === 2).length);
        set(f + 4, ids.filter((id) => n(id) > norm).length);
        set(f + 5, ids.filter((id) => n(id) < norm).length);
      } else {
        set(f + 3, ids.filter((id) => n(id) > norm).length);
        set(f + 4, ids.filter((id) => n(id) < norm).length);
      }
      totalNorm += ids.length * norm;
      visitNorm += ids.reduce((s, id) => s + Math.min(n(id), norm), 0);
    });

    // Worked With (days(calls)) by designation of the accompanying manager.
    const names = Array.from(new Set(dcrs.map((d) => d.jointWork?.accompanyingManager).filter(Boolean)));
    const named = names.length ? ((await EmployeeModel.find({ tenantSlug, name: { $in: names } }).select("name designation").lean()) as any[]) : [];
    const desigByName = new Map<string, string>(named.map((n) => [n.name, n.designation]));
    ASSESS_DESIGNATIONS.forEach((desig, i) => {
      const hits = dcrs.filter((d) => desigByName.get(d.jointWork?.accompanyingManager) === desig);
      v[63 + i] = `${new Set(hits.map((d) => d.visitDateOnly)).size}(${hits.length})`;
    });

    const top = (pairs: [string, number][]) => pairs.sort((a, b) => b[1] - a[1]).slice(0, 5);
    const promoted = new Map<string, number>();
    const sampled = new Map<string, { qty: number; drs: Set<string> }>();
    for (const d of dcrs) {
      for (const p of d.productsDetailed || []) promoted.set(p, (promoted.get(p) || 0) + 1);
      for (const s of d.samplesGiven || []) {
        const e = sampled.get(s.productName) || { qty: 0, drs: new Set<string>() };
        e.qty += s.qty || 0; e.drs.add(String(d.doctorId?._id || d.doctorId)); sampled.set(s.productName, e);
      }
    }
    top(Array.from(promoted.entries())).forEach(([name, count], i) => { v[92 + i] = `${name} (${count})`; });
    top(Array.from(sampled.entries()).map(([n, e]) => [n, e.qty] as [string, number])).forEach(([name, qty], i) => {
      v[98 + i] = `${name} - ${qty} (${sampled.get(name)!.drs.size} drs)`;
    });
    set(103, totalNorm); set(104, visitNorm); set(105, totalNorm ? pct(visitNorm, totalNorm) : 0);
    cols[month] = v;
  }
  return { months, employee: { employeeCode: emp.employeeCode, name: emp.name, designation: emp.designation, hq: emp.territory }, cols };
}
