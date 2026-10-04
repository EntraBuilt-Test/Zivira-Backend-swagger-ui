// Round 44 -- MIS Reports > Visit Details:
//   * Cat/Cls/Splty/LstDr Wise  (legacy Visit_Details_Cat_Cls_Spclty_LstDr_Wise.aspx)
//   * DateWise                  (legacy VisitDetail_Datewise.aspx)
// Reuses resolveScope/monthsBetween (pob-rx-reports), the 4-tier category and
// classification rules (doctor-tier, same as Visit Analysis) and the day-status
// helpers; no new calendar or hierarchy logic.
import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { isManagerRole, findVacantManagerCodes, type OrgEmployee } from "./org-hierarchy.js";
import { loadCoreMap, tierOfDoctor, TIERS } from "./doctor-tier.js";
import { buildDayStatusContext, classifyDay, dayStatusLabel } from "./day-status.js";
import { monthsBetween, resolveScope } from "./pob-rx-reports.js";

export type VisitMode = "Category" | "Speciality" | "Class" | "Listed Doctor" | "Campaign" | "Doctor Type";
export const VISIT_MODES: VisitMode[] = ["Category", "Speciality", "Class", "Listed Doctor", "Campaign", "Doctor Type"];
export const CLASS_VALUES = ["Nil", "A", "B", "C"];
export const DEFAULT_DOCTOR_TYPES = ["Core drs", "Academica", "BILFL", "Clinic Utilitie", "Just for You"];

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
async function masterRows(key: string, filter: Record<string, unknown>): Promise<any[]> {
  try { return (await getMasterModel(key).find(filter).lean()) as any[]; } catch { return []; }
}

// ── options for the mode-specific "Select ..." blocks ─────────────────────
export async function visitDetailOptions(tenantSlug: string) {
  const docs = (await DoctorModel.find({ tenantSlug, status: "ACTIVE" }).select("specialty campaign doctorTypes").lean()) as any[];
  const spec = new Map<string, { name: string; n: number }>();
  for (const d of docs) {
    const k = lc(d.specialty); if (!k) continue;
    const cur = spec.get(k) || { name: String(d.specialty).trim(), n: 0 }; cur.n++; spec.set(k, cur);
  }
  const specialities = [...spec.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((s) => s.name);
  const camp = (await masterRows("campaignMaster", { tenantSlug })).filter((r) => r.status !== "Inactive").map((r) => String(r.campaignName || "").trim());
  for (const d of docs) if (d.campaign) camp.push(String(d.campaign).trim());
  const campaigns = [...new Set(camp.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const dt = (await masterRows("doctorTypeMaster", { tenantSlug })).filter((r) => r.status !== "Inactive").map((r) => String(r.doctorTypeName || "").trim()).filter(Boolean);
  return { specialities, campaigns, doctorTypes: [...new Set(dt)], categories: [...TIERS], classes: CLASS_VALUES };
}

// ── Screen 1 ──────────────────────────────────────────────────────────────
type Cell = { list: number; met: number; seen: number; missed: number };
const zero = (): Cell => ({ list: 0, met: 0, seen: 0, missed: 0 });

export async function computeCatClsVisit(tenantSlug: string, code: string, fromMonth: string, toMonth: string, mode: VisitMode, values: string[], withVacants: boolean) {
  const { root, list } = await resolveScope(tenantSlug, code, false);
  if (!root) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const inScope = list as OrgEmployee[];
  const scopeCodes = new Set(inScope.map((e) => e.employeeCode));
  const bes = inScope.filter((e) => e.employeeCode !== root.employeeCode && !isManagerRole(e.role));
  let seats: OrgEmployee[] = [];
  if (withVacants) {
    // vacant manager seats (R40 definition) hanging directly off someone in scope
    const vacant = await findVacantManagerCodes(tenantSlug);
    const inactive = (await EmployeeModel.find({ tenantSlug, status: "INACTIVE", role: { $in: ["ABM", "RBM", "ZBM", "BH", "NBH"] } }).lean()) as unknown as OrgEmployee[];
    seats = inactive.filter((i) => vacant.has(i.employeeCode) && i.reportingManager && scopeCodes.has(i.reportingManager));
  }
  const rowEmps: OrgEmployee[] = isManagerRole(root.role) ? [...bes, ...seats, root] : [root];
  const codes = rowEmps.map((e) => e.employeeCode);

  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" })
    .select("name specialty category doctorCode mappedEmployeeCode doctorCategory campaign doctorTypes").lean()) as any[];
  const classRows = await masterRows("doctorClassification", { tenantSlug, doctorCode: { $in: doctors.map((d) => d.doctorCode).filter(Boolean) } });
  const classByCode = new Map<string, string>(classRows.map((r) => [r.doctorCode, r.doctorCategory]));
  const coreMap = mode === "Category" ? await loadCoreMap(tenantSlug, rowEmps.map((e) => e.name)) : new Map<string, string>();
  const nameOf = new Map(rowEmps.map((e) => [e.employeeCode, e.name]));

  const valuesOf = (d: any): string[] => {
    switch (mode) {
      case "Category": return [tierOfDoctor(d, coreMap, nameOf.get(d.mappedEmployeeCode) || "")];
      case "Speciality": return [String(d.specialty || "").trim()];
      case "Class": return [classByCode.get(d.doctorCode) || d.category || "Nil"];
      case "Campaign": return [String(d.campaign || "").trim()];
      case "Doctor Type": return Array.isArray(d.doctorTypes) ? d.doctorTypes.map((t: unknown) => String(t).trim()) : [];
      default: return [];
    }
  };
  const grouped = mode !== "Listed Doctor";
  const groupValues = grouped ? values : [];
  const wanted = new Set(groupValues.map(lc));

  const dcrByMonth = new Map<string, any[]>();
  for (const m of months) dcrByMonth.set(m, (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: m }).select("employeeCode doctorId").lean()) as any[]);

  type Acc = { total: Cell; groups: Record<string, Cell> };
  const perEmp = new Map<string, Record<string, Acc>>();
  for (const e of rowEmps) {
    const mine = doctors.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    const byMonth: Record<string, Acc> = {};
    for (const m of months) {
      const calls = new Map<string, number>();
      for (const c of dcrByMonth.get(m)!) if (c.employeeCode === e.employeeCode) { const id = String(c.doctorId?._id ?? c.doctorId); calls.set(id, (calls.get(id) || 0) + 1); }
      const tally = (ds: any[]): Cell => {
        let met = 0, seen = 0;
        for (const d of ds) { const n = calls.get(String(d._id)) || 0; if (n) { met++; seen += n; } }
        return { list: ds.length, met, seen, missed: ds.length - met };
      };
      const acc: Acc = { total: tally(grouped ? mine.filter((d) => valuesOf(d).some((v) => wanted.has(lc(v)))) : mine), groups: {} };
      for (const v of groupValues) acc.groups[v] = tally(mine.filter((d) => valuesOf(d).some((x) => lc(x) === lc(v))));
      byMonth[m] = acc;
    }
    perEmp.set(e.employeeCode, byMonth);
  }

  const isMgrRow = (e: OrgEmployee) => e.employeeCode === root.employeeCode && isManagerRole(root.role);
  const rows = rowEmps.map((e, i) => {
    const perMonth: Record<string, Acc> = {};
    for (const m of months) {
      const own = perEmp.get(e.employeeCode)![m];
      if (!isMgrRow(e)) { perMonth[m] = own; continue; }
      // manager row: List = rolled-up total of team + own; Met/Seen/Missed carry no manager numbers
      const roll = (pick: (a: Acc) => Cell) => rowEmps.reduce((s, x) => s + pick(perEmp.get(x.employeeCode)![m]).list, 0);
      const groups: Record<string, Cell> = {};
      for (const v of groupValues) groups[v] = { list: roll((a) => a.groups[v]), met: 0, seen: 0, missed: 0 };
      perMonth[m] = { total: { list: roll((a) => a.total), met: 0, seen: 0, missed: 0 }, groups };
    }
    return {
      sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory,
      subDivision: (e as any).division || "", isManager: isMgrRow(e), isVacant: seats.some((s) => s.employeeCode === e.employeeCode), perMonth
    };
  });
  return {
    mode, months, values: groupValues, grouped, withVacants,
    employee: { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory },
    rows
  };
}

// ── Screen 2 ──────────────────────────────────────────────────────────────
// Week 1 = day 1 through the first Sunday (inclusive); then Monday..Sunday
// blocks; the last block ends at month end. Sep 2026: 1-6, 7-13, 14-20, 21-27, 28-30.
export function weekRanges(month: string): { week: number; from: number; to: number; label: string }[] {
  const [y, m] = month.split("-").map((v) => parseInt(v, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  let end = firstDow === 0 ? 1 : 1 + (7 - firstDow);
  const out: { week: number; from: number; to: number; label: string }[] = [];
  let from = 1, w = 1;
  while (from <= last) {
    const to = Math.min(end, last);
    out.push({ week: w, from, to, label: `week ${w}[${from}-${to}]` });
    from = to + 1; end = to + 7; w++;
  }
  return out;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function computeDateWise(tenantSlug: string, code: string, month: string, week?: number) {
  const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean()) as unknown as OrgEmployee | null;
  if (!emp) return null;
  const [y, m] = month.split("-").map((v) => parseInt(v, 10));
  const numDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dcrs = (await DcrModel.find({ tenantSlug, employeeCode: code, month }).populate("doctorId").lean()) as any[];
  const docs = dcrs.map((d) => d.doctorId).filter((d) => d && d.name);
  const classRows = await masterRows("doctorClassification", { tenantSlug, doctorCode: { $in: docs.map((d) => d.doctorCode).filter(Boolean) } });
  const classByCode = new Map<string, string>(classRows.map((r) => [r.doctorCode, r.doctorCategory]));
  const coreMap = await loadCoreMap(tenantSlug, [emp.name]);
  const info = (d: any) => ({
    name: d.name as string, territory: (d.territory || "") as string, qualification: (d.qualification || "") as string,
    category: tierOfDoctor(d, coreMap, emp.name), specialty: (d.specialty || "") as string, cls: (classByCode.get(d.doctorCode) || d.category || "Nil") as string
  });
  const base = { month, numDays, employee: { employeeCode: emp.employeeCode, name: emp.name, designation: emp.designation, hq: emp.territory }, weeks: weekRanges(month) };

  if (week === undefined) {
    const byDoc = new Map<string, { info: ReturnType<typeof info>; days: Record<number, number> }>();
    for (const c of dcrs) {
      if (!c.doctorId?.name) continue;
      const id = String(c.doctorId._id);
      const cur = byDoc.get(id) || { info: info(c.doctorId), days: {} };
      const day = parseInt(String(c.visitDateOnly).slice(8, 10), 10);
      cur.days[day] = (cur.days[day] || 0) + 1; byDoc.set(id, cur);
    }
    const rows = [...byDoc.values()]
      .sort((a, b) => a.info.territory.localeCompare(b.info.territory) || a.info.name.localeCompare(b.info.name))
      .map((r, i) => ({ sno: i + 1, ...r.info, days: r.days, total: Object.values(r.days).reduce((s, n) => s + n, 0) }));
    return { ...base, matrix: false as const, rows };
  }

  const wk = base.weeks.find((w) => w.week === week);
  if (!wk) return null;
  const ctx = await buildDayStatusContext(tenantSlug, month, [code], [emp.state]);
  const days = [];
  for (let d = wk.from; d <= wk.to; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    const calls = dcrs.filter((c) => c.visitDateOnly === date && c.doctorId?.name)
      .sort((a, b) => String(a.callTime || a.checkInTime || "").localeCompare(String(b.callTime || b.checkInTime || "")) || +new Date(a.callAt || a.createdAt || 0) - +new Date(b.callAt || b.createdAt || 0))
      .map((c) => ({ ...info(c.doctorId), time: c.callTime || c.checkInTime || "", products: (c.productsDetailed || []).join(", ") }));
    const st = classifyDay(ctx, code, date);
    const status = st.kind === "weeklyOff" ? "Weekly Off" : st.kind === "holiday" ? "Holiday" : st.kind === "leave" ? "Leave" : "";
    void dayStatusLabel;
    days.push({ day: d, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], status: calls.length ? "" : status, calls });
  }
  return { ...base, matrix: true as const, week: wk, days };
}
