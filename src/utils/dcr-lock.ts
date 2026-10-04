// Round 41 Gap A -- DCR lock mechanism.
//
// Rule: a DCR date D is auto-locked for an employee when D was a working day
// for them (not a holiday / weekly off / approved leave, on/after their
// joining date), NO DCR / chemist call / visit log exists for D, and today
// is later than D + N days (N = company setting DCR_DELAY_DAYS, default 3).
// Locks are computed lazily whenever a screen or submit touches the date
// and persisted on first detection (DcrLockModel); a daily background sweep
// persists the rest. A lock stays in force until an admin releases it
// (releasedAt / releasedBy), after which the date can be submitted.
import { DcrLockModel } from "../models/dcr-lock.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";
import { getDcrDelayDays } from "./settings.js";

export const LOCK_LOOKBACK_DAYS = 60;

export function utcDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return utcDateString(d);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
}
// The first calendar day on which date D is considered locked = D + N + 1.
export function lockEffectiveDate(date: string, delayDays: number): string {
  return addDays(date, delayDays + 1);
}
export function isPastDelayWindow(date: string, today: string, delayDays: number): boolean {
  return today >= lockEffectiveDate(date, delayDays);
}

type Emp = { employeeCode: string; joinDate?: Date | null; state?: string | null; status?: string };

// Detect (and persist) auto-delay locks for one batch of employees over
// [fromDate, toDate]. Returns the number of NEW lock rows created.
export async function detectLocks(tenantSlug: string, employees: Emp[], fromDate: string, toDate: string, now: Date = new Date()): Promise<number> {
  if (employees.length === 0) return 0;
  const today = utcDateString(now);
  const delayDays = await getDcrDelayDays(tenantSlug);
  const latest = addDays(today, -(delayDays + 1)); // newest date that can already be locked
  const end = toDate < latest ? toDate : latest;
  if (fromDate > end) return 0;

  const codes = employees.map((e) => e.employeeCode);
  const [dcrDates, chemDates, logDates] = await Promise.all([
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: fromDate, $lte: end } }).select("employeeCode visitDateOnly").lean(),
    ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: fromDate, $lte: end } }).select("employeeCode visitDateOnly").lean(),
    FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: fromDate, $lte: end } }).select("employeeCode visitDateOnly").lean()
  ]);
  const submitted = new Set<string>();
  for (const r of [...(dcrDates as any[]), ...(chemDates as any[]), ...(logDates as any[])]) submitted.add(`${r.employeeCode}|${r.visitDateOnly}`);
  const existing = new Set<string>(
    ((await DcrLockModel.find({ tenantSlug, employeeCode: { $in: codes }, dcrDate: { $gte: fromDate, $lte: end } }).select("employeeCode dcrDate").lean()) as any[]).map((l) => `${l.employeeCode}|${l.dcrDate}`)
  );

  // Day classification needs one context per month the range touches.
  const months = new Set<string>();
  for (let d = fromDate; d <= end; d = addDays(d, 1)) months.add(d.slice(0, 7));
  const ctxByMonth = new Map<string, Awaited<ReturnType<typeof buildDayStatusContext>>>();
  for (const m of months) ctxByMonth.set(m, await buildDayStatusContext(tenantSlug, m, codes, employees.map((e) => e.state)));

  const docs: any[] = [];
  for (const e of employees) {
    if (e.status && e.status !== "ACTIVE") continue;
    const joined = e.joinDate ? utcDateString(new Date(e.joinDate)) : null;
    for (let d = fromDate; d <= end; d = addDays(d, 1)) {
      const key = `${e.employeeCode}|${d}`;
      if (existing.has(key) || submitted.has(key)) continue;
      if (joined && d < joined) continue;
      const kind = classifyDay(ctxByMonth.get(d.slice(0, 7))!, e.employeeCode, d).kind;
      if (kind === "holiday" || kind === "weeklyOff" || kind === "leave") continue;
      docs.push({
        tenantSlug, employeeCode: e.employeeCode, dcrDate: d, lockReason: "auto-delay", delayDays,
        lockedAt: new Date(`${lockEffectiveDate(d, delayDays)}T00:00:00Z`), detectedAt: now
      });
    }
  }
  if (docs.length === 0) return 0;
  try {
    const res = await DcrLockModel.insertMany(docs, { ordered: false });
    return res.length;
  } catch (err: any) {
    // Duplicate-key races with a concurrent detector are harmless.
    return typeof err?.insertedDocs?.length === "number" ? err.insertedDocs.length : 0;
  }
}

export type LockState = { locked: boolean; reason: "auto-delay" | "manual" | null; releasedAt: Date | null; releasedBy: string | null; lockedAt: Date | null };

// Is this one date currently locked (and so not submittable)?
export async function getLockState(tenantSlug: string, employeeCode: string, date: string, now: Date = new Date()): Promise<LockState> {
  let lock = (await DcrLockModel.findOne({ tenantSlug, employeeCode, dcrDate: date }).lean()) as any;
  if (!lock) {
    const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean()) as any;
    if (emp) await detectLocks(tenantSlug, [emp], date, date, now);
    lock = (await DcrLockModel.findOne({ tenantSlug, employeeCode, dcrDate: date }).lean()) as any;
  }
  if (!lock) return { locked: false, reason: null, releasedAt: null, releasedBy: null, lockedAt: null };
  return { locked: !lock.releasedAt, reason: lock.lockReason, releasedAt: lock.releasedAt || null, releasedBy: lock.releasedBy || null, lockedAt: lock.lockedAt };
}

export async function releaseLocks(tenantSlug: string, employeeCode: string, dates: string[] | "all", releasedBy: string, now: Date = new Date()): Promise<number> {
  const filter: Record<string, unknown> = { tenantSlug, employeeCode, releasedAt: null };
  if (dates !== "all") filter.dcrDate = { $in: dates };
  const res = await DcrLockModel.updateMany(filter, { $set: { releasedAt: now, releasedBy } });
  return res.modifiedCount ?? 0;
}

// Daily sweep: persist locks for every active employee of every tenant.
export async function sweepAllTenants(now: Date = new Date()): Promise<number> {
  const tenants = (await EmployeeModel.distinct("tenantSlug")) as string[];
  const today = utcDateString(now);
  const from = addDays(today, -LOCK_LOOKBACK_DAYS);
  let created = 0;
  for (const tenantSlug of tenants) {
    const emps = (await EmployeeModel.find({ tenantSlug, status: "ACTIVE", role: { $in: ["MR", "SR_MR", "ABM", "RBM", "ZBM", "BH", "NBH"] } }).select("employeeCode joinDate state status").lean()) as any[];
    created += await detectLocks(tenantSlug, emps, from, today, now);
  }
  return created;
}
