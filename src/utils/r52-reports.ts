// Round 52 -- MIS Reports:
//   * Product Exposure > Priority Wise  ("Product Prioritywise Analysis")  -- RESULT LAYOUT INFERRED (only the form was seen)
//   * Sample / Input > Sample Issued - Fieldforce Wise ("Sample Details")
// Real Doctor / DCR / Dispatch / Employee / territoryHqMaster data only.
//
// Inferences (also returned in `notes`):
//   Priority Wise: slots are the doctor's priorityProducts P0..P5 (index = priority, as in the Listed Doctor master).
//     Cell = doctors whose slot holds the product (current roster) and how many of them were visited in the month;
//     manager rows are team rollups.
//   Sample Details: default source = DCR samplesGiven (samples handed to doctors, which carries doctor/product/date for the drill);
//     "despatch" = Dispatch(SAMPLE) item dispatchQty by despatch date; "both" adds them (not default: it mixes issued-to-rep with given-to-doctor).
//     Manager rows show the manager's own samples only. Region = territoryHqMaster.region matched on the employee's territory (HQ).
import { DcrModel } from "../models/dcr.model.js";
import { DispatchModel } from "../models/dispatch.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { monthsBetween } from "./pob-rx-reports.js";
import { buildHierarchy } from "./r50-reports.js";
import { loadCalls } from "./r51-reports.js";
import { mappedDoctors } from "./r48-reports.js";

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();

// ═══ Priority Wise ════════════════════════════════════════════════════
export const PRIORITY_SLOTS = [0, 1, 2, 3, 4, 5];
export async function computePriorityWise(tenantSlug: string, code: string, product: string, fromMonth: string, toMonth: string) {
  const h = await buildHierarchy(tenantSlug, code); if (!h) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = h.order.map((e) => e.employeeCode);
  const docs = await mappedDoctors(tenantSlug, codes);
  const match = (v: unknown) => (product === "ALL" ? !!String(v ?? "").trim() : lc(v) === lc(product));
  const slotDocs = docs.map((d) => ({ d, slots: PRIORITY_SLOTS.filter((i) => match(d.priorityProducts?.[i])) })).filter((x) => x.slots.length);
  const calls = await loadCalls(tenantSlug, codes, months);
  const rows = h.order.map((e, i) => {
    const sub = new Set(h.subtree.get(e.employeeCode)!);
    const mine = slotDocs.filter((x) => sub.has(x.d.mappedEmployeeCode));
    const perMonth: Record<string, Record<string, { drs: number; visited: number }>> = {};
    for (const m of months) {
      const seen = new Set(calls.filter((c) => c.month === m && sub.has(c.code)).map((c) => c.doctorId));
      perMonth[m] = Object.fromEntries(PRIORITY_SLOTS.map((p) => {
        const ds = mine.filter((x) => x.slots.includes(p));
        return [String(p), { drs: ds.length, visited: ds.filter((x) => seen.has(String(x.d._id))).length }];
      }));
    }
    return { ...h.head(e, i), perMonth };
  });
  return { product, months, slots: PRIORITY_SLOTS, employee: { employeeCode: h.root.employeeCode, name: h.root.name, designation: h.root.designation, hq: h.root.territory }, rows, notes: [
    "LAYOUT INFERRED: only the form screenshot was available for this legacy report.",
    "Slots are the doctor's priority products P0..P5 (index = priority). Each cell shows doctors whose slot holds the product, with how many of them were visited in the month in brackets.",
    "The priority mapping has no month history (current roster); manager rows are team rollups."
  ] };
}

// ═══ Sample Details ═══════════════════════════════════════════════════
export type SampleSource = "dcr" | "despatch" | "both";
type Issue = { code: string; month: string; date: string; doctor: string; product: string; qty: number; source: "DCR" | "Despatch"; ref: string };
async function loadIssues(tenantSlug: string, codes: string[], months: string[], source: SampleSource): Promise<Issue[]> {
  const out: Issue[] = []; if (!codes.length) return out;
  const set = new Set(months);
  if (source !== "despatch") {
    const rows = (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).populate("doctorId").lean()) as any[];
    for (const c of rows) {
      if (c.status === "REJECTED" || c.status === "DRAFT") continue;
      for (const s of c.samplesGiven || []) if ((s.qty || 0) > 0) out.push({ code: c.employeeCode, month: c.month || String(c.visitDateOnly).slice(0, 7), date: String(c.visitDateOnly || ""), doctor: c.doctorId?.name || "", product: s.productName, qty: s.qty, source: "DCR", ref: "" });
    }
  }
  if (source !== "dcr") {
    const rows = (await DispatchModel.find({ tenantSlug, employeeCode: { $in: codes }, type: "SAMPLE" }).lean()) as any[];
    for (const d of rows) for (const it of d.items || []) {
      const dt = it.despatchDate || d.dispatchDate; if (!dt) continue;
      const iso = new Date(dt).toISOString().slice(0, 10); if (!set.has(iso.slice(0, 7)) || !(it.dispatchQty > 0)) continue;
      out.push({ code: d.employeeCode, month: iso.slice(0, 7), date: iso, doctor: "", product: it.name, qty: it.dispatchQty, source: "Despatch", ref: it.docketNo || "" });
    }
  }
  return out;
}
const slash = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

export async function computeSampleDetails(tenantSlug: string, code: string, fromMonth: string, toMonth: string, source: SampleSource = "dcr") {
  const all = (await EmployeeModel.find({ tenantSlug }).lean()) as any[];
  const root = all.find((e) => e.employeeCode === code); if (!root) return null;
  const kids = new Map<string, any[]>();
  for (const e of all) if (e.reportingManager) (kids.get(e.reportingManager) ?? kids.set(e.reportingManager, []).get(e.reportingManager)!).push(e);
  const order: any[] = []; const seen = new Set<string>();
  const walk = (e: any) => { seen.add(e.employeeCode); for (const k of kids.get(e.employeeCode) ?? []) if (!seen.has(k.employeeCode)) walk(k); order.push(e); };
  walk(root);
  const months = monthsBetween(fromMonth, toMonth);
  const issues = await loadIssues(tenantSlug, order.map((e) => e.employeeCode), months, source);
  let hqRows: any[] = []; try { hqRows = (await getMasterModel("territoryHqMaster").find({ tenantSlug }).lean()) as any[]; } catch { /* master not configured */ }
  const regionOf = (hq: string) => String(hqRows.find((r) => lc(r.headquartersName) === lc(hq))?.region || "");
  const vacant = (e: any) => e.status === "INACTIVE" || !!e.leftDate;
  const rows = order.map((e, i) => {
    const perMonth = Object.fromEntries(months.map((m) => [m, issues.filter((x) => x.code === e.employeeCode && x.month === m).reduce((s, x) => s + x.qty, 0)]));
    return { sno: i + 1, employeeCode: e.employeeCode, name: vacant(e) ? "Vacant" : e.name, designation: e.designation, role: e.role, hq: e.territory, region: regionOf(e.territory), state: e.state || "", perMonth, total: Object.values(perMonth).reduce((s, n) => s + n, 0) };
  });
  return { months, source, employee: { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory }, rows, notes: [
    source === "dcr" ? "Sample count = quantity of samples given to doctors in DCRs (samplesGiven)." : source === "despatch" ? "Sample count = quantity despatched to the fieldforce (Dispatch, type SAMPLE, by despatch date)." : "Sample count = DCR samples given PLUS despatched quantity (mixes two different measures).",
    "Manager rows show the manager's own samples only (no team rollup). Vacant = inactive or left employee.",
    "Region comes from the Territory/HQ master's region matched on the employee's territory; blank when the HQ is not in that master."
  ] };
}
export async function sampleDetailsDrill(tenantSlug: string, code: string, month: string, source: SampleSource = "dcr") {
  const items = (await loadIssues(tenantSlug, [code], [month], source)).sort((a, b) => a.date.localeCompare(b.date));
  return { employeeCode: code, month, rows: items.map((x) => ({ date: slash(x.date), doctor: x.doctor, product: x.product, qty: x.qty, source: x.source, ref: x.ref })) };
}
