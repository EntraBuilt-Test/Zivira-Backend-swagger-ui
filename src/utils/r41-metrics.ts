// src/utils/r41-metrics.ts
// Round 41 -- shared real-data helpers used by the MIS reports once the
// previously disclosed gaps were closed:
//   * docPobValue        doctor / chemist call order value (Gap B)
//   * computeDelayStats  delayed / locked DCR dates (Gap A)
//   * computeExpenseSplit  HQ / EX / OS / misc expense (item 5)
//   * computeSpend       sample / input / Dr-service spend (item 5)
//   * computeRcpaCrm     doctor-linked RCPA + CRM totals (item 4)
//   * computeOtherVisits stockist / hospital / CIP / unlisted visits (item 1)
//   * computeTierStats   per-category (Nil/CORE/N CORE/S CORE) visit stats
import { DcrModel } from "../models/dcr.model.js";
import { DcrLockModel } from "../models/dcr-lock.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { RcpaModel } from "../models/rcpa.model.js";
import { CrmModel } from "../models/crm.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { pobValue } from "./mis-reports-compute.js";
import { detectLocks, daysBetween, utcDateString } from "./dcr-lock.js";
import { getCategoryNorms } from "./settings.js";
import { loadCoreMap, tierOfDoctor, TIERS, type Tier } from "./doctor-tier.js";
import type { OrgEmployee } from "./org-hierarchy.js";

const round2 = (n: number) => Number(n.toFixed(2));
const ymd = (d: unknown): string | null => {
  if (!d) return null;
  const dt = new Date(d as string);
  return Number.isNaN(dt.getTime()) ? null : utcDateString(dt);
};

// ── Gap B: order value of one DCR / chemist-call document ───────────────
// Per-product rows win (explicit valueRs, else qty x product rate); when a
// call has no per-product rows the single entered order amount is used.
// Historic documents have neither and honestly evaluate to 0.
export function docPobValue(doc: { pob?: any[]; pobAmountRs?: number | null } | null | undefined, rates: Map<string, number>): number {
  if (!doc) return 0;
  const rows = pobValue(doc.pob, rates);
  if (rows > 0) return rows;
  return typeof doc.pobAmountRs === "number" ? doc.pobAmountRs : 0;
}

// ── Gap A: delayed reporting ────────────────────────────────────────────
// A date is "delayed" when its first submission was recorded after the DCR
// date (late submission, days = submission day - DCR date) or when it is
// still locked with nothing submitted (days = today - DCR date).
export type DelayStats = {
  delayedDates: { date: string; days: number; kind: "late-submitted" | "locked-outstanding" }[];
  total: number;
  locks: { date: string; lockedAt: Date; releasedAt: Date | null; releasedBy: string | null; reason: string }[];
};
export async function computeDelayStats(tenantSlug: string, emp: OrgEmployee, month: string, now: Date = new Date()): Promise<DelayStats> {
  const monthRegex = new RegExp(`^${month}`);
  const first = `${month}-01`;
  const [y, m] = month.split("-").map((v) => parseInt(v, 10));
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  await detectLocks(tenantSlug, [emp as any], first, last, now);
  const [dcrs, chem, logs, locks] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: emp.employeeCode, month }).select("visitDateOnly createdAt").lean(),
    ChemistCallModel.find({ tenantSlug, employeeCode: emp.employeeCode, visitDateOnly: monthRegex }).select("visitDateOnly createdAt").lean(),
    FieldVisitLogModel.find({ tenantSlug, employeeCode: emp.employeeCode, visitDateOnly: monthRegex }).select("visitDateOnly createdAt").lean(),
    DcrLockModel.find({ tenantSlug, employeeCode: emp.employeeCode, dcrDate: monthRegex }).sort({ dcrDate: 1 }).lean()
  ]);
  const firstSubmission = new Map<string, string>();
  for (const r of [...(dcrs as any[]), ...(chem as any[]), ...(logs as any[])]) {
    const created = ymd(r.createdAt);
    if (!created) continue;
    const cur = firstSubmission.get(r.visitDateOnly);
    if (!cur || created < cur) firstSubmission.set(r.visitDateOnly, created);
  }
  const today = utcDateString(now);
  const delayed: DelayStats["delayedDates"] = [];
  for (const [date, created] of firstSubmission) {
    const late = daysBetween(date, created);
    if (late > 0) delayed.push({ date, days: late, kind: "late-submitted" });
  }
  for (const l of locks as any[]) {
    if (!firstSubmission.has(l.dcrDate) && !l.releasedAt) delayed.push({ date: l.dcrDate, days: Math.max(daysBetween(l.dcrDate, today), 0), kind: "locked-outstanding" });
  }
  delayed.sort((a, b) => a.date.localeCompare(b.date));
  return {
    delayedDates: delayed,
    total: delayed.reduce((s, d) => s + d.days, 0),
    locks: (locks as any[]).map((l) => ({ date: l.dcrDate, lockedAt: l.lockedAt, releasedAt: l.releasedAt || null, releasedBy: l.releasedBy || null, reason: l.lockReason }))
  };
}

// ── item 5: expense split from real expense claims ──────────────────────
export async function computeExpenseSplit(tenantSlug: string, employeeCode: string, month: string) {
  const claims = (await ExpenseClaimModel.find({ tenantSlug, employeeCode, month, status: { $ne: "REJECTED" } }).lean()) as any[];
  const sum = (f: (c: any) => boolean) => round2(claims.filter(f).reduce((s, c) => s + (c.amountRs || 0), 0));
  return {
    hq: sum((c) => c.territoryType === "HQ"),
    ex: sum((c) => c.territoryType === "EX"),
    os: sum((c) => c.territoryType === "OS"),
    misc: sum((c) => c.category === "Other"),
    total: sum(() => true),
    unclassified: sum((c) => !c.territoryType)
  };
}

// ── item 5: sample / input / Dr-service spend ───────────────────────────
// Sample spend = qty x the product master rate (only where a rate exists);
// input spend = valueRs x qty as entered; Dr-service spend = approved CRM.
export async function computeSpend(tenantSlug: string, dcrs: any[], rates: Map<string, number>, employeeCode: string, month: string) {
  let sample = 0, input = 0;
  for (const d of dcrs) {
    for (const s of d.samplesGiven || []) {
      const rate = rates.get(String(s.productName || "").trim().toLowerCase());
      if (rate != null) sample += (s.qty || 0) * rate;
    }
    for (const i of d.inputsGiven || []) input += (i.valueRs || 0) * (i.qty || 1);
  }
  const crm = (await CrmModel.find({ tenantSlug, employeeCode, month, status: "APPROVED" }).lean()) as any[];
  return { sample: round2(sample), input: round2(input), drService: round2(crm.reduce((s, c) => s + (c.amountRs || 0), 0)) };
}

// ── item 4: RCPA + CRM ──────────────────────────────────────────────────
export async function computeRcpaCrm(tenantSlug: string, employeeCode: string, month: string) {
  const [rcpa, crm] = await Promise.all([
    RcpaModel.find({ tenantSlug, employeeCode, month }).lean() as Promise<any[]>,
    CrmModel.find({ tenantSlug, employeeCode, month }).lean() as Promise<any[]>
  ]);
  return {
    rcpaEntries: rcpa.length,
    rcpaOurQty: rcpa.reduce((s, r) => s + (r.ourQty || 0), 0),
    rcpaCompetitorQty: rcpa.reduce((s, r) => s + (r.competitorQty || 0), 0),
    crmEntries: crm.length,
    crmAmount: round2(crm.reduce((s, c) => s + (c.amountRs || 0), 0)),
    crmApprovedAmount: round2(crm.filter((c) => c.status === "APPROVED").reduce((s, c) => s + (c.amountRs || 0), 0))
  };
}

// ── item 1: Stockist / Hospital / CIP / Unlisted visits ─────────────────
export async function computeOtherVisits(tenantSlug: string, employeeCode: string, month: string) {
  const logs = (await FieldVisitLogModel.find({ tenantSlug, employeeCode, visitDateOnly: new RegExp(`^${month}`) }).select("visitType entityName").lean()) as any[];
  const by = (t: string) => logs.filter((l) => l.visitType === t);
  const stat = (t: string) => ({ met: new Set(by(t).map((l) => String(l.entityName).trim().toLowerCase())).size, seen: by(t).length });
  return { unlisted: stat("UnlistedDoctor"), stockist: stat("Stockist"), hospital: stat("Hospital"), cip: stat("CIP") };
}

// ── item 2: per-category visit statistics for one rep ──────────────────
export type TierStat = { list: number; met: number; seen: number; missed: number; v1: number; v2: number; v3: number; vMore: number; v0: number; adhered: number; underNorm: number; overNorm: number };
export async function computeTierStats(tenantSlug: string, emp: OrgEmployee, dcrs: any[]): Promise<{ stats: Record<Tier, TierStat>; norms: Record<Tier, number>; totalNorm: number; visitNorm: number }> {
  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: emp.employeeCode, status: "ACTIVE" }).lean()) as any[];
  const [core, norms] = await Promise.all([loadCoreMap(tenantSlug, [emp.name]), getCategoryNorms(tenantSlug)]);
  const visits = new Map<string, number>();
  for (const d of dcrs) { const id = String(d.doctorId?._id || d.doctorId); visits.set(id, (visits.get(id) || 0) + 1); }
  const normOf: Record<Tier, number> = { Nil: norms.NIL, CORE: norms.CORE, "N CORE": norms["N CORE"], "S CORE": norms["S CORE"] };
  const stats = {} as Record<Tier, TierStat>;
  let totalNorm = 0, visitNorm = 0;
  for (const tier of TIERS) {
    const ids = doctors.filter((d) => tierOfDoctor(d, core, emp.name) === tier).map((d) => String(d._id));
    const n = (id: string) => visits.get(id) || 0;
    const norm = normOf[tier];
    stats[tier] = {
      list: ids.length, met: ids.filter((i) => n(i) > 0).length, seen: ids.reduce((s, i) => s + n(i), 0), missed: ids.filter((i) => n(i) === 0).length,
      v0: ids.filter((i) => n(i) === 0).length, v1: ids.filter((i) => n(i) === 1).length, v2: ids.filter((i) => n(i) === 2).length,
      v3: ids.filter((i) => n(i) === 3).length, vMore: ids.filter((i) => n(i) > 3).length,
      adhered: ids.filter((i) => n(i) >= norm).length, underNorm: ids.filter((i) => n(i) < norm).length, overNorm: ids.filter((i) => n(i) > norm).length
    };
    totalNorm += ids.length * norm;
    visitNorm += ids.reduce((s, i) => s + Math.min(n(i), norm), 0);
  }
  return { stats, norms: normOf, totalNorm, visitNorm };
}

// Secondary-sale rows (product qty / value) for an HQ+month from the real
// Secondary Sales master.
export async function computeSecondaryRows(tenantSlug: string, hq: string, month: string) {
  try {
    const rows = (await getMasterModel("secondarySales").find({ tenantSlug, hq, month }).lean()) as any[];
    const by = new Map<string, { qty: number; value: number }>();
    for (const r of rows) {
      const e = by.get(r.product) || { qty: 0, value: 0 };
      e.qty += r.salesUnit || 0; e.value += r.salesValue || 0; by.set(r.product, e);
    }
    return Array.from(by.entries()).map(([product, v]) => ({ product, qty: v.qty, value: round2(v.value) })).sort((a, b) => b.value - a.value);
  } catch { return []; }
}
