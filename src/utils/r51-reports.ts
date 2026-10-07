// Round 51 -- MIS Reports > Visit Details / Product Exposure family (legacy ASPX screens):
//   At a Glance, Manager Visit (Vacant HQ's), Chemist/UnListed/Stockist, Territory wise (+ Manager coverage),
//   Product Exposure Analysis (+ drill), ListedDr - Product Visit, Product Exposure - Unlisted Doctor.
// Real DCR / ChemistCall / FieldVisitLog / Doctor / Employee data only; hierarchy via buildHierarchy (r50).
//
// Inferred definitions (also returned in each result's `notes`):
//   * A "call" = distinct (doctor, day) per fieldforce; a doctor seen twice in a day counts once. REJECTED/DRAFT DCRs ignored.
//   * Ttl Drs = ACTIVE doctors currently mapped (no month-wise roster history exists).
//   * Manager rows: coverage metrics are team-rolled (doctors mapped anywhere in the subtree, visited by anyone in the subtree);
//     FWD, Drs Seen, Call Avg and Unlist Met are the manager's own.
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { monthsBetween, loadProductMaster } from "./pob-rx-reports.js";
import { buildHierarchy, type Hierarchy } from "./r50-reports.js";
import { mappedDoctors } from "./r48-reports.js";

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : null);
const slash = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

export type Call = { code: string; doctorId: string; doctor: any; day: number; month: string; products: string[]; date: string };
export async function loadCalls(tenantSlug: string, codes: string[], months: string[]): Promise<Call[]> {
  if (!codes.length) return [];
  const rows = (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).populate("doctorId").lean()) as any[];
  const seen = new Set<string>(); const out: Call[] = [];
  for (const c of rows) {
    if (c.status === "REJECTED" || c.status === "DRAFT" || !c.doctorId) continue;
    const date = String(c.visitDateOnly || ""); const day = parseInt(date.slice(8, 10), 10); if (!day) continue;
    const doctorId = String(c.doctorId._id ?? c.doctorId);
    const k = `${c.employeeCode}|${doctorId}|${date}`;
    const prods = (c.productsDetailed || []).map((p: string) => String(p).trim()).filter(Boolean);
    if (seen.has(k)) { const prev = out.find((o) => o.code === c.employeeCode && o.doctorId === doctorId && o.date === date)!; prev.products = [...new Set([...prev.products, ...prods])]; continue; }
    seen.add(k);
    out.push({ code: c.employeeCode, doctorId, doctor: c.doctorId, day, month: c.month || date.slice(0, 7), products: prods, date });
  }
  return out;
}
const header = (h: Hierarchy) => ({ employeeCode: h.root.employeeCode, name: h.root.name, designation: h.root.designation, hq: h.root.territory });
async function hier(tenantSlug: string, code: string) { return buildHierarchy(tenantSlug, code); }

// ═══ 2) At a Glance ═════════════════════════════════════════════════════
export async function computeAtGlance(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const h = await hier(tenantSlug, code); if (!h) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = h.order.map((e) => e.employeeCode);
  const [docs, calls] = [await mappedDoctors(tenantSlug, codes), await loadCalls(tenantSlug, codes, months)];
  const logs = (await FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitType: "UnlistedDoctor", visitDateOnly: { $gte: `${fromMonth}-01`, $lte: `${toMonth}-31` } }).lean()) as any[];
  const last = (await DcrModel.aggregate([{ $match: { tenantSlug, employeeCode: { $in: codes }, status: { $nin: ["REJECTED", "DRAFT"] } } }, { $group: { _id: "$employeeCode", last: { $max: "$visitDateOnly" } } }])) as any[];
  const lastBy = new Map<string, string>(last.map((x) => [x._id, String(x.last || "")]));
  const rows = h.order.map((e, i) => {
    const sub = new Set(h.subtree.get(e.employeeCode)!);
    const teamDocs = docs.filter((d) => sub.has(d.mappedEmployeeCode));
    const perMonth: Record<string, any> = {};
    for (const m of months) {
      const mine = calls.filter((c) => c.code === e.employeeCode && c.month === m);
      const team = calls.filter((c) => sub.has(c.code) && c.month === m);
      const byDoc = new Map<string, number>();
      for (const c of team) byDoc.set(c.doctorId, (byDoc.get(c.doctorId) || 0) + 1);
      let met = 0, once = 0, twice = 0, rpt = 0;
      for (const d of teamDocs) { const n = byDoc.get(String(d._id)) || 0; if (n >= 1) met++; if (n === 1) once++; if (n >= 2) { twice++; rpt += n - 1; } }
      const ttl = teamDocs.length, fwd = new Set(mine.map((c) => c.day)).size, seen = mine.length;
      const unl = new Set(logs.filter((l) => l.employeeCode === e.employeeCode && String(l.visitDateOnly).slice(0, 7) === m).map((l) => lc(l.entityName))).size;
      perMonth[m] = { fwd, ttl, met, once, twice, seen, missed: ttl - met, unl, rpt, coverage: pct(met, ttl), callAvg: fwd ? r2(seen / fwd) : null, missedPct: pct(ttl - met, ttl), repeatedPct: pct(rpt, met) };
    }
    return { ...h.head(e, i), subDivision: (e as any).division || "", lastDcrDate: slash(lastBy.get(e.employeeCode) || ""), perMonth };
  });
  return { months, employee: header(h), rows, notes: [
    "FWD = distinct days with a doctor-call DCR; Ttl Drs = active doctors currently mapped; Drs Met = distinct doctors visited; Met Once / Twice & Above = doctors with 1 / 2+ calls in the month.",
    "Drs Seen = the row's own doctor calls (distinct doctor+day); Rpt Calls = calls beyond the first to the same doctor (screenshot hint suggests it may equal Met Twice & Above - inferred).",
    "Manager rows: Ttl Drs / Met / Once / Twice / Missed / Rpt are team-rolled; FWD, Drs Seen, Call Avg and Unlist Met are the manager's own. Coverage = Met/Ttl, Call Avg = Seen/FWD, Missed % = Missed/Ttl, Repeated % = Rpt/Met.",
    "Unlist Met = distinct unlisted doctors in the field visit log."
  ] };
}

// ═══ 3) Manager - Visit (Vacant HQ's) ═══════════════════════════════════
export const MANAGER_DESIGNATIONS = ["ABM", "BH", "BRM", "MH", "NBM", "RBM", "SM", "Sr ABM", "ZBM"];
export async function computeVacantManagerVisits(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const all = (await EmployeeModel.find({ tenantSlug }).lean()) as any[];
  const root = all.find((e) => e.employeeCode === code); if (!root) return null;
  const kids = new Map<string, any[]>();
  for (const e of all) if (e.reportingManager) (kids.get(e.reportingManager) ?? kids.set(e.reportingManager, []).get(e.reportingManager)!).push(e);
  const desc: any[] = []; const seen = new Set<string>([root.employeeCode]); const stack = [root.employeeCode];
  while (stack.length) for (const k of kids.get(stack.pop()!) ?? []) if (!seen.has(k.employeeCode)) { seen.add(k.employeeCode); desc.push(k); stack.push(k.employeeCode); }
  const vacant = desc.filter((e) => (e.role === "MR" || e.role === "SR_MR") && (e.status === "INACTIVE" || e.leftDate));
  const months = monthsBetween(fromMonth, toMonth);
  const vcodes = vacant.map((e) => e.employeeCode);
  const docs = vcodes.length ? ((await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: vcodes }, status: "ACTIVE" }).lean()) as any[]) : [];
  const docOwner = new Map<string, string>(docs.map((d) => [String(d._id), d.mappedEmployeeCode]));
  const desigOf = new Map<string, string>(all.map((e) => [e.employeeCode, lc(e.designation)]));
  const dcrs = docs.length ? ((await DcrModel.find({ tenantSlug, month: { $in: months } }).lean()) as any[]) : [];
  const sets = new Map<string, Set<string>>();
  for (const c of dcrs) {
    if (c.status === "REJECTED" || c.status === "DRAFT" || !c.doctorId) continue;
    const id = String(c.doctorId._id ?? c.doctorId); const owner = docOwner.get(id); if (!owner) continue;
    const col = MANAGER_DESIGNATIONS.find((m) => lc(m) === desigOf.get(c.employeeCode)); if (!col) continue;
    const k = `${owner}|${c.month}|${col}`; (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(id);
  }
  const rows = vacant.map((e, i) => ({ sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory,
    perMonth: Object.fromEntries(months.map((m) => [m, Object.fromEntries(MANAGER_DESIGNATIONS.map((c) => [c, sets.get(`${e.employeeCode}|${m}|${c}`)?.size ?? 0]))])) }));
  return { months, columns: MANAGER_DESIGNATIONS, employee: { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory }, rows,
    notes: ["Vacant HQ = an MR under the selected manager who is INACTIVE or has a leftDate.", "Cell = distinct doctors mapped to that MR visited by an employee with that designation in the month (any DCR author); columns are the fixed legacy designations."] };
}

// ═══ 4) Chemist - UnListed Doctors - Stockist ═══════════════════════════
export async function computeChemistUnlisted(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const h = await hier(tenantSlug, code); if (!h) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = h.order.map((e) => e.employeeCode);
  const chem = (await ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: `${fromMonth}-01`, $lte: `${toMonth}-31` } }).lean()) as any[];
  const logs = (await FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitType: { $in: ["UnlistedDoctor", "Stockist"] }, visitDateOnly: { $gte: `${fromMonth}-01`, $lte: `${toMonth}-31` } }).lean()) as any[];
  const ev = [
    ...chem.map((c) => ({ code: c.employeeCode, kind: "chemist", id: String(c.chemistId), m: String(c.visitDateOnly).slice(0, 7) })),
    ...logs.map((l) => ({ code: l.employeeCode, kind: l.visitType === "Stockist" ? "stockist" : "unlisted", id: lc(l.entityName), m: String(l.visitDateOnly).slice(0, 7) }))
  ];
  const rows = h.order.map((e, i) => {
    const sub = new Set(h.subtree.get(e.employeeCode)!);
    const perMonth: Record<string, any> = {};
    for (const m of months) {
      const o: any = {};
      for (const k of ["chemist", "unlisted", "stockist"]) { const x = ev.filter((v) => v.kind === k && v.m === m && sub.has(v.code)); o[k] = { met: new Set(x.map((v) => v.id)).size, seen: x.length }; }
      perMonth[m] = o;
    }
    return { ...h.head(e, i), perMonth };
  });
  return { months, employee: header(h), rows, notes: ["Met = distinct chemists / unlisted doctors / stockists visited; Seen = total visit records (chemist calls and field visit log entries).", "Manager rows roll up their whole team (distinct across the team)."] };
}

// ═══ 5) Territory wise - Listed Doctor Visit (+ Manager coverage) ═══════
const modeType = (docs: any[]) => { const c = new Map<string, number>(); for (const d of docs) c.set(d.territoryType || "HQ", (c.get(d.territoryType || "HQ") || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "HQ"; };
export async function computeTerritoryWise(tenantSlug: string, code: string, month: string) {
  const h = await hier(tenantSlug, code); if (!h) return null;
  const bes = h.order.filter((e) => !h.isMgr(e));
  const codes = bes.map((e) => e.employeeCode);
  const docs = await mappedDoctors(tenantSlug, codes);
  const calls = await loadCalls(tenantSlug, codes, [month]);
  const rows = bes.map((e, i) => {
    const mine = docs.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    const terrs = [...new Set(mine.map((d) => String(d.territory || "").trim()))].sort((a, b) => a.localeCompare(b));
    return {
      sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory,
      territories: terrs.map((t) => {
        const td = mine.filter((d) => String(d.territory || "").trim() === t); const ids = new Set(td.map((d) => String(d._id)));
        const vs = calls.filter((c) => c.code === e.employeeCode && ids.has(c.doctorId));
        const met = new Set(vs.map((c) => c.doctorId)).size;
        return { territory: t || "-", type: modeType(td), available: td.length, visited: met, days: [...new Set(vs.map((c) => c.day))].sort((a, b) => a - b), missed: td.length - met };
      })
    };
  });
  return { month, employee: header(h), rows, notes: ["One block per base-level fieldforce, one row per territory taken from the doctors' territory; Type = the territory's most common doctor territoryType (HQ/EX/OS).", "Date of Visit = distinct days the fieldforce called on doctors of that territory; Missed = available - visited."] };
}
export async function computeManagerCoverage(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const h = await hier(tenantSlug, code); if (!h) return null;
  const mgrs = h.order.filter((e) => h.isMgr(e) || e.employeeCode === h.root.employeeCode);
  const docs = await mappedDoctors(tenantSlug, mgrs.map((e) => e.employeeCode));
  const rows = mgrs.map((e, i) => {
    const mine = docs.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    const terrs = [...new Set(mine.map((d) => String(d.territory || "").trim()))].sort((a, b) => a.localeCompare(b));
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory,
      territories: terrs.map((t) => { const td = mine.filter((d) => String(d.territory || "").trim() === t); return { territory: t || "-", type: modeType(td), available: td.length }; }), total: mine.length };
  });
  return { fromMonth, toMonth, employee: header(h), rows, notes: ["'Self Manager' = the selected manager and every manager beneath, using the doctors mapped to the managers themselves.", "Availability is the current roster, so it does not vary with the period; the period only labels the report."] };
}

// ═══ 6) Product Exposure Analysis (+ drill) ═════════════════════════════
export async function productOptions(tenantSlug: string) { return (await loadProductMaster(tenantSlug)).map((p) => p.name); }
const hasProduct = (c: Call, product: string) => (product === "ALL" ? c.products.length > 0 : c.products.some((p) => lc(p) === lc(product)));
export async function computeProductExposure(tenantSlug: string, code: string, product: string, fromMonth: string, toMonth: string) {
  const h = await hier(tenantSlug, code); if (!h) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = h.order.map((e) => e.employeeCode);
  const calls = (await loadCalls(tenantSlug, codes, months)).filter((c) => hasProduct(c, product));
  const cnt = (cs: string[], m: string) => new Set(calls.filter((c) => c.month === m && cs.includes(c.code)).map((c) => c.doctorId)).size;
  const rows = h.order.map((e, i) => ({ ...h.head(e, i), perMonth: Object.fromEntries(months.map((m) => [m, cnt([e.employeeCode], m)])) }));
  const grand = Object.fromEntries(months.map((m) => [m, cnt(codes, m)]));
  return { product, months, employee: header(h), rows, grand, codes, notes: ["Count = distinct doctors detailed with the product in a DCR (productsDetailed) that month; 'All Product' = any product detailed. Rx quantities are not used.", "Manager rows show the manager's own calls; Grand Total is distinct across everyone."] };
}
export async function productExposureDrill(tenantSlug: string, codes: string[], product: string, month: string) {
  const calls = (await loadCalls(tenantSlug, codes, [month])).filter((c) => hasProduct(c, product));
  const byDoc = new Map<string, { doctorName: string; doctorCode: string; speciality: string; territory: string; employeeCode: string; dates: string[] }>();
  for (const c of calls) {
    const k = c.doctorId; const cur = byDoc.get(k) || { doctorName: c.doctor?.name || "", doctorCode: c.doctor?.doctorCode || "", speciality: c.doctor?.specialty || "", territory: c.doctor?.territory || "", employeeCode: c.code, dates: [] as string[] };
    cur.dates.push(slash(c.date)); byDoc.set(k, cur);
  }
  return { product, month, rows: [...byDoc.values()].sort((a, b) => a.doctorName.localeCompare(b.doctorName)) };
}

// ═══ 7) ListedDr - Product Visit ════════════════════════════════════════
export async function computeListedDrProductVisit(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const h = await hier(tenantSlug, code); if (!h) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = h.order.map((e) => e.employeeCode);
  const docs = await mappedDoctors(tenantSlug, codes);
  const tagged = (d: any): string[] => [...new Set([...(d.mappedProducts || []), ...(d.priorityProducts || [])].map((x: string) => String(x).trim()).filter(Boolean))];
  const tdocs = docs.filter((d) => tagged(d).length);
  const byId = new Map<string, any>(tdocs.map((d) => [String(d._id), d]));
  const calls = (await loadCalls(tenantSlug, codes, months)).filter((c) => byId.has(c.doctorId) && tagged(byId.get(c.doctorId)).some((t) => c.products.some((p) => lc(p) === lc(t))));
  const rows = h.order.map((e, i) => {
    const sub = new Set(h.subtree.get(e.employeeCode)!);
    return { ...h.head(e, i), taggedDrs: tdocs.filter((d) => sub.has(d.mappedEmployeeCode)).length,
      perMonth: Object.fromEntries(months.map((m) => [m, calls.filter((c) => c.month === m && sub.has(c.code)).length])) };
  });
  return { months, employee: header(h), rows, notes: ["No of Product Tagged-Drs = mapped doctors with at least one mapped/priority product.", "Product Visit = doctor calls (distinct doctor+day) in which a product tagged to that doctor was detailed. Manager rows are team rollups."] };
}

// ═══ 8) Product Exposure - Unlisted Doctor ══════════════════════════════
export async function computeProductExposureUnlisted(tenantSlug: string, code: string, product: string, fromMonth: string, toMonth: string) {
  const h = await hier(tenantSlug, code); if (!h) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = h.order.map((e) => e.employeeCode);
  const logs = (await FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitType: "UnlistedDoctor" }).lean()) as any[];
  const tagged = logs.filter((l) => String(l.visitDateOnly || "") && months.includes(String(l.visitDateOnly).slice(0, 7)) && Array.isArray(l.productsDetailed) && l.productsDetailed.length
    && (product === "ALL" ? true : l.productsDetailed.some((p: string) => lc(p) === lc(product))));
  const cnt = (code1: string, m: string) => new Set(tagged.filter((l) => l.employeeCode === code1 && String(l.visitDateOnly).slice(0, 7) === m).map((l) => lc(l.entityName))).size;
  const rows = h.order.map((e, i) => ({ ...h.head(e, i), perMonth: Object.fromEntries(months.map((m) => [m, cnt(e.employeeCode, m)])) }));
  const anyData = tagged.length > 0;
  return { product, months, employee: header(h), rows, dataAvailable: anyData,
    notes: [anyData ? "Count = distinct unlisted doctors (by name) visited and detailed with the product, from the products recorded on unlisted-doctor visits; 'All Product' = any product. Each row counts that fieldforce's own visits only."
      : "No unlisted visits with products yet.",
      "Products are captured on unlisted-doctor visits only from the release that added this field; earlier visits carry no product data and are not counted."] };
}
export type { Hierarchy };
