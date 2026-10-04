// Round 42 -- legacy-parity POB/Rx screens and Heat Analysis:
//   Rx/POB Details (Product Wise)   Dr_Chem_POB.aspx
//   Rx/POB Details (FieldForce Wise) Dr_Chem_Dump.aspx
//   Rx/POB Details (Day Wise)        Dr_Che_POB_daywise.aspx
//   Listed Dr/Chem Dump (.xlsx)      Dr_Che_POB_Dump.aspx
//   Not At All Visit Drs / Promoted Products / Visit HQs
// All figures come from the Round 41 capture:
//   Doctors  -> DcrModel.rxItems (Rx qty per product); value = qty x product rate
//   Chemists -> ChemistCallModel.pob rows (qty, valueRs, else qty x product rate)
// Calls with only a lump-sum pobAmountRs (no product rows) cannot be attributed
// to a product, so they are not part of these product-level screens.
import ExcelJS from "exceljs";
import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { ProductModel } from "../models/product.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { findVacantManagerCodes, isManagerRole, type OrgEmployee } from "./org-hierarchy.js";
import { orgOrdered } from "./mis-reports-2-compute.js";
import { loadCoreMap, tierOfDoctor } from "./doctor-tier.js";

export type PobMode = "Doctors" | "Chemists";
const round2 = (n: number) => Number(n.toFixed(2));
const key = (s: unknown) => String(s ?? "").trim().toLowerCase();

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while ((y < ty || (y === ty && m <= tm)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const slash = (d: Date | string | null | undefined) => { if (!d) return null; const x = new Date(d); return Number.isNaN(x.getTime()) ? null : `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`; };

// ── product master (in master order) ─────────────────────────────────────
export type MasterProduct = { name: string; code: string; pack: string; rate: number | null };
export async function loadProductMaster(tenantSlug: string): Promise<MasterProduct[]> {
  const rows = (await ProductModel.find({ tenantSlug, status: "ACTIVE" }).sort({ _id: 1 }).lean()) as any[];
  const seen = new Set<string>();
  const out: MasterProduct[] = [];
  for (const p of rows) {
    const name = String(p.productName || p.name || "").trim();
    if (!name || seen.has(key(name))) continue;
    seen.add(key(name));
    out.push({ name, code: String(p.code || p.productCode || name), pack: p.pack || "", rate: typeof p.rate === "number" ? p.rate : null });
  }
  return out;
}

// ── scope: selected force + everyone under it (or the whole company) ───────
export async function resolveScope(tenantSlug: string, code: string, includeVacant = false) {
  const root = code && code !== "admin" ? ((await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean()) as unknown as OrgEmployee | null) : null;
  let list = (await orgOrdered(tenantSlug, root ? root.employeeCode : "", true)) as (OrgEmployee & { depth: number })[];
  if (includeVacant) {
    const vacant = await findVacantManagerCodes(tenantSlug);
    if (vacant.size > 0) {
      const inactive = (await EmployeeModel.find({ tenantSlug, status: "INACTIVE", role: { $in: ["ABM", "RBM", "ZBM", "BH", "NBH"] } }).lean()) as unknown as OrgEmployee[];
      const have = new Set(list.map((s) => s.employeeCode));
      list = [...list, ...inactive.filter((i) => !have.has(i.employeeCode)).map((i) => ({ ...i, depth: 0 }))];
    }
  }
  return { root, list };
}
export const dojOf = (e: OrgEmployee | null) => (e ? slash(e.joinDate) : null);

// ── activity lines ───────────────────────────────────────────────────────
export type Line = { code: string; date: string; day: number; product: string; qty: number; value: number; kind: "dr" | "ch"; entityId: string; callId: string };

export async function loadLines(tenantSlug: string, codes: string[], months: string[], mode: PobMode | "both", master: MasterProduct[], only?: Set<string>): Promise<Line[]> {
  const byKey = new Map(master.map((p) => [key(p.name), p]));
  const canon = (n: string) => byKey.get(key(n))?.name ?? String(n || "").trim();
  const rate = (n: string) => byKey.get(key(n))?.rate ?? 0;
  const keep = (n: string) => !only || only.size === 0 || only.has(key(canon(n)));
  const first = `${months[0]}-01`;
  const last = monthEnd(months[months.length - 1]);
  const out: Line[] = [];
  if (mode === "Doctors" || mode === "both") {
    const dcrs = (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).select("employeeCode visitDateOnly doctorId rxItems").lean()) as any[];
    for (const d of dcrs) {
      for (const r of d.rxItems || []) {
        if (!(r.qty > 0) || !keep(r.productName)) continue;
        const product = canon(r.productName);
        out.push({ code: d.employeeCode, date: d.visitDateOnly, day: Number(String(d.visitDateOnly).slice(8, 10)), product, qty: r.qty, value: round2(r.qty * rate(product)), kind: "dr", entityId: String(d.doctorId ?? ""), callId: String(d._id) });
      }
    }
  }
  if (mode === "Chemists" || mode === "both") {
    const calls = (await ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: first, $lte: last } }).select("employeeCode visitDateOnly chemistId pob").lean()) as any[];
    for (const c of calls) {
      for (const r of c.pob || []) {
        if (!(r.qty > 0) && !(r.valueRs > 0)) continue;
        if (!keep(r.productName)) continue;
        const product = canon(r.productName);
        const value = typeof r.valueRs === "number" ? r.valueRs : (r.qty || 0) * rate(product);
        out.push({ code: c.employeeCode, date: c.visitDateOnly, day: Number(String(c.visitDateOnly).slice(8, 10)), product, qty: r.qty || 0, value: round2(value), kind: "ch", entityId: String(c.chemistId ?? ""), callId: String(c._id) });
      }
    }
  }
  return out;
}

const parseMode = (m: string): PobMode => (m === "Chemists" ? "Chemists" : "Doctors");

// ═══ Item 1 -- Product Wise ═══════════════════════════════════════════════
export async function computeProductWise(tenantSlug: string, code: string, fromMonth: string, toMonth: string, modeRaw: string) {
  const mode = parseMode(modeRaw);
  const months = monthsBetween(fromMonth, toMonth);
  const { root, list } = await resolveScope(tenantSlug, code);
  const master = await loadProductMaster(tenantSlug);
  const lines = await loadLines(tenantSlug, list.map((e) => e.employeeCode), months, mode, master);
  const acc = new Map<string, { qty: number; value: number }>();
  for (const l of lines) {
    const k = `${key(l.product)}|${l.date.slice(0, 7)}`;
    const c = acc.get(k) || { qty: 0, value: 0 };
    c.qty += l.qty; c.value += l.value; acc.set(k, c);
  }
  const totalsPerMonth: Record<string, { qty: number; value: number }> = {};
  for (const m of months) totalsPerMonth[m] = { qty: 0, value: 0 };
  const products = master.map((p, i) => {
    const perMonth: Record<string, { qty: number; rate: number | null; value: number }> = {};
    let tq = 0, tv = 0;
    for (const m of months) {
      const c = acc.get(`${key(p.name)}|${m}`) || { qty: 0, value: 0 };
      perMonth[m] = { qty: c.qty, rate: p.rate, value: round2(c.value) };
      tq += c.qty; tv += c.value;
      totalsPerMonth[m].qty += c.qty; totalsPerMonth[m].value += c.value;
    }
    return { sno: i + 1, name: p.name, pack: p.pack, perMonth, total: { qty: tq, value: round2(tv) } };
  });
  for (const m of months) totalsPerMonth[m].value = round2(totalsPerMonth[m].value);
  const grand = { qty: products.reduce((s, p) => s + p.total.qty, 0), value: round2(products.reduce((s, p) => s + p.total.value, 0)) };
  return {
    mode, months, employee: root ? { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory, doj: dojOf(root) } : null,
    products, totals: { perMonth: totalsPerMonth, total: grand }
  };
}

// ═══ Item 2 -- FieldForce Wise ════════════════════════════════════════════
export async function computeFieldforceWise(tenantSlug: string, code: string, fromMonth: string, toMonth: string, modeRaw: string) {
  const mode = parseMode(modeRaw);
  const months = monthsBetween(fromMonth, toMonth);
  const { root, list } = await resolveScope(tenantSlug, code);
  const master = await loadProductMaster(tenantSlug);
  const lines = await loadLines(tenantSlug, list.map((e) => e.employeeCode), months, mode, master);
  const acc = new Map<string, { qty: number; value: number }>();
  for (const l of lines) {
    const k = `${l.code}|${l.date.slice(0, 7)}`;
    const c = acc.get(k) || { qty: 0, value: 0 };
    c.qty += l.qty; c.value += l.value; acc.set(k, c);
  }
  const rows = list.map((e) => {
    const perMonth: Record<string, { qty: number; value: number }> = {};
    let tq = 0, tv = 0;
    for (const m of months) { const c = acc.get(`${e.employeeCode}|${m}`) || { qty: 0, value: 0 }; perMonth[m] = { qty: c.qty, value: round2(c.value) }; tq += c.qty; tv += c.value; }
    return { employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, isManager: isManagerRole(e.role), perMonth, total: { qty: tq, value: round2(tv) } };
  });
  return { mode, months, employee: root ? { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory, doj: dojOf(root) } : null, rows };
}

// ═══ Item 3 -- Day Wise ═══════════════════════════════════════════════════
// Datewise, per employee per day:
//   Drs   = doctor calls that day that carried Rx (qty > 0)
//   Che   = chemist calls that day that carried POB
//   Qty   = Rx qty of those doctor calls + POB qty of those chemist calls
//   Value = Rx value (qty x rate) + chemist POB value
// Productwise (inferred layout), per employee x selected product that has
// activity, per day: Drs = doctor Rx qty, Che = chemist POB qty, Qty = both,
// Value = both.
export async function computeDayWise(tenantSlug: string, code: string, month: string, withoutVacant: boolean, modeRaw: string, products: string[]) {
  const productwise = modeRaw === "Productwise";
  const { root, list } = await resolveScope(tenantSlug, code, !withoutVacant);
  const master = await loadProductMaster(tenantSlug);
  const only = productwise ? new Set(products.map(key)) : undefined;
  const lines = await loadLines(tenantSlug, list.map((e) => e.employeeCode), [month], "both", master, only);
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  type Cell = { drs: number; che: number; qty: number; value: number };
  const blank = (): Cell => ({ drs: 0, che: 0, qty: 0, value: 0 });
  const add = (a: Cell, b: Cell) => { a.drs += b.drs; a.che += b.che; a.qty += b.qty; a.value = round2(a.value + b.value); };
  const mkRow = () => ({ perDay: Array.from({ length: days }, blank) as Cell[], total: blank() });
  const meta = (e: OrgEmployee) => ({ employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, isManager: isManagerRole(e.role) });

  if (!productwise) {
    const calls = new Map<string, Set<string>>();
    const rows = new Map<string, ReturnType<typeof mkRow>>();
    for (const e of list) rows.set(e.employeeCode, mkRow());
    for (const l of lines) {
      const r = rows.get(l.code); if (!r) continue;
      const c = r.perDay[l.day - 1]; if (!c) continue;
      c.qty += l.qty; c.value = round2(c.value + l.value);
      const ck = `${l.code}|${l.day}|${l.kind}`;
      const set = calls.get(ck) || new Set<string>();
      if (!set.has(l.callId)) { set.add(l.callId); calls.set(ck, set); if (l.kind === "dr") c.drs++; else c.che++; }
    }
    const out = list.map((e) => { const r = rows.get(e.employeeCode)!; for (const c of r.perDay) add(r.total, c); return { ...meta(e), ...r }; });
    return { mode: "Datewise", month, days, employee: root ? { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory, doj: dojOf(root) } : null, rows: out };
  }
  const by = new Map<string, ReturnType<typeof mkRow>>();
  for (const l of lines) {
    const k = `${l.code}|${l.product}`;
    const r = by.get(k) || mkRow(); by.set(k, r);
    const c = r.perDay[l.day - 1]; if (!c) continue;
    if (l.kind === "dr") c.drs += l.qty; else c.che += l.qty;
    c.qty += l.qty; c.value = round2(c.value + l.value);
  }
  const out: any[] = [];
  for (const e of list) {
    for (const p of master) {
      if (only && !only.has(key(p.name))) continue;
      const r = by.get(`${e.employeeCode}|${p.name}`);
      if (!r) continue;
      for (const c of r.perDay) add(r.total, c);
      out.push({ ...meta(e), product: p.name, ...r });
    }
  }
  return { mode: "Productwise", month, days, employee: root ? { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory, doj: dojOf(root) } : null, rows: out };
}

// ═══ Item 4 -- Dump (.xlsx) ═══════════════════════════════════════════════
// Layouts reproduced from the four reference files:
//   Doctors + Dr Wise     14 columns  (...Territory_Name, PCR TotalVal)
//   Doctors + Brand Wise  17 columns  (...Product_Detail_Name, QTY, Value, DRwise PCR Value)
//   Chemists (either)     72 columns  (chemname, Territoryname, Prodcode, Day n Qty/Val x31, totalqty, totalval)
// Interpretation: only entities with activity in the month produce rows;
// Chemists + Dr Wise = one row per chemist (Prodcode blank, day totals of the
// selected products), Chemists + Brand Wise = one row per chemist x product.
// Check Vacant adds a bare employee row for every force with no data row and
// the inactive vacant manager seats.
const EMP_HEAD = ["sf_name", "hq", "desg", "emp_id", "statename"];
const DOC_COMMON = ["DrName", "DOB", "DOW", "Category", "Class", "Speciality", "Qualification", "Territory_Name"];
export const DUMP_HEADERS = {
  doctorsDr: [...EMP_HEAD, ...DOC_COMMON, "PCR TotalVal"],
  doctorsBrand: [...EMP_HEAD, ...DOC_COMMON, "Product_Detail_Name", "QTY", "Value", "DRwise PCR Value"],
  chemists: [...EMP_HEAD, "chemname", "Territoryname", "Prodcode", ...Array.from({ length: 31 }, (_, i) => [`Day ${i + 1} Qty`, `Day ${i + 1} Val`]).flat(), "totalqty", "totalval"]
};
const DUMP_WIDTHS: Record<keyof typeof DUMP_HEADERS, (number | null)[]> = {
  doctorsDr: [10.55, 5.27, 7.13, 9.7, 12.41, 10.27, 6.84, 7.55, 10.84, 7.41, 11.55, 14.13, 16.84, 13.84],
  doctorsBrand: [10.55, 5.27, 7.13, 9.7, 12.41, 10.27, 6.84, 7.55, 10.84, 7.41, 11.55, 14.13, 16.84, 22.41, 6.41, 7.98, 18.84],
  chemists: [10.55, null, 7.13, 9.7, 12.41, 12.84, 15.55, 11.41, ...Array.from({ length: 62 }, (_, i) => (i < 18 ? (i % 2 === 0 ? 11.27 : 10.84) : (i % 2 === 0 ? 12.27 : 11.84))), 9.98, 9.7]
};

export async function buildPobDump(tenantSlug: string, code: string, month: string, modeRaw: string, products: string[], checkVacant: boolean, option: string) {
  const mode = parseMode(modeRaw);
  const brandWise = option === "Brand Wise";
  const { root, list } = await resolveScope(tenantSlug, code, checkVacant);
  const master = await loadProductMaster(tenantSlug);
  const prodByKey = new Map(master.map((p) => [key(p.name), p]));
  const only = new Set(products.map(key));
  const codes = list.map((e) => e.employeeCode);
  const lines = await loadLines(tenantSlug, codes, [month], mode, master, only);
  const variant: keyof typeof DUMP_HEADERS = mode === "Chemists" ? "chemists" : brandWise ? "doctorsBrand" : "doctorsDr";
  const emp = (e: OrgEmployee) => [e.name, e.territory, e.designation, e.employeeCode, e.state || ""];
  const rows: (string | number | null)[][] = [];
  const dealerIds = [...new Set(lines.filter((l) => l.kind === "ch").map((l) => l.entityId))];
  const doctorIds = [...new Set(lines.filter((l) => l.kind === "dr").map((l) => l.entityId))];
  const [dealers, doctors] = await Promise.all([
    dealerIds.length ? (DealerModel.find({ tenantSlug, _id: { $in: dealerIds } }).lean() as Promise<any[]>) : Promise.resolve([] as any[]),
    doctorIds.length ? (DoctorModel.find({ tenantSlug, _id: { $in: doctorIds } }).lean() as Promise<any[]>) : Promise.resolve([] as any[])
  ]);
  const dealerBy = new Map(dealers.map((d) => [String(d._id), d]));
  const doctorBy = new Map(doctors.map((d) => [String(d._id), d]));
  let classBy = new Map<string, string>();
  try {
    const cls = (await getMasterModel("doctorClassification").find({ tenantSlug, doctorCode: { $in: doctors.map((d) => d.doctorCode) } }).lean()) as any[];
    classBy = new Map(cls.map((c) => [c.doctorCode, c.doctorCategory]));
  } catch { /* master not configured */ }
  const core = await loadCoreMap(tenantSlug, list.map((e) => e.name));

  for (const e of list) {
    const mine = lines.filter((l) => l.code === e.employeeCode);
    const before = rows.length;
    if (mode === "Doctors") {
      const byDoc = new Map<string, Line[]>();
      for (const l of mine) { const a = byDoc.get(l.entityId) || []; a.push(l); byDoc.set(l.entityId, a); }
      for (const [docId, ls] of byDoc) {
        const d = doctorBy.get(docId);
        const total = round2(ls.reduce((s, l) => s + l.value, 0));
        const dInfo = [d?.name || "", slash(d?.dob) || "", "", d ? tierOfDoctor(d, core, e.name) : "", (d && (classBy.get(d.doctorCode) || (["A", "B", "C"].includes(d.category) ? d.category : "Nil"))) || "", d?.specialty || "", d?.qualification || "", d?.territory || ""];
        if (!brandWise) { rows.push([...emp(e), ...dInfo, total]); continue; }
        const byProd = new Map<string, { qty: number; value: number }>();
        for (const l of ls) { const c = byProd.get(l.product) || { qty: 0, value: 0 }; c.qty += l.qty; c.value = round2(c.value + l.value); byProd.set(l.product, c); }
        for (const [p, c] of byProd) rows.push([...emp(e), ...dInfo, p, c.qty, c.value, total]);
      }
    } else {
      const byChem = new Map<string, Line[]>();
      for (const l of mine) { const a = byChem.get(l.entityId) || []; a.push(l); byChem.set(l.entityId, a); }
      for (const [chemId, ls] of byChem) {
        const dl = dealerBy.get(chemId);
        const groups = brandWise ? [...new Set(ls.map((l) => l.product))].map((p) => ({ p, ls: ls.filter((l) => l.product === p) })) : [{ p: "", ls }];
        for (const g of groups) {
          const cells: (number | null)[] = [];
          let tq = 0, tv = 0;
          for (let day = 1; day <= 31; day++) {
            const dl2 = g.ls.filter((l) => l.day === day);
            const q = dl2.reduce((s, l) => s + l.qty, 0); const v = round2(dl2.reduce((s, l) => s + l.value, 0));
            tq += q; tv += v;
            cells.push(q || null, v || null);
          }
          rows.push([...emp(e), dl?.dealerName || "", dl?.patchName || dl?.city || "", g.p ? prodByKey.get(key(g.p))?.code || g.p : "", ...cells, tq, round2(tv)]);
        }
      }
    }
    if (checkVacant && rows.length === before) {
      const width = DUMP_HEADERS[variant].length;
      rows.push([...emp(e), ...Array(width - 5).fill(null)]);
    }
  }
  const title = ` (  ${root ? `${root.name} - ${root.designation} - ${root.territory}` : "ADMIN"} )`;
  return { variant, title, headers: DUMP_HEADERS[variant], rows, widths: DUMP_WIDTHS[variant] };
}

export async function dumpToXlsx(d: Awaited<ReturnType<typeof buildPobDump>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dr_Che_POB");
  ws.mergeCells("A1:U1");
  const t = ws.getCell("A1");
  t.value = d.title;
  t.font = { name: "Calibri", size: 15, bold: true };
  t.alignment = { horizontal: "center" };
  ws.addRow(d.headers);
  for (const r of d.rows) ws.addRow(r);
  d.widths.forEach((w, i) => { if (w) ws.getColumn(i + 1).width = w; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ═══ Items 5-7 -- Heat Analysis ═══════════════════════════════════════════
export type HeatKind = "drs" | "products" | "hqs";
export async function computeHeat(tenantSlug: string, kind: HeatKind, code: string, nMonths: number, now: Date = new Date()) {
  const root = (await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean()) as unknown as OrgEmployee | null;
  if (!root) return null;
  const ordered = (await orgOrdered(tenantSlug, root.employeeCode, true)) as (OrgEmployee & { depth: number })[];
  const team = ordered.filter((e) => e.employeeCode !== root.employeeCode);
  const scope = [...team, root]; // legacy: team first, the selected manager LAST
  const codes = scope.map((e) => e.employeeCode);
  // Window = the last N calendar months up to and including the current month.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (nMonths - 1), 1));
  const from = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const to = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const counts = new Map<string, number>();

  if (kind === "drs") {
    const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).select("mappedEmployeeCode").lean()) as any[];
    const visited = new Set(((await DcrModel.find({ tenantSlug, visitDateOnly: { $gte: from, $lte: to } }).select("doctorId").lean()) as any[]).map((d) => String(d.doctorId?._id ?? d.doctorId)));
    for (const d of doctors) if (!visited.has(String(d._id))) counts.set(d.mappedEmployeeCode, (counts.get(d.mappedEmployeeCode) || 0) + 1);
  } else if (kind === "products") {
    const master = await loadProductMaster(tenantSlug);
    const raw = (await ProductModel.find({ tenantSlug, status: "ACTIVE" }).select("productName name division").lean()) as any[];
    const divOf = new Map(raw.map((p) => [key(p.productName || p.name), key(p.division)]));
    const dcrs = (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: from, $lte: to } }).select("employeeCode productsDetailed").lean()) as any[];
    const promoted = new Map<string, Set<string>>();
    for (const d of dcrs) { const s = promoted.get(d.employeeCode) || new Set<string>(); for (const p of d.productsDetailed || []) s.add(key(p)); promoted.set(d.employeeCode, s); }
    for (const e of scope) {
      // The employee's own product list = products of the employee's division when the master tags any;
      // otherwise the whole product master.
      const divKey = key((e as any).division);
      const tagged = master.filter((p) => divOf.get(key(p.name)) && divOf.get(key(p.name)) === divKey);
      const list = tagged.length ? tagged : master;
      const done = promoted.get(e.employeeCode) || new Set<string>();
      counts.set(e.employeeCode, list.filter((p) => !done.has(key(p.name))).length);
    }
  } else {
    // HQs: each force's territories = territories of its listed doctors + patches of its chemists + its own HQ.
    const [doctors, dealers, dcrs, calls, logs] = await Promise.all([
      DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).select("mappedEmployeeCode territory").lean() as Promise<any[]>,
      DealerModel.find({ tenantSlug, employeeCode: { $in: codes } }).select("employeeCode patchName").lean() as Promise<any[]>,
      DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: from, $lte: to } }).populate("doctorId").lean() as Promise<any[]>,
      ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: from, $lte: to } }).select("employeeCode chemistId").lean() as Promise<any[]>,
      FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: from, $lte: to } }).select("employeeCode").lean() as Promise<any[]>
    ]);
    const dealerPatch = new Map(dealers.map((d) => [String(d._id), key(d.patchName)]));
    for (const e of scope) {
      const territories = new Set<string>([key(e.territory)]);
      for (const d of doctors) if (d.mappedEmployeeCode === e.employeeCode && d.territory) territories.add(key(d.territory));
      for (const d of dealers) if (d.employeeCode === e.employeeCode && d.patchName) territories.add(key(d.patchName));
      const seen = new Set<string>();
      for (const d of dcrs) if (d.employeeCode === e.employeeCode && d.doctorId?.territory) seen.add(key(d.doctorId.territory));
      for (const c of calls) if (c.employeeCode === e.employeeCode && dealerPatch.get(String(c.chemistId))) seen.add(dealerPatch.get(String(c.chemistId))!);
      // A day logged in the field at all counts the employee's own HQ as visited when a visit log exists.
      if ((logs as any[]).some((l) => l.employeeCode === e.employeeCode)) seen.add(key(e.territory));
      counts.set(e.employeeCode, [...territories].filter((t) => t && !seen.has(t)).length);
    }
  }
  const rows = scope.map((e, i) => ({ sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, cnt: counts.get(e.employeeCode) || 0, isSelected: e.employeeCode === root.employeeCode }));
  return { kind, months: nMonths, from, to, employee: { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory }, rows };
}
