// Round 54 -- MIS Reports: TP - Deviation For Managers, TP - Deviation At A Glance, Doctors - Addition/Deactivation Status.
// Reuses the Round 53 TP engine (tpDeviationRows, level 2 = managers) and orgWalk. Real data only.
//
// Inferred (also returned in `notes`):
//   * Managers = every non-base-level role (ABM/RBM/ZBM/BH/NBH) in the selected downline, including the selected manager.
//   * A manager's plan entry that is only the holiday's title (e.g. "Gandhi Jayanti") is listed against "Holiday" (single legacy example).
//   * Doctor addition = Doctor.createdAt in the month; deactivation = INACTIVE doctor whose updatedAt falls in the month
//     (the Doctor model stores no deactivation date, so updatedAt is a stand-in and may move on later edits).
//   * Level 1/2/3 Mgr show the manager's HQ (as printed by the legacy report), walking up reportingManager.
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { monthsBetween } from "./pob-rx-reports.js";
import { orgWalk, tpDeviationRows, type TpDevRow } from "./r53-reports.js";
import { docCtx } from "./r48-reports.js";
import { tierOfDoctor } from "./doctor-tier.js";

const isBase = (e: any) => e.role === "MR" || e.role === "SR_MR" || e.role === "OTHER";
const vacant = (e: any) => e.status === "INACTIVE" || !!e.leftDate;
const dmy = (d: Date | string | null | undefined) => { if (!d) return ""; const x = new Date(d); return Number.isNaN(x.getTime()) ? "" : `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`; };
const monthOf = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 7) : "");
const header = (root: any) => (root ? { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory } : { employeeCode: "admin", name: "admin", designation: "", hq: "" });

// ═══ 1) TP - Deviation For Managers ═════════════════════════════════════
export async function computeTpDeviationManagers(tenantSlug: string, code: string, month: string) {
  const o = await orgWalk(tenantSlug, code, true); if (!o) return null;
  const mgrs = o.order.filter((e) => !isBase(e));
  const map = await tpDeviationRows(tenantSlug, mgrs, month, 2);
  const rows: (TpDevRow & { sno: number; employeeCode: string; fieldForce: string })[] = [];
  for (const e of mgrs) for (const r of map.get(e.employeeCode) ?? []) rows.push({ sno: rows.length + 1, employeeCode: e.employeeCode, fieldForce: `${e.name} - ${e.designation} -${e.territory}`, ...r });
  return { month, employee: header(o.root), rows, notes: [
    "Managers = every non-base-level fieldforce (ABM/RBM/ZBM/BH/NBH) in the downline, including the selected manager; one row per deviation day.",
    "Planned = APPROVED tour plan day; actual = DCR work type, approved leave, holiday, weekly off or no DCR. A plan entry that is just the holiday's title is listed against 'Holiday' (inferred from a single legacy example).",
    "Holiday names come from the state holiday master by date (not state-specific when several states share the month)."
  ] };
}

// ═══ 2) TP - Deviation At A Glance (+ drill) ═════════════════════════════
export async function computeTpDeviationAtGlance(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const o = await orgWalk(tenantSlug, code, false); if (!o) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const live = o.order.filter((e) => !vacant(e));
  const counts = new Map<string, Record<string, number>>(o.order.map((e) => [e.employeeCode, Object.fromEntries(months.map((m) => [m, 0]))]));
  for (const m of months) {
    for (const level of [1, 2] as const) {
      const group = live.filter((e) => (level === 2) === !isBase(e));
      const map = await tpDeviationRows(tenantSlug, group, m, level);
      for (const e of group) counts.get(e.employeeCode)![m] = map.get(e.employeeCode)!.length;
    }
  }
  const rows = o.order.map((e, i) => ({ sno: i + 1, employeeCode: e.employeeCode, name: vacant(e) ? "Vacant" : e.name, designation: e.designation, role: e.role, hq: e.territory, perMonth: counts.get(e.employeeCode)! }));
  return { months, employee: header(o.root), rows, notes: ["Count = days where the approved tour plan and the actual (DCR / leave / holiday / weekly off / none) differ, using the same rules as TP - Deviation For Baselevel / Managers.", "Vacant = inactive or left employee (no deviation is computed for them)."] };
}
export async function tpDeviationDrill(tenantSlug: string, code: string, month: string) {
  const o = await orgWalk(tenantSlug, code, false); const e = o?.root; if (!o || !e) return null;
  const rows = (await tpDeviationRows(tenantSlug, [e], month, isBase(e) ? 1 : 2)).get(code)!;
  return { month, employee: header(e), rows };
}

// ═══ 3) Doctors - Addition/Deactivation Status (+ drill) ═════════════════
export async function computeDoctorsAddDeact(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const o = await orgWalk(tenantSlug, code, true); if (!o) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const emps = o.order.filter(isBase).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const codes = new Set(emps.map((e) => e.employeeCode));
  const docs = ((await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: [...codes] } }).lean()) as any[]);
  const mgr = (e: any, n: number) => { let cur = e; for (let i = 0; i < n; i++) cur = cur?.reportingManager ? o.byCode.get(cur.reportingManager) : null; return cur?.territory || ""; };
  const rows = emps.map((e, i) => {
    const mine = docs.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, division: e.division || "", level3: mgr(e, 3), level2: mgr(e, 2), level1: mgr(e, 1),
      perMonth: Object.fromEntries(months.map((m) => [m, { added: mine.filter((d) => monthOf(d.createdAt) === m).length, deactivated: mine.filter((d) => d.status === "INACTIVE" && monthOf(d.updatedAt) === m).length }])) };
  });
  const totals = Object.fromEntries(months.map((m) => [m, { added: rows.reduce((s, r) => s + r.perMonth[m].added, 0), deactivated: rows.reduce((s, r) => s + r.perMonth[m].deactivated, 0) }]));
  return { months, employee: header(o.root), rows, totals, notes: [
    "Addition = doctors mapped to the fieldforce whose record was created in the month; Deactivation = INACTIVE doctors whose record was last updated in the month (no deactivation date is stored, so updatedAt is a stand-in).",
    "Level 1/2/3 Mgr show the HQ of the first/second/third manager above the fieldforce. Base-level active fieldforce only."
  ] };
}
export async function doctorsAddDeactDrill(tenantSlug: string, code: string, month: string, kind: "added" | "deactivated") {
  const docs = ((await DoctorModel.find({ tenantSlug, mappedEmployeeCode: code }).lean()) as any[]).filter((d) => (kind === "added" ? monthOf(d.createdAt) === month : d.status === "INACTIVE" && monthOf(d.updatedAt) === month));
  const owner: any = await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean();
  const ctx = await docCtx(tenantSlug, docs, owner ? [owner.name] : []);
  const rows = docs.sort((a, b) => String(a.name).localeCompare(String(b.name))).map((d) => ({ doctorName: d.name, doctorCode: d.doctorCode || "", specialty: d.specialty || "", category: tierOfDoctor(d, ctx.coreMap, owner?.name || ""), cls: ctx.classByCode.get(d.doctorCode) || d.category || "Nil", date: dmy(kind === "added" ? d.createdAt : d.updatedAt) }));
  return { employeeCode: code, month, kind, rows };
}
