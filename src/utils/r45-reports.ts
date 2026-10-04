// Round 45 -- MIS Reports: Quiz Test Result, Summary > Day Wise Report Dump and
// Call Report Dump, Digital Detailing > Visit Wise / Brand Wise Star Rating,
// Product Slide Analysis, Drs Analyis. Reuses resolveScope (R42), the 4-tier
// category rules, day-status helpers, R40 vacant-seat definition and the DCR
// rate/POB helpers; no duplicated hierarchy or calendar logic.
import ExcelJS from "exceljs";
import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { ProductModel } from "../models/product.model.js";
import { ProductBrandModel } from "../models/product-brand.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { QuizAttemptModel } from "../models/quiz-attempt.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { DoctorBrandRatingModel } from "../models/doctor-brand-rating.model.js";
import { SlideViewModel } from "../models/slide-view.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { isManagerRole, getUpwardChain, type OrgEmployee } from "./org-hierarchy.js";
import { loadCoreMap, tierOfDoctor } from "./doctor-tier.js";
import { buildDayStatusContext, classifyDay } from "./day-status.js";
import { loadRateMap, docPobValue } from "./mis-reports-compute.js";
import { resolveScope, monthsBetween, loadProductMaster } from "./pob-rx-reports.js";

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const p2 = (n: number) => String(n).padStart(2, "0");
const WD_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const daysIn = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const ymdOf = (d: unknown): string => (d ? new Date(d as Date).toISOString().slice(0, 10) : "");
const mdy = (date: string) => `${date.slice(5, 7)}-${date.slice(8, 10)}-${date.slice(0, 4)}`;
const dmySlash = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const dmyDash = (date: string) => (date ? `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}` : "");
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (n: number) => String(round2(n));

// Base-level employees under the selected force; a selected manager goes LAST.
// "admin"/empty = whole company (base-level employees only).
export async function beScope(tenantSlug: string, code: string) {
  const { root, list } = await resolveScope(tenantSlug, code, false);
  const bes = (list as OrgEmployee[]).filter((e) => !isManagerRole(e.role) && e.employeeCode !== root?.employeeCode);
  if (root && isManagerRole(root.role)) return { root, rows: [...bes, root] };
  if (root) return { root, rows: [root] };
  return { root, rows: bes };
}
const rootInfo = (root: OrgEmployee | null) => (root ? { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory } : { employeeCode: "admin", name: "admin", designation: "", hq: "" });

// ═══ Item 1 -- Quiz Test Result ═══════════════════════════════════════════
export async function computeQuizResult(tenantSlug: string, code: string, scope: "Team" | "Individual", month: string) {
  const root = (await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean()) as unknown as OrgEmployee | null;
  if (!root) return null;
  const rows: OrgEmployee[] = scope === "Individual" ? [root] : (await beScope(tenantSlug, code)).rows;
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 1));
  const attempts = (await QuizAttemptModel.find({ tenantSlug, employeeCode: { $in: rows.map((r) => r.employeeCode) }, submittedAt: { $gte: from, $lt: to } }).lean()) as any[];
  const quizzes = (await QuizModel.find({ tenantSlug }).lean()) as any[];
  const quizById = new Map(quizzes.map((q) => [String(q._id), q]));
  const n = daysIn(month);
  const days = Array.from({ length: n }, (_, i) => ({ day: i + 1, label: `${i + 1} - ${WD_FULL[dowOf(`${month}-${p2(i + 1)}`)].slice(0, 3)}` }));
  const out = [];
  for (const [i, e] of rows.entries()) {
    const chain = await getUpwardChain(tenantSlug, e.employeeCode);
    const perDay: Record<number, { total: number; correct: number; pct: number }> = {};
    const acc: Record<number, { total: number; correct: number; score: number; possible: number }> = {};
    for (const a of attempts.filter((x) => x.employeeCode === e.employeeCode)) {
      const q = quizById.get(String(a.quizId));
      const day = new Date(a.submittedAt).getUTCDate();
      const total = q?.questions?.length ?? a.answers?.length ?? 0;
      const correct = q ? (a.answers || []).filter((ans: any) => q.questions[ans.questionIndex]?.correctOptionIndex === ans.selectedOptionIndex).length : 0;
      const cur = acc[day] || (acc[day] = { total: 0, correct: 0, score: 0, possible: 0 });
      cur.total += total; cur.correct += correct; cur.score += a.score || 0; cur.possible += a.totalPossible || 0;
    }
    for (const [d, v] of Object.entries(acc)) perDay[Number(d)] = { total: v.total, correct: v.correct, pct: v.possible ? round2((v.score / v.possible) * 100) : v.total ? round2((v.correct / v.total) * 100) : 0 };
    out.push({ sno: i + 1, employeeCode: e.employeeCode, doj: dmyDash(ymdOf(e.joinDate)), name: e.name, designation: e.designation, hq: e.territory, firstManager: chain[0]?.name || "", secondManager: chain[1]?.name || "", perDay });
  }
  return { month, scope, days, employee: rootInfo(root), rows: out };
}

// ═══ Items 2 + 3 -- Day Wise Report Dump / Call Report Dump ══════════════
export const DAYWISE_HEADERS = ["ECODE", "sf_name", "hq", "desg", "Date", "Day", "Day_Type", "CallType", "AreaName", "Territory_code", "Type", "Worked_with_Name", "MSL_No", "Doctor_Chemist_StockistName", "Date_of_Met", "Time_of_Met", "Doctor_Speciality", "Doctor_Category", "Doctor_Type", "ProductName_With_Sample", "Input Given", "FeedBack", "Activity_Remarks", "DRClass", "Agreed_to_Prescribe", "POB", "Remarks"];
export const CALL_REPORT_HEADERS = ["Field Force Name", "Employee Code", "hq", "Designation", "Date", "Day", "Day_Type", "CallType", "AreaName", "Territory_code", "Type", "Worked_with_Name", "MSL_No", "Dr/Ch/Stck Code", "Doctor_Chemist_StockistName", "Dr/Ch/Stck Clinic Address", "Last Visit Date", "Date_of_Met", "Time_of_Met", "Doctor_Speciality", "Doctor_Category", "Doctor_Type", "ProductName_With_Sample", "Sample Qty", "Input Given", "Input Qty", "FeedBack", "Activity_Remarks", "DRClass", "Agreed_to_Prescribe", "POB", "Remarks", "Actual Reporting Location", "Division"];

export type CallLine = {
  emp: OrgEmployee; date: string; time: string; dayType: string; callType: string; area: string; terrCode: string; type: string; workedWith: string;
  msl: string; code: string; name: string; address: string; lastVisit: string; met: string; timeMet: string; speciality: string; category: string; doctorType: string;
  products: string; sampleQty: string; inputGiven: string; inputQty: string; feedback: string; activity: string; drClass: string; agreed: string; pob: string; remarks: string; loc: string;
};

// callAt is a server timestamp (UTC); the legacy dumps show Indian clock time.
function clockOf(callAt: unknown, hhmm: string | undefined | null): string {
  if (callAt) {
    const d = new Date(new Date(callAt as Date).getTime() + 330 * 60000);
    return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
  }
  const m = /(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? `${p2(Number(m[1]))}:${m[2]}:00` : "";
}
const locOf = (g: any) => (g && typeof g.latitude === "number" && typeof g.longitude === "number" ? `${g.latitude} ; ${g.longitude}` : "0.0 ; 0.0");

export async function buildCallLines(tenantSlug: string, code: string, month: string, days: number[], includeVacant: boolean, everyDay: boolean): Promise<{ lines: CallLine[]; division: string }> {
  const { list } = await resolveScope(tenantSlug, code && code !== "admin" ? code : "", includeVacant);
  const scope = [...(list as OrgEmployee[])].sort((a, b) => a.name.localeCompare(b.name));
  const codes = scope.map((e) => e.employeeCode);
  const monthRegex = new RegExp(`^${month}`);
  const wanted = (date: string) => days.length === 0 || days.includes(Number(date.slice(8, 10)));
  const [tenant, dcrs, chem, logs, dealers, patches, classRows, rates] = await Promise.all([
    TenantModel.findOne({ slug: tenantSlug }).lean() as Promise<any>,
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).populate("doctorId").lean() as Promise<any[]>,
    ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: monthRegex }).lean() as Promise<any[]>,
    FieldVisitLogModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: monthRegex }).lean() as Promise<any[]>,
    DealerModel.find({ tenantSlug }).select("sourceSNo dealerName address patchName").lean() as Promise<any[]>,
    getMasterModel("patchNameMaster").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]),
    getMasterModel("doctorClassification").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]),
    loadRateMap(tenantSlug)
  ]);
  const division = tenant?.name || "";
  const patchCode = new Map<string, string>((patches as any[]).map((p) => [lc(p.patchName), String(p.patchCode ?? "")]));
  const dealerById = new Map<string, any>(dealers.map((d) => [String(d._id), d]));
  const classByCode = new Map<string, string>((classRows as any[]).map((r) => [r.doctorCode, r.doctorCategory]));
  const core = await loadCoreMap(tenantSlug, scope.map((s) => s.name));
  const ctx = await buildDayStatusContext(tenantSlug, month, codes, scope.map((s) => s.state));
  // previous visit (any earlier day, same employee + doctor) for "Last Visit Date"
  const docIds = [...new Set(dcrs.map((d) => String(d.doctorId?._id ?? "")).filter(Boolean))];
  const history = docIds.length ? ((await DcrModel.find({ tenantSlug, doctorId: { $in: docIds }, visitDateOnly: { $lt: `${month}-01` } }).select("employeeCode doctorId visitDateOnly").lean()) as any[]) : [];
  const lastBefore = (emp: string, doc: string, date: string) => {
    const earlier = [...history.filter((h) => h.employeeCode === emp && String(h.doctorId) === doc).map((h) => h.visitDateOnly),
      ...dcrs.filter((d) => d.employeeCode === emp && String(d.doctorId?._id) === doc && d.visitDateOnly < date).map((d) => d.visitDateOnly)];
    return earlier.length ? earlier.sort().at(-1)! : "";
  };
  const monthDays = daysIn(month);
  const lines: CallLine[] = [];

  for (const emp of scope) {
    const base = (date: string, time: string): CallLine => ({
      emp, date, time, dayType: "Field Work", callType: "", area: "", terrCode: "", type: "", workedWith: "", msl: "", code: "", name: "", address: "", lastVisit: "", met: "",
      timeMet: "", speciality: "", category: "", doctorType: "", products: "", sampleQty: "", inputGiven: "", inputQty: "", feedback: "", activity: "", drClass: "", agreed: "", pob: "", remarks: "", loc: "0.0 ; 0.0"
    });
    const mine: CallLine[] = [];
    for (const d of dcrs.filter((x) => x.employeeCode === emp.employeeCode && wanted(x.visitDateOnly))) {
      const doc = d.doctorId || {};
      const timeMet = clockOf(d.callAt, d.callTime || d.checkInTime);
      const l = base(d.visitDateOnly, timeMet);
      const samples = new Map<string, number>((d.samplesGiven || []).map((s: any) => [lc(s.productName), Number(s.qty || 0)]));
      const detailed: string[] = d.productsDetailed || [];
      const parts = detailed.map((p) => `${p} - ${p2(samples.get(lc(p)) ?? 0)}`);
      for (const s of d.samplesGiven || []) if (!detailed.some((p) => lc(p) === lc(s.productName))) parts.push(`${s.productName} - ${p2(Number(s.qty || 0))}`);
      const sampleTotal = (d.samplesGiven || []).reduce((s: number, x: any) => s + Number(x.qty || 0), 0);
      Object.assign(l, {
        dayType: d.workType || "Field Work", callType: "Listeddr", area: doc.territory || emp.territory, terrCode: patchCode.get(lc(doc.territory || emp.territory)) || "", type: doc.territoryType || "HQ",
        workedWith: d.jointWork?.accompanyingManager || "", msl: doc.doctorCode || "", name: doc.name || "", address: doc.address1 || doc.location || doc.city || "",
        lastVisit: doc._id ? (lastBefore(emp.employeeCode, String(doc._id), d.visitDateOnly) ? dmySlash(lastBefore(emp.employeeCode, String(doc._id), d.visitDateOnly)) : "") : "",
        met: dmySlash(d.visitDateOnly), timeMet, speciality: doc.specialty || "", category: tierOfDoctor(doc, core, emp.name), doctorType: (doc.doctorTypes || []).join(";"),
        products: parts.join(";"), sampleQty: sampleTotal ? String(sampleTotal) : "", inputGiven: (d.inputsGiven || []).map((i: any) => i.inputName).join(";"),
        inputQty: String((d.inputsGiven || []).reduce((s: number, x: any) => s + Number(x.qty || 0), 0)), feedback: d.productFeedback || "", activity: "",
        drClass: classByCode.get(doc.doctorCode) || doc.category || "", agreed: d.prescriptionInterest === "HIGH" || d.prescriptionInterest === "MEDIUM" ? "Yes" : d.prescriptionInterest === "LOW" || d.prescriptionInterest === "NONE" ? "No" : "",
        pob: num(docPobValue(d, rates)), remarks: d.notes || "", loc: locOf(d.gpsLocation)
      });
      mine.push(l);
    }
    for (const c of chem.filter((x) => x.employeeCode === emp.employeeCode && wanted(x.visitDateOnly))) {
      const dealer = dealerById.get(String(c.chemistId));
      const timeMet = clockOf(c.createdAt && c.checkInTime ? null : c.createdAt, c.checkInTime);
      const l = base(c.visitDateOnly, timeMet);
      const sno = dealer?.sourceSNo != null ? String(dealer.sourceSNo) : "";
      Object.assign(l, { callType: "Chemist", area: dealer?.patchName || emp.territory, terrCode: patchCode.get(lc(dealer?.patchName || emp.territory)) || "", type: "HQ", msl: sno, code: sno,
        name: c.chemistName || dealer?.dealerName || "", met: dmySlash(c.visitDateOnly), timeMet, pob: num(docPobValue(c, rates)), loc: locOf(c.gpsLocation) });
      mine.push(l);
    }
    for (const g of logs.filter((x) => x.employeeCode === emp.employeeCode && wanted(x.visitDateOnly))) {
      const timeMet = clockOf(null, g.checkInTime);
      const l = base(g.visitDateOnly, timeMet);
      Object.assign(l, { callType: g.visitType === "Stockist" ? "Stockist" : g.visitType === "UnlistedDoctor" ? "UnListeddr" : g.visitType, area: emp.territory, terrCode: patchCode.get(lc(emp.territory)) || "", type: "HQ",
        name: g.entityName || "", met: dmySlash(g.visitDateOnly), timeMet, remarks: g.notes || "", loc: locOf(g.gpsLocation) });
      mine.push(l);
    }
    const have = new Set(mine.map((l) => l.date));
    for (let day = 1; day <= monthDays; day++) {
      const date = `${month}-${p2(day)}`;
      if (!wanted(date) || have.has(date)) continue;
      const st = classifyDay(ctx, emp.employeeCode, date);
      const label = st.kind === "weeklyOff" ? "Weekly Off" : st.kind === "holiday" ? "Holiday" : st.kind === "leave" ? "Leave" : "";
      if (st.kind === "leave" || everyDay) {
        const l = base(date, "");
        l.dayType = label || "Not Reported";
        mine.push(l);
      }
    }
    if (includeVacant && emp.status === "INACTIVE" && mine.length === 0) { const l = base(`${month}-01`, ""); l.dayType = "Vacant"; mine.push(l); }
    mine.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
    lines.push(...mine);
  }
  return { lines, division };
}

const clean = (v: unknown) => String(v ?? "").replace(/[,\r\n]+/g, ";");
export const dayWiseCells = (l: CallLine): string[] => [
  l.emp.employeeCode, l.emp.name, l.emp.territory, l.emp.designation, mdy(l.date), WD_FULL[dowOf(l.date)], l.dayType, l.callType, l.area, l.terrCode, l.type, l.workedWith, l.msl, l.name,
  l.met, l.timeMet, l.speciality, l.category, l.doctorType, l.products, l.inputGiven, l.feedback, l.activity, l.drClass, l.agreed, l.pob, l.remarks
].map(clean);
export const callReportCells = (l: CallLine, division: string): string[] => [
  l.emp.name, l.emp.employeeCode, l.emp.territory, l.emp.designation, mdy(l.date), WD_FULL[dowOf(l.date)], l.dayType, l.callType, l.area, l.terrCode, l.type, l.workedWith, l.msl, l.code, l.name,
  l.address, l.lastVisit, l.met, l.timeMet, l.speciality, l.category, l.doctorType, l.products, l.sampleQty, l.inputGiven, l.inputQty, l.feedback, l.activity, l.drClass, l.agreed, l.pob, l.remarks, l.loc, division
].map(clean);

export function callReportCsv(lines: CallLine[], division: string): string {
  const rows = [CALL_REPORT_HEADERS, ...lines.map((l) => callReportCells(l, division))];
  return rows.map((r) => `${r.join(",")},\r\n`).join("");
}
// Legacy DayWise_Report_Dump is an HTML <table> served as Excel (one header row, lightblue cells).
export function dayWiseHtmlXls(lines: CallLine[]): string {
  const head = `<table width = '100%' border='1'><tr>${DAYWISE_HEADERS.map((h) => `<th style='background-color:lightblue'>${h}</th>`).join("")}</tr>`;
  if (!lines.length) return head;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return head + lines.map((l) => `<tr>${dayWiseCells(l).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") + "</table>";
}
export async function aoaToXlsx(sheet: string, headers: string[], rows: string[][], headerArgb?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet.slice(0, 31));
  const hr = ws.addRow(headers);
  hr.font = { bold: true };
  if (headerArgb) hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerArgb } }; c.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } }; });
  for (const r of rows) ws.addRow(r);
  headers.forEach((h, i) => { ws.getColumn(i + 1).width = Math.min(40, Math.max(10, h.length + 2)); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ═══ Items 4 + 5 -- Digital Detailing: Visit Wise, Brand Wise Star Rating ═
export async function detailingOptions(tenantSlug: string) {
  const [master, brandRows, prodRows] = await Promise.all([
    loadProductMaster(tenantSlug),
    ProductBrandModel.find({ tenantSlug, status: "ACTIVE" }).sort({ sortOrder: 1, brandName: 1 }).lean() as Promise<any[]>,
    ProductModel.find({ tenantSlug, status: "ACTIVE" }).select("brandName").lean() as Promise<any[]>
  ]);
  const seen = new Set<string>(); const brands: string[] = [];
  for (const n of [...brandRows.map((b) => b.brandName), ...prodRows.map((p) => p.brandName)]) { const t = String(n || "").trim(); if (t && !seen.has(lc(t))) { seen.add(lc(t)); brands.push(t); } }
  return { brands: ["Nil", ...brands], products: master.map((p) => p.name) };
}
async function brandOfProduct(tenantSlug: string): Promise<Map<string, string>> {
  const raw = (await ProductModel.find({ tenantSlug, status: "ACTIVE" }).select("productName name brandName").lean()) as any[];
  return new Map(raw.map((p) => [lc(p.productName || p.name), String(p.brandName || "").trim()]));
}
const hqLabel = (e: OrgEmployee) => `${e.name}-${e.territory}-${e.designation}`;

export async function computeDetailingVisitWise(tenantSlug: string, code: string, month: string, mode: "Brand" | "Product", names: string[]) {
  const { root, rows } = await beScope(tenantSlug, code);
  if (code && code !== "admin" && !root) return null;
  const dcrs = (await DcrModel.find({ tenantSlug, employeeCode: { $in: rows.map((r) => r.employeeCode) }, month }).select("employeeCode doctorId productsDetailed").lean()) as any[];
  const brandOf = await brandOfProduct(tenantSlug);
  const wanted = new Map(names.map((n) => [lc(n), n]));
  // employee -> name -> doctor -> number of calls on which it was detailed
  const tally = new Map<string, Map<string, Map<string, number>>>();
  for (const d of dcrs) {
    if (!d.doctorId) continue;
    const prods: string[] = (d.productsDetailed || []).map((p: string) => String(p).trim()).filter(Boolean);
    const keys = new Set<string>();
    if (mode === "Product") prods.forEach((p) => keys.add(lc(p)));
    else if (!prods.length) keys.add("nil");
    else for (const p of prods) keys.add(lc(brandOf.get(lc(p)) || "") || "nil");
    for (const k of keys) {
      if (!wanted.has(k)) continue;
      const byName = tally.get(d.employeeCode) || new Map(); tally.set(d.employeeCode, byName);
      const byDoc = byName.get(k) || new Map<string, number>(); byName.set(k, byDoc);
      const id = String(d.doctorId); byDoc.set(id, (byDoc.get(id) || 0) + 1);
    }
  }
  const outRows = rows.map((e, i) => {
    const groups: Record<string, { drs: number; one: number; two: number; more: number }> = {};
    for (const n of names) {
      const byDoc = tally.get(e.employeeCode)?.get(lc(n));
      const counts = byDoc ? [...byDoc.values()] : [];
      groups[n] = { drs: counts.length, one: counts.filter((c) => c === 1).length, two: counts.filter((c) => c === 2).length, more: counts.filter((c) => c > 2).length };
    }
    return { sno: i + 1, label: hqLabel(e), employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, groups };
  });
  return { month, mode, names, employee: rootInfo(root), rows: outRows };
}

export async function computeBrandStarRating(tenantSlug: string, code: string, month: string, brands: string[]) {
  const { root, rows } = await beScope(tenantSlug, code);
  if (code && code !== "admin" && !root) return null;
  const doctors = (await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: rows.map((r) => r.employeeCode) }, status: "ACTIVE" }).select("mappedEmployeeCode").lean()) as any[];
  const ratings = (await DoctorBrandRatingModel.find({ tenantSlug, month, doctorId: { $in: doctors.map((d) => String(d._id)) } }).lean()) as any[];
  // latest rating in the month per doctor + brand
  const latest = new Map<string, any>();
  for (const r of ratings) {
    const k = `${r.doctorId}|${lc(r.brandName)}`; const cur = latest.get(k);
    if (!cur || new Date(r.ratedAt) > new Date(cur.ratedAt)) latest.set(k, r);
  }
  const outRows = rows.map((e, i) => {
    const mine = doctors.filter((d) => d.mappedEmployeeCode === e.employeeCode);
    const groups: Record<string, { stars: number[]; nil: number }> = {};
    for (const b of brands) {
      const stars = [0, 0, 0, 0, 0]; let rated = 0;
      for (const d of mine) { const r = latest.get(`${d._id}|${lc(b)}`); if (r) { stars[r.stars - 1]++; rated++; } }
      groups[b] = { stars, nil: mine.length - rated };
    }
    return { sno: i + 1, label: hqLabel(e), employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, groups };
  });
  return { month, brands, employee: rootInfo(root), rows: outRows };
}

// ═══ Item 6 -- Product Slide Analysis (Listed Doctor Slide Analysis) ═════
export type SlideFilterKind = "ALL" | "Doctor Speciality" | "Doctor Category" | "Doctor Qualification" | "Doctor Class" | "Doctor Territory" | "Product / Brand";
export async function slideAnalysisOptions(tenantSlug: string) {
  const docs = (await DoctorModel.find({ tenantSlug, status: "ACTIVE" }).select("specialty qualification territory category").lean()) as any[];
  const uniq = (vals: unknown[]) => [...new Map(vals.map((v) => String(v ?? "").trim()).filter(Boolean).map((v) => [lc(v), v])).values()].sort((a, b) => a.localeCompare(b));
  const det = await detailingOptions(tenantSlug);
  return {
    "Doctor Speciality": uniq(docs.map((d) => d.specialty)), "Doctor Category": ["Nil", "CORE", "N CORE", "S CORE"], "Doctor Qualification": uniq(docs.map((d) => d.qualification)),
    "Doctor Class": ["Nil", "A", "B", "C"], "Doctor Territory": uniq(docs.map((d) => d.territory)), "Product / Brand": uniq([...det.products, ...det.brands.filter((b) => b !== "Nil")])
  };
}

export async function computeSlideAnalysis(tenantSlug: string, code: string, fromMonth: string, toMonth: string, basedOn: "Product" | "Brand", filterKind: SlideFilterKind, filterValue: string) {
  const { root, rows } = await beScope(tenantSlug, code);
  if (code && code !== "admin" && !root) return null;
  const months = monthsBetween(fromMonth, toMonth);
  const empCodes = rows.map((r) => r.employeeCode);
  const views = (await SlideViewModel.find({ tenantSlug, employeeCode: { $in: empCodes }, month: { $in: months } }).lean()) as any[];
  const docIds = [...new Set(views.map((v) => String(v.doctorId)))];
  const doctors = docIds.length ? ((await DoctorModel.find({ tenantSlug, _id: { $in: docIds } }).lean()) as any[]) : [];
  const docById = new Map(doctors.map((d) => [String(d._id), d]));
  const classRows = await getMasterModel("doctorClassification").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]);
  const classByCode = new Map<string, string>(classRows.map((r) => [r.doctorCode, r.doctorCategory]));
  const core = await loadCoreMap(tenantSlug, rows.map((r) => r.name));
  const empByCode = new Map(rows.map((r) => [r.employeeCode, r]));
  const brandOf = await brandOfProduct(tenantSlug);
  const colOf = (v: any) => (basedOn === "Brand" ? v.brandName || brandOf.get(lc(v.productName)) || "" : v.productName || "");
  const info = (d: any, emp: string) => ({
    speciality: d.specialty || "", category: tierOfDoctor(d, core, empByCode.get(emp)?.name || ""), cls: classByCode.get(d.doctorCode) || d.category || "Nil", territory: d.territory || "", qualification: d.qualification || ""
  });
  const agg = new Map<string, any>(); const cols = new Set<string>();
  for (const v of views) {
    const d = docById.get(String(v.doctorId)); if (!d) continue;
    const i = info(d, v.employeeCode);
    if (filterKind !== "ALL" && filterValue) {
      const want = lc(filterValue);
      const ok = filterKind === "Doctor Speciality" ? lc(i.speciality) === want : filterKind === "Doctor Category" ? lc(i.category) === want : filterKind === "Doctor Qualification" ? lc(i.qualification) === want
        : filterKind === "Doctor Class" ? lc(i.cls) === want : filterKind === "Doctor Territory" ? lc(i.territory) === want : lc(v.productName) === want || lc(v.brandName) === want || lc(brandOf.get(lc(v.productName))) === want;
      if (!ok) continue;
    }
    const col = colOf(v) || "(unspecified)"; cols.add(col);
    const key = `${v.employeeCode}|${v.doctorId}`;
    const row = agg.get(key) || { employeeCode: v.employeeCode, employeeName: empByCode.get(v.employeeCode)?.name || "", doctor: d.name, ...i, cells: {} as Record<string, { views: number; seconds: number }>, totalViews: 0, totalSeconds: 0 };
    const c = row.cells[col] || (row.cells[col] = { views: 0, seconds: 0 });
    c.views++; c.seconds += v.durationSec || 0; row.totalViews++; row.totalSeconds += v.durationSec || 0; agg.set(key, row);
  }
  const outRows = [...agg.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.doctor.localeCompare(b.doctor)).map((r, i) => ({ sno: i + 1, ...r }));
  return { months, basedOn, filterKind, filterValue, columns: [...cols].sort((a, b) => a.localeCompare(b)), employee: rootInfo(root), rows: outRows };
}

// ═══ Item 7 -- Drs Analyis ═══════════════════════════════════════════════
export async function computeDrsAnalysis(tenantSlug: string, code: string, fromMonth: string, toMonth: string) {
  const root = (await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean()) as unknown as OrgEmployee | null;
  if (!root) return null;
  const { rows } = await beScope(tenantSlug, code);
  const months = monthsBetween(fromMonth, toMonth);
  const codes = rows.map((r) => r.employeeCode);
  const [doctors, dcrs, views] = await Promise.all([
    DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).select("mappedEmployeeCode").lean() as Promise<any[]>,
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).select("employeeCode doctorId month").lean() as Promise<any[]>,
    SlideViewModel.find({ tenantSlug, employeeCode: { $in: codes }, month: { $in: months } }).select("employeeCode doctorId month").lean() as Promise<any[]>
  ]);
  const outRows = rows.map((e, i) => {
    const total = doctors.filter((d) => d.mappedEmployeeCode === e.employeeCode).length;
    const perMonth: Record<string, { total: number; met: number; edet: number; pct: number }> = {};
    for (const m of months) {
      const met = new Set(dcrs.filter((d) => d.employeeCode === e.employeeCode && d.month === m && d.doctorId).map((d) => String(d.doctorId))).size;
      const edet = new Set(views.filter((v) => v.employeeCode === e.employeeCode && v.month === m).map((v) => String(v.doctorId))).size;
      perMonth[m] = { total, met, edet, pct: total ? round2((edet / total) * 100) : 0 };
    }
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, perMonth };
  });
  return { months, employee: rootInfo(root), rows: outRows };
}
