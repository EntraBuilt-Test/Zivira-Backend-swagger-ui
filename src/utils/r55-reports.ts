// Round 55 -- MIS Reports > Product Exposure > Speciality/Category Wise (legacy Product_Exp_specat.aspx).
// Count = distinct doctors of the speciality/category detailed with the selected product (DCR productsDetailed),
// per fieldforce and month. Own calls only (manager rows are the manager's own calls, as in Product Exposure).
// Reuses the Round 51 call engine (loadCalls: distinct employee+doctor+day, REJECTED/DRAFT ignored).
import { DoctorSpecialityModel } from "../models/doctor-speciality.model.js";
import { monthsBetween } from "./pob-rx-reports.js";
import { buildHierarchy } from "./r50-reports.js";
import { loadCalls, type Call } from "./r51-reports.js";
import { TIERS, tierOfDoctor, loadCoreMap, type CoreMap } from "./doctor-tier.js";

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const slash = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
export type SpecatMode = "speciality" | "category";
const hasProduct = (c: Call, product: string) => (product === "ALL" ? c.products.length > 0 : c.products.some((p) => lc(p) === lc(product)));

export async function specatOptions(tenantSlug: string) {
  const rows = (await DoctorSpecialityModel.find({ tenantSlug, status: { $ne: "INACTIVE" } }).lean()) as any[];
  const ordered = rows.map((r, i) => ({ n: String(r.specialityName || "").trim(), o: r.sortOrder ?? Number.MAX_SAFE_INTEGER, i })).filter((r) => r.n)
    .sort((a, b) => a.o - b.o || a.i - b.i).map((r) => r.n);
  return { specialities: ordered, categories: [...TIERS] as string[] };
}

type Ctx = { h: NonNullable<Awaited<ReturnType<typeof buildHierarchy>>>; calls: Call[]; valueOf: (c: Call) => string; tier: (c: Call) => string };
async function ctxOf(tenantSlug: string, code: string, product: string, months: string[], mode: SpecatMode): Promise<Ctx | null> {
  const h = await buildHierarchy(tenantSlug, code); if (!h) return null;
  const codes = h.order.map((e) => e.employeeCode);
  const calls = (await loadCalls(tenantSlug, codes, months)).filter((c) => hasProduct(c, product));
  const nameOf = new Map(h.order.map((e) => [e.employeeCode, e.name]));
  const core: CoreMap = await loadCoreMap(tenantSlug, [...nameOf.values()]);
  const tier = (c: Call) => tierOfDoctor(c.doctor, core, nameOf.get(c.doctor?.mappedEmployeeCode) || nameOf.get(c.code) || "");
  const valueOf = mode === "category" ? tier : (c: Call) => String(c.doctor?.specialty || "").trim();
  return { h, calls, valueOf, tier };
}

export async function computeProductExposureSpecat(tenantSlug: string, code: string, product: string, fromMonth: string, toMonth: string, mode: SpecatMode, selected: string[]) {
  const months = monthsBetween(fromMonth, toMonth);
  const ctx = await ctxOf(tenantSlug, code, product, months, mode); if (!ctx) return null;
  const { h, calls, valueOf } = ctx;
  const cols = selected.map((s) => s.trim()).filter(Boolean);
  const rows = h.order.map((e, i) => ({
    ...h.head(e, i),
    perMonth: Object.fromEntries(months.map((m) => [m, Object.fromEntries(cols.map((col) => [col,
      new Set(calls.filter((c) => c.code === e.employeeCode && c.month === m && lc(valueOf(c)) === lc(col)).map((c) => c.doctorId)).size]))]))
  }));
  return { product, mode, months, columns: cols, employee: { employeeCode: h.root.employeeCode, name: h.root.name, designation: h.root.designation, hq: h.root.territory }, rows,
    notes: ["Count = distinct doctors of the speciality/category detailed with the selected product in a DCR (productsDetailed) in that month; 'All Product' = any product. Rx quantities are not used.",
      "Each row counts that fieldforce's own calls only, including manager rows. Category comes from the doctor's category (legacy core-map fallback)."] };
}

export async function productExposureSpecatDrill(tenantSlug: string, employeeCode: string, product: string, month: string, mode: SpecatMode, value: string) {
  const ctx = await ctxOf(tenantSlug, employeeCode, product, [month], mode); if (!ctx) return null;
  const mine = ctx.calls.filter((c) => c.code === employeeCode && lc(ctx.valueOf(c)) === lc(value));
  const byDoc = new Map<string, { doctorName: string; doctorCode: string; speciality: string; category: string; dates: string[] }>();
  for (const c of mine) {
    const cur = byDoc.get(c.doctorId) || { doctorName: c.doctor?.name || "", doctorCode: c.doctor?.doctorCode || "", speciality: c.doctor?.specialty || "", category: ctx.tier(c), dates: [] as string[] };
    cur.dates.push(slash(c.date)); byDoc.set(c.doctorId, cur);
  }
  const rows = [...byDoc.values()].map((r) => ({ ...r, dates: [...new Set(r.dates)].sort() })).sort((a, b) => a.doctorName.localeCompare(b.doctorName));
  return { product, month, mode, value, rows };
}
