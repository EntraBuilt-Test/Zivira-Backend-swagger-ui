// Round 50 -- MIS Reports > Visit Details > Based on Mode Wise (legacy Visit_Details_Basedon_ModeWise.aspx).
//   Type=Campaign : per fieldforce x month, total campaign-doctor visits (calls).
//   Type=Category / Speciality / Class : per fieldforce x month x group, Ttl Drs | Drs Met | Coverage.
// Rows follow the hierarchy: every manager's subtree first, then the manager's own row carrying the team rollup.
// Real DCR / doctor data only (r48-reports loaders + doctor-tier). REJECTED/DRAFT DCRs are ignored.
//
// Inferences (surfaced in `notes`):
//   * Campaign cell (default metric=doctors) = doctors mapped to the fieldforce with Doctor.campaign set; metric=calls = DCR calls to such doctors.
//   * Ttl Drs = ACTIVE doctors currently mapped to the fieldforce (no month-wise roster history is stored).
//   * Drs Met = distinct doctors visited that month by their mapped fieldforce.
//   * Speciality and Class group layouts are inferred from the Category screenshot (Speciality groups = real specialities by doctor count, Class = Nil/A/B/C).
//   * Manager rows = own doctors + all doctors of everyone below; Coverage recomputed from the sums.
import type { OrgEmployee } from "./org-hierarchy.js";
import { TIERS, tierOfDoctor } from "./doctor-tier.js";
import { monthsBetween, resolveScope } from "./pob-rx-reports.js";
import { loadVisits, docCtx, mappedDoctors } from "./r48-reports.js";

export const MODEWISE_TYPES = ["category", "speciality", "class", "campaign"] as const;
export type ModewiseType = (typeof MODEWISE_TYPES)[number];
const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
type Cnt = { ttl: number; met: number };

export type Hierarchy = {
  root: OrgEmployee; order: OrgEmployee[]; subtree: Map<string, string[]>; isMgr: (e: OrgEmployee) => boolean;
  head: (e: OrgEmployee, i: number) => { sno: number; employeeCode: string; name: string; designation: string; hq: string; role: string; isManager: boolean };
};
// The selected force plus everyone under it, children first and each manager's own row last (legacy order).
export async function buildHierarchy(tenantSlug: string, code: string): Promise<Hierarchy | null> {
  const { root, list } = await resolveScope(tenantSlug, code, false);
  if (!root) return null;
  const team = list as OrgEmployee[];
  const members = team.some((e) => e.employeeCode === root.employeeCode) ? team : [root, ...team];
  const kids = new Map<string, OrgEmployee[]>();
  for (const e of members) if (e.employeeCode !== root.employeeCode && e.reportingManager) (kids.get(e.reportingManager) ?? kids.set(e.reportingManager, []).get(e.reportingManager)!).push(e);
  const order: OrgEmployee[] = [];
  const subtree = new Map<string, string[]>();
  const seen = new Set<string>();
  const walk = (e: OrgEmployee): string[] => {
    seen.add(e.employeeCode);
    let codes = [e.employeeCode];
    for (const k of kids.get(e.employeeCode) ?? []) if (!seen.has(k.employeeCode)) codes = codes.concat(walk(k));
    order.push(e); subtree.set(e.employeeCode, codes);
    return codes;
  };
  walk(root);
  const isMgr = (e: OrgEmployee) => (kids.get(e.employeeCode)?.length ?? 0) > 0;
  const head = (e: OrgEmployee, i: number) => ({ sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, role: e.role, isManager: isMgr(e) });
  return { root, order, subtree, isMgr, head };
}

export async function computeModewise(tenantSlug: string, code: string, type: ModewiseType, fromMonth: string, toMonth: string, metric: "doctors" | "calls" = "doctors") {
  const h = await buildHierarchy(tenantSlug, code);
  if (!h) return null;
  const { root, order, subtree, head } = h;
  const months = monthsBetween(fromMonth, toMonth);
  const codes = order.map((e) => e.employeeCode);
  const base = { type, months, employee: { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory } };
  const visits = await loadVisits(tenantSlug, codes, months);

  if (type === "campaign") {
    // Legacy screenshot: the column equals each fieldforce's listed-doctor count, so the default metric is
    // the number of doctors mapped to the fieldforce that carry a campaign. metric=calls keeps the Round 50
    // reading (campaign-doctor DCR calls per month).
    const cdocs = (await mappedDoctors(tenantSlug, codes)).filter((d) => String(d.campaign || "").trim());
    const ownDocs = new Map<string, number>(codes.map((c) => [c, 0]));
    for (const d of cdocs) if (ownDocs.has(d.mappedEmployeeCode)) ownDocs.set(d.mappedEmployeeCode, ownDocs.get(d.mappedEmployeeCode)! + 1);
    const ownCalls = new Map<string, Record<string, number>>(codes.map((c) => [c, Object.fromEntries(months.map((m) => [m, 0]))]));
    for (const v of visits) if (String(v.doctor?.campaign || "").trim() && ownCalls.has(v.code) && v.month in ownCalls.get(v.code)!) ownCalls.get(v.code)![v.month]++;
    const rows = order.map((e, i) => ({
      ...head(e, i),
      cells: Object.fromEntries(months.map((m) => [m, subtree.get(e.employeeCode)!.reduce((s, c) => s + (metric === "doctors" ? ownDocs.get(c)! : ownCalls.get(c)![m]), 0)]))
    }));
    return { ...base, metric, rows, notes: metric === "doctors"
      ? ["Cell = doctors mapped to the fieldforce that carry a campaign (current roster, so identical every month); manager rows are team rollups.", "The legacy column equals the listed-doctor count; where every doctor carries a campaign the two match."]
      : ["Cell = campaign-doctor calls (DCR records) in the month; manager rows are team rollups.", "Only doctors with a campaign set are counted."] };
  }

  // category / speciality / class
  const docs = await mappedDoctors(tenantSlug, codes);
  const ctx = await docCtx(tenantSlug, docs, order.map((e) => e.name));
  const nameOf = new Map(order.map((e) => [e.employeeCode, e.name]));
  const valueOf = (d: any): string => type === "category" ? tierOfDoctor(d, ctx.coreMap, nameOf.get(d.mappedEmployeeCode) || "")
    : type === "speciality" ? String(d.specialty || "").trim() : (ctx.classByCode.get(d.doctorCode) || d.category || "Nil");
  let values: string[];
  if (type === "category") values = ["CORE", "N CORE", "Nil", "S CORE"].filter((v) => (TIERS as string[]).includes(v));
  else if (type === "class") values = ["Nil", "A", "B", "C"];
  else {
    const cnt = new Map<string, { name: string; n: number }>();
    for (const d of docs) { const v = valueOf(d); if (!v) continue; const c = cnt.get(lc(v)) || { name: v, n: 0 }; c.n++; cnt.set(lc(v), c); }
    values = [...cnt.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((c) => c.name);
  }
  const keys = ["COVERAGE", ...values];
  const wanted = new Map(values.map((v) => [lc(v), v]));
  const metSet = new Map<string, Set<string>>(); // `${code}|${month}` -> doctorIds visited
  for (const v of visits) { const k = `${v.code}|${v.month}`; (metSet.get(k) ?? metSet.set(k, new Set()).get(k)!).add(v.doctorId); }
  const own = new Map<string, Record<string, Record<string, Cnt>>>();
  for (const e of order) {
    const mine = docs.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    const pm: Record<string, Record<string, Cnt>> = {};
    for (const m of months) {
      const met = metSet.get(`${e.employeeCode}|${m}`) ?? new Set<string>();
      const g: Record<string, Cnt> = Object.fromEntries(keys.map((k) => [k, { ttl: 0, met: 0 }]));
      for (const d of mine) {
        const isMet = met.has(String(d._id));
        g.COVERAGE.ttl++; if (isMet) g.COVERAGE.met++;
        const v = wanted.get(lc(valueOf(d)));
        if (v) { g[v].ttl++; if (isMet) g[v].met++; }
      }
      pm[m] = g;
    }
    own.set(e.employeeCode, pm);
  }
  const rows = order.map((e, i) => {
    const perMonth: Record<string, Record<string, Cnt & { coverage: number | null }>> = {};
    for (const m of months) {
      perMonth[m] = {};
      for (const k of keys) {
        let ttl = 0, met = 0;
        for (const c of subtree.get(e.employeeCode)!) { const x = own.get(c)![m][k]; ttl += x.ttl; met += x.met; }
        perMonth[m][k] = { ttl, met, coverage: ttl > 0 ? Math.round((met / ttl) * 10000) / 100 : null };
      }
    }
    return { ...head(e, i), perMonth };
  });
  const notes = ["Ttl Drs = active doctors currently mapped (no month-wise roster history is stored); Drs Met = distinct doctors visited in the month.", "Manager rows = team totals, Coverage recomputed from the sums."];
  if (type !== "category") notes.push(`${type === "speciality" ? "Speciality" : "Class"} layout is inferred from the Category screen.`);
  return { ...base, groups: keys, rows, notes };
}
