// src/utils/mis-reports-compute.ts
// Round 39 Items 3-7 -- MIS Reports > Analysis: DCR, Visit Analysis, Sales
// Details, POB Wise, POB Wise - Periodically. Built entirely on real
// documents already in the schema and the helpers from Rounds 34-38
// (org-hierarchy.ts, day-status.ts, manager-analysis-compute.ts monthRange):
//   * DCR calls            -> DcrModel (doctor calls, joint work, call session/time)
//   * Doctor POB           -> DcrModel.pob (NEW in Round 39 -- previously no POB
//                             field existed on a DCR, so doctor-side POB was
//                             not recoverable from any data; rows exist only
//                             where POB was actually entered)
//   * Chemist calls / POB  -> ChemistCallModel (pob rows carry qty, no value)
//   * Stockist / Unlisted  -> FieldVisitLogModel (visit log only, no POB)
//   * POB value            -> explicit valueRs when present, else qty x the
//                             real Product master `rate`; never invented
//   * Planned visit freq   -> generic master doctorClassification.visitFrequency
//   * Class                -> doctorClassification.doctorCategory (fallback DoctorModel.category)
//   * Campaign             -> generic master doctorCampaignMap.campaignSubCategory
//   * Category             -> generic master managerwiseCoreDoctorMap.isCore
// Anything with no real backing is returned as 0 / null and called out in
// the comment beside it.

import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { UnlistedDoctorModel } from "../models/unlisted-doctor.model.js";
import { ProductModel } from "../models/product.model.js";
import { StateModel } from "../models/state.model.js";
import { CompanyConfigModel } from "../models/company-config.model.js";
import { DcrLockModel } from "../models/dcr-lock.model.js";
import { loadCoreMap, tierOfDoctor } from "./doctor-tier.js";
import { getMasterModel } from "../models/master-record.model.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";
import { getAllDescendants, isManagerRole, type OrgEmployee } from "./org-hierarchy.js";

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}
function monthBounds(month: string) {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  return { start: new Date(Date.UTC(year, mon - 1, 1)), end: new Date(Date.UTC(year, mon, 1)) };
}
function ymd(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function pct(num: number, den: number): number {
  return den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0;
}
function round2(n: number) {
  return Number(n.toFixed(2));
}

// ── POB value helpers ───────────────────────────────────────────────────
export async function loadRateMap(tenantSlug: string): Promise<Map<string, number>> {
  const products = await ProductModel.find({ tenantSlug }).select("productName name rate").lean();
  const map = new Map<string, number>();
  for (const p of products as any[]) {
    const rate = typeof p.rate === "number" ? p.rate : null;
    if (rate == null) continue;
    for (const key of [p.productName, p.name]) if (key) map.set(String(key).trim().toLowerCase(), rate);
  }
  return map;
}
function rowValue(row: any, rates: Map<string, number>): number {
  if (typeof row.valueRs === "number") return row.valueRs;
  const rate = rates.get(String(row.productName || "").trim().toLowerCase());
  return rate != null ? (row.qty || 0) * rate : 0;
}
export function pobValue(rows: any[] | undefined, rates: Map<string, number>): number {
  return (rows || []).reduce((s, r) => s + rowValue(r, rates), 0);
}
// Round 41 Gap B -- order value of a whole call document: per-product rows
// win (explicit valueRs, else qty x rate); otherwise the single order amount
// the rep entered (pobAmountRs). Historic calls have neither -> 0.
export function docPobValue(doc: { pob?: any[]; pobAmountRs?: number | null } | null | undefined, rates: Map<string, number>): number {
  if (!doc) return 0;
  const rows = pobValue(doc.pob, rates);
  if (rows > 0) return rows;
  return typeof doc.pobAmountRs === "number" ? doc.pobAmountRs : 0;
}
// A call is "productive" when any order was recorded for it.
export function hasPob(doc: { pob?: any[]; pobAmountRs?: number | null } | null | undefined): boolean {
  return !!doc && ((doc.pob || []).length > 0 || (typeof doc.pobAmountRs === "number" && doc.pobAmountRs > 0));
}

// ── Team helpers ────────────────────────────────────────────────────────
export async function selfAndTeam(tenantSlug: string, employeeCode: string): Promise<OrgEmployee[]> {
  const self = (await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean()) as unknown as OrgEmployee | null;
  if (!self) return [];
  const team = await getAllDescendants(tenantSlug, employeeCode);
  return [self, ...team];
}

// ═══ Item 3 -- DCR Analysis ═══════════════════════════════════════════════
export async function computeDcrAnalysis(tenantSlug: string, emp: OrgEmployee, month: string) {
  const code = emp.employeeCode;
  const numDays = daysInMonth(month);
  const monthRegex = new RegExp(`^${month}`);
  const [dcrs, chemCalls, visitLogs, rates, doctorTotal, releasedCfg, lockRows] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: code, month }).populate("doctorId").lean(),
    ChemistCallModel.find({ tenantSlug, employeeCode: code, visitDateOnly: monthRegex }).lean(),
    FieldVisitLogModel.find({ tenantSlug, employeeCode: code, visitDateOnly: monthRegex }).lean(),
    loadRateMap(tenantSlug),
    DoctorModel.countDocuments({ tenantSlug, mappedEmployeeCode: code, status: "ACTIVE" }),
    CompanyConfigModel.findOne({ tenantSlug, key: `delayedReleased:${month}:${code}` }).lean(),
    // Round 41 Gap A -- real DCR lock rows (see utils/dcr-lock.ts).
    DcrLockModel.find({ tenantSlug, employeeCode: code, dcrDate: monthRegex }).sort({ dcrDate: 1 }).lean()
  ]);
  const ctx = await buildDayStatusContext(tenantSlug, month, [code], [emp.state]);

  type Day = {
    dcrs: any[]; chem: any[]; stockist: any[]; unlisted: any[]; created: Date[];
  };
  const byDate = new Map<string, Day>();
  const day = (k: string): Day => {
    let d = byDate.get(k);
    if (!d) { d = { dcrs: [], chem: [], stockist: [], unlisted: [], created: [] }; byDate.set(k, d); }
    return d;
  };
  for (const d of dcrs as any[]) { const x = day(d.visitDateOnly); x.dcrs.push(d); if (d.createdAt) x.created.push(new Date(d.createdAt)); }
  for (const c of chemCalls as any[]) { const x = day(c.visitDateOnly); x.chem.push(c); if (c.createdAt) x.created.push(new Date(c.createdAt)); }
  for (const v of visitLogs as any[]) {
    const x = day(v.visitDateOnly);
    if (v.visitType === "Stockist") x.stockist.push(v);
    else if (v.visitType === "UnlistedDoctor") x.unlisted.push(v);
    if (v.createdAt) x.created.push(new Date(v.createdAt));
  }

  const dates = Array.from(byDate.keys()).sort();
  const rows = dates.map((date) => {
    const x = byDate.get(date)!;
    const planned = classifyDay(ctx, code, date).kind === "tour";
    const joint = x.dcrs.filter((d) => d.jointWork?.accompanyingManager);
    const workedWith = Array.from(new Set(joint.map((d) => String(d.jointWork.accompanyingManager))));
    const startCandidates = [
      ...x.dcrs.map((d) => d.checkInTime || d.callTime),
      ...x.chem.map((c) => c.checkInTime),
      ...x.stockist.map((s) => s.checkInTime),
      ...x.unlisted.map((s) => s.checkInTime)
    ].filter(Boolean) as string[];
    const endCandidates = [
      ...x.dcrs.map((d) => d.checkOutTime),
      ...x.chem.map((c) => c.checkOutTime),
      ...x.stockist.map((s) => s.checkOutTime),
      ...x.unlisted.map((s) => s.checkOutTime)
    ].filter(Boolean) as string[];
    const created = x.created.length ? new Date(Math.min(...x.created.map((c) => c.getTime()))) : null;
    return {
      date,
      submittedDate: ymd(created),
      workType: x.dcrs[0]?.workType || "Field Work",
      workedWith: workedWith.length ? workedWith.join(", ") : "-",
      jointCalls: joint.length,
      asPerTp: planned ? 1 : 0,
      worked: 1,
      dev: planned ? 0 : 1, // worked on a day with no Tour Plan entry
      listedDrMet: x.dcrs.length,
      listedDrUnique: new Set(x.dcrs.map((d) => String(d.doctorId?._id || d.doctorId))).size,
      drsPob: round2(x.dcrs.reduce((s, d) => s + docPobValue(d, rates), 0)),
      unlistDrMet: x.unlisted.length,
      chemistMet: x.chem.length,
      chemistPob: round2(x.chem.reduce((s, c) => s + docPobValue(c, rates), 0)),
      stockistMet: x.stockist.length,
      startTime: startCandidates.length ? startCandidates.sort()[0] : "-",
      endTime: endCandidates.length ? endCandidates.sort()[endCandidates.length - 1] : "-"
    };
  });

  // Planned (Tour Plan) days with nothing submitted are also real deviations.
  let plannedNotWorked = 0;
  let leaveDays = 0, holidayDays = 0, notPlannedDays = 0;
  for (let d = 1; d <= numDays; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const st = classifyDay(ctx, code, key);
    if (st.kind === "tour" && !byDate.has(key)) plannedNotWorked++;
    if (st.kind === "leave") leaveDays++;
    else if (st.kind === "holiday" || st.kind === "weeklyOff") holidayDays++;
    else if (st.kind === "notPlanned" && !byDate.has(key)) notPlannedDays++;
  }

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const totalListedCalls = sum((r) => r.listedDrMet);
  const doctorIdsMet = new Set((dcrs as any[]).map((d) => String(d.doctorId?._id || d.doctorId)));
  const totals = {
    jointCalls: sum((r) => r.jointCalls),
    asPerTp: sum((r) => r.asPerTp),
    worked: sum((r) => r.worked),
    dev: sum((r) => r.dev),
    listedDrMet: totalListedCalls,
    listedDrUnique: doctorIdsMet.size,
    drsPob: round2(sum((r) => r.drsPob)),
    unlistDrMet: sum((r) => r.unlistDrMet),
    chemistMet: sum((r) => r.chemistMet),
    chemistPob: round2(sum((r) => r.chemistPob)),
    stockistMet: sum((r) => r.stockistMet)
  };

  const jointMap = new Map<string, { dates: Set<string>; calls: number }>();
  for (const d of dcrs as any[]) {
    const n = d.jointWork?.accompanyingManager;
    if (!n) continue;
    const e = jointMap.get(n) || { dates: new Set<string>(), calls: 0 };
    e.dates.add(d.visitDateOnly); e.calls++;
    jointMap.set(n, e);
  }
  const jointRows = Array.from(jointMap.entries()).map(([name, v]) => ({ name, dates: v.dates.size, calls: v.calls }));
  const jointDays = new Set((dcrs as any[]).filter((d) => d.jointWork?.accompanyingManager).map((d) => d.visitDateOnly)).size;

  const workTypeCount = new Map<string, Set<string>>();
  for (const d of dcrs as any[]) {
    const s = workTypeCount.get(d.workType || "Field Work") || new Set<string>();
    s.add(d.visitDateOnly); workTypeCount.set(d.workType || "Field Work", s);
  }
  const workTypeDays = [
    ...Array.from(workTypeCount.entries()).map(([label, s]) => ({ label, days: s.size })),
    ...(leaveDays ? [{ label: "Leave", days: leaveDays }] : []),
    ...(holidayDays ? [{ label: "Holiday / Weekly Off", days: holidayDays }] : []),
    ...(plannedNotWorked ? [{ label: "Planned - Not Worked", days: plannedNotWorked }] : [])
  ];

  const chemistsMet = new Set((chemCalls as any[]).map((c) => c.chemistId)).size;
  const nlMet = new Set((visitLogs as any[]).filter((v) => v.visitType === "UnlistedDoctor").map((v) => v.entityName)).size;
  const workedDays = rows.length;
  // Locked Date / Released Date: real DcrLock rows. Falls back to the
  // legacy "released" flag's timestamp (pre-lock-era Delayed Release clicks)
  // only when no lock row carries a release.
  const locks = (lockRows as any[]).map((l) => ({
    date: l.dcrDate, lockedAt: ymd(l.lockedAt), releasedAt: ymd(l.releasedAt), releasedBy: l.releasedBy || null, reason: l.lockReason
  }));
  const releasedFromLocks = locks.filter((l) => l.releasedAt).map((l) => l.releasedAt as string);
  const releasedDate = releasedFromLocks.length ? Array.from(new Set(releasedFromLocks)).join(", ") : releasedCfg ? ymd((releasedCfg as any).updatedAt) : null;
  const lockedDate = locks.length ? Array.from(new Set(locks.map((l) => l.lockedAt).filter(Boolean))).join(", ") : null;

  return {
    employee: { employeeCode: code, name: emp.name, designation: emp.designation, hq: emp.territory },
    month,
    rows,
    totals,
    delayed: {
      lockedDate,
      releasedDate,
      locks
    },
    workTypeDays,
    callsDetails: {
      totalDoctors: doctorTotal,
      doctorsMet: doctorIdsMet.size,
      totalCallsSeen: totalListedCalls,
      nlDrsMet: nlMet,
      coveragePct: pct(doctorIdsMet.size, doctorTotal),
      callAverage: workedDays > 0 ? round2(totalListedCalls / workedDays) : 0,
      tpDeviation: totals.dev + plannedNotWorked,
      jointWorkDays: jointDays,
      jointWorkCallAvg: jointDays > 0 ? round2(totals.jointCalls / jointDays) : 0,
      chemistPobValue: totals.chemistPob,
      chemistMet: chemistsMet,
      chemistSeen: (chemCalls as any[]).length,
      chemistCallAvg: workedDays > 0 ? round2((chemCalls as any[]).length / workedDays) : 0
    },
    jointWorkDetails: {
      rows: jointRows,
      total: { dates: jointDays, calls: jointRows.reduce((s, r) => s + r.calls, 0) }
    },
    notPlannedDays
  };
}

// ═══ Item 4 -- Visit Analysis ═════════════════════════════════════════════
const FREQUENCY_VISITS_PER_MONTH: Record<string, number> = {
  Weekly: 4, Fortnightly: 2, "Twice a Month": 2, Monthly: 1, "Once in Two Months": 1, Quarterly: 1
};

export type VisitAnalysisType = "Category" | "Speciality" | "Class" | "Campaign";

async function safeMasterRows(key: string, filter: Record<string, unknown>): Promise<any[]> {
  try {
    return (await getMasterModel(key).find(filter).lean()) as any[];
  } catch {
    return [];
  }
}

export async function computeVisitAnalysis(tenantSlug: string, members: OrgEmployee[], months: string[], type: VisitAnalysisType) {
  const codes = members.map((m) => m.employeeCode);
  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" })
    .select("name specialty category doctorCode mappedEmployeeCode territoryType doctorCategory campaign").lean()) as any[];
  const docCodes = doctors.map((d) => d.doctorCode).filter(Boolean);
  const [classRows, campaignRows, coreMap] = await Promise.all([
    safeMasterRows("doctorClassification", { tenantSlug, doctorCode: { $in: docCodes } }),
    type === "Campaign" ? safeMasterRows("doctorCampaignMap", { tenantSlug, doctorCode: { $in: docCodes } }) : Promise.resolve([]),
    type === "Category" ? loadCoreMap(tenantSlug, members.map((m) => m.name)) : Promise.resolve(new Map<string, string>())
  ]);
  const classByCode = new Map<string, any>(classRows.map((r) => [r.doctorCode, r]));
  const campaignByCode = new Map<string, string>(campaignRows.filter((r) => r.campaignSubCategory).map((r) => [r.doctorCode, String(r.campaignSubCategory)]));
  const nameByCode = new Map(members.map((m) => [m.employeeCode, m.name]));

  function groupOf(d: any): string | null {
    if (type === "Speciality") return d.specialty || "(Unspecified)";
    if (type === "Class") return classByCode.get(d.doctorCode)?.doctorCategory || d.category || null;
    // Round 41 item 3 -- Doctor.campaign is the real field (kept in sync with
    // the Doctor - Campaign Map master); the map is only a fallback.
    if (type === "Campaign") return d.campaign || campaignByCode.get(d.doctorCode) || null;
    // Round 41 item 2 -- real 4-tier DoctorModel.doctorCategory (Nil / CORE /
    // N CORE / S CORE), with the legacy isCore flag only as a fallback for
    // doctors that were never migrated.
    const tier = tierOfDoctor(d, coreMap, nameByCode.get(d.mappedEmployeeCode) || "");
    return tier === "N CORE" ? "NON CORE" : tier === "S CORE" ? "SUPER CORE" : tier;
  }
  function freqBucket(d: any): 1 | 2 | 0 {
    const v = FREQUENCY_VISITS_PER_MONTH[classByCode.get(d.doctorCode)?.visitFrequency as string];
    return v === 1 ? 1 : v === 2 ? 2 : 0;
  }

  const doctorsByEmp = new Map<string, any[]>();
  for (const d of doctors) {
    const arr = doctorsByEmp.get(d.mappedEmployeeCode) || [];
    arr.push(d); doctorsByEmp.set(d.mappedEmployeeCode, arr);
  }

  const groupOrder = type === "Category" ? ["Nil", "CORE", "NON CORE", "SUPER CORE"] : null;
  const rows: any[] = [];
  const groupsSeen = new Set<string>();

  for (const m of members) {
    const myDoctors = doctorsByEmp.get(m.employeeCode) || [];
    const lastDcrDoc = (await DcrModel.findOne({ tenantSlug, employeeCode: m.employeeCode }).sort({ visitDate: -1 }).select("visitDateOnly").lean()) as any;
    for (const month of months) {
      const dcrs = (await DcrModel.find({ tenantSlug, employeeCode: m.employeeCode, month }).populate("doctorId").lean()) as any[];
      const ctx = await buildDayStatusContext(tenantSlug, month, [m.employeeCode], [m.state]);
      const numDays = daysInMonth(month);
      let sundaysHolidays = 0, leave = 0;
      for (let d = 1; d <= numDays; d++) {
        const st = classifyDay(ctx, m.employeeCode, `${month}-${String(d).padStart(2, "0")}`);
        if (st.kind === "holiday" || st.kind === "weeklyOff") sundaysHolidays++;
        else if (st.kind === "leave") leave++;
      }
      const fieldDates = new Set(dcrs.map((d) => d.visitDateOnly));
      const avail = numDays - sundaysHolidays;
      const daywise = { avail, fieldWork: fieldDates.size, leave, other: Math.max(avail - fieldDates.size - leave, 0) };
      const typeDates: Record<string, Set<string>> = { HQ: new Set(), EX: new Set(), OS: new Set() };
      for (const d of dcrs) {
        const t = d.doctorId?.territoryType || "HQ";
        if (typeDates[t]) typeDates[t].add(d.visitDateOnly);
      }
      const territory = { hq: typeDates.HQ.size, ex: typeDates.EX.size, os: typeDates.OS.size };

      const docIdToGroup = new Map<string, string>();
      for (const d of myDoctors) { const g = groupOf(d); if (g) docIdToGroup.set(String(d._id), g); }
      const groups = new Set<string>(docIdToGroup.values());
      const orderedGroups = groupOrder ? groupOrder.filter((g) => groups.has(g)) : Array.from(groups).sort();

      for (const g of orderedGroups) {
        groupsSeen.add(g);
        const gDocs = myDoctors.filter((d) => docIdToGroup.get(String(d._id)) === g);
        const gIds = new Set(gDocs.map((d) => String(d._id)));
        const gDcrs = dcrs.filter((d) => gIds.has(String(d.doctorId?._id || d.doctorId)));
        const visitsPerDoc = new Map<string, number>();
        for (const d of gDcrs) {
          const id = String(d.doctorId?._id || d.doctorId);
          visitsPerDoc.set(id, (visitsPerDoc.get(id) || 0) + 1);
        }
        const blockFor = (bucket: 0 | 1 | 2) => {
          const list = bucket === 0 ? gDocs : gDocs.filter((d) => freqBucket(d) === bucket);
          const ids = new Set(list.map((d) => String(d._id)));
          let met = 0, seen = 0;
          for (const [id, n] of visitsPerDoc) if (ids.has(id)) { met++; seen += n; }
          return { list: list.length, met, seen };
        };
        let morning = 0, evening = 0, both = 0;
        const sessionsByDate = new Map<string, Set<string>>();
        for (const d of gDcrs) {
          if (d.callSession === "MORNING") morning++;
          else if (d.callSession === "EVENING") evening++;
          const s = sessionsByDate.get(d.visitDateOnly) || new Set<string>();
          s.add(d.callSession); sessionsByDate.set(d.visitDateOnly, s);
        }
        for (const s of sessionsByDate.values()) if (s.has("MORNING") && s.has("EVENING")) both++;
        const counts = Array.from(visitsPerDoc.values());
        const total = blockFor(0);
        rows.push({
          employeeCode: m.employeeCode, name: m.name, designation: m.designation, hq: m.territory,
          doj: ymd(m.joinDate), lastDcr: lastDcrDoc?.visitDateOnly || null,
          month, group: g,
          total, v1: blockFor(1), v2: blockFor(2),
          morning, evening, both,
          callAvg: daywise.fieldWork > 0 ? round2(gDcrs.length / daywise.fieldWork) : 0,
          met1: counts.filter((n) => n === 1).length,
          met2: counts.filter((n) => n === 2).length,
          metAbove2: counts.filter((n) => n > 2).length,
          missed: Math.max(gDocs.length - visitsPerDoc.size, 0),
          daywise, territory
        });
      }
    }
  }
  return {
    type,
    groups: Array.from(groupsSeen),
    rows,
    // Campaign has real backing only through the doctorCampaignMap master;
    // when it has no rows for this team the table is genuinely empty.
    campaignsAvailable: type !== "Campaign" || campaignRows.length > 0 || doctors.some((d) => !!d.campaign)
  };
}

// ═══ Item 5 -- Sales Details ══════════════════════════════════════════════
type Triple = { total: number; visited: number; productive: number; missed: number; missedPct: number };
function triple(total: number, visited: number, productive: number): Triple {
  const missed = Math.max(total - visited, 0);
  return { total, visited, productive, missed, missedPct: pct(missed, total) };
}

export async function computeSalesDetailsRows(tenantSlug: string, members: OrgEmployee[], month: string) {
  const codes = members.map((m) => m.employeeCode);
  const names = members.map((m) => m.name);
  const monthRegex = new RegExp(`^${month}`);
  const [doctors, dcrs, unlistedMaster, unlistedVisits, dealers, chemCalls] = await Promise.all([
    DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).select("mappedEmployeeCode").lean(),
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).select("employeeCode doctorId pob pobAmountRs").lean(),
    UnlistedDoctorModel.find({ tenantSlug, mr: { $in: names }, status: { $ne: "Rejected" } }).select("mr").lean(),
    FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitType: "UnlistedDoctor", visitDateOnly: monthRegex }).select("employeeCode entityName").lean(),
    DealerModel.find({ tenantSlug, employeeCode: { $in: codes }, status: "ACTIVE" }).select("employeeCode").lean(),
    ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: monthRegex }).select("employeeCode chemistId pob pobAmountRs").lean()
  ]);
  const count = (arr: any[], key: string, val: string) => arr.filter((x) => x[key] === val).length;
  return members.map((m) => {
    const myDcrs = (dcrs as any[]).filter((d) => d.employeeCode === m.employeeCode);
    const visited = new Set(myDcrs.map((d) => String(d.doctorId)));
    const productive = new Set(myDcrs.filter((d) => hasPob(d)).map((d) => String(d.doctorId)));
    const myUnlistedVisits = new Set((unlistedVisits as any[]).filter((v) => v.employeeCode === m.employeeCode).map((v) => v.entityName));
    const myChem = (chemCalls as any[]).filter((c) => c.employeeCode === m.employeeCode);
    const chemVisited = new Set(myChem.map((c) => c.chemistId));
    const chemProductive = new Set(myChem.filter((c) => hasPob(c)).map((c) => c.chemistId));
    return {
      employeeCode: m.employeeCode, name: m.name, designation: m.designation, hq: m.territory,
      listed: triple(count(doctors as any[], "mappedEmployeeCode", m.employeeCode), visited.size, productive.size),
      // UnlistedDoctor has no per-visit POB capture anywhere -> productive stays 0.
      unlisted: triple(count(unlistedMaster as any[], "mr", m.name), myUnlistedVisits.size, 0),
      chemist: triple(count(dealers as any[], "employeeCode", m.employeeCode), chemVisited.size, chemProductive.size)
    };
  });
}

export async function computeSalesDetailsStatewise(tenantSlug: string, month: string) {
  const [stateDocs, employees, rates] = await Promise.all([
    StateModel.find({ tenantSlug, status: "ACTIVE" }).select("stateName").lean(),
    EmployeeModel.find({ tenantSlug, status: "ACTIVE" }).select("employeeCode state").lean(),
    loadRateMap(tenantSlug)
  ]);
  const monthRegex = new RegExp(`^${month}`);
  const [dcrs, chemCalls] = await Promise.all([
    DcrModel.find({ tenantSlug, month, $or: [{ "pob.0": { $exists: true } }, { pobAmountRs: { $gt: 0 } }] }).select("employeeCode visitDateOnly pob pobAmountRs").lean(),
    ChemistCallModel.find({ tenantSlug, visitDateOnly: monthRegex, $or: [{ "pob.0": { $exists: true } }, { pobAmountRs: { $gt: 0 } }] }).select("employeeCode visitDateOnly pob pobAmountRs").lean()
  ]);
  const stateByCode = new Map((employees as any[]).map((e) => [e.employeeCode, e.state || ""]));
  const today = ymd(new Date())!;
  type Cell = { till: number; today: number };
  const blank = (): { listed: Cell; unlisted: Cell; chemist: Cell } => ({ listed: { till: 0, today: 0 }, unlisted: { till: 0, today: 0 }, chemist: { till: 0, today: 0 } });
  const byState = new Map<string, ReturnType<typeof blank>>();
  const names = new Set<string>([...(stateDocs as any[]).map((s) => s.stateName), ...(employees as any[]).map((e) => e.state).filter(Boolean)]);
  for (const n of names) byState.set(n, blank());
  const add = (rows: any[], key: "listed" | "chemist", valueOf: (r: any) => number) => {
    for (const r of rows) {
      const state = stateByCode.get(r.employeeCode);
      if (!state) continue;
      const cell = byState.get(state)![key];
      const v = valueOf(r);
      if (r.visitDateOnly === today) cell.today += v;
      else if (r.visitDateOnly < today) cell.till += v;
    }
  };
  add(dcrs as any[], "listed", (r) => docPobValue(r, rates));
  add(chemCalls as any[], "chemist", (r) => docPobValue(r, rates));
  const rows = Array.from(byState.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([state, v]) => {
    const t = (c: Cell) => round2(c.till + c.today);
    return {
      state,
      listed: { till: round2(v.listed.till), today: round2(v.listed.today), total: t(v.listed) },
      unlisted: { till: 0, today: 0, total: 0 }, // no POB capture on unlisted-doctor visits
      chemist: { till: round2(v.chemist.till), today: round2(v.chemist.today), total: t(v.chemist) },
      totalSalesValue: round2(t(v.listed) + t(v.chemist))
    };
  });
  return rows;
}

// ═══ Items 6/7 -- POB Wise / POB Wise - Periodically ══════════════════════
export async function listPobProducts(tenantSlug: string): Promise<string[]> {
  const names = await ProductModel.distinct("productName", { tenantSlug, status: "ACTIVE" });
  const fallback = names.length ? names : await ProductModel.distinct("name", { tenantSlug, status: "ACTIVE" });
  return (fallback as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

type PobCell = { drs: number; chem: number; products: Record<string, number> };
const emptyCell = (): PobCell => ({ drs: 0, chem: 0, products: {} });
function addProducts(cell: PobCell, rows: any[], wanted: Set<string>) {
  for (const r of rows || []) {
    if (!wanted.has(r.productName)) continue;
    cell.products[r.productName] = (cell.products[r.productName] || 0) + (r.qty || 0);
  }
}

export async function computePobWise(tenantSlug: string, team: OrgEmployee[], months: string[], products: string[]) {
  const codes = team.map((m) => m.employeeCode);
  const wanted = new Set(products);
  const first = monthBounds(months[0]).start;
  const last = monthBounds(months[months.length - 1]).end;
  const [dcrs, chemCalls] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months }, "pob.0": { $exists: true } }).select("employeeCode month pob").lean(),
    ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDate: { $gte: first, $lt: last }, "pob.0": { $exists: true } }).select("employeeCode visitDateOnly pob").lean()
  ]);
  const cells = new Map<string, PobCell>(); // `${code}|${month}`
  const cell = (code: string, month: string) => {
    const k = `${code}|${month}`;
    let c = cells.get(k);
    if (!c) { c = emptyCell(); cells.set(k, c); }
    return c;
  };
  for (const d of dcrs as any[]) { const c = cell(d.employeeCode, d.month); c.drs++; addProducts(c, d.pob, wanted); }
  for (const x of chemCalls as any[]) { const c = cell(x.employeeCode, String(x.visitDateOnly).slice(0, 7)); c.chem++; addProducts(c, x.pob, wanted); }

  const sumCells = (list: PobCell[]): PobCell => {
    const out = emptyCell();
    for (const c of list) {
      out.drs += c.drs; out.chem += c.chem;
      for (const [p, q] of Object.entries(c.products)) out.products[p] = (out.products[p] || 0) + q;
    }
    return out;
  };
  const rows = team.map((m) => {
    const perMonth: Record<string, PobCell> = {};
    for (const month of months) perMonth[month] = cells.get(`${m.employeeCode}|${month}`) || emptyCell();
    return {
      employeeCode: m.employeeCode, name: m.name, designation: m.designation, hq: m.territory, joinDate: ymd(m.joinDate),
      perMonth, total: sumCells(Object.values(perMonth))
    };
  });
  const grandPerMonth: Record<string, PobCell> = {};
  for (const month of months) grandPerMonth[month] = sumCells(rows.map((r) => r.perMonth[month]));
  return { months, products, rows, grandTotal: { perMonth: grandPerMonth, total: sumCells(Object.values(grandPerMonth)) } };
}

export async function computePobPeriodic(tenantSlug: string, team: OrgEmployee[], from: string, to: string, products: string[]) {
  const codes = team.map((m) => m.employeeCode);
  const wanted = new Set(products);
  const [dcrs, chemCalls] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: from, $lte: to } }).select("employeeCode visitDateOnly callSession pob").lean(),
    ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: from, $lte: to }, "pob.0": { $exists: true } }).select("employeeCode pob").lean()
  ]);
  const rowFor = (m: OrgEmployee) => {
    const mine = (dcrs as any[]).filter((d) => d.employeeCode === m.employeeCode);
    const fwd = new Set(mine.map((d) => d.visitDateOnly)).size;
    const morning = mine.filter((d) => d.callSession === "MORNING").length;
    const evening = mine.filter((d) => d.callSession === "EVENING").length;
    const cell = emptyCell();
    for (const d of mine) { if ((d.pob || []).length) cell.drs++; addProducts(cell, d.pob, wanted); }
    for (const c of (chemCalls as any[]).filter((x) => x.employeeCode === m.employeeCode)) { cell.chem++; addProducts(cell, c.pob, wanted); }
    return {
      employeeCode: m.employeeCode, name: m.name, designation: m.designation, hq: m.territory, joinDate: ymd(m.joinDate),
      fwd, morning, evening, drsSeen: mine.length, callAvg: fwd > 0 ? Math.round(mine.length / fwd) : 0,
      drsPob: cell.drs, chemPob: cell.chem, products: cell.products
    };
  };
  const rows = team.map(rowFor);
  const totals = {
    fwd: rows.reduce((s, r) => s + r.fwd, 0),
    morning: rows.reduce((s, r) => s + r.morning, 0),
    evening: rows.reduce((s, r) => s + r.evening, 0),
    drsSeen: rows.reduce((s, r) => s + r.drsSeen, 0),
    drsPob: rows.reduce((s, r) => s + r.drsPob, 0),
    chemPob: rows.reduce((s, r) => s + r.chemPob, 0),
    products: {} as Record<string, number>
  };
  for (const r of rows) for (const [p, q] of Object.entries(r.products)) totals.products[p] = (totals.products[p] || 0) + q;
  return { rows, totals: { ...totals, callAvg: totals.fwd > 0 ? Math.round(totals.drsSeen / totals.fwd) : 0 }, products };
}

export { isManagerRole };
