// Round 53 -- MIS Reports: Input Details, Sample Rx Quantity, Delayed Status, Leave Status (active / periodically),
// Mail Status, TP - Deviation (legacy layout). Real data only.
//
// Inferred definitions (also returned in `notes`):
//   Input Details   : default source = inputs given to doctors on DCRs (inputsGiven qty); "despatch" = Dispatch(INPUT) item dispatchQty
//                     by despatch date; "both" adds them. Rows show each person's own count (no rollup); Total row sums all rows.
//   Sample Rx Qty   : Rx = DcrModel.rxItems (qty>0). basis "sampled" (default) counts only Rx of an item for doctors the same fieldforce
//                     gave a sample of that item (DCR samplesGiven) on or before the Rx day; basis "all" counts every Rx.
//                     Multiple = Rx records, Unique = distinct Rx doctors, Total Rx Qty = summed quantity. Own DCRs only.
//   Leave           : APPROVED LeaveApplication days inside the range, Sundays excluded (weekly off); CL / PL / SL / LOP by leave-type name
//                     (isLWP or loss/lop/lwp/unpaid -> LOP; casual -> CL; sick -> SL; privilege/earned/PL/EL -> PL); other types count in Total only.
//   Delayed Status  : only DcrLock rows already persisted (the sweep/detector writes them); "not released" = releasedAt unset.
//   TP Deviation    : APPROVED tour-plan day vs the day's actual (DCR work type, approved leave, holiday, weekly off, or no DCR);
//                     days with neither a plan nor a DCR are not listed.
import { DcrModel } from "../models/dcr.model.js";
import { DispatchModel } from "../models/dispatch.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { DcrLockModel } from "../models/dcr-lock.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { MailLogModel } from "../models/mail-log.model.js";
import { ProductModel } from "../models/product.model.js";
import { ProductBrandModel } from "../models/product-brand.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { monthsBetween, loadProductMaster } from "./pob-rx-reports.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const dmy = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const isoOf = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const monthEnd = (m: string) => { const [y, mm] = m.split("-").map(Number); return new Date(Date.UTC(y, mm, 0)).getUTCDate(); };

// ── org walk over ALL employees (any status), children first, each manager after their team ──
export type Org = { root: any | null; order: any[]; byCode: Map<string, any>; isMgr: (e: any) => boolean; kids: Map<string, any[]> };
export async function orgWalk(tenantSlug: string, code: string, activeOnly = false): Promise<Org | null> {
  const all = (await EmployeeModel.find({ tenantSlug }).lean()) as any[];
  const byCode = new Map<string, any>(all.map((e) => [e.employeeCode, e]));
  const kids = new Map<string, any[]>();
  for (const e of all) if (e.reportingManager && byCode.has(e.reportingManager)) (kids.get(e.reportingManager) ?? kids.set(e.reportingManager, []).get(e.reportingManager)!).push(e);
  const isAdmin = !code || code === "admin";
  const root = isAdmin ? null : byCode.get(code);
  if (!isAdmin && !root) return null;
  const order: any[] = []; const seen = new Set<string>();
  const keep = (e: any) => !activeOnly || (e.status !== "INACTIVE" && !e.leftDate);
  const walk = (e: any) => { seen.add(e.employeeCode); for (const k of kids.get(e.employeeCode) ?? []) if (!seen.has(k.employeeCode)) walk(k); if (keep(e)) order.push(e); };
  if (isAdmin) { for (const e of all) if (!e.reportingManager || !byCode.has(e.reportingManager)) if (!seen.has(e.employeeCode)) walk(e); } else walk(root);
  return { root, order, byCode, isMgr: (e) => (kids.get(e.employeeCode)?.length ?? 0) > 0, kids };
}
const header = (o: Org) => (o.root ? { employeeCode: o.root.employeeCode, name: o.root.name, designation: o.root.designation, hq: o.root.territory } : { employeeCode: "admin", name: "admin", designation: "", hq: "" });
async function regionLookup(tenantSlug: string) {
  let rows: any[] = []; try { rows = (await getMasterModel("territoryHqMaster").find({ tenantSlug }).lean()) as any[]; } catch { /* master not configured */ }
  return (hq: string) => String(rows.find((r) => lc(r.headquartersName) === lc(hq))?.region || "");
}
const vacant = (e: any) => e.status === "INACTIVE" || !!e.leftDate;

// ═══ 1) Input Details ═══════════════════════════════════════════════════
export type InputSource = "dcr" | "despatch" | "both";
export async function computeInputDetails(tenantSlug: string, code: string, fromMonth: string, toMonth: string, source: InputSource = "dcr") {
  const o = await orgWalk(tenantSlug, code); if (!o) return null;
  const months = monthsBetween(fromMonth, toMonth); const set = new Set(months);
  const codes = o.order.map((e) => e.employeeCode);
  const qty = new Map<string, number>(); // `${code}|${month}`
  const add = (c: string, m: string, n: number) => qty.set(`${c}|${m}`, (qty.get(`${c}|${m}`) || 0) + n);
  if (source !== "despatch") {
    for (const d of (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).lean()) as any[]) {
      if (d.status === "REJECTED" || d.status === "DRAFT") continue;
      for (const i of d.inputsGiven || []) if (i.qty > 0) add(d.employeeCode, d.month || String(d.visitDateOnly).slice(0, 7), i.qty);
    }
  }
  if (source !== "dcr") {
    for (const d of (await DispatchModel.find({ tenantSlug, employeeCode: { $in: codes }, type: "INPUT" }).lean()) as any[]) {
      for (const it of d.items || []) { const iso = isoOf(it.despatchDate || d.dispatchDate); if (iso && set.has(iso.slice(0, 7)) && it.dispatchQty > 0) add(d.employeeCode, iso.slice(0, 7), it.dispatchQty); }
    }
  }
  const region = await regionLookup(tenantSlug);
  const rows = o.order.map((e, i) => {
    const perMonth = Object.fromEntries(months.map((m) => [m, qty.get(`${e.employeeCode}|${m}`) || 0]));
    return { sno: i + 1, employeeCode: e.employeeCode, name: vacant(e) ? "Vacant" : e.name, designation: e.designation, role: e.role, hq: e.territory, region: region(e.territory), state: e.state || "", perMonth, total: Object.values(perMonth).reduce((s, n) => s + n, 0) };
  });
  const totals = Object.fromEntries(months.map((m) => [m, rows.reduce((s, r) => s + r.perMonth[m], 0)]));
  return { months, source, employee: header(o), rows, totals, grandTotal: Object.values(totals).reduce((s, n) => s + n, 0), notes: [
    source === "dcr" ? "No.of Input given = quantity of inputs/gifts given to doctors in DCRs (inputsGiven)." : source === "despatch" ? "No.of Input given = quantity despatched to the fieldforce (Dispatch type INPUT, by despatch date)." : "No.of Input given = DCR inputs given PLUS despatched quantity (mixes two measures).",
    "Every row shows that person's own count (no team rollup); the Total row sums all rows. Region comes from the Territory/HQ master (blank when the HQ is not listed)."
  ] };
}

// ═══ 2) Sample Rx Quantity ══════════════════════════════════════════════
export async function sampleRxOptions(tenantSlug: string, mode: "product" | "brand") {
  if (mode === "product") return (await loadProductMaster(tenantSlug)).map((p) => p.name);
  const rows = (await ProductBrandModel.find({ tenantSlug }).lean()) as any[];
  const names = rows.sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || String(a.brandName).localeCompare(String(b.brandName))).map((r) => String(r.brandName).trim()).filter(Boolean);
  return ["Nil", ...new Set(names.filter((n) => lc(n) !== "nil"))];
}
export async function computeSampleRxQuantity(tenantSlug: string, code: string, fromMonth: string, toMonth: string, mode: "product" | "brand", items: string[], basis: "sampled" | "all" = "sampled") {
  const o = await orgWalk(tenantSlug, code, true); if (!o) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = o.order.map((e) => e.employeeCode);
  const prods = (await ProductModel.find({ tenantSlug }).lean()) as any[];
  const brandOf = new Map<string, string>();
  for (const p of prods) for (const n of [p.productName, p.name]) if (n) brandOf.set(lc(n), String(p.brandName || "").trim() || "Nil");
  const itemOf = (name: string) => (mode === "product" ? name : brandOf.get(lc(name)) || "Nil");
  const wanted = new Map(items.map((i) => [lc(i), i]));
  const norm = (name: string) => wanted.get(lc(itemOf(name)));
  const dcrs = (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).lean()) as any[];
  const live = dcrs.filter((d) => d.status !== "REJECTED" && d.status !== "DRAFT" && d.doctorId);
  type Agg = { multiple: number; docs: Set<string>; qty: number; cells: Map<string, number> };
  const aggs = new Map<string, Agg>(codes.map((c) => [c, { multiple: 0, docs: new Set(), qty: 0, cells: new Map() }]));
  const firstSample = new Map<string, string>(); // `${code}|${doctor}|${item}` -> first sample date
  for (const d of live) for (const s of d.samplesGiven || []) { const it = norm(s.productName); if (!it || !(s.qty > 0)) continue; const k = `${d.employeeCode}|${d.doctorId}|${it}`; const cur = firstSample.get(k); if (!cur || d.visitDateOnly < cur) firstSample.set(k, d.visitDateOnly); }
  for (const d of live) {
    const a = aggs.get(d.employeeCode)!;
    for (const r of d.rxItems || []) {
      const it = norm(r.productName); if (!it || !(r.qty > 0)) continue;
      if (basis === "sampled") { const f = firstSample.get(`${d.employeeCode}|${d.doctorId}|${it}`); if (!f || f > d.visitDateOnly) continue; }
      a.multiple++; a.docs.add(String(d.doctorId)); a.qty += r.qty;
      const ck = `${d.month}|${it}`; a.cells.set(ck, (a.cells.get(ck) || 0) + r.qty);
    }
  }
  const rows = o.order.map((e, i) => {
    const a = aggs.get(e.employeeCode)!;
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, role: e.role, hq: e.territory, multiple: a.multiple, unique: a.docs.size, totalQty: a.qty,
      perMonth: Object.fromEntries(months.map((m) => [m, Object.fromEntries(items.map((it) => [it, a.cells.get(`${m}|${it}`) || 0]))])) };
  });
  const total = { multiple: rows.reduce((s, r) => s + r.multiple, 0), unique: rows.reduce((s, r) => s + r.unique, 0), totalQty: rows.reduce((s, r) => s + r.totalQty, 0),
    perMonth: Object.fromEntries(months.map((m) => [m, Object.fromEntries(items.map((it) => [it, rows.reduce((s, r) => s + r.perMonth[m][it], 0)]))])) };
  return { months, mode, items, basis, employee: header(o), rows, total, notes: [
    basis === "sampled" ? "Rx quantity counts only prescriptions of an item by doctors the same fieldforce gave a sample of that item on or before the Rx day." : "Rx quantity counts every prescription of the selected items (sample status ignored).",
    "Multiple = Rx records, Unique = distinct Rx doctors (per fieldforce; the Total row sums rows), Total Rx Qty = summed quantity. Own DCRs only, so managers without own Rx show '-'.",
    mode === "brand" ? "Brand = Product.brandName; products without a brand are 'Nil'." : "Product names are matched case-insensitively against the DCR Rx and sample lines."
  ] };
}

// ═══ 3) Delayed Status ══════════════════════════════════════════════════
export async function computeDelayedStatus(tenantSlug: string, code: string, month: string) {
  const o = await orgWalk(tenantSlug, code); if (!o) return null;
  const codes = o.order.map((e) => e.employeeCode);
  const from = `${month}-01`, to = `${month}-${String(monthEnd(month)).padStart(2, "0")}`;
  const locks = (await DcrLockModel.find({ tenantSlug, employeeCode: { $in: codes }, dcrDate: { $gte: from, $lte: to } }).lean()) as any[];
  const last = (await DcrModel.aggregate([{ $match: { tenantSlug, employeeCode: { $in: codes }, status: { $nin: ["REJECTED", "DRAFT"] } } }, { $group: { _id: "$employeeCode", last: { $max: "$visitDateOnly" } } }])) as any[];
  const lastBy = new Map<string, string>(last.map((x) => [x._id, String(x.last || "")]));
  const mgrName = (e: any, n: number) => { let cur = e; for (let i = 0; i < n; i++) { cur = cur?.reportingManager ? o.byCode.get(cur.reportingManager) : null; } return cur?.name || ""; };
  const rows = o.order.map((e, i) => {
    const mine = locks.filter((l) => l.employeeCode === e.employeeCode).sort((a, b) => a.dcrDate.localeCompare(b.dcrDate));
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, role: e.role, joiningDate: dmy(isoOf(e.joinDate)), resignedDate: dmy(isoOf(e.leftDate)), lastDcrDate: dmy(lastBy.get(e.employeeCode) || ""),
      manager1: mgrName(e, 1), manager2: mgrName(e, 2),
      notReleased: mine.filter((l) => !l.releasedAt).map((l) => dmy(l.dcrDate)), released: mine.filter((l) => l.releasedAt).map((l) => `${dmy(l.dcrDate)} (${dmy(isoOf(l.releasedAt))})`) };
  });
  return { month, employee: header(o), rows, notes: ["Only DCR locks already persisted by the lock detector are shown (a date nobody has swept yet cannot appear).", "Delayed Not Released Dates = locked DCR dates in the month with no release; Delay Lock date = locked date with its release date in brackets."] };
}

// ═══ 4/5) Leave Status ══════════════════════════════════════════════════
export type LeaveKind = "CL" | "PL" | "SL" | "LOP" | "OTHER";
export function leaveKind(type: string, isLWP?: boolean): LeaveKind {
  const t = lc(type);
  if (isLWP || /\b(lop|lwp)\b|loss of pay|without pay|unpaid/.test(t)) return "LOP";
  if (/casual|^cl$|\bcl\b/.test(t)) return "CL";
  if (/sick|^sl$|\bsl\b/.test(t)) return "SL";
  if (/privilege|earned|^pl$|\bpl\b|^el$|\bel\b/.test(t)) return "PL";
  return "OTHER";
}
type LeaveDay = { code: string; date: string; kind: LeaveKind };
async function leaveDays(tenantSlug: string, codes: string[], from: string, to: string): Promise<LeaveDay[]> {
  if (!codes.length) return [];
  const apps = (await LeaveApplicationModel.find({ tenantSlug, employeeCode: { $in: codes }, status: "APPROVED", fromDate: { $lte: new Date(`${to}T23:59:59Z`) }, toDate: { $gte: new Date(`${from}T00:00:00Z`) } }).lean()) as any[];
  const out: LeaveDay[] = []; const seen = new Set<string>();
  for (const a of apps) {
    const kind = leaveKind(a.leaveType, a.isLWP);
    const start = isoOf(a.fromDate) > from ? isoOf(a.fromDate) : from, end = isoOf(a.toDate) < to ? isoOf(a.toDate) : to;
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000) {
      const d = new Date(t); if (d.getUTCDay() === 0) continue;
      const iso = d.toISOString().slice(0, 10); const k = `${a.employeeCode}|${iso}`; if (seen.has(k)) continue; seen.add(k);
      out.push({ code: a.employeeCode, date: iso, kind });
    }
  }
  return out;
}
const tally = (days: LeaveDay[]) => ({ CL: days.filter((d) => d.kind === "CL").length, PL: days.filter((d) => d.kind === "PL").length, SL: days.filter((d) => d.kind === "SL").length, LOP: days.filter((d) => d.kind === "LOP").length, total: days.length });
const LEAVE_NOTES = ["Leave days = approved leave applications (including uploaded leave) within the range, Sundays excluded.", "CL / PL / SL / LOP come from the leave-type name (LWP flag or loss-of-pay -> LOP); other leave types count only in Total."];

export async function computeLeaveActive(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const o = await orgWalk(tenantSlug, code, true); if (!o) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const days = await leaveDays(tenantSlug, o.order.map((e) => e.employeeCode), `${months[0]}-01`, `${months[months.length - 1]}-${String(monthEnd(months[months.length - 1])).padStart(2, "0")}`);
  const rows = o.order.map((e, i) => {
    const mine = days.filter((d) => d.code === e.employeeCode);
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, role: e.role, hq: e.territory,
      perMonth: Object.fromEntries(months.map((m) => [m, tally(mine.filter((d) => d.date.startsWith(m)))])), totals: tally(mine) };
  });
  return { months, employee: header(o), rows, notes: [...LEAVE_NOTES, "Only ACTIVE fieldforce are listed."] };
}
export async function computeLeavePeriodically(tenantSlug: string, code: string, from: string, to: string, detailed: boolean) {
  const o = await orgWalk(tenantSlug, code, true); if (!o) return null;
  const days = await leaveDays(tenantSlug, o.order.map((e) => e.employeeCode), from, to);
  const list = detailed ? o.order : o.order.filter((e) => !o.isMgr(e));
  const rows = list.map((e, i) => {
    const mine = days.filter((d) => d.code === e.employeeCode).sort((a, b) => a.date.localeCompare(b.date));
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, role: e.role, hq: e.territory, joiningDate: dmy(isoOf(e.joinDate)),
      leaveDates: mine.map((d) => dmy(d.date)), ...tally(mine) };
  });
  return { from, to, detailed, employee: header(o), rows, notes: [...LEAVE_NOTES, "Only ACTIVE fieldforce are listed; the non-detailed view omits manager rows (as in the legacy report)."] };
}

// ═══ 6) Mail Status ═════════════════════════════════════════════════════
export async function computeMailStatus(tenantSlug: string, from: string, to: string) {
  const rows = (await MailLogModel.find({ tenantSlug, sentAt: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59.999Z`) } }).sort({ sentAt: -1 }).lean()) as any[];
  return { from, to, rows: rows.map((r, i) => ({ sno: i + 1, sentAt: new Date(r.sentAt).toISOString(), to: r.to, toName: r.toName || "", subject: r.subject, mailType: r.mailType, status: r.status, error: r.error || "", channel: r.channel || "" })),
    notes: ["Mail history starts when logging was added (Round 53); earlier mail was not recorded.", "Only e-mails to employees of this tenant are shown."] };
}

// ═══ 7) TP - Deviation (legacy layout) ══════════════════════════════════
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const plannedCat = (purpose: string) => (/leave/i.test(purpose) ? "Leave" : /meeting|transit|training|non/i.test(purpose) ? "Non Field Work" : "Field Work");
export type TpDevRow = { date: string; day: string; asPerTp: string; asPerDcr: string };
// Shared TP-vs-actual engine (Round 53 baselevel, Round 54 managers + at-a-glance). level 2 = managers.
export async function tpDeviationRows(tenantSlug: string, emps: any[], month: string, level: 1 | 2 = 1): Promise<Map<string, TpDevRow[]>> {
  const codes = emps.map((e) => e.employeeCode);
  const out = new Map<string, TpDevRow[]>(codes.map((c) => [c, []]));
  if (!codes.length) return out;
  const plans = (await TourPlanModel.find({ tenantSlug, employeeCode: { $in: codes }, month, status: "APPROVED" }).lean()) as any[];
  const dcrs = ((await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).lean()) as any[]).filter((d) => d.status !== "REJECTED" && d.status !== "DRAFT");
  const ctx = await buildDayStatusContext(tenantSlug, month, codes, emps.map((e) => e.state));
  ctx.tourPlanByEmployee = new Map();   // plans are compared separately; here only leave / holiday / weekly off matter
  for (const e of emps) {
    const code = e.employeeCode;
    const planned = new Map<string, { area: string; town: string; purpose: string }>();
    for (const p of plans.filter((x) => x.employeeCode === code)) for (const l of p.locations || []) planned.set(l.date, { area: l.area || "", town: l.town || "", purpose: l.purpose || "" });
    const byDate = new Map<string, string>();
    for (const d of dcrs.filter((x) => x.employeeCode === code)) { const cat = (d.workType && d.workType !== "Field Work") ? "Non Field Work" : "Field Work"; if (byDate.get(d.visitDateOnly) !== "Field Work") byDate.set(d.visitDateOnly, cat); }
    const rows: TpDevRow[] = [];
    for (let d = 1; d <= monthEnd(month); d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const tp = planned.get(date); const dcr = byDate.get(date);
      let actual = dcr; let actualRaw = dcr || "";
      if (!actual) { const st = classifyDay(ctx, code, date); actualRaw = st.kind === "leave" ? "Leave" : st.kind === "holiday" ? "Holiday" : st.kind === "weeklyOff" ? "Weekly Off" : "No DCR"; actual = actualRaw; }
      if (!tp && !dcr) continue;                                   // nothing planned and no DCR: not a deviation
      const holiday = ctx.holidaysByDate.get(date);
      // Managers: a plan entry that is just the holiday's title (e.g. "Gandhi Jayanti") is listed against the day's actual
      // status ("Holiday"), as in the single legacy example; otherwise the same category comparison as base level.
      const titleOnly = level === 2 && !!tp && !!holiday && (lc(tp.town) === lc(holiday) || lc(tp.purpose) === lc(holiday));
      if (tp && !titleOnly && plannedCat(tp.purpose) === actual) continue;     // plan honoured
      const text = tp ? (titleOnly ? holiday! : level === 2 ? [tp.town, tp.area].filter(Boolean).join(", ") + (tp.purpose && lc(tp.purpose) !== "field work" ? ` (${tp.purpose})` : "") : `${tp.town}, ${tp.area} (${tp.purpose || "Field Work"})`) : "";
      rows.push({ date: dmy(date), day: DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()], asPerTp: text, asPerDcr: actualRaw });
    }
    out.set(code, rows);
  }
  return out;
}
export async function computeTpDeviationLegacy(tenantSlug: string, code: string, month: string) {
  const e: any = await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean(); if (!e) return null;
  const rows = (await tpDeviationRows(tenantSlug, [e], month, 1)).get(code)!;
  return { month, employee: { employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory }, rows,
    notes: ["Planned = APPROVED tour plan day; actual = DCR work type, approved leave, holiday, weekly off or no DCR. Only differing days are listed (days with a DCR but no plan are included).", "Plan work type is read from the plan's purpose text: 'leave' -> Leave, meeting/transit/training/non -> Non Field Work, otherwise Field Work."] };
}
