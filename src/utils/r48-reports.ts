// Round 48 -- MIS Reports > Visit Details:
//   * Doctorwise (Periodically) = "Listed Doctor Visit - Periodically" (9 modes)
//   * Call Feedbackwise
//   * Fixationwise (By Visit)
// Real DCR / doctor / employee data only; hierarchy via resolveScope + getUpwardChain.
//
// Inferences (flagged to the user, also surfaced in each result's `notes`):
//   * "Remark" = DcrModel.notes (the DCR has no dedicated remark field).
//   * Deactivate Date = Doctor.updatedAt of an INACTIVE doctor (no deactivation date is stored).
//   * Core Doctor Mapwise / Campaignwise layouts are inferred (no legacy screenshot).
//   * Visit = distinct visit DAYS (a doctor seen twice on one day counts once); REJECTED/DRAFT DCRs are ignored.
//   * Designation bucket: MR/SR_MR -> BE, ABM, RBM, ZBM, BH. NBH has no column in the legacy layout and is not counted.
import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { UnlistedDoctorModel } from "../models/unlisted-doctor.model.js";
import { DoctorCategoryModel } from "../models/doctor-category.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { HttpError } from "../http/errors.js";
import { isManagerRole, getUpwardChain, type OrgEmployee } from "./org-hierarchy.js";
import { loadCoreMap, tierOfDoctor, TIERS } from "./doctor-tier.js";
import { getCategoryNorms } from "./settings.js";
import { monthsBetween, resolveScope } from "./pob-rx-reports.js";

export const BUCKETS = ["BE", "ABM", "RBM", "ZBM", "BH"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const bucketOf = (role: string | undefined): Bucket | null =>
  role === "MR" || role === "SR_MR" ? "BE" : role === "ABM" || role === "RBM" || role === "ZBM" || role === "BH" ? (role as Bucket) : null;

export const DOCTORWISE_MODES = ["baselevel", "baselevel-managers", "deactivate", "daywise-remarks", "listed-remarks", "core-mapwise", "ii-level", "core-periodically", "campaignwise"] as const;
export type DoctorwiseMode = (typeof DOCTORWISE_MODES)[number];

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const slash = (d: Date | string | null | undefined) => { if (!d) return ""; const x = new Date(d); return Number.isNaN(x.getTime()) ? "" : `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`; };
async function masterRows(key: string, filter: Record<string, unknown>): Promise<any[]> {
  try { return (await getMasterModel(key).find(filter).lean()) as any[]; } catch { return []; }
}
const emp = (e: OrgEmployee) => ({ employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory });

async function scopeOf(tenantSlug: string, code: string, scope: "Team" | "Individual") {
  const { root, list } = await resolveScope(tenantSlug, code, false);
  if (!root) return null;
  const inScope = (scope === "Individual" ? [root] : (list as OrgEmployee[]));
  return { root, list: inScope };
}

// ── visits ────────────────────────────────────────────────────────────────
export type Visit = { code: string; doctorId: string; doctor: any; day: number; month: string; notes: string; feedback: boolean };
export async function loadVisits(tenantSlug: string, codes: string[], months: string[]): Promise<Visit[]> {
  if (codes.length === 0) return [];
  const rows = (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).populate("doctorId").lean()) as any[];
  const out: Visit[] = [];
  for (const c of rows) {
    if (c.status === "REJECTED" || c.status === "DRAFT" || !c.doctorId) continue;
    const day = parseInt(String(c.visitDateOnly || "").slice(8, 10), 10);
    if (!day) continue;
    out.push({
      code: c.employeeCode, doctorId: String(c.doctorId._id ?? c.doctorId), doctor: c.doctorId, day, month: c.month || String(c.visitDateOnly).slice(0, 7),
      notes: String(c.notes || "").trim(), feedback: !!(c.productFeedback || c.prescriptionInterest || c.notes)
    });
  }
  return out;
}
const daysOf = (vs: Visit[]) => [...new Set(vs.map((v) => v.day))].sort((a, b) => a - b);

export type DocCtx = { coreMap: Map<string, string>; classByCode: Map<string, string> };
export async function docCtx(tenantSlug: string, doctors: any[], mrNames: string[]): Promise<DocCtx> {
  const classRows = await masterRows("doctorClassification", { tenantSlug, doctorCode: { $in: doctors.map((d) => d.doctorCode).filter(Boolean) } });
  return { coreMap: await loadCoreMap(tenantSlug, mrNames), classByCode: new Map<string, string>(classRows.map((r) => [r.doctorCode, r.doctorCategory])) };
}
const docRow = (d: any, ctx: DocCtx, mrName: string) => ({
  doctorId: String(d._id), doctorCode: d.doctorCode || "", name: d.name as string, uniNo: d.uniqueSlNo || "",
  category: tierOfDoctor(d, ctx.coreMap, mrName) as string, specialty: d.specialty || "", cls: (ctx.classByCode.get(d.doctorCode) || d.category || "Nil") as string,
  qualification: d.qualification || "", territory: d.territory || "", campaign: d.campaign || ""
});
export const mappedDoctors = async (tenantSlug: string, codes: string[], status: "ACTIVE" | "INACTIVE" = "ACTIVE") =>
  codes.length ? ((await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status }).lean()) as any[]) : [];
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

// ═══ Screen 1: Doctorwise (Periodically) ═════════════════════════════════
export type DoctorwiseParams = { mode: DoctorwiseMode; employeeCode: string; scope: "Team" | "Individual"; baseLevel?: string; fromMonth: string; toMonth: string };

export async function baseLevelOptions(tenantSlug: string, code: string) {
  const { root, list } = await resolveScope(tenantSlug, code, false);
  if (!root) return null;
  return (list as OrgEmployee[]).filter((e) => !isManagerRole(e.role)).map((e) => emp(e));
}

export async function computeDoctorwise(tenantSlug: string, p: DoctorwiseParams) {
  const sc = await scopeOf(tenantSlug, p.employeeCode, p.scope);
  if (!sc) return null;
  const { root, list } = sc;
  const months = monthsBetween(p.fromMonth, p.toMonth);
  const base = { mode: p.mode, months, employee: emp(root), notes: [] as string[] };
  const codes = list.map((e) => e.employeeCode);

  // Base level (modes a, b, c, i)
  let be: OrgEmployee | null = null;
  if (p.mode === "baselevel" || p.mode === "baselevel-managers" || p.mode === "campaignwise" || (p.mode === "deactivate" && p.baseLevel)) {
    if (!p.baseLevel) throw new HttpError(400, "Select a Base Level");
    be = ((await resolveScope(tenantSlug, p.employeeCode, false)).list as OrgEmployee[]).find((e) => e.employeeCode === p.baseLevel) || null;
    if (!be) throw new HttpError(400, "Base Level is not under the selected field force");
  }
  const cell = (vs: Visit[]) => ({ count: daysOf(vs).length, days: daysOf(vs) });

  // (a) Based on Baselevel / (i) Campaignwise
  if (p.mode === "baselevel" || p.mode === "campaignwise") {
    let docs = await mappedDoctors(tenantSlug, [be!.employeeCode]);
    if (p.mode === "campaignwise") { docs = docs.filter((d) => String(d.campaign || "").trim()); base.notes.push("Campaignwise layout inferred: Based-on-Baselevel columns restricted to doctors mapped to a campaign, with a Campaign column."); }
    const ctx = await docCtx(tenantSlug, docs, [be!.name]);
    const visits = await loadVisits(tenantSlug, [be!.employeeCode], months);
    const rows = docs.map((d) => docRow(d, ctx, be!.name)).sort(byName).map((r, i) => ({
      sno: i + 1, ...r, perMonth: Object.fromEntries(months.map((m) => [m, cell(visits.filter((v) => v.doctorId === r.doctorId && v.month === m))]))
    }));
    return { ...base, kind: p.mode, baseLevel: emp(be!), rows };
  }

  // (b) Baselevels / Managers: visits by BE + managers above the BE, split by designation
  if (p.mode === "baselevel-managers") {
    const chain = [be!, ...(await getUpwardChain(tenantSlug, be!.employeeCode))];
    const bucketByCode = new Map(chain.map((e) => [e.employeeCode, bucketOf(e.role)]));
    const docs = await mappedDoctors(tenantSlug, [be!.employeeCode]);
    const ctx = await docCtx(tenantSlug, docs, [be!.name]);
    const visits = await loadVisits(tenantSlug, chain.map((e) => e.employeeCode), months);
    const rows = docs.map((d) => docRow(d, ctx, be!.name)).sort(byName).map((r, i) => ({
      sno: i + 1, ...r,
      perMonth: Object.fromEntries(months.map((m) => [m, Object.fromEntries(BUCKETS.map((b) => [b, cell(visits.filter((v) => v.doctorId === r.doctorId && v.month === m && bucketByCode.get(v.code) === b))]))]))
    }));
    return { ...base, kind: p.mode, baseLevel: emp(be!), buckets: [...BUCKETS], rows };
  }

  // (c) Deactivate Drs
  if (p.mode === "deactivate") {
    const owners = be ? [be] : list;
    const docs = await mappedDoctors(tenantSlug, owners.map((e) => e.employeeCode), "INACTIVE");
    const nameOf = new Map(owners.map((e) => [e.employeeCode, e.name]));
    const ctx = await docCtx(tenantSlug, docs, owners.map((e) => e.name));
    const visits = await loadVisits(tenantSlug, owners.map((e) => e.employeeCode), months);
    base.notes.push("Deactivate Date is the doctor record's last-updated date (no separate deactivation date is stored).");
    const rows = docs.map((d) => ({ ...docRow(d, ctx, nameOf.get(d.mappedEmployeeCode) || ""), deactivateDate: slash(d.updatedAt), mappedCode: d.mappedEmployeeCode, mappedTo: nameOf.get(d.mappedEmployeeCode) || "" }))
      .sort(byName).map((r, i) => ({ sno: i + 1, ...r, perMonth: Object.fromEntries(months.map((m) => [m, cell(visits.filter((v) => v.doctorId === r.doctorId && v.month === m && v.code === r.mappedCode))])) }));
    return { ...base, kind: p.mode, baseLevel: be ? emp(be) : null, rows };
  }

  // (d) Daywise Remarks (single month = fromMonth)
  if (p.mode === "daywise-remarks") {
    const month = p.fromMonth;
    const [y, m] = month.split("-").map(Number);
    const numDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const bucketByCode = new Map(list.map((e) => [e.employeeCode, bucketOf(e.role)]));
    const visits = (await loadVisits(tenantSlug, codes, [month])).filter((v) => v.notes);
    base.notes.push("Remark text is the DCR notes entered on the call (shown as 'Doctor : remark').");
    const days = Array.from({ length: numDays }, (_, i) => i + 1).map((d) => ({
      day: d,
      cells: Object.fromEntries(BUCKETS.map((b) => [b, visits.filter((v) => v.day === d && bucketByCode.get(v.code) === b).map((v) => `${v.doctor.name} : ${v.notes}`)]))
    }));
    return { ...base, months: [month], kind: p.mode, buckets: [...BUCKETS], days };
  }

  // (e) Listed Drwise Remarks (single month)
  if (p.mode === "listed-remarks") {
    const month = p.fromMonth;
    const bucketByCode = new Map(list.map((e) => [e.employeeCode, bucketOf(e.role)]));
    const docs = await mappedDoctors(tenantSlug, codes);
    const nameOf = new Map(list.map((e) => [e.employeeCode, e.name]));
    const ctx = await docCtx(tenantSlug, docs, list.map((e) => e.name));
    const visits = await loadVisits(tenantSlug, codes, [month]);
    base.notes.push("Remark text is the DCR notes entered on the call; [] = visited with no remark.");
    const rows = docs.map((d) => docRow(d, ctx, nameOf.get(d.mappedEmployeeCode) || "")).sort(byName).map((r, i) => ({
      sno: i + 1, ...r,
      cells: Object.fromEntries(BUCKETS.map((b) => {
        const vs = visits.filter((v) => v.doctorId === r.doctorId && bucketByCode.get(v.code) === b);
        return [b, { visited: vs.length > 0, remark: vs.map((v) => v.notes).filter(Boolean).join(" | ") }];
      }))
    }));
    return { ...base, months: [month], kind: p.mode, buckets: [...BUCKETS], rows };
  }

  // (f) Core Doctor Mapwise (inferred)
  if (p.mode === "core-mapwise") {
    const docs = await mappedDoctors(tenantSlug, codes);
    const nameOf = new Map(list.map((e) => [e.employeeCode, e.name]));
    const ctx = await docCtx(tenantSlug, docs, list.map((e) => e.name));
    const visits = await loadVisits(tenantSlug, codes, months);
    base.notes.push("Core Doctor Mapwise layout inferred: CORE-category doctors in the team, by territory, with the mapped field force and per-month visit count/dates by the mapped field force.");
    const rows = docs.map((d) => ({ ...docRow(d, ctx, nameOf.get(d.mappedEmployeeCode) || ""), mappedCode: d.mappedEmployeeCode, mappedTo: nameOf.get(d.mappedEmployeeCode) || "" }))
      .filter((r) => r.category === "CORE")
      .sort((a, b) => a.territory.localeCompare(b.territory) || a.name.localeCompare(b.name)).map((r, i) => ({
        sno: i + 1, ...r, perMonth: Object.fromEntries(months.map((m) => [m, cell(visits.filter((v) => v.doctorId === r.doctorId && v.month === m && v.code === r.mappedCode))]))
      }));
    return { ...base, kind: p.mode, rows };
  }

  // (g) Visit Listeddrs (Based on II Level): one block of doctors per BE under the selected manager
  if (p.mode === "ii-level") {
    const bes = list.filter((e) => !isManagerRole(e.role));
    const docs = await mappedDoctors(tenantSlug, bes.map((e) => e.employeeCode));
    const ctx = await docCtx(tenantSlug, docs, bes.map((e) => e.name));
    const visits = await loadVisits(tenantSlug, bes.map((e) => e.employeeCode), months);
    const rows: any[] = [];
    for (const e of bes) {
      for (const d of docs.filter((x) => x.mappedEmployeeCode === e.employeeCode).sort(byName)) {
        const r = docRow(d, ctx, e.name);
        rows.push({ sno: rows.length + 1, sfName: `${e.name} - ${e.designation} - ${e.territory}`, ...r,
          perMonth: Object.fromEntries(months.map((m) => [m, cell(visits.filter((v) => v.doctorId === r.doctorId && v.month === m && v.code === e.employeeCode))])) });
      }
    }
    return { ...base, kind: p.mode, rows };
  }

  // (h) Core Doctor Periodically
  if (p.mode === "core-periodically") {
    const docs = await mappedDoctors(tenantSlug, codes);
    const ctx = await docCtx(tenantSlug, docs, list.map((e) => e.name));
    const visits = await loadVisits(tenantSlug, codes, months);
    base.notes.push("Tot Drs = active CORE doctors mapped to the field force; Visited = distinct core doctors visited by that field force in the month; Missed = Tot - Visited; Per = Visited / Tot.");
    const rows = list.map((e, i) => {
      const core = docs.filter((d) => d.mappedEmployeeCode === e.employeeCode && tierOfDoctor(d, ctx.coreMap, e.name) === "CORE");
      const ids = new Set(core.map((d) => String(d._id)));
      const perMonth = Object.fromEntries(months.map((m) => {
        const seen = new Set(visits.filter((v) => v.code === e.employeeCode && v.month === m && ids.has(v.doctorId)).map((v) => v.doctorId));
        const tot = core.length, vis = seen.size;
        return [m, { tot, visited: vis, missed: tot - vis, per: tot ? Math.round((vis / tot) * 10000) / 100 : 0 }];
      }));
      return { sno: i + 1, ...emp(e), perMonth };
    });
    return { ...base, kind: p.mode, rows };
  }
  return null;
}

// ═══ Screen 2: Call Feedbackwise ═════════════════════════════════════════
export async function computeCallFeedbackwise(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const sc = await scopeOf(tenantSlug, code, "Team");
  if (!sc) return null;
  const { root, list } = sc;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = list.map((e) => e.employeeCode);
  const docs = await mappedDoctors(tenantSlug, codes);
  const visits = await loadVisits(tenantSlug, codes, months);
  const rows = list.map((e, i) => {
    const mine = docs.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    const perMonth = Object.fromEntries(months.map((m) => {
      const vs = visits.filter((v) => v.code === e.employeeCode && v.month === m);
      return [m, { tdrs: mine.length, met: new Set(vs.map((v) => v.doctorId)).size, feedback: new Set(vs.filter((v) => v.feedback).map((v) => v.doctorId)).size }];
    }));
    return { sno: i + 1, ...emp(e), perMonth };
  });
  return { months, employee: emp(root), rows, notes: ["TDrs = active listed doctors mapped to the field force; Met = distinct doctors visited; 'teste' = distinct doctors whose call carries a recorded feedback (product feedback, prescription interest or remark)."] };
}

// ═══ Screen 3: Fixationwise (By Visit) ═══════════════════════════════════
export const FIXATION_TYPES = ["Category", "Speciality", "Class", "Campaign"] as const;
export type FixationType = (typeof FIXATION_TYPES)[number];
type Fx = { tdrs: number; v0: number; v1: number; v2: number; vm2: number; miss: number };
const fx0 = (): Fx => ({ tdrs: 0, v0: 0, v1: 0, v2: 0, vm2: 0, miss: 0 });

export async function computeFixation(tenantSlug: string, code: string, fromMonth: string, toMonth: string, type: FixationType) {
  const { root, list } = await resolveScope(tenantSlug, code, false);
  if (!root) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const inScope = list as OrgEmployee[];
  const bes = inScope.filter((e) => e.employeeCode !== root.employeeCode && !isManagerRole(e.role));
  const rowEmps: OrgEmployee[] = isManagerRole(root.role) ? [...bes, root] : [root];
  const beRows = isManagerRole(root.role) ? bes : [root];
  const codes = rowEmps.map((e) => e.employeeCode);
  const docs = await mappedDoctors(tenantSlug, codes);
  const ctx = await docCtx(tenantSlug, docs, rowEmps.map((e) => e.name));
  const nameOf = new Map(rowEmps.map((e) => [e.employeeCode, e.name]));
  const valueOf = (d: any): string => {
    switch (type) {
      case "Category": return tierOfDoctor(d, ctx.coreMap, nameOf.get(d.mappedEmployeeCode) || "");
      case "Speciality": return String(d.specialty || "").trim();
      case "Class": return ctx.classByCode.get(d.doctorCode) || d.category || "Nil";
      case "Campaign": return String(d.campaign || "").trim();
    }
  };
  // values + norms
  let values: string[];
  if (type === "Category") values = [...TIERS];
  else if (type === "Class") values = ["Nil", "A", "B", "C"];
  else {
    const cnt = new Map<string, { name: string; n: number }>();
    for (const d of docs) { const v = valueOf(d); if (!v) continue; const c = cnt.get(lc(v)) || { name: v, n: 0 }; c.n++; cnt.set(lc(v), c); }
    values = [...cnt.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((c) => c.name);
  }
  const norms = await getCategoryNorms(tenantSlug);
  const catRows = type === "Class" ? ((await DoctorCategoryModel.find({ tenantSlug }).lean()) as any[]) : [];
  const normOf = (v: string): number | null => {
    if (type === "Category") return v === "Nil" ? norms.NIL : (norms as any)[v] ?? null;
    if (type === "Class") { const r = catRows.find((c) => lc(c.shortName) === lc(v)); return r && typeof r.noOfVisit === "number" ? r.noOfVisit : null; }
    return null;
  };
  const visits = await loadVisits(tenantSlug, codes, months);
  const wanted = new Map(values.map((v) => [lc(v), v]));
  const rowFor = (e: OrgEmployee) => {
    const mine = docs.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    const perMonth: Record<string, Record<string, Fx>> = {};
    for (const m of months) {
      const g: Record<string, Fx> = Object.fromEntries(values.map((v) => [v, fx0()]));
      for (const d of mine) {
        const v = wanted.get(lc(valueOf(d)));
        if (!v) continue;
        const n = daysOf(visits.filter((x) => x.code === e.employeeCode && x.month === m && x.doctorId === String(d._id))).length;
        const c = g[v]; c.tdrs++;
        if (n === 0) c.v0++; else if (n === 1) c.v1++; else if (n === 2) c.v2++; else c.vm2++;
        if (n < (normOf(v) ?? 1)) c.miss++;
      }
      perMonth[m] = g;
    }
    return perMonth;
  };
  const unl = (await UnlistedDoctorModel.find({ tenantSlug }).select("mr").lean()) as any[];
  const nl = (name: string) => unl.filter((u) => lc(u.mr) === lc(name)).length;
  const beData = beRows.map((e) => ({ e, perMonth: rowFor(e) }));
  const rows: any[] = beData.map((r, i) => ({ sno: i + 1, ...emp(r.e), subDivision: (r.e as any).division || "", isManager: false, perMonth: r.perMonth, nlDrs: nl(r.e.name) }));
  if (isManagerRole(root.role)) {
    const perMonth: Record<string, Record<string, Fx>> = {};
    for (const m of months) {
      perMonth[m] = Object.fromEntries(values.map((v) => {
        const t = fx0();
        for (const r of beData) { const c = r.perMonth[m][v]; t.tdrs += c.tdrs; t.v0 += c.v0; t.v1 += c.v1; t.v2 += c.v2; t.vm2 += c.vm2; t.miss += c.miss; }
        return [v, t];
      }));
    }
    rows.push({ sno: rows.length + 1, ...emp(root), subDivision: (root as any).division || "", isManager: true, perMonth, nlDrs: rows.reduce((s, r) => s + r.nlDrs, 0) });
  }
  return {
    type, months, employee: emp(root),
    values: values.map((v) => ({ value: v, norm: normOf(v) })), rows,
    notes: [
      "Counts are per mapped doctor: 0 V / 1 V / 2 V / M 2 V = doctors visited on 0 / 1 / 2 / more than 2 distinct days in the month by the mapped field force.",
      "Miss = doctors visited on fewer days than the norm shown in brackets (category norms from Company Settings, class norms from the Doctor Category master; where no norm is configured a doctor is missed only when never visited).",
      "NL Drs = unlisted doctors whose MR is that field force (not month-specific). The manager row is the total of the team above it."
    ]
  };
}
