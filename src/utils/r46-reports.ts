// Round 46 -- MIS Reports dumps and result screens:
//   Dump II > RCPA (xls + csv), Dump II > Product Exposure Analysis [SKU wise
//   detailing secs] (tab-separated .xls), Dump > Visit - Drs, Secondary Sale,
//   Listeddr (66-column CSV), Chemist, Transit Bills, Listed Stockist,
//   Options > Resigned User Status, Join/Left Details, TP - Deviation For
//   Baselevel. Layouts follow the legacy sample files byte for byte where a
//   sample exists (header text, order, sheet name, title row, merges, widths).
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import { EmployeeModel } from "../models/employee.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { StockistModel } from "../models/stockist.model.js";
import { RcpaModel } from "../models/rcpa.model.js";
import { SlideViewModel } from "../models/slide-view.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { CompetitorMapModel } from "../models/competitor-map.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { isManagerRole, getUpwardChain, type OrgEmployee } from "./org-hierarchy.js";
import { loadCoreMap, tierOfDoctor } from "./doctor-tier.js";
import { resolveScope } from "./pob-rx-reports.js";
import { beScope } from "./r45-reports.js";

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const p2 = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: unknown): string => { if (!d) return ""; const x = new Date(d as Date); return Number.isNaN(x.getTime()) ? "" : x.toISOString().slice(0, 10); };
const dmy = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "");
const dmyOf = (d: unknown) => dmy(ymdOf(d));
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monLabel = (month: string) => `${MON[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const monthEnd = (month: string) => { const [y, m] = month.split("-").map(Number); return `${month}-${p2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
const sstr = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export const FORCE_ADMIN_LABEL = "admin - Admin -";
export const forceLabel = (e: { name: string; designation: string; territory: string } | null) => (e ? `${e.name} - ${e.designation} - ${e.territory}` : FORCE_ADMIN_LABEL);

type Cell = string | number | null;

// ── shared legacy-shaped .xlsx writer ────────────────────────────────────
// Row 1 = optional bold 15pt centred title merged across `mergeTo` columns,
// then a plain (unstyled) header row and plain data rows, exactly like the
// legacy workbooks. Strings stay strings, numbers stay numbers, null = empty.
export async function legacyXlsx(o: { sheet: string; title?: string; mergeTo?: number; headers: string[]; rows: Cell[][]; widths?: Record<number, number> }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(o.sheet);
  if (o.title !== undefined) {
    const tr = ws.addRow([o.title]);
    ws.mergeCells(1, 1, 1, o.mergeTo || o.headers.length);
    const c = tr.getCell(1);
    c.font = { name: "Calibri", size: 15, bold: true };
    c.alignment = { horizontal: "center" };
  }
  ws.addRow(o.headers);
  for (const r of o.rows) ws.addRow(r);
  for (const [i, w] of Object.entries(o.widths || {})) ws.getColumn(Number(i)).width = w;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Scope = { root: OrgEmployee | null; list: OrgEmployee[] };
async function teamScope(tenantSlug: string, code: string): Promise<Scope> {
  const { root, list } = await resolveScope(tenantSlug, code && code !== "admin" ? code : "", false);
  return { root, list: list as OrgEmployee[] };
}
async function hqCodeMap(tenantSlug: string): Promise<Map<string, string>> {
  const rows = (await getMasterModel("territoryHqMaster").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]));
  return new Map(rows.map((r) => [lc(r.headquartersName), String(r.hqCode ?? "")]));
}
const tierLabel = (d: any, core: Map<string, string>, mr: string) => tierOfDoctor(d, core, mr);
async function classMap(tenantSlug: string): Promise<Map<string, string>> {
  const rows = (await getMasterModel("doctorClassification").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]));
  return new Map(rows.map((r) => [String(r.doctorCode), String(r.doctorCategory ?? "")]));
}
const validIds = (ids: string[]) => [...new Set(ids.filter((i) => mongoose.isValidObjectId(i)))];

// ═══ 1. RCPA dump (Dump II) ═══════════════════════════════════════════════
export const RCPA_HEADERS = ["Sno", "ListedDrCode", "Emp Code", "Field Force Name", "HQ", "Designation", "Subdivision", "DOJ", "I Level MGR Name", "II Level  MGR Name", "RCPA Date", "Chemist name", "Chemist Cluster Name", "Doctor Name", "Speciality", "Dr Category", "Chemist Category", "Doctor Cluster Name", "Our Product Name", "Our Product Qty", "PTR", "Competitor Name", "Competitor Product", "Competitor Qty", "Competitor PTR"];

export async function buildRcpaRows(tenantSlug: string, code: string, month: string): Promise<string[][]> {
  const { list } = await teamScope(tenantSlug, code);
  const byCode = new Map(list.map((e) => [e.employeeCode, e]));
  const entries = (await RcpaModel.find({ tenantSlug, employeeCode: { $in: [...byCode.keys()] }, month }).lean()) as any[];
  if (!entries.length) return [];
  const order = new Map([...byCode.keys()].map((c, i) => [c, i]));
  entries.sort((a, b) => (order.get(a.employeeCode)! - order.get(b.employeeCode)!) || String(a.date).localeCompare(String(b.date)) || lc(a.doctorName).localeCompare(lc(b.doctorName)));
  const docIds = validIds(entries.map((e) => String(e.doctorId)));
  const chemIds = validIds(entries.map((e) => String(e.chemistId ?? "")));
  const [doctors, dealers, products, comps] = await Promise.all([
    docIds.length ? (DoctorModel.find({ tenantSlug, _id: { $in: docIds } }).lean() as Promise<any[]>) : Promise.resolve([] as any[]),
    chemIds.length ? (DealerModel.find({ tenantSlug, _id: { $in: chemIds } }).lean() as Promise<any[]>) : Promise.resolve([] as any[]),
    getMasterModel("productMaster").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]),
    CompetitorMapModel.find({ tenantSlug }).lean() as Promise<any[]>
  ]);
  const docBy = new Map(doctors.map((d) => [String(d._id), d]));
  const dealerBy = new Map(dealers.map((d) => [String(d._id), d]));
  const ptrBy = new Map<string, number>();
  for (const p of products) if (typeof p.ptr === "number") ptrBy.set(lc(p.productName), p.ptr);
  const compCompany = new Map<string, string>();
  for (const c of comps) if (c.competitorCompanyName) compCompany.set(lc(c.competitorBrandName), c.competitorCompanyName);
  const core = await loadCoreMap(tenantSlug, list.map((e) => e.name));
  const chains = new Map<string, OrgEmployee[]>();
  for (const c of new Set(entries.map((e) => e.employeeCode as string))) chains.set(c, await getUpwardChain(tenantSlug, c));
  return entries.map((r, i) => {
    const emp = byCode.get(r.employeeCode)!;
    const doc = docBy.get(String(r.doctorId));
    const dealer = r.chemistId ? dealerBy.get(String(r.chemistId)) : undefined;
    const chain = chains.get(r.employeeCode) || [];
    const ptr = typeof r.ourPtr === "number" ? r.ourPtr : ptrBy.get(lc(r.ourProduct));
    return [
      String(i + 1), sstr(doc?.doctorCode), emp.employeeCode, emp.name, emp.territory, emp.designation, sstr((emp as any).division), dmyOf(emp.joinDate),
      sstr(chain[0]?.name), sstr(chain[1]?.name), dmy(String(r.date)), sstr(r.chemistName || dealer?.dealerName), sstr(dealer?.clusterName || dealer?.patchName),
      sstr(r.doctorName || doc?.name), sstr(doc?.specialty), doc ? tierLabel(doc, core, emp.name) : "", sstr(dealer?.category), sstr(doc?.territory),
      sstr(r.ourProduct), String(r.ourQty ?? 0), ptr === undefined || ptr === null ? "" : String(ptr),
      sstr(r.competitorName || compCompany.get(lc(r.competitorProduct))), sstr(r.competitorProduct), r.competitorProduct ? String(r.competitorQty ?? 0) : "", typeof r.competitorPtr === "number" ? String(r.competitorPtr) : ""
    ];
  });
}
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Legacy structure: single-quoted attributes, no line terminators, header cells
// 'background-color:lightblue'. Header-only output is byte-identical to the sample.
export function rcpaHtmlXls(rows: string[][]): string {
  const head = `<table width = '100%' border='1'><tr>${RCPA_HEADERS.map((h) => `<th style='background-color:lightblue'>${h}</th>`).join("")}</tr>`;
  if (!rows.length) return head;
  return head + rows.map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("") + "</table>";
}
// CSV quoting follows the legacy Call Report CSV convention (the same platform's
// "Download CSV"): no quotes, commas inside a value become ";", every line ends
// with a trailing comma and CRLF.
export function rcpaCsv(rows: string[][]): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/,/g, ";");
  return [RCPA_HEADERS, ...rows].map((r) => r.map(clean).join(",") + ",\r\n").join("");
}

// ═══ 2. SKU wise detailing (Product Exposure Analysis) ═══════════════════
export const SKU_HEADERS = ["Fieldforce Name", "HQ", "Designation", "Emp Code", "HQ Code", "State", "SubDivision Name", "Type", "Visit Date", "Transaction Id", "Brand Name", "Product Name", "Slide Name", "Slide Duration (in secs)", "MSL_No", "Doc/Chemist Name", "Speciality", "Category", "Doc/Chemists State", "Doc/Chemists Country", "Cluster Name", "Doc/Chemists HospitalName", "Territory Name", "StartTime", "EndTime"];
const istStamp = (d: unknown) => { if (!d) return ""; const x = new Date(new Date(d as Date).getTime() + 330 * 60000); return `${p2(x.getUTCDate())}/${p2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()} ${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}:${p2(x.getUTCSeconds())}`; };

export async function buildSkuRows(tenantSlug: string, code: string, month: string): Promise<string[][]> {
  const { list } = await teamScope(tenantSlug, code);
  const byCode = new Map(list.map((e) => [e.employeeCode, e]));
  const views = (await SlideViewModel.find({ tenantSlug, employeeCode: { $in: [...byCode.keys()] }, month }).lean()) as any[];
  if (!views.length) return [];
  const order = new Map([...byCode.keys()].map((c, i) => [c, i]));
  views.sort((a, b) => (order.get(a.employeeCode)! - order.get(b.employeeCode)!) || new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const docIds = validIds(views.map((v) => String(v.doctorId)));
  const chemIds = validIds(views.map((v) => String(v.chemistId ?? "")));
  const [doctors, dealers, hq] = await Promise.all([
    docIds.length ? (DoctorModel.find({ tenantSlug, _id: { $in: docIds } }).lean() as Promise<any[]>) : Promise.resolve([] as any[]),
    chemIds.length ? (DealerModel.find({ tenantSlug, _id: { $in: chemIds } }).lean() as Promise<any[]>) : Promise.resolve([] as any[]),
    hqCodeMap(tenantSlug)
  ]);
  const docBy = new Map(doctors.map((d) => [String(d._id), d]));
  const dealerBy = new Map(dealers.map((d) => [String(d._id), d]));
  const core = await loadCoreMap(tenantSlug, list.map((e) => e.name));
  return views.map((v) => {
    const emp = byCode.get(v.employeeCode)!;
    const chem = v.targetType === "Chemist";
    const doc = chem ? null : docBy.get(String(v.doctorId));
    const dealer = chem ? dealerBy.get(String(v.chemistId)) : null;
    const end = v.endedAt ? v.endedAt : new Date(new Date(v.startedAt).getTime() + (v.durationSec || 0) * 1000);
    return [
      emp.name, emp.territory, emp.designation, emp.employeeCode, hq.get(lc(emp.territory)) || "", sstr(emp.state), sstr((emp as any).division),
      chem ? "Chemist" : "Doctor", dmy(String(v.visitDateOnly)), sstr(v.transactionId), sstr(v.brandName), sstr(v.productName), sstr(v.slideName), String(v.durationSec ?? 0),
      chem ? sstr(dealer?.sourceSNo) : sstr(doc?.doctorCode), chem ? sstr(dealer?.dealerName) : sstr(doc?.name), chem ? "" : sstr(doc?.specialty),
      chem ? sstr(dealer?.category) : doc ? tierLabel(doc, core, emp.name) : "", chem ? sstr(dealer?.state) : sstr(doc?.state), chem ? sstr(dealer?.country) : sstr(doc?.country),
      chem ? sstr(dealer?.clusterName || dealer?.patchName) : sstr(doc?.territory), chem ? "" : sstr(doc?.clinicName), chem ? sstr(dealer?.patchName) : sstr(doc?.territory),
      istStamp(v.startedAt), istStamp(end)
    ];
  });
}
// Tab-separated text (the legacy file is named .xls but is plain text); "\n" line ends.
export function skuTsv(rows: string[][]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ");
  return [SKU_HEADERS, ...rows].map((r) => r.map(clean).join("\t") + "\n").join("");
}

// ═══ 3. Visit - Drs (xlsx 'tab1') ═════════════════════════════════════════
export const VISIT_DRS_DESIGNATIONS = ["MR", "BH", "RBM", "ABM", "ZBM", "BRM", "NBM", "Sr ABM", "MH", "SM"];
export const VISIT_DRS_HEADERS = ["sno", "sf_name", "ListedDr_Name", "Cat", "Spec", "Class", ...VISIT_DRS_DESIGNATIONS.flatMap((d) => [`${d} Visit Count`, `${d} Visit Date`])];
const dkey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function buildVisitDrsRows(tenantSlug: string, code: string, month: string): Promise<Cell[][]> {
  const { list } = await teamScope(tenantSlug, code);
  const codes = list.map((e) => e.employeeCode);
  const empByCode = new Map(list.map((e) => [e.employeeCode, e]));
  const [doctors, dcrs, classBy] = await Promise.all([
    DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).lean() as Promise<any[]>,
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).select("employeeCode doctorId visitDateOnly jointWork").lean() as Promise<any[]>,
    classMap(tenantSlug)
  ]);
  const allEmps = (await EmployeeModel.find({ tenantSlug }).select("name employeeCode designation role").lean()) as any[];
  const mgrByToken = new Map<string, any>();
  for (const e of allEmps) { mgrByToken.set(lc(e.employeeCode), e); mgrByToken.set(lc(e.name), e); }
  const colOfEmp = (e: any): string | null => {
    if (!isManagerRole(e.role)) return "MR";
    const k = dkey(e.designation);
    return VISIT_DRS_DESIGNATIONS.find((d) => d !== "MR" && dkey(d) === k) ?? null;
  };
  const core = await loadCoreMap(tenantSlug, list.map((e) => e.name));
  // doctorId -> column -> dates
  const tally = new Map<string, Map<string, string[]>>();
  const add = (doc: string, col: string | null, date: string) => {
    if (!col) return;
    const m = tally.get(doc) || new Map<string, string[]>();
    const a = m.get(col) || [];
    a.push(date); m.set(col, a); tally.set(doc, m);
  };
  for (const d of dcrs) {
    if (!d.doctorId) continue;
    const doc = String(d.doctorId);
    const own = empByCode.get(d.employeeCode) || allEmps.find((e) => e.employeeCode === d.employeeCode);
    if (own) add(doc, colOfEmp(own), d.visitDateOnly);
    const am = d.jointWork?.accompanyingManager;
    if (am) { const mgr = mgrByToken.get(lc(am)); if (mgr && mgr.employeeCode !== d.employeeCode) add(doc, colOfEmp(mgr), d.visitDateOnly); }
  }
  const order = new Map(codes.map((c, i) => [c, i]));
  doctors.sort((a, b) => ((order.get(a.mappedEmployeeCode) ?? 0) - (order.get(b.mappedEmployeeCode) ?? 0)) || lc(a.name).localeCompare(lc(b.name)));
  return doctors.map((d, i) => {
    const mr = empByCode.get(d.mappedEmployeeCode);
    const t = tally.get(String(d._id));
    const cells: Cell[] = [i + 1, mr?.name ?? "", d.name, tierLabel(d, core, mr?.name || ""), d.specialty ?? "", classBy.get(d.doctorCode) || d.category || "Nil"];
    for (const col of VISIT_DRS_DESIGNATIONS) {
      const dates = (t?.get(col) || []).slice().sort();
      cells.push(dates.length || null, dates.length ? dates.map(dmy).join(",") : null);
    }
    return cells;
  });
}

// ═══ 4. Secondary sales dump ═════════════════════════════════════════════
export const SS_HEADERS = ["Fieldforce Name", "HQ", "Designation", "Emp Code", "Stockist Name", "Stockist ERP Code", "Product Name", "Product ERP Code", "Sale Qty", "Sale Value", "Bill Date", "Month"];
export async function buildSsRows(tenantSlug: string, code: string, month: string): Promise<Cell[][]> {
  const { list } = await teamScope(tenantSlug, code);
  const whole = !code || code === "admin";
  const byName = new Map(list.map((e) => [lc(e.name), e]));
  const byHq = new Map<string, OrgEmployee[]>();
  for (const e of list) { const a = byHq.get(lc(e.territory)) || []; a.push(e); byHq.set(lc(e.territory), a); }
  const [rows, stockists, products] = await Promise.all([
    getMasterModel("secondarySales").find({ tenantSlug, month }).lean().then((r: any) => r as any[], () => [] as any[]),
    getMasterModel("stockistMaster").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]),
    getMasterModel("productMaster").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[])
  ]);
  const erpOfStockist = new Map(stockists.map((s) => [lc(s.stockistName), sstr(s.stockistCode)]));
  const erpOfProduct = new Map(products.map((p) => [lc(p.productName), sstr(p.productCode)]));
  const out: { emp: OrgEmployee | null; r: any }[] = [];
  for (const r of rows) {
    if (r.status === "Inactive") continue;
    let emp: OrgEmployee | null = r.fieldForceName ? byName.get(lc(r.fieldForceName)) ?? null : null;
    if (!emp && !r.fieldForceName) { const c = byHq.get(lc(r.hq)); if (c && c.length === 1) emp = c[0]; }
    const inScope = whole || !!emp || (!r.fieldForceName && (byHq.get(lc(r.hq))?.length ?? 0) > 0);
    if (!inScope) continue;
    out.push({ emp, r });
  }
  out.sort((a, b) => lc(a.emp?.name ?? a.r.fieldForceName).localeCompare(lc(b.emp?.name ?? b.r.fieldForceName)) || String(a.r.billDate).localeCompare(String(b.r.billDate)) || lc(a.r.stockist).localeCompare(lc(b.r.stockist)));
  return out.map(({ emp, r }) => [
    emp?.name ?? sstr(r.fieldForceName), emp?.territory ?? sstr(r.hq), emp?.designation ?? "", emp?.employeeCode ?? "", sstr(r.stockist), erpOfStockist.get(lc(r.stockist)) ?? "",
    sstr(r.product), erpOfProduct.get(lc(r.product)) ?? "", typeof r.salesUnit === "number" ? r.salesUnit : null, typeof r.salesValue === "number" ? r.salesValue : null,
    r.billDate ? dmy(ymdOf(r.billDate)) : "", monLabel(month)
  ]);
}

// ═══ 5. Listeddr dump (66-column fully-quoted CSV) ═══════════════════════
export const LISTEDDR_HEADERS = ["sno", "Saneforce code", "Fieldforce Name", "Designation", "HQ", "Employee Code", "DOJ", "StateName", "Division Name", "SubDivision", "Reporting_leve1", "Reporting_HQ_leve1", "Reporting_leve2", "Reporting_HQ_leve2", "Reporting_leve3", "Reporting_HQ_leve3", "SLVNo", "Unique Code", "Listed Dr Name", "Created Date", "ListedDr_Address1", "Address2", "Address3", "Category", "Speciality", "Qualification", "Class", "Doctor_Type", "Territory", "Territory_type", "City Name", "Hospital Name", "Hospital Address", "DOB", "DOW", "Mobile", "Email", "Gender", "Pincode", "Register Number", "Telephone No", "Dr_Potential", "Business Value", "Exp Business Value", "Current Business", "Communication", "Working Place", "Visiting days", "IUI Cycle", "Average Number of Patients Per Day", "Class of Patients", "Time Of Meeting", "Consultation_Fees", "campaign", "P0", "P1", "P2", "P3", "P4", "P5", "MappedProduct", "MappedChemist", "Geo Tag Count", "lat", "long", "Geoaddrs"];

export async function buildListeddrRows(tenantSlug: string, code: string): Promise<string[][]> {
  const { list } = await teamScope(tenantSlug, code);
  const tenant = (await TenantModel.findOne({ slug: tenantSlug }).lean()) as any;
  const emps = [...list].sort((a, b) => lc(a.name).localeCompare(lc(b.name)));
  const codes = emps.map((e) => e.employeeCode);
  const [doctors, classBy] = await Promise.all([
    DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).lean() as Promise<any[]>,
    classMap(tenantSlug)
  ]);
  const core = await loadCoreMap(tenantSlug, emps.map((e) => e.name));
  const out: string[][] = [];
  let sno = 0;
  for (const e of emps) {
    const mine = doctors.filter((d) => d.mappedEmployeeCode === e.employeeCode).sort((a, b) => lc(a.name).localeCompare(lc(b.name)));
    if (!mine.length) continue;
    const chain = await getUpwardChain(tenantSlug, e.employeeCode);
    for (const d of mine) {
      sno++;
      const prio = (i: number) => sstr(d.priorityProducts?.[i]);
      const tags: any[] = d.geoTags || [];
      const last = tags[tags.length - 1];
      out.push([
        String(sno), sstr((e as any).sfCode), e.name, e.designation, e.territory, e.employeeCode, dmyOf(e.joinDate), sstr(e.state), sstr(tenant?.name), sstr((e as any).division),
        sstr(chain[0]?.name), sstr(chain[0]?.territory), sstr(chain[1]?.name), sstr(chain[1]?.territory), sstr(chain[2]?.name), sstr(chain[2]?.territory),
        sstr((e as any).sfCode), sstr(d.doctorCode), d.name, dmyOf(d.createdAt), sstr(d.address1), "", "", tierLabel(d, core, e.name), sstr(d.specialty), sstr(d.qualification),
        classBy.get(d.doctorCode) || d.category || "Nil", (d.doctorTypes || []).join(","), sstr(d.territory), sstr(d.territoryType), sstr(d.city), sstr(d.clinicName), sstr(d.hospitalAddress),
        dmyOf(d.dob), dmyOf(d.anniversaryDate), sstr(d.phone), sstr(d.email).toUpperCase(), sstr(d.gender), sstr(d.postalCode), sstr(d.registrationNo), sstr(d.telephone),
        sstr(d.drPotential), sstr(d.businessValue), sstr(d.expBusinessValue), sstr(d.currentBusiness), sstr(d.communication), sstr(d.workingPlace), sstr(d.visitingDays), sstr(d.iuiCycle),
        sstr(d.avgPatientsPerDay), sstr(d.classOfPatients), sstr(d.timeOfMeeting), sstr(d.consultationFees), sstr(d.campaign),
        prio(0), prio(1), prio(2), prio(3), prio(4), prio(5), (d.mappedProducts || []).join(","), (d.supportiveChemists || []).map((c: any) => c.dealerName).join(","),
        String(tags.length), last ? String(last.lat) : "", last ? String(last.lng) : "", sstr(last?.address)
      ]);
    }
  }
  return out;
}
// Every field double-quoted (header included), CRLF after every line.
export function listeddrCsv(rows: string[][]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [LISTEDDR_HEADERS, ...rows].map((r) => r.map(q).join(",") + "\r\n").join("");
}

// ═══ 6. Chemist dump ═════════════════════════════════════════════════════
export const CHEMIST_HEADERS = ["sno", "Fieldforce Name", "Designation", "HQ", "Employee Code", "Chemists Name", "Class", "Address", "Territory", "Contact Person", "Mobile", "Common Reference Number"];
export const CHEMIST_WIDTHS: Record<number, number> = { 1: 6.13, 2: 23.41, 3: 13.41, 4: 14.13, 5: 16.84, 6: 31.27, 7: 7.41, 8: 46.98, 9: 18.84, 10: 16.27, 11: 9.27, 12: 28.27 };
export async function buildChemistRows(tenantSlug: string, code: string): Promise<{ title: string; rows: Cell[][] }> {
  const { root, list } = await teamScope(tenantSlug, code);
  const emps = [...list].sort((a, b) => lc(a.name).localeCompare(lc(b.name)));
  const dealers = (await DealerModel.find({ tenantSlug, employeeCode: { $in: emps.map((e) => e.employeeCode) }, status: "ACTIVE" }).lean()) as any[];
  const rows: Cell[][] = [];
  let sno = 0;
  for (const e of emps) {
    for (const d of dealers.filter((x) => x.employeeCode === e.employeeCode).sort((a, b) => lc(a.dealerName).localeCompare(lc(b.dealerName)))) {
      sno++;
      const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
      rows.push([sno, e.name, e.designation, e.territory, e.employeeCode, d.dealerName, n(d.chemistClass), n(d.address), n(d.patchName), n(d.contactPersonName), n(d.dealerPhone), n(d.commonRefNo)]);
    }
  }
  return { title: `Chemist Dump (  ${forceLabel(root)} )`, rows };
}

// ═══ 7. Transit bills ════════════════════════════════════════════════════
export const TRANSIT_HEADERS = ["Bill_No", "Bill_Date", "Stockist_Name", "Stockist_ERP_Code", "Product_ERP_Code", "Product_Name", "Sale_Qty", "Sale_Value"];
export const TRANSIT_WIDTHS: Record<number, number> = { 1: 9.41, 2: 10.98, 3: 16.13, 4: 19.7, 6: 16.13, 7: 10.84, 8: 12.7 };
export async function buildTransitRows(tenantSlug: string, month: string): Promise<{ title: string; rows: Cell[][] }> {
  const rows = (await getMasterModel("transitBills").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]))
    .filter((r) => r.status !== "Inactive" && ymdOf(r.billDate).slice(0, 7) === month)
    .sort((a, b) => ymdOf(a.billDate).localeCompare(ymdOf(b.billDate)) || String(a.billNo).localeCompare(String(b.billNo)));
  return {
    title: `Transit Bills (  ${MON[Number(month.slice(5, 7)) - 1]} - ${month.slice(0, 4)} )`,
    rows: rows.map((r) => [sstr(r.billNo), dmy(ymdOf(r.billDate)), sstr(r.stockistName), sstr(r.stockistErpCode) || null, sstr(r.productErpCode) || null, sstr(r.productName),
      typeof r.saleQty === "number" ? r.saleQty : null, typeof r.saleValue === "number" ? r.saleValue : null])
  };
}

// ═══ 8. Listed stockist dump ═════════════════════════════════════════════
export const STOCKIST_HEADERS = ["Sl No", "ERP Code", "Stockist Name", "HQ Name", "State", "Emp Code", "Fieldforce Name", "HQ Code"];
export const STOCKIST_WIDTHS: Record<number, number> = { 1: 7.55, 2: 11.27, 3: 48.41, 4: 11.41, 5: 18.84, 6: 11.84, 7: 36.55, 8: 10.7 };
export async function buildStockistRows(tenantSlug: string, division: string): Promise<{ title: string; rows: Cell[][] }> {
  const tenant = (await TenantModel.findOne({ slug: tenantSlug }).lean()) as any;
  const name = tenant?.name || "";
  const all = !division || division.toUpperCase() === "ALL";
  const title = `Stockist Dump (  ${all ? "ALL" : division} )`;
  if (!all && lc(division) !== lc(name)) return { title, rows: [] };
  const [stockists, emps, hq] = await Promise.all([
    StockistModel.find({ tenantSlug, status: "ACTIVE" }).lean() as Promise<any[]>,
    EmployeeModel.find({ tenantSlug }).select("name employeeCode").lean() as Promise<any[]>,
    hqCodeMap(tenantSlug)
  ]);
  const codeOf = new Map(emps.map((e) => [lc(e.name), e.employeeCode]));
  stockists.sort((a, b) => lc(a.name).localeCompare(lc(b.name)));
  const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  return { title, rows: stockists.map((s, i) => [i + 1, n(s.erpCode), s.name, n(s.hqName), n(s.state), n(codeOf.get(lc(s.fieldForceName))), n(s.fieldForceName), n(hq.get(lc(s.hqName)))]) };
}

// ═══ 9/10. Resigned user status and Join / Left details ══════════════════
async function dcrSpan(tenantSlug: string, codes: string[]): Promise<Map<string, { first: string; last: string }>> {
  const out = new Map<string, { first: string; last: string }>();
  if (!codes.length) return out;
  const rows = (await DcrModel.find({ tenantSlug, employeeCode: { $in: codes } }).select("employeeCode visitDateOnly").lean()) as any[];
  for (const r of rows) {
    const d = String(r.visitDateOnly || ""); if (!d) continue;
    const cur = out.get(r.employeeCode);
    if (!cur) out.set(r.employeeCode, { first: d, last: d });
    else { if (d < cur.first) cur.first = d; if (d > cur.last) cur.last = d; }
  }
  return out;
}
const inRange = (d: unknown, from: string, to: string) => { const y = ymdOf(d); return !!y && y >= from && y <= to; };
async function shortCodeOf(tenantSlug: string): Promise<string> {
  const tenant = (await TenantModel.findOne({ slug: tenantSlug }).lean()) as any;
  const rows = (await getMasterModel("divisionMaster").find({ tenantSlug }).lean().then((r: any) => r as any[], () => [] as any[]));
  return sstr(rows.find((r) => lc(r.divisionName) === lc(tenant?.name) && r.status !== "Inactive")?.shortCode);
}

export async function computeResignedUsers(tenantSlug: string, fromMonth: string, toMonth: string) {
  const from = `${fromMonth}-01`, to = monthEnd(toMonth);
  const emps = ((await EmployeeModel.find({ tenantSlug }).lean()) as any[]).filter((e) => inRange(e.leftDate, from, to) || (e.status === "INACTIVE" && inRange(e.deactivatedAt, from, to)));
  const span = await dcrSpan(tenantSlug, emps.map((e) => e.employeeCode));
  emps.sort((a, b) => lc(a.name).localeCompare(lc(b.name)));
  return {
    from: fromMonth, to: toMonth,
    rows: emps.map((e, i) => ({ sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, dcrStart: dmy(span.get(e.employeeCode)?.first || ""), dcrEnd: dmy(span.get(e.employeeCode)?.last || "") }))
  };
}

export async function computeJoinLeft(tenantSlug: string, fromMonth: string, toMonth: string) {
  const from = `${fromMonth}-01`, to = monthEnd(toMonth);
  const all = (await EmployeeModel.find({ tenantSlug }).lean()) as any[];
  const joined = all.filter((e) => inRange(e.joinDate, from, to)).sort((a, b) => ymdOf(a.joinDate).localeCompare(ymdOf(b.joinDate)) || lc(a.name).localeCompare(lc(b.name)));
  const left = all.filter((e) => inRange(e.leftDate, from, to)).sort((a, b) => ymdOf(a.leftDate).localeCompare(ymdOf(b.leftDate)) || lc(a.name).localeCompare(lc(b.name)));
  const span = await dcrSpan(tenantSlug, [...joined, ...left].map((e) => e.employeeCode));
  const division = await shortCodeOf(tenantSlug);
  return {
    from: fromMonth, to: toMonth,
    joined: joined.map((e, i) => ({ sno: i + 1, employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, doj: dmyOf(e.joinDate), dcrStart: dmy(span.get(e.employeeCode)?.first || ""), createdId: dmyOf(e.createdAt), division })),
    left: left.map((e, i) => ({ sno: i + 1, employeeCode: e.employeeCode, name: e.name, hq: e.territory, designation: e.designation, dateOfLeft: dmyOf(e.leftDate), dcrLast: dmy(span.get(e.employeeCode)?.last || ""), deactiveDate: dmyOf(e.deactivatedAt), division }))
  };
}

// ═══ 11. TP - Deviation for Baselevel (layout inferred) ══════════════════
export async function computeTpDeviation(tenantSlug: string, code: string, month: string) {
  const { root, rows } = await beScope(tenantSlug, code);
  if (code && code !== "admin" && !root) return null;
  const reps = rows.filter((e) => !isManagerRole(e.role));
  const codes = reps.map((e) => e.employeeCode);
  const [plans, dcrs] = await Promise.all([
    TourPlanModel.find({ tenantSlug, employeeCode: { $in: codes }, month, status: { $nin: ["VOIDED", "REJECTED", "DRAFT"] } }).sort({ createdAt: 1 }).lean() as Promise<any[]>,
    DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).populate("doctorId").lean() as Promise<any[]>
  ]);
  const out = reps.map((e, i) => {
    const planned = new Map<string, { area: string; town: string }>();
    for (const p of plans.filter((x) => x.employeeCode === e.employeeCode)) for (const l of p.locations || []) planned.set(l.date, { area: l.area || "", town: l.town || "" });
    const worked = new Map<string, Map<string, number>>();
    for (const d of dcrs.filter((x) => x.employeeCode === e.employeeCode)) {
      const t = String(d.doctorId?.territory || e.territory || "").trim();
      const m = worked.get(d.visitDateOnly) || new Map<string, number>();
      m.set(t, (m.get(t) || 0) + 1); worked.set(d.visitDateOnly, m);
    }
    const dates = [...new Set([...planned.keys(), ...worked.keys()])].sort();
    const days = dates.map((date) => {
      const pl = planned.get(date);
      const w = worked.get(date);
      const workedTop = w ? [...w.entries()].sort((a, b) => b[1] - a[1])[0][0] : "";
      const plannedLabel = pl ? [pl.area, pl.town].filter(Boolean).join(" - ") : "";
      const match = !!pl && !!w && [...w.keys()].some((t) => [lc(pl.area), lc(pl.town)].includes(lc(t)));
      return { date: dmy(date), planned: plannedLabel, worked: workedTop, deviation: match ? "N" : "Y" };
    });
    return { sno: i + 1, employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, planned: days.filter((d) => d.planned).length, deviations: days.filter((d) => d.deviation === "Y").length, days };
  });
  return { month, employee: root ? { employeeCode: root.employeeCode, name: root.name, designation: root.designation, hq: root.territory } : { employeeCode: "admin", name: "admin", designation: "", hq: "" }, rows: out };
}
