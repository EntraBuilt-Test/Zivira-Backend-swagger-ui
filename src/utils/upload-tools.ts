// Round 48 Part B -- 12 validated, idempotent bulk-upload tools.
//   Options > Customer Upload: Listed Doctor, Chemists, Sample Despatch, Input Despatch, Target
//   Options > Upload:          Salesforce, Stockist, Product, Product Rate, Slide (E-Detailing metadata),
//                              Holiday Fixation, Leave
// Every tool: header check -> per-row validation (row / field / reason) -> import of VALID rows only
// (upsert on a natural key, so re-uploading the same file changes nothing) -> history row.
// Real models only. Dates are dd/mm/yyyy (ISO yyyy-mm-dd and Excel date cells are also accepted).
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { EmployeeModel } from "../models/employee.model.js";
import { UserModel } from "../models/user.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { StockistModel } from "../models/stockist.model.js";
import { ProductModel } from "../models/product.model.js";
import { ProductRateModel } from "../models/product-rate.model.js";
import { HolidayModel } from "../models/holiday.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { LeaveTypeModel } from "../models/leave-type.model.js";
import { DispatchModel } from "../models/dispatch.model.js";
import { DespatchLogModel } from "../models/despatch-log.model.js";
import { UploadHistoryModel } from "../models/upload-history.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { LISTEDDR_HEADERS } from "./r46-reports.js";
import { enumFromTier, TIERS, type Tier } from "./doctor-tier.js";
import { StateModel } from "../models/state.model.js";
import { STUB_SOURCE, STUB_TERRITORY, DESIGNATION_FOR, inferStubRoles, breakStubCycles, nextStubNumber, stubCode, renameEmployeeCode, type StubPlan } from "./manager-stubs.js";

export type RowErr = { row: number; field: string; reason: string };
type Raw = Record<string, unknown>;
type Getter = (header: string) => string;
type Check = { errors: { field: string; reason: string }[]; warnings?: string[]; value?: any; key: string };
type Ctx = any;
// Round 58 -- options chosen on the legacy upload pages (Month/Year, Financial Year, State, Deactivate, Overwrite/Only Insert).
export type UploadOpts = { deactivate?: boolean; mode?: "insert" | "overwrite"; month?: number; year?: number; fy?: number; state?: string };
type Tool = {
  key: string; title: string; group: "Customer Upload" | "Upload"; headers: string[]; required: string[]; dateHeaders: string[];
  note: string;
  /** Legacy sheet name the workbook must contain (case-insensitive). A single-sheet file with a different name is accepted with a warning. */
  sheetName?: string;
  /** norm(alias header) -> canonical header; lets the legacy template column names and the demo-pack names both import. */
  aliases?: Record<string, string>;
  /** all-or-nothing (Target): any bad row blocks the whole upload. */
  allOrNothing?: boolean;
  /** columns / mandatory (yellow) columns / sheet name of the downloadable Excel format file. */
  templateHeaders?: string[]; templateMandatory?: string[]; templateSheet?: string;
  /** "Deactivate Existing ... List" -- deactivates all active rows before the upload re-activates the uploaded ones; returns how many were deactivated. */
  deactivate?: (tenant: string) => Promise<number>;
  load: (tenant: string, opts?: UploadOpts) => Promise<Ctx>;
  check: (g: Getter, ctx: Ctx, rowNo: number, opts?: UploadOpts) => Check;
  apply: (tenant: string, items: { row: number; value: any }[], ctx: Ctx, opts?: UploadOpts) => Promise<{ inserted: number; updated: number; errors: RowErr[]; skipped?: number; warnings?: { row: number; reason: string }[]; outcomes?: { row: number; outcome: "inserted" | "updated" }[]; autoCreated?: { code: string; name: string; role: string; designation: string; reports: number; manager: string | null }[]; merged?: { code: string; name: string }[] }>;
};
const A = (m: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(m).map(([k, v]) => [norm(k), v]));

// ── helpers ───────────────────────────────────────────────────────────────
export const norm = (h: unknown) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const lc = (v: unknown) => S(v).toLowerCase();
/** Person names compare case-, spacing- and punctuation-insensitively ("JAYASANKAR  L" = "Jayasankar L", "A.V. Rao" = "a v rao"). */
export const nm = (v: unknown) => S(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));

// Returns { date } (valid), { date: null } (blank) or { bad: true }.
export function parseDate(v: unknown): { date: Date | null; bad?: boolean } {
  if (typeof v === "number" && Number.isFinite(v)) { // Excel serial
    const d = new Date(Math.round((v - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? { date: null, bad: true } : { date: d };
  }
  const s = S(v);
  if (!s) return { date: null };
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})$/);
  if (mt) {
    d = +mt[1]; m = +mt[2]; y = +mt[3];
    // two-digit year (dd/mm/yy): the 20xx reading unless that lands more than 10 years in the future, then 19xx (78 -> 1978, 27 -> 2027)
    if (mt[3].length === 2) y = 2000 + y > new Date().getUTCFullYear() + 10 ? 1900 + y : 2000 + y;
  }
  else if ((mt = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else return { date: null, bad: true };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return { date: null, bad: true };
  return { date: dt };
}
const dmy = (d: Date | null | undefined) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (s: string): number | null => { if (s === "") return null; const n = Number(s.replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; };
const yes = (s: string, dflt = true) => { const v = lc(s); if (!v) return dflt; if (["yes", "y", "true", "1", "active", "a"].includes(v)) return true; if (["no", "n", "false", "0", "inactive", "i"].includes(v)) return false; return null; };
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = (s: string) => /^[+]?[0-9][0-9\s\-]{5,16}$/.test(s);

type Er = { field: string; reason: string };
function dateField(g: Getter, h: string, errors: Er[], required: boolean): Date | null {
  const raw = g(h);
  const { date, bad } = parseDate(raw);
  if (bad) errors.push({ field: h, reason: `"${raw}" is not a valid date (use dd/mm/yyyy)` });
  else if (!date && required) errors.push({ field: h, reason: "required" });
  return date;
}
function reqd(g: Getter, h: string, errors: Er[]): string {
  const v = g(h);
  if (!v) errors.push({ field: h, reason: "required" });
  return v;
}
type Emp = { employeeCode: string; name: string; designation: string; territory: string; state?: string; division?: string; status?: string; role?: string };
const codeKey = (v: unknown) => lc(v).replace(/[\s\u200b-\u200d\ufeff]+/g, "");
async function loadEmployees(tenant: string) {
  const list = (await EmployeeModel.find({ tenantSlug: tenant }).lean()) as unknown as Emp[];
  const byCode = new Map(list.map((e) => [codeKey(e.employeeCode), e]));
  const byName = new Map<string, Emp[]>();
  for (const e of list) { const k = nm(e.name); byName.set(k, [...(byName.get(k) || []), e]); }
  // login names (users linked to an employee code) resolve to that employee too
  const byLogin = new Map<string, Emp>();
  try {
    for (const u of (await UserModel.find({ tenantSlug: tenant, employeeCode: { $exists: true } }).lean()) as any[]) {
      const e = u.employeeCode ? byCode.get(codeKey(u.employeeCode)) : undefined;
      if (e && u.username) byLogin.set(codeKey(u.username), e);
    }
  } catch { /* user lookup is optional */ }
  return { byCode, byName, byLogin };
}
/** "User Name" / "Employee ID" may hold the employee code (any case, stray spaces), a login name, or the employee's name when that name is unique. */
function empOf(ctx: any, v: string): Emp | null {
  if (!v) return null;
  const hit = ctx.byCode.get(codeKey(v)) || ctx.byLogin?.get(codeKey(v));
  if (hit) return hit;
  const named = ctx.byName?.get(nm(v)) as Emp[] | undefined;
  return named && named.length === 1 ? named[0] : null;
}
type Prod = { code: string; name: string; brand: string; division: string };
async function loadProducts(tenant: string) {
  const byCode = new Map<string, Prod>();
  for (const p of (await ProductModel.find({ tenantSlug: tenant }).lean()) as any[]) {
    if (p.code) byCode.set(lc(p.code), { code: p.code, name: p.productName || p.name || "", brand: p.brandName || "", division: p.division || "" });
  }
  try {
    for (const p of (await getMasterModel("productMaster").find({ tenantSlug: tenant }).lean()) as any[]) {
      if (p.productCode && !byCode.has(lc(p.productCode))) byCode.set(lc(p.productCode), { code: p.productCode, name: p.productName || "", brand: p.brand || "", division: p.division || "" });
    }
  } catch { /* master not configured */ }
  return byCode;
}

/** Update-or-insert on a natural-key filter. Never validates required-ness of untouched legacy fields. */
async function upsert(Model: any, filter: Record<string, unknown>, set: Record<string, unknown>, insertOnly: () => Record<string, unknown> = () => ({})): Promise<"inserted" | "updated"> {
  const existing = (await Model.findOne(filter).lean()) as any;
  if (existing) { await Model.updateOne({ _id: existing._id }, { $set: set }); return "updated"; }
  await Model.create([{ ...filter, ...set, ...insertOnly() }], { validateBeforeSave: false });
  return "inserted";
}
const catching = async (rows: { row: number; value: any }[], fn: (v: any) => Promise<"inserted" | "updated">) => {
  let inserted = 0, updated = 0; const errors: RowErr[] = []; const outcomes: { row: number; outcome: "inserted" | "updated" }[] = [];
  for (const r of rows) {
    try { const o = await fn(r.value); o === "inserted" ? inserted++ : updated++; outcomes.push({ row: r.row, outcome: o }); }
    catch (e) { errors.push({ row: r.row, field: "(save)", reason: e instanceof Error ? e.message : String(e) }); }
  }
  return { inserted, updated, errors, outcomes };
};

// ── 1. Listed Doctor (legacy 66-column Listeddr layout) ───────────────────
const H = LISTEDDR_HEADERS;
const DOCTOR_CLASSES = ["A", "B", "C", "Nil"];
/** Territory type spellings seen in real files: HQ / Headquarter, EX / Ex-HQ / Ex HQ / Ex Headquarter, OS / Out Station / OutStation. Anything else stays invalid. */
export function territoryTypeOf(raw: string): "HQ" | "EX" | "OS" | "" {
  const k = String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (["hq", "headquarter", "headquarters", "headquaters"].includes(k)) return "HQ";
  if (["ex", "exhq", "exheadquarter", "exheadquarters", "exstation", "extension"].includes(k)) return "EX";
  if (["os", "outstation", "outofstation", "outsatation"].includes(k)) return "OS";
  return "";
}
const listedDoctor: Tool = {
  key: "listed-doctor", title: "Listed Doctor Upload Tool", group: "Customer Upload",
  headers: H, required: ["Employee Code", "Listed Dr Name", "Speciality", "Territory"], dateHeaders: ["DOB", "DOW"],
  templateSheet: "Listed Doctor Upload",
  aliases: A({
    "User Name": "Employee Code", "Listed Doctor Name": "Listed Dr Name", "Territory/Cluster(For DCR)": "Territory", "City Name(For Expense)": "City Name",
    "Territory Type": "Territory_type", "Address": "ListedDr_Address1", "EMail ID": "Email", "Mobile No": "Mobile", "Pin Code": "Pincode", "Phone No": "Telephone No",
    "Doctor Business Value": "Business Value", "Expected Business Value": "Exp Business Value", "Reg No": "Register Number", "Avg Patient/day": "Average Number of Patients Per Day",
    "Visiting Days(Sun/Mon/)": "Visiting days", "DOB(DD/MM/YY)": "DOB", "DOW(DD/MM/YY)": "DOW", "Product Code(p1/p2/p3)": "MappedProduct"
  }),
  async deactivate(tenant) { const n = await DoctorModel.countDocuments({ tenantSlug: tenant, status: "ACTIVE" }); await DoctorModel.updateMany({ tenantSlug: tenant, status: "ACTIVE" }, { $set: { status: "INACTIVE" } }); return n; },
  note: "Legacy Listeddr 66-column layout (same columns as the Listeddr dump, so a dump can be re-uploaded). Key = Employee Code + Unique Code (or Listed Dr Name + Territory when no Unique Code). Employee-derived columns (Fieldforce Name, Designation, HQ, DOJ, reporting levels...) are read-only context and are ignored on import.",
  load: loadEmployees,
  check(g, ctx, rowNo) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors);
    const name = reqd(g, "Listed Dr Name", errors);
    const spec = reqd(g, "Speciality", errors);
    const terr = reqd(g, "Territory", errors);
    const emp = empOf(ctx, code);
    // User Name may hold the employee code (any case), the exact full name, or a login-style name ("rahul.sharma" = "Rahul Sharma"); never an invented employee
    if (code && !emp) errors.push({ field: "User Name", reason: `User Name "${code}" not found in Field Force. Use the Employee Code or exact name from the Field Force master` });
    const cat = g("Category");
    let tier: Tier | null = null;
    if (cat) { tier = TIERS.find((t) => lc(t) === lc(cat)) || null; if (!tier) errors.push({ field: "Category", reason: `"${cat}" must be one of ${TIERS.join(", ")}${/^[abc]$/i.test(cat) ? " (A / B / C belong in the Class column)" : ""}` }); }
    const cls = g("Class");
    if (cls && !DOCTOR_CLASSES.some((c) => lc(c) === lc(cls))) errors.push({ field: "Class", reason: "Class must be A, B, C or Nil" });
    const ttRaw = g("Territory_type");
    const tt = ttRaw ? territoryTypeOf(ttRaw) : "";
    if (ttRaw && !tt) errors.push({ field: "Territory_type", reason: `"${ttRaw}" must be HQ, EX (Ex-HQ) or OS (Out Station)` });
    const dob = dateField(g, "DOB", errors, false), dow = dateField(g, "DOW", errors, false);
    const mail = g("Email"); if (mail && !isEmail(mail)) errors.push({ field: "Email", reason: "invalid email address" });
    const mob = g("Mobile"); if (mob && !isPhone(mob)) errors.push({ field: "Mobile", reason: "invalid mobile number" });
    const uniq = g("Unique Code");
    const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const extras: Record<string, string> = {};
    for (const [label, k] of [["Fax", "fax"], ["Website", "website"], ["Hospital State", "hospitalState"], ["No of Visit", "noOfVisit"], ["DAY1", "day1"], ["DAY2", "day2"], ["DAY3", "day3"], ["Others 1", "others1"], ["Others 2", "others2"], ["Others 3", "others3"]]) if (g(label)) extras[k] = g(label);
    const value = {
      employeeCode: emp?.employeeCode || code, empName: emp?.name || "", empState: g("State") || emp?.state || "", name, specialty: spec, territory: terr, doctorCode: uniq || undefined,
      doctorCategory: tier ? enumFromTier(tier) : undefined, category: cls && cls.toLowerCase() !== "nil" ? cls.toUpperCase() : undefined,
      set: {
        qualification: g("Qualification") || null, territoryType: tt || undefined, city: g("City Name") || terr, address1: g("ListedDr_Address1") || null,
        clinicName: g("Hospital Name") || null, hospitalAddress: g("Hospital Address") || null, dob: dob || undefined, anniversaryDate: dow || undefined,
        phone: mob || null, email: mail ? mail.toLowerCase() : null, gender: g("Gender") || null, postalCode: g("Pincode") || null, registrationNo: g("Register Number") || null, telephone: g("Telephone No") || null,
        drPotential: g("Dr_Potential") || null, businessValue: g("Business Value") || null, expBusinessValue: g("Exp Business Value") || null, currentBusiness: g("Current Business") || null,
        communication: g("Communication") || null, workingPlace: g("Working Place") || null, visitingDays: g("Visiting days") || null, iuiCycle: g("IUI Cycle") || null,
        avgPatientsPerDay: g("Average Number of Patients Per Day") || null, classOfPatients: g("Class of Patients") || null, timeOfMeeting: g("Time Of Meeting") || null, consultationFees: g("Consultation_Fees") || null,
        campaign: g("campaign") || null, doctorTypes: split(g("Doctor_Type")), priorityProducts: ["P0", "P1", "P2", "P3", "P4", "P5"].map((p) => g(p)).some(Boolean) ? ["P0", "P1", "P2", "P3", "P4", "P5"].map((p) => g(p)) : undefined,
        mappedProducts: split(g("MappedProduct")),
        country: g("Country") || undefined, uploadExtras: Object.keys(extras).length ? extras : undefined
      }
    };
    return { errors, value, key: `${lc(code)}|${uniq ? lc(uniq) : `${lc(name)}|${lc(terr)}`}` };
  },
  async apply(tenant, items) {
    return catching(items, async (v) => {
      const filter: any = v.doctorCode ? { tenantSlug: tenant, doctorCode: v.doctorCode } : { tenantSlug: tenant, name: v.name, territory: v.territory, mappedEmployeeCode: v.employeeCode };
      const set: any = { ...v.set, name: v.name, specialty: v.specialty, territory: v.territory, state: v.empState || v.territory, mappedEmployeeCode: v.employeeCode, mappedEmployeeName: v.empName, status: "ACTIVE" };
      if (v.doctorCode) set.doctorCode = v.doctorCode;
      if (v.doctorCategory) set.doctorCategory = v.doctorCategory;
      if (v.category) set.category = v.category;
      for (const k of Object.keys(set)) if (set[k] === undefined) delete set[k];
      return upsert(DoctorModel, filter, set);
    });
  }
};

// ── 2. Chemists ───────────────────────────────────────────────────────────
const chemist: Tool = {
  key: "chemist", title: "Chemists Upload Tool", group: "Customer Upload",
  headers: ["Fieldforce Name", "Designation", "HQ", "Employee Code", "Chemists Name", "Class", "Address", "Territory", "Contact Person", "Mobile", "Common Reference Number"],
  required: ["Employee Code", "Chemists Name"], dateHeaders: [], templateSheet: "Chemist Upload",
  aliases: A({
    "User Name": "Employee Code", "Chemist Name": "Chemists Name", "Contact person": "Contact Person", "Mobile No": "Mobile", "Pin Code": "Pin Code"
  }),
  async deactivate(tenant) { const n = await DealerModel.countDocuments({ tenantSlug: tenant, status: "ACTIVE" }); await DealerModel.updateMany({ tenantSlug: tenant, status: "ACTIVE" }, { $set: { status: "INACTIVE" } }); return n; },
  note: "Key = Employee Code + Chemists Name + Territory. Fieldforce Name / Designation / HQ are checked against the employee record and ignored on import.",
  load: loadEmployees,
  check(g, ctx) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors), name = reqd(g, "Chemists Name", errors);
    if (!g("Territory")) errors.push({ field: "Territory", reason: "required" });
    const emp = empOf(ctx, code);
    if (code && !emp) errors.push({ field: "User Name", reason: `User Name "${code}" not found in Field Force. Use the Employee Code or exact name from the Field Force master` });
    const mob = g("Mobile"); if (mob && !isPhone(mob)) errors.push({ field: "Mobile", reason: "invalid mobile number" });
    const mail = g("EMail ID") || g("Email"); if (mail && !isEmail(mail)) errors.push({ field: "EMail ID", reason: "invalid email address" });
    const cls = g("Class"); if (cls && cls.length > 20) errors.push({ field: "Class", reason: "Class must be 20 characters or fewer" });
    const extras: Record<string, string> = {};
    for (let i = 1; i <= 5; i++) if (g(`Others ${i}`)) extras[`others${i}`] = g(`Others ${i}`);
    return { errors, key: `${lc(code)}|${lc(name)}|${lc(g("Territory"))}`, value: { code: emp?.employeeCode || code, empName: emp?.name || "", state: g("State") || emp?.state || null, name, cls, address: g("Address"), territory: g("Territory"), contact: g("Contact Person"), mobile: mob, ref: g("Common Reference Number"),
      category: g("Category"), address2: g("Address 2"), city: g("City Name"), pin: g("Pin Code"), designation: g("Contact Person Designation"), landline: g("Shop landline No"), mail, website: g("Website"), stockistErp: g("Stockist ERP Code"), chemistErp: g("Chemist ERP Code"), extras } };
  },
  async apply(tenant, items) {
    // new chemists get the next Chemist Code (sourceSNo) so the master shows CH001-style codes and keeps its order
    const top = (await DealerModel.find({ tenantSlug: tenant, sourceSNo: { $exists: true } }).sort({ sourceSNo: -1 }).limit(1).lean()) as any[];
    let nextNo = Number(top[0]?.sourceSNo || 0);
    return catching(items, (v) => upsert(DealerModel, { tenantSlug: tenant, employeeCode: v.code, dealerName: v.name, patchName: v.territory || null },
      { employeeName: v.empName, chemistClass: v.cls || null, address: v.address || null, contactPersonName: v.contact || null, dealerPhone: v.mobile || null, commonRefNo: v.ref || null, state: v.state, status: "ACTIVE",
      ...(v.category ? { category: v.category } : {}), ...(v.address2 ? { address2: v.address2 } : {}), ...(v.city ? { city: v.city } : {}), ...(v.pin ? { pincode: v.pin } : {}), ...(v.designation ? { contactDesignation: v.designation } : {}),
      ...(v.landline ? { shopLandline: v.landline } : {}), ...(v.mail ? { dealerEmail: v.mail.toLowerCase() } : {}), ...(v.website ? { website: v.website } : {}), ...(v.stockistErp ? { stockistErpCode: v.stockistErp } : {}), ...(v.chemistErp ? { chemistErpCode: v.chemistErp } : {}),
      ...(Object.keys(v.extras).length ? { uploadExtras: v.extras } : {}) }, () => ({ sourceSNo: ++nextNo })));
  }
};

// ── 3. Stockist ───────────────────────────────────────────────────────────
const stockist: Tool = {
  key: "stockist", title: "Stockist Upload Tool", group: "Upload",
  headers: ["ERP Code", "Stockist Name", "HQ Name", "State", "Emp Code", "Fieldforce Name", "HQ Code"],
  required: ["ERP Code", "Stockist Name", "State"], dateHeaders: [], sheetName: "UPL_Stockist_Master",
  async deactivate(tenant) { const n = await StockistModel.countDocuments({ tenantSlug: tenant, status: "ACTIVE" }); await StockistModel.updateMany({ tenantSlug: tenant, status: "ACTIVE" }, { $set: { status: "INACTIVE" } }); return n; },
  note: "Key = ERP Code. The Stockist master requires an address, which this layout does not carry, so imported stockists have no address until edited.",
  load: loadEmployees,
  check(g, ctx) {
    const errors: Er[] = [];
    const erp = reqd(g, "ERP Code", errors), name = reqd(g, "Stockist Name", errors), state = reqd(g, "State", errors);
    const code = g("Emp Code");
    const emp = code ? ctx.byCode.get(lc(code)) : null;
    const hq = g("HQ Name") || emp?.territory || "";   // HQ Name optional: defaults to the mapped employee's HQ
    if (code && !emp) errors.push({ field: "Emp Code", reason: `employee "${code}" not found` });
    return { errors, key: lc(erp), value: { erp, name, hq, state, empCode: emp?.employeeCode || null, ff: emp?.name || g("Fieldforce Name") || null, hqCode: g("HQ Code") || null } };
  },
  async apply(tenant, items) {
    return catching(items, (v) => upsert(StockistModel, { tenantSlug: tenant, erpCode: v.erp }, { name: v.name, hqName: v.hq, state: v.state, empCode: v.empCode, fieldForceName: v.ff, hqCode: v.hqCode, status: "ACTIVE" }));
  }
};

// ── 4. Salesforce (employee master) ───────────────────────────────────────
export function roleFromDesignation(d: string): string {
  const u = d.toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(NBH|NBM)$/.test(u) || u.includes("NATIONAL")) return "NBH";
  if (/\bZBM\b/.test(u) || u.includes("ZONAL")) return "ZBM";
  if (/\bRBM\b/.test(u) || u.includes("REGIONAL")) return "RBM";
  if (/\bABM\b/.test(u) || u.includes("AREA")) return "ABM";
  if (/^BH$/.test(u) || u.includes("BUSINESS HEAD")) return "BH";
  if (/\b(SR|SENIOR)\b.*\b(BE|MR)\b|\bSR BE\b/.test(u)) return "SR_MR";
  if (/^(BE|MR)$/.test(u) || u.includes("BUSINESS EXECUTIVE") || u.includes("MEDICAL REP")) return "MR";
  return "OTHER";
}
const salesforce: Tool = {
  key: "field-force", title: "Salesforce Upload Tool", group: "Upload",
  headers: ["Employee Code", "Name", "Designation", "HQ", "State", "DOJ", "Reporting Manager Code", "Reporting Manager Name", "Reporting Manager II Name", "Mobile", "Email", "Division", "SubDivision"],
  required: ["Employee Code", "Name", "Designation", "HQ"], dateHeaders: ["DOJ"], sheetName: "UPL_SalesForce",
  async deactivate(tenant) { const n = await EmployeeModel.countDocuments({ tenantSlug: tenant, status: "ACTIVE" }); await EmployeeModel.updateMany({ tenantSlug: tenant, status: "ACTIVE" }, { $set: { status: "INACTIVE" } }); return n; },
  note: "Key = Employee Code. Reporting manager resolved by code, else by name (a manager defined earlier in the same file counts); a manager NAME that exists nowhere gets an auto-created stub (placeholder code MGR-PENDING-NNN, flagged code pending, role inferred from the people reporting to it, its own manager from Reporting Manager II Name); a later row with the real code and the same name takes the stub over; an unknown manager CODE is an error. Role is derived from Designation (unknown designations become OTHER with a warning). Division is stored as SubDivision when given. Reporting Manager II Name is informational (level 2 comes from the manager's own manager). Login credentials are never touched.",
  async load(tenant) { return loadEmployees(tenant); },
  check(g, ctx) {
    const errors: Er[] = []; const warnings: string[] = [];
    const code = reqd(g, "Employee Code", errors), name = reqd(g, "Name", errors), desig = reqd(g, "Designation", errors), hq = reqd(g, "HQ", errors);
    const doj = dateField(g, "DOJ", errors, false);
    const mail = g("Email"); if (mail && !isEmail(mail)) errors.push({ field: "Email", reason: "invalid email address" });
    const mob = g("Mobile"); if (mob && !isPhone(mob)) errors.push({ field: "Mobile", reason: "invalid mobile number" });
    const division = g("SubDivision") || g("Division");
    const mc = g("Reporting Manager Code"), mn = g("Reporting Manager Name"), mn2 = g("Reporting Manager II Name");
    if (code && mc && lc(mc) === lc(code)) errors.push({ field: "Reporting Manager Code", reason: "an employee cannot report to themselves" });
    const role = desig ? roleFromDesignation(desig) : "OTHER";
    if (desig && role === "OTHER") warnings.push(`Designation "${desig}" not recognised; role stored as OTHER`);
    return { errors, warnings, key: lc(code), value: { code, name, desig, hq, state: g("State") || null, doj, mc, mn, mn2, mob, mail, division, role } };
  },
  async apply(tenant, items, ctx0, opts) {
    // 0) a row with a REAL code whose name matches a "code pending" stub takes the stub over (merge, no duplicate): the stub is renamed and every report re-linked
    const merged: { code: string; name: string }[] = [];
    const stubs = (await EmployeeModel.find({ tenantSlug: tenant, codePending: true }).lean()) as any[];
    for (const it of items) {
      const v = it.value;
      if (ctx0.byCode.has(lc(v.code))) continue;
      const hit = stubs.filter((st) => nm(st.name) === nm(v.name) && st.codePending);
      if (hit.length !== 1) continue;
      try {
        await renameEmployeeCode(tenant, hit[0].employeeCode, v.code, { codePending: false, autoCreatedSource: null });
        merged.push({ code: v.code, name: v.name }); hit[0].codePending = false;
      } catch { /* clash etc.: falls through to the normal insert/update */ }
    }
    const ctx: any = merged.length ? await loadEmployees(tenant) : ctx0;
    // resolve managers against DB + this file
    const fileByCode = new Map(items.map((i) => [lc(i.value.code), i.value]));
    const fileByName = new Map<string, any[]>();
    for (const i of items) fileByName.set(nm(i.value.name), [...(fileByName.get(nm(i.value.name)) || []), i.value]);
    // a literal placeholder such as "admin" / "NA" / "vacant" in a manager column is not a person: no stub, no link (disclosed in the result)
    const PLACEHOLDER = /^(admin|administrator|na|n a|nil|none|vacant|tbd|-+)$/i;
    const skippedPlaceholders = new Set<string>();
    const lookup = (name: string): { code: string | null; ambiguous?: string[] } => {
      const db = ctx.byName.get(nm(name)) || [], fl = fileByName.get(nm(name)) || [];
      const all = [...new Set([...db.map((e: any) => e.employeeCode), ...fl.map((e: any) => e.code)])];
      return all.length === 1 ? { code: all[0] } : all.length ? { code: null, ambiguous: all } : { code: null };
    };
    // stubs wanted: key -> plan (a manager NAME that exists nowhere)
    const plans = new Map<string, StubPlan>();
    const planFor = (name: string, division: string): StubPlan => {
      const key = nm(name);
      let p = plans.get(key);
      if (!p) { p = { key, name: name.trim(), division, reportRoles: [], mn2: "", mgrKey: null, mgrCode: null, role: "ABM", code: "" }; plans.set(key, p); }
      return p;
    };
    const resolve = (v: any): { code: string | null; stubKey?: string; err?: string } => {
      if (v.mc) {
        const hit = ctx.byCode.get(lc(v.mc)) || fileByCode.get(lc(v.mc));
        return hit ? { code: hit.employeeCode || hit.code } : { code: null, err: `reporting manager code "${v.mc}" not found` };
      }
      if (v.mn) {
        const r = lookup(v.mn);
        if (r.code) return { code: r.code };
        if (r.ambiguous) return { code: null, err: `reporting manager name "${v.mn}" is ambiguous (${r.ambiguous.join(", ")})` };
        if (PLACEHOLDER.test(v.mn.trim().replace(/[^A-Za-z/ -]/g, " ").replace(/\s+/g, " ").trim())) { skippedPlaceholders.add(v.mn.trim()); return { code: null }; }
        const p = planFor(v.mn, v.division || "General");
        p.reportRoles.push(v.role);
        if (v.mn2 && !p.mn2) p.mn2 = v.mn2;
        return { code: null, stubKey: p.key };
      }
      return { code: null };
    };
    const errors: RowErr[] = []; const ok: typeof items = []; const warnings: { row: number; reason: string }[] = [];
    const mgr = new Map<number, string | null>(); const stubOf = new Map<number, string>();
    for (const it of items) {
      const r = resolve(it.value);
      if (r.err) errors.push({ row: it.row, field: it.value.mc ? "Reporting Manager Code" : "Reporting Manager Name", reason: r.err });
      else { if (r.stubKey) stubOf.set(it.row, r.stubKey); mgr.set(it.row, r.code); ok.push(it); }
    }
    // a pending stub that this file's rows report to must be ACTIVE (e.g. after "Deactivate Existing Field Force List")
    const usedStubs = [...new Set([...mgr.values()].filter((c): c is string => !!c))];
    for (let i = 0; i < usedStubs.length && i < 200; i++) {   // and the stubs above them
      const up = (await EmployeeModel.findOne({ tenantSlug: tenant, codePending: true, employeeCode: usedStubs[i] }).lean()) as any;
      if (up?.reportingManager && !usedStubs.includes(up.reportingManager)) usedStubs.push(up.reportingManager);
    }
    if (usedStubs.length) await EmployeeModel.updateMany({ tenantSlug: tenant, codePending: true, employeeCode: { $in: usedStubs } }, { $set: { status: "ACTIVE" } });
    // the stubs' own managers ("Reporting Manager II Name"): an existing/file person, another stub, or one more stub (chain closes in a few passes)
    for (let pass = 0; pass < 6; pass++) {
      let grew = false;
      for (const p of [...plans.values()]) {
        if (!p.mn2 || p.mgrKey || p.mgrCode || nm(p.mn2) === p.key) continue;
        const r = lookup(p.mn2);
        if (r.code) p.mgrCode = r.code;
        else if (!r.ambiguous && PLACEHOLDER.test(p.mn2.trim().replace(/[^A-Za-z/ -]/g, " ").replace(/\s+/g, " ").trim())) skippedPlaceholders.add(p.mn2.trim());
        else if (!r.ambiguous) { const before = plans.size; const up = planFor(p.mn2, p.division); p.mgrKey = up.key; if (plans.size > before) grew = true; }
      }
      if (!grew) break;
    }
    breakStubCycles(plans);
    inferStubRoles(plans);
    // create the stubs (placeholder code, ACTIVE, flagged), then point their reports at them
    const autoCreated: { code: string; name: string; role: string; designation: string; reports: number; manager: string | null }[] = [];
    if (plans.size) {
      let n = await nextStubNumber(tenant);
      for (const p of plans.values()) p.code = stubCode(n++);
      for (const p of plans.values()) {
        const mgrCode = p.mgrCode || (p.mgrKey ? plans.get(p.mgrKey)!.code : null);
        const designation = DESIGNATION_FOR[p.role] || "Manager";
        try {
          await EmployeeModel.create([{ tenantSlug: tenant, employeeCode: p.code, name: p.name, designation, role: p.role, division: p.division || "General", territory: STUB_TERRITORY, reportingManager: mgrCode, status: "ACTIVE", codePending: true, autoCreatedSource: STUB_SOURCE }], { validateBeforeSave: false });
        } catch (e) { warnings.push({ row: 0, reason: `could not create manager "${p.name}": ${e instanceof Error ? e.message : String(e)}` }); continue; }
        autoCreated.push({ code: p.code, name: p.name, role: p.role, designation, reports: [...stubOf.values()].filter((k) => k === p.key).length, manager: mgrCode });
      }
      for (const [row, key] of stubOf) { const c = plans.get(key)?.code || null; mgr.set(row, c && autoCreated.some((x) => x.code === c) ? c : null); }
      if (autoCreated.length) warnings.push({ row: 0, reason: `${autoCreated.length} manager(s) auto-created, code pending (${autoCreated.map((a) => `${a.code} ${a.name}`).join("; ")}). Complete their details in the Field Force master; uploading a row with the real code and the same name will take the placeholder over.` });
    }
    if (skippedPlaceholders.size) warnings.push({ row: 0, reason: `manager value(s) ${[...skippedPlaceholders].map((x) => `"${x}"`).join(", ")} look like placeholders, not people - no manager stub was created for them` });
    if (merged.length) warnings.push({ row: 0, reason: `${merged.length} pending manager(s) completed by this file: ${merged.map((m) => `${m.name} -> ${m.code}`).join("; ")}` });
    const res = await catching(ok, (v) => {
      const row = items.find((i) => i.value === v)!.row;
      return upsert(EmployeeModel, { tenantSlug: tenant, employeeCode: v.code }, {
        name: v.name, designation: v.desig, territory: v.hq, role: v.role, division: v.division || "General", state: v.state, joinDate: v.doj || undefined,
        reportingManager: mgr.get(row) || null, phone: v.mob || null, email: v.mail ? v.mail.toLowerCase() : null,
        ...(opts?.deactivate ? { status: "ACTIVE" } : {})
      }).then(async (r) => { if (r === "inserted") await EmployeeModel.updateOne({ tenantSlug: tenant, employeeCode: v.code }, { $set: { status: "ACTIVE" } }); return r; });
    });
    return { inserted: res.inserted, updated: res.updated, errors: [...errors, ...res.errors], warnings, autoCreated, merged };
  }
};

// ── 5. Product ────────────────────────────────────────────────────────────
const product: Tool = {
  key: "product", title: "Product Upload Tool", group: "Upload",
  headers: ["Product Code", "Product Name", "Brand", "Pack", "Division", "Category", "Active", "Group"],
  required: ["Product Code", "Product Name"], dateHeaders: [], sheetName: "UPL_Product_Master",
  templateHeaders: ["Product Code", "Product Name", "Group", "Category", "Brand", "Pack", "Division", "Active"], templateMandatory: ["Product Code", "Product Name"],
  async deactivate(tenant) { const n = await ProductModel.countDocuments({ tenantSlug: tenant, status: "ACTIVE" }); await ProductModel.updateMany({ tenantSlug: tenant, status: "ACTIVE" }, { $set: { status: "INACTIVE" } }); return n; },
  note: "Key = Product Code (an existing product with the same Brand + Product Name and no code is adopted). Also mirrored into the Product Master screen.",
  load: async () => ({}),
  check(g) {
    const errors: Er[] = [];
    const code = reqd(g, "Product Code", errors), name = reqd(g, "Product Name", errors), cat = g("Category");
    const act = yes(g("Active")); if (act === null) errors.push({ field: "Active", reason: `"${g("Active")}" must be Yes or No` });
    return { errors, key: lc(code), value: { code, name, brand: g("Brand"), pack: g("Pack"), division: g("Division"), cat, group: g("Group"), active: act !== false } };
  },
  async apply(tenant, items) {
    const Mirror = getMasterModel("productMaster");
    return catching(items, async (v) => {
      let filter: any = { tenantSlug: tenant, code: v.code };
      if (!(await ProductModel.findOne(filter).lean())) {
        const legacy = (await ProductModel.findOne({ tenantSlug: tenant, productName: v.name, brandName: v.brand || null }).lean()) as any;
        if (legacy && !legacy.code) filter = { tenantSlug: tenant, _id: legacy._id };
      }
      const r = await upsert(ProductModel, filter, { code: v.code, name: v.name, productName: v.name, brandName: v.brand || null, pack: v.pack || null, division: v.division || "", category: v.cat || "", ...(v.group ? { group: v.group } : {}), status: v.active ? "ACTIVE" : "INACTIVE" });
      await upsert(Mirror, { tenantSlug: tenant, productCode: v.code }, { productName: v.name, brand: v.brand || null, division: v.division || "", pack: v.pack || null, status: v.active ? "Active" : "Inactive" });
      return r;
    });
  }
};

// ── 6. Product Rate ───────────────────────────────────────────────────────
let rateIndexSynced = false;
/** The unique index now includes stateName; drop the pre-Round-58 (tenant, product, date) index once per process. */
async function ensureRateIndex() {
  if (rateIndexSynced) return;
  rateIndexSynced = true;
  try { if (typeof (ProductRateModel as any).syncIndexes === "function") await (ProductRateModel as any).syncIndexes(); } catch { /* index sync is best-effort */ }
}
const productRate: Tool = {
  key: "product-rate", title: "Product Rate Upload", group: "Upload",
  headers: ["Product Code", "Product Name", "PTR", "PTS", "MRP", "Effective From"],
  required: ["Product Code", "PTR", "Effective From"], dateHeaders: ["Effective From"], templateSheet: "UPL_Product_Rate",
  note: "Key = State + Product Code + Effective From (rate history is kept per state). The product's flat rate (used for POB / Rx values) is the PTR of the latest rate effective on or before today in its reference state = the state with rates for it that has the most active field force (tie: the state uploaded first); PTR is the assumed basis for 'rate'.",
  async load(tenant) { return { products: await loadProducts(tenant) }; },
  check(g, ctx, _row, opts) {
    const errors: Er[] = [];
    const code = reqd(g, "Product Code", errors);
    const p = code ? ctx.products.get(lc(code)) : null;
    if (code && !p) errors.push({ field: "Product Code", reason: `product "${code}" not found (upload the Product first)` });
    const nm = g("Product Name"); if (p && nm && lc(nm) !== lc(p.name)) errors.push({ field: "Product Name", reason: `does not match product ${code} ("${p.name}")` });
    const n = (h: string, required: boolean) => { const v = num(g(h)); if (v === null) { if (required) errors.push({ field: h, reason: "required" }); return null; } if (Number.isNaN(v) || v < 0) { errors.push({ field: h, reason: `"${g(h)}" must be a number of 0 or more` }); return null; } return v; };
    const ptr = n("PTR", true), pts = n("PTS", false), mrp = n("MRP", false);
    const eff = dateField(g, "Effective From", errors, true);
    return { errors, key: `${lc(code)}|${eff ? iso(eff) : ""}`, value: { code: p?.code || code, name: p?.name || nm, ptr, pts, mrp, eff, state: S(opts?.state) } };
  },
  async apply(tenant, items, _ctx, opts) {
    await ensureRateIndex();
    const state = S(opts?.state);
    const res = await catching(items, (v) => upsert(ProductRateModel, { tenantSlug: tenant, productCode: v.code, stateName: state, effectiveFrom: v.eff }, { productName: v.name, ptr: v.ptr, pts: v.pts, mrp: v.mrp }));
    // Product.rate (flat rate used by POB / Rx valuation) = the latest effective PTR (on or before today) of the REFERENCE STATE of that product:
    // the state, among those that have a rate for it, with the most ACTIVE field force (Employee.state); a tie goes to the state whose rates were uploaded first.
    const today = new Date();
    const emps = (await EmployeeModel.find({ tenantSlug: tenant, status: "ACTIVE" }).lean()) as any[];
    const headcount = new Map<string, number>();
    for (const e of emps) { const k = nm(e.state); if (k) headcount.set(k, (headcount.get(k) || 0) + 1); }
    for (const code of new Set(items.map((i) => i.value.code))) {
      const all = (await ProductRateModel.find({ tenantSlug: tenant, productCode: code }).lean()) as any[];
      const named = [...new Set(all.map((r) => S(r.stateName)).filter(Boolean))];
      const firstUpload = (s: string) => Math.min(...all.filter((r) => S(r.stateName) === s).map((r) => +new Date(r.createdAt || r.effectiveFrom)));
      const ref = named.length ? [...named].sort((a, b) => (headcount.get(nm(b)) || 0) - (headcount.get(nm(a)) || 0) || firstUpload(a) - firstUpload(b) || a.localeCompare(b))[0] : "";
      const rates = all.filter((r) => S(r.stateName) === ref && new Date(r.effectiveFrom) <= today).sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom));
      if (rates[0] && typeof rates[0].ptr === "number") await ProductModel.updateMany({ tenantSlug: tenant, code }, { $set: { rate: rates[0].ptr, rateState: ref || null } });
    }
    return res;
  }
};

// ── 7. Slide Upload (E-Detailing metadata) ────────────────────────────────
const slide: Tool = {
  key: "slides-upload", title: "Slide Upload - E-Detailing", group: "Upload",
  headers: ["Brand", "Product", "Slide Name", "Order", "File Name", "Active"],
  required: ["Brand", "Slide Name", "File Name"], dateHeaders: [],
  note: "Imports slide METADATA into the E-Detailing slide list (key = Brand + File Name). Attach the actual files with the multi-file picker afterwards; each file is matched to a row by File Name.",
  async load(tenant) { return { products: await loadProducts(tenant) }; },
  check(g) {
    const errors: Er[] = [];
    const brand = reqd(g, "Brand", errors), sn = reqd(g, "Slide Name", errors), fn = reqd(g, "File Name", errors);
    const ord = num(g("Order")); if (ord !== null && (Number.isNaN(ord) || !Number.isInteger(ord) || ord < 0)) errors.push({ field: "Order", reason: "must be a whole number" });
    const act = yes(g("Active")); if (act === null) errors.push({ field: "Active", reason: "must be Yes or No" });
    return { errors, key: `${lc(brand)}|${lc(fn)}`, value: { brand, product: g("Product"), sn, order: ord ?? null, fn, active: act !== false } };
  },
  async apply(tenant, items, ctx) {
    const Slides = getMasterModel("slideUploadEDetailing");
    return catching(items, (v) => {
      const p = [...ctx.products.values()].find((x: Prod) => lc(x.name) === lc(v.product) && (!v.brand || !x.brand || lc(x.brand) === lc(v.brand))) as Prod | undefined;
      return upsert(Slides, { tenantSlug: tenant, brand: v.brand, fileName: v.fn }, { productName: v.product || null, slideName: v.sn, order: v.order, active: v.active, division: p?.division || "", uploadedOn: new Date(), status: v.active ? "Active" : "Inactive" });
    });
  }
};

// ── 8. Holiday ────────────────────────────────────────────────────────────
const holiday: Tool = {
  key: "holiday-fixation", title: "Holiday Fixation Bulk Upload", group: "Upload",
  headers: ["Date", "Holiday Name", "State", "HQ", "Type"],
  required: ["Date", "Holiday Name", "State"], dateHeaders: ["Date"], sheetName: "UPL_Holiday_Fixation",
  note: "Key = State + Date + HQ. HQ and Type are stored on the holiday record; day-status logic applies holidays per State (HQ-specific holidays are stored but not yet applied per HQ).",
  load: async () => ({}),
  check(g) {
    const errors: Er[] = [];
    const date = dateField(g, "Date", errors, true), name = reqd(g, "Holiday Name", errors), state = reqd(g, "State", errors);
    return { errors, key: `${lc(state)}|${date ? iso(date) : ""}|${lc(g("HQ"))}`, value: { date, name, state, hq: g("HQ"), type: g("Type") } };
  },
  async apply(tenant, items) {
    return catching(items, (v) => upsert(HolidayModel, { tenantSlug: tenant, stateName: v.state, otherHolidayDate: v.date, hq: v.hq || null }, { otherHolidayDescription: v.name, holidayType: v.type || null, status: "ACTIVE" }));
  }
};

// ── 9. Leave ──────────────────────────────────────────────────────────────
const leave: Tool = {
  key: "leave-bulk-upload", title: "Leave Upload", group: "Upload",
  headers: ["Employee Code", "Leave Type", "From Date", "To Date", "Days", "Reason", "Status"],
  required: ["Employee Code", "Leave Type", "From Date", "To Date"], dateHeaders: ["From Date", "To Date"], sheetName: "Leave_Upload",
  note: "Key = Employee Code + Leave Type + From Date + To Date. Leave Type must exist in the Leave Type master. Days default to the inclusive day count; Status defaults to Approved.",
  async load(tenant) {
    const types = ((await LeaveTypeModel.find({ tenantSlug: tenant }).lean()) as any[]).map((t) => t.leaveTypeDesc as string);
    return { ...(await loadEmployees(tenant)), types };
  },
  check(g, ctx, _row, opts) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors), lt = reqd(g, "Leave Type", errors);
    const emp = code ? ctx.byCode.get(lc(code)) : null;
    if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
    const type = ctx.types.find((t: string) => lc(t) === lc(lt));
    if (lt && !type) errors.push({ field: "Leave Type", reason: `"${lt}" is not in the Leave Type master (${ctx.types.join(", ") || "none defined"})` });
    const from = dateField(g, "From Date", errors, true), to = dateField(g, "To Date", errors, true);
    if (from && to && to < from) errors.push({ field: "To Date", reason: "is before From Date" });
    if (opts?.fy && from && to) { // Financial Year = April of the chosen year to March of the next
      const lo = Date.UTC(opts.fy, 3, 1), hi = Date.UTC(opts.fy + 1, 2, 31);
      if (+from < lo || +from > hi) errors.push({ field: "From Date", reason: `is outside financial year ${opts.fy} - ${opts.fy + 1}` });
      else if (+to > hi) errors.push({ field: "To Date", reason: `is outside financial year ${opts.fy} - ${opts.fy + 1}` });
    }
    let days = num(g("Days"));
    if (days !== null && (Number.isNaN(days) || days <= 0)) { errors.push({ field: "Days", reason: "must be a positive number" }); days = null; }
    if (days === null && from && to && to >= from) days = Math.round((+to - +from) / 86400000) + 1;
    const st = lc(g("Status") || "approved");
    const status = st === "approved" ? "APPROVED" : st === "pending" ? "PENDING" : st === "rejected" ? "REJECTED" : null;
    if (!status) errors.push({ field: "Status", reason: `"${g("Status")}" must be Approved, Pending or Rejected` });
    return { errors, key: `${lc(code)}|${lc(lt)}|${from ? iso(from) : ""}|${to ? iso(to) : ""}`, value: { code: emp?.employeeCode || code, type: type || lt, from, to, days, reason: g("Reason"), status } };
  },
  async apply(tenant, items) {
    return catching(items, (v) => upsert(LeaveApplicationModel, { tenantSlug: tenant, employeeCode: v.code, leaveType: v.type, fromDate: v.from, toDate: v.to },
      { days: v.days, reason: v.reason || "Bulk uploaded by Admin", isLWP: ["lop", "lwp"].includes(lc(v.type)), status: v.status, ...(v.status === "APPROVED" ? { approvedBy: "ADMIN_BULK_UPLOAD", approvedAt: new Date() } : {}) }));
  }
};

// ── 10. Target ────────────────────────────────────────────────────────────
function parseMonth(s: string): number | null {
  const n = Number(s); if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const i = MONTHS_SHORT.findIndex((m) => lc(m) === lc(s).slice(0, 3)); return s && i >= 0 && MONTHS_LONG[i].toLowerCase().startsWith(lc(s)) ? i + 1 : null;
}
/** Financial year starting April of `fy`: month keys "fy-04" .. "fy+1-03". */
const fyKeys = (fy: number) => Array.from({ length: 12 }, (_, i) => { const m = ((i + 3) % 12) + 1; return `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, "0")}`; });
const target: Tool = {
  key: "target", title: "Target Upload", group: "Customer Upload",
  headers: ["Employee Code", "Month", "Year", "Product Code", "Target Qty", "Target Value", "Target Rate"],
  required: ["Employee Code", "Month", "Product Code", "Target Qty"], dateHeaders: [], allOrNothing: true, templateSheet: "Upl_Target_Master",
  templateHeaders: ["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"], templateMandatory: ["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"],
  aliases: A({ "HQ Code": "Employee Code", "Sale ERP Code": "Product Code", "Employee ID": "Employee Code" }),
  note: "Key = Employee Code (HQ Code) + Month + Year + Product Code (Sale ERP Code). Writes the Target Master for the chosen Financial Year (all-or-nothing; the Financial Year's existing targets are replaced). Target Value defaults to Qty x Rate; Unit Price = Rate (or Value / Qty).",
  async load(tenant) { return { ...(await loadEmployees(tenant)), products: await loadProducts(tenant) }; },
  check(g, ctx, _row, opts) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors), pc = reqd(g, "Product Code", errors);
    const emp = empOf(ctx, code);
    if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
    const p = pc ? ctx.products.get(lc(pc)) : null;
    if (pc && !p) errors.push({ field: "Product Code", reason: `product "${pc}" not found` });
    const mRaw = reqd(g, "Month", errors); const m = mRaw ? parseMonth(mRaw) : null;
    if (mRaw && !m) errors.push({ field: "Month", reason: `"${mRaw}" is not a month (1-12 or name)` });
    const yRaw = g("Year"); let y = Number(yRaw);
    if (yRaw) { if (!(Number.isInteger(y) && y >= 2000 && y <= 2100)) errors.push({ field: "Year", reason: "must be a 4-digit year" }); }
    else if (opts?.fy && m) y = m >= 4 ? opts.fy : opts.fy + 1; // month alone fixes the year inside a financial year
    else errors.push({ field: "Year", reason: "required" });
    if (opts?.fy && m && Number.isInteger(y) && !fyKeys(opts.fy).includes(`${y}-${String(m).padStart(2, "0")}`)) errors.push({ field: "Month", reason: `${MONTHS_SHORT[m - 1]} ${y} is outside financial year ${opts.fy} - ${opts.fy + 1}` });
    const q = num(g("Target Qty")); if (g("Target Qty") === "") errors.push({ field: "Target Qty", reason: "required" }); else if (Number.isNaN(q) || (q as number) < 0) errors.push({ field: "Target Qty", reason: "must be a number of 0 or more" });
    let val = num(g("Target Value")); if (val !== null && (Number.isNaN(val) || val < 0)) { errors.push({ field: "Target Value", reason: "must be a number of 0 or more" }); val = null; }
    const rate = num(g("Target Rate")); if (rate !== null && (Number.isNaN(rate) || rate < 0)) errors.push({ field: "Target Rate", reason: "must be a number of 0 or more" });
    const rateOk = rate !== null && !Number.isNaN(rate) ? rate : null;
    if (val === null && rateOk !== null && q !== null && !Number.isNaN(q)) val = Math.round(rateOk * (q as number) * 100) / 100;
    return { errors, key: `${lc(code)}|${y}-${m}|${lc(pc)}`, value: { code: emp?.employeeCode || code, emp, p, m, y, q, val, rate: rateOk } };
  },
  async apply(tenant, items, _ctx, opts) {
    const Targets = getMasterModel("targetMaster");
    if (opts?.fy) await Targets.deleteMany({ tenantSlug: tenant, monthKey: { $in: fyKeys(opts.fy) } });   // re-upload of the Financial Year replaces it
    return catching(items, (v) => {
      const monthKey = `${v.y}-${String(v.m).padStart(2, "0")}`;
      return upsert(Targets, { tenantSlug: tenant, employeeCode: v.code, monthKey, productCode: v.p.code }, {
        fieldForceName: v.emp?.name || "", hq: v.emp?.territory || "", division: v.emp?.division || v.p.division || "", product: v.p.name, month: MONTHS_LONG[v.m - 1], year: String(v.y),
        targetUnit: v.q, unitPrice: v.rate !== null ? v.rate : v.val !== null && v.q ? Math.round((v.val / v.q) * 100) / 100 : null, targetValue: v.val, status: "Active"
      });
    });
  }
};

// ── 11 / 12. Despatch (Sample / Input) ────────────────────────────────────
function despatchTool(type: "SAMPLE" | "INPUT"): Tool {
  const itemHeader = type === "SAMPLE" ? "Product Code" : "Input Item";
  return {
    key: type === "SAMPLE" ? "sample" : "input", title: type === "SAMPLE" ? "Sample Despatch Upload" : "Input Despatch Upload", group: "Customer Upload",
    headers: ["Employee Code", itemHeader, "Qty", "Despatch Date", "Docket/LR No", "Courier"], required: ["Employee Code", itemHeader, "Qty"], dateHeaders: ["Despatch Date"],
    sheetName: type === "SAMPLE" ? "Upl_Despatch_Master" : undefined, templateSheet: "Upl_Despatch_Master",
    templateHeaders: type === "SAMPLE" ? ["Employee ID", "Sample ERP Code", "Despatch Qty"] : ["Employee ID", "Input Code", "Despatch Qty"],
    templateMandatory: type === "SAMPLE" ? ["Employee ID", "Sample ERP Code", "Despatch Qty"] : ["Employee ID", "Input Code", "Despatch Qty"],
    aliases: A(type === "SAMPLE" ? { "Employee ID": "Employee Code", "Sample ERP Code": "Product Code", "Despatch Qty": "Qty" } : { "Employee ID": "Employee Code", "Input Code": "Input Item", "Despatch Qty": "Qty", "Input Qty": "Qty" }),
    note: type === "SAMPLE"
      ? "Key = Employee Code + Product Code + Despatch Date + Docket/LR No. Feeds the field-force Inventory (receive) screen and the admin Sample Dispatch View/Status. Qty already received on a re-uploaded line is kept."
      : "Key = Employee Code + Input Item + Despatch Date + Docket/LR No. Input Item may be an input code or name from the Input master. Feeds the field-force Inventory and the admin Input Dispatch View/Status.",
    async load(tenant) {
      const base = await loadEmployees(tenant);
      if (type === "SAMPLE") return { ...base, products: await loadProducts(tenant) };
      let inputs: { code: string; name: string }[] = [];
      try { inputs = ((await getMasterModel("inputMaster").find({ tenantSlug: tenant }).lean()) as any[]).map((r) => ({ code: String(r.inputCode || ""), name: String(r.inputName || "") })); } catch { /* none */ }
      return { ...base, inputs };
    },
    check(g, ctx, _row, opts) {
      const errors: Er[] = [];
      const code = reqd(g, "Employee Code", errors), it = reqd(g, itemHeader, errors);
      const emp = empOf(ctx, code);
      if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
      let item: { code: string; name: string } | null = null;
      if (it) {
        if (type === "SAMPLE") { const p = ctx.products.get(lc(it)); if (p) item = { code: p.code, name: p.name }; }
        else item = ctx.inputs.find((i: any) => lc(i.code) === lc(it) || lc(i.name) === lc(it)) || null;
        if (!item) errors.push({ field: itemHeader, reason: `"${it}" not found in the ${type === "SAMPLE" ? "Product" : "Input"} master` });
      }
      const q = num(g("Qty")); if (g("Qty") === "") errors.push({ field: "Qty", reason: "required" }); else if (Number.isNaN(q) || (q as number) < 0 || !Number.isInteger(q)) errors.push({ field: "Qty", reason: "must be a whole number of 0 or more" });
      // With Month/Year chosen on the page the date is optional (defaults to the 1st of that month) and must fall inside it.
      const pick = opts?.month && opts?.year;
      let date = dateField(g, "Despatch Date", errors, !pick);
      if (pick) {
        if (!date && !errors.some((e) => e.field === "Despatch Date")) date = new Date(Date.UTC(opts!.year!, opts!.month! - 1, 1));
        else if (date && (date.getUTCMonth() + 1 !== opts!.month || date.getUTCFullYear() !== opts!.year)) errors.push({ field: "Despatch Date", reason: `must fall in ${MONTHS_SHORT[opts!.month! - 1]} ${opts!.year} (the selected Month / Year)` });
      }
      const docket = g("Docket/LR No");
      return { errors, key: `${lc(code)}|${lc(item?.code || it)}|${date ? iso(date) : ""}|${lc(docket)}`, value: { code: emp?.employeeCode || code, empName: emp?.name || "", item, q, date, docket, courier: g("Courier") } };
    },
    async apply(tenant, items, _ctx, opts) {
      const groups = new Map<string, { row: number; value: any }[]>();
      let skipped = 0;
      for (const i of items) { const k = `${i.value.code}|${MONTHS_SHORT[i.value.date.getUTCMonth()]}|${i.value.date.getUTCFullYear()}`; groups.set(k, [...(groups.get(k) || []), i]); }
      let inserted = 0, updated = 0; const errors: RowErr[] = [];
      for (const [, rows] of groups) {
        const first = rows[0].value; const month = MONTHS_SHORT[first.date.getUTCMonth()], year = String(first.date.getUTCFullYear());
        try {
          const batch = (await DispatchModel.findOne({ tenantSlug: tenant, employeeCode: first.code, type, month, year }).lean()) as any;
          const previous: any[] = batch ? [...batch.items] : [];
          // "OverWrite with Existing Records": the month's lines for this employee are replaced by the file (received qty / remarks of identical lines are carried over).
          const lines: any[] = opts?.mode === "overwrite" ? [] : [...previous];
          const same = (l: any, v: any) => l.code === v.item.code && l.despatchDate && iso(new Date(l.despatchDate)) === iso(v.date) && (l.docketNo || "") === v.docket;
          for (const r of rows) {
            const v = r.value;
            const idx = lines.findIndex((l) => same(l, v));
            if (idx >= 0 && opts?.mode === "insert") { skipped++; continue; }   // "Only Insert": existing lines stay untouched
            const old = idx >= 0 ? lines[idx] : previous.find((l) => same(l, v));
            const line = { code: v.item.code, name: v.item.name, dispatchQty: v.q, receivedQty: old ? old.receivedQty ?? null : null, remarks: old ? old.remarks ?? null : null, despatchDate: v.date, docketNo: v.docket || null, courier: v.courier || null };
            if (idx >= 0) { lines[idx] = line; updated++; } else { lines.push(line); old ? updated++ : inserted++; }
          }
          const dispatchDate = batch?.dispatchDate || rows[0].value.date;
          if (batch) await DispatchModel.updateOne({ _id: batch._id }, { $set: { items: lines, employeeName: first.empName } });
          else await DispatchModel.create([{ tenantSlug: tenant, employeeCode: first.code, employeeName: first.empName, type, month, year, dispatchDate, items: lines, receivedDate: null, status: "Pending" }], { validateBeforeSave: false });
          // mirror into the admin Despatch View/Status log (one row per item per month)
          const monthKey = `${year}-${String(first.date.getUTCMonth() + 1).padStart(2, "0")}`;
          for (const name of new Set(lines.map((l) => l.name))) {
            const qty = lines.filter((l) => l.name === name).reduce((s, l) => s + (l.dispatchQty || 0), 0);
            await upsert(DespatchLogModel, { tenantSlug: tenant, despatchType: type, employeeCode: first.code, month: monthKey, itemName: name }, { despatchQty: qty, closingBalance: qty, despatchDate: dispatchDate });
          }
        } catch (e) {
          for (const r of rows) errors.push({ row: r.row, field: "(save)", reason: e instanceof Error ? e.message : String(e) });
        }
      }
      return { inserted, updated, errors, skipped };
    }
  };
}

export const TOOLS: Tool[] = [listedDoctor, chemist, despatchTool("SAMPLE"), despatchTool("INPUT"), target, salesforce, stockist, product, productRate, slide, holiday, leave];
export const getTool = (key: string) => TOOLS.find((t) => t.key === key);

// ── file parsing (server) ─────────────────────────────────────────────────
export class SheetNameError extends Error {}
/**
 * Reads the workbook. When `sheetName` is given (legacy "Sheet Name Must be 'X'") the sheet is looked up case-insensitively.
 * A workbook with exactly one sheet under another name (e.g. "Sheet1", as in the demo data pack) is accepted and a note is returned
 * (the column check that follows still has to pass); any other workbook without that sheet throws SheetNameError.
 */
export function parseBuffer(buf: Buffer, sheetName?: string, known?: Set<string>): { headers: string[]; rows: Raw[]; sheetNote?: string } {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  let name = wb.SheetNames[0]; let sheetNote: string | undefined;
  // Real Excel files: an instructions sheet before the data sheet, or a title line above the headers. When the caller knows the tool's column names, take the sheet and row that hold them.
  if (known && !sheetName) {
    let best = { score: 0, sheet: name, at: 0 };
    for (const n of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "", blankrows: false });
      grid.slice(0, 10).forEach((r, at) => { const score = r.filter((c) => known.has(norm(c))).length; if (score > best.score) best = { score, sheet: n, at }; });
    }
    if (best.score >= 3) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[best.sheet], { header: 1, raw: true, defval: "", blankrows: false }).slice(best.at);
      const headers = (aoa[0] || []).map((h) => S(h));
      return { headers, rows: aoa.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))), sheetNote: best.sheet !== wb.SheetNames[0] || best.at > 0 ? `Read the columns from sheet '${best.sheet}', row ${best.at + 1}.` : undefined };
    }
  }
  if (sheetName) {
    const hit = wb.SheetNames.find((n) => lc(n) === lc(sheetName));
    if (hit) name = hit;
    else if (wb.SheetNames.length === 1) sheetNote = `The sheet is named '${wb.SheetNames[0]}'; the legacy format requires the sheet name '${sheetName}'. Accepted because the file has a single sheet - rename it to '${sheetName}' for future uploads.`;
    else throw new SheetNameError(`Sheet Name Must be '${sheetName}'`);
  }
  const ws = wb.Sheets[name];
  if (!ws) return { headers: [], rows: [], sheetNote };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: false });
  const headers = (aoa[0] || []).map((h) => S(h));
  const rows = aoa.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows, sheetNote };
}

// ── Excel format files (templates) ─────────────────────────────────────────
const YELLOW = "FFFFFF00";
async function buildSheet(sheet: string, headers: string[], mandatory: string[], rows: unknown[][] = [], dateCols: string[] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(headers);
  headers.forEach((h, i) => {
    const c = ws.getRow(1).getCell(i + 1);
    c.font = { bold: true };
    if (mandatory.some((m) => norm(m) === norm(h))) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };   // mandatory column = yellow
    ws.getColumn(i + 1).width = Math.max(14, h.length + 3);
    if (dateCols.some((d) => norm(d) === norm(h))) ws.getColumn(i + 1).numFmt = "@";
  });
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** The "Excel Format File - Download Here" workbook: legacy sheet name, mandatory columns in yellow. */
/** Normalised column names (and aliases) a tool understands. */
export const knownHeaders = (tool: Tool) => new Set([...tool.headers.map(norm), ...Object.keys(tool.aliases || {}), ...(GENERATE_COLUMNS[tool.key] || []).map((c) => norm(c.label))]);

export async function templateWorkbook(tool: Tool, tenant: string, opts: UploadOpts = {}): Promise<Buffer> {
  const headers = tool.templateHeaders || tool.headers;
  const mandatory = tool.templateMandatory || tool.required;
  const sheet = tool.sheetName || tool.templateSheet || "Upload";
  if (tool.key === "product-rate") {      // state-wise rate template: every active product, current rate of that state pre-filled when one exists
    const products = (await ProductModel.find({ tenantSlug: tenant, status: "ACTIVE" }).lean()) as any[];
    const state = S(opts.state);
    const rates = state ? ((await ProductRateModel.find({ tenantSlug: tenant, stateName: state }).lean()) as any[]) : [];
    const today = new Date();
    const latest = (code: string) => rates.filter((r) => r.productCode === code && new Date(r.effectiveFrom) <= today).sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom))[0];
    const seen = new Set<string>(); const rows: unknown[][] = [];
    for (const p of products.sort((a, b) => String(a.productName || a.name).localeCompare(String(b.productName || b.name)))) {
      const code = S(p.code); if (!code || seen.has(lc(code))) continue; seen.add(lc(code));
      const r = latest(code);
      rows.push([code, p.productName || p.name || "", r?.ptr ?? "", r?.pts ?? "", r?.mrp ?? "", r ? dmy(new Date(r.effectiveFrom)) : ""]);
    }
    return buildSheet(sheet, headers, mandatory, rows, ["Effective From"]);
  }
  return buildSheet(sheet, headers, mandatory, [], tool.dateHeaders);
}

/** Selectable columns of the two "Generate Excel" tools (legacy checkbox grids, in screen order, row by row). */
export const GENERATE_COLUMNS: Record<string, { label: string; mandatory: boolean; red?: boolean }[]> = {
  "listed-doctor": [
    ...["SI No", "User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "City Name(For Expense)", "Speciality", "Category", "Qualification", "Class", "Territory Type", "Address"].map((label) => ({ label, mandatory: true, red: true })),
    { label: "Hospital Name", mandatory: false }, { label: "Hospital Address", mandatory: false }, { label: "DOB(DD/MM/YY)", mandatory: false }, { label: "DOW(DD/MM/YY)", mandatory: false },
    { label: "EMail ID", mandatory: true, red: true }, { label: "Phone No", mandatory: false }, { label: "Mobile No", mandatory: true, red: true },
    { label: "Gender", mandatory: true, red: true }, { label: "No of Visit", mandatory: false }, { label: "State", mandatory: true, red: true },
    ...["Fax", "Website", "Pin Code", "Doctor Business Value", "Expected Business Value", "Product Code(p1/p2/p3)", "Country", "Hospital State", "DAY1", "DAY2", "DAY3", "Geo Tag Count", "Unique Code", "Reg No", "Avg Patient/day", "Visiting Days(Sun/Mon/)", "Others 1", "Others 2", "Others 3"].map((label) => ({ label, mandatory: false }))
  ],
  chemist: [
    ...["SI No", "User Name", "Chemist Name", "Territory"].map((label) => ({ label, mandatory: true })),
    ...["Category", "Class", "Address", "Address 2", "City Name", "Pin Code", "Contact person", "Contact Person Designation", "Mobile No", "Shop landline No", "EMail ID", "Website", "Stockist ERP Code", "Chemist ERP Code", "State", "Others 1", "Others 2", "Others 3", "Others 4", "Others 5"].map((label) => ({ label, mandatory: false }))
  ]
};
// The "Excel Format File - Download Here" of these two tools is the mandatory-column format of their Generate Excel grid (the 66-column Listeddr dump layout and the demo-pack layouts still import).
for (const k of ["listed-doctor", "chemist"]) { const t = getTool(k)!; t.templateHeaders = GENERATE_COLUMNS[k].filter((c) => c.mandatory).map((c) => c.label); t.templateMandatory = t.templateHeaders; }
export function generateWorkbook(toolKey: string, selected: string[]): Promise<Buffer> {
  const all = GENERATE_COLUMNS[toolKey];
  if (!all) throw new Error(`No Generate Excel for ${toolKey}`);
  const want = new Set(selected.map((x) => norm(x)));
  const unknown = selected.filter((x) => !all.some((c) => norm(c.label) === norm(x)));
  if (unknown.length) throw new Error(`Unknown column(s): ${unknown.join(", ")}`);
  const cols = all.filter((c) => c.mandatory || want.has(norm(c.label)));   // mandatory columns are always included
  return buildSheet(toolKey === "listed-doctor" ? "Listed Doctor Upload" : "Chemist Upload", cols.map((c) => c.label), cols.filter((c) => c.mandatory).map((c) => c.label));
}

// ── validate / import ─────────────────────────────────────────────────────
export type Validation = {
  fileErrors: string[]; total: number; valid: number; invalid: number; errors: RowErr[]; warnings: { row: number; reason: string }[];
  preview: { row: number; cells: string[]; errors: string[] }[];
};
type FailedRow = { row: number; cells: Raw; reasons: string[] };
/** Maps alias headers (legacy template names) onto the canonical headers the checkers read. First non-blank value wins. */
function canonicalise(tool: Tool, headersIn: string[], rows: Raw[]): { headers: string[]; rows: Raw[] } {
  if (!tool.aliases) return { headers: headersIn, rows };
  const canon = (h: string) => tool.aliases![norm(h)] ?? h;
  const headers = [...new Set(headersIn.map(canon))];
  return { headers, rows: rows.map((r) => { const o: Raw = {}; for (const [k, v] of Object.entries(r)) { const c = canon(k); if (!(c in o) || S(o[c]) === "") o[c] = v; } return o; }) };
}
export async function validateRows(tool: Tool, tenant: string, headersIn: string[], rowsIn: Raw[], previewLimit = 50, opts: UploadOpts = {}) {
  const { headers, rows } = canonicalise(tool, headersIn, rowsIn);
  const headerMap = new Map(headers.map((h) => [norm(h), h]));
  const missing = tool.required.filter((h) => !headerMap.has(norm(h)));
  const out: Validation = { fileErrors: missing.length ? [`Missing required column(s): ${missing.join(", ")}`] : [], total: 0, valid: 0, invalid: 0, errors: [], warnings: [], preview: [] };
  if (tool.key === "product-rate" && !S(opts.state)) out.fileErrors.push("Select the State Name first");
  if (tool.key === "target" && !opts.fy) out.warnings.push({ row: 0, reason: "No Financial Year chosen: Year column is required in every row and existing targets are not replaced" });
  const items: { row: number; value: any }[] = [];
  const failed: FailedRow[] = [];
  if (out.fileErrors.length) return { out, items, ctx: null as Ctx, failed };
  const ctx = await tool.load(tenant, opts);
  // an empty Field Force master makes every row fail for the same reason: say so once instead of rejecting each row
  if (["listed-doctor", "chemist"].includes(tool.key) && ctx?.byCode && ctx.byCode.size === 0) {
    out.fileErrors.push("The Field Force master has no employees for this company, so User Name cannot be matched. Upload the Salesforce file (Upload > Salesforce) or add the employees first, then upload the file again.");
    return { out, items, ctx, failed };
  }
  const seen = new Map<string, number>();
  rows.forEach((raw, i) => {
    const rowNo = i + 2;
    const byNorm = new Map(Object.entries(raw).map(([k, v]) => [norm(k), v]));
    if (![...byNorm.values()].some((v) => S(v) !== "")) return; // blank row
    out.total++;
    const g: Getter = (h) => S(byNorm.get(norm(h)));
    const rawG = (h: string) => byNorm.get(norm(h));
    // dates arrive as Excel serial numbers when typed as dates: expose them as dd/mm/yyyy text to the checker
    const gd: Getter = (h) => { if (tool.dateHeaders.includes(h)) { const v = rawG(h); if (typeof v === "number") { const d = parseDate(v).date; return d ? dmy(d) : S(v); } } return g(h); };
    const res = tool.check(gd, ctx, rowNo, opts);
    const errs = [...res.errors];
    if (errs.length === 0) {
      const dupe = seen.get(res.key);
      if (dupe) errs.push({ field: "(key)", reason: `duplicate of row ${dupe} (same ${tool.title} key); only the first is imported` });
      else seen.set(res.key, rowNo);
    }
    for (const w of res.warnings || []) out.warnings.push({ row: rowNo, reason: w });
    if (errs.length) { out.invalid++; for (const e of errs) out.errors.push({ row: rowNo, ...e }); failed.push({ row: rowNo, cells: rowsIn[i], reasons: errs.map((e) => `${e.field}: ${e.reason}`) }); }
    else { out.valid++; items.push({ row: rowNo, value: res.value }); }
    if (out.preview.length < previewLimit) out.preview.push({ row: rowNo, cells: tool.headers.map((h) => { const v = rawG(h); return typeof v === "number" && tool.dateHeaders.includes(h) ? gd(h) : S(v); }), errors: errs.map((e) => `${e.field}: ${e.reason}`) });
  });
  return { out, items, ctx, failed };
}

/** "Not Uploaded List": the rows that were not uploaded, with their original cells and the reason. Base64 .xlsx. */
function notUploadedList(headersIn: string[], failed: FailedRow[]): string {
  const aoa = [[...headersIn, "Reason"], ...failed.slice(0, 5000).map((f) => [...headersIn.map((h) => f.cells[h] ?? ""), f.reasons.join("; ")])];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Not Uploaded List");
  return (XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer).toString("base64");
}

export async function importRows(tool: Tool, tenant: string, who: string, fileName: string, headersIn: string[], rows: Raw[], opts: UploadOpts = {}, sheetNote?: string) {
  const startedAt = new Date().toISOString();
  const { out, items, ctx, failed } = await validateRows(tool, tenant, headersIn, rows, 0, opts);
  if (sheetNote) out.warnings.unshift({ row: 0, reason: sheetNote });
  let inserted = 0, updated = 0, skipped = 0, deactivated = 0; const saveErrors: RowErr[] = [];
  let autoCreated: any[] | undefined, merged: any[] | undefined, outcomes: { row: number; outcome: "inserted" | "updated" }[] | undefined;
  const blocked = out.fileErrors.length > 0 || (!!tool.allOrNothing && out.invalid > 0) || (tool.allOrNothing && out.total === 0);
  if (!blocked && items.length) {
    if (opts.deactivate && tool.deactivate) deactivated = await tool.deactivate(tenant);
    const r = await tool.apply(tenant, items, ctx, opts);
    inserted = r.inserted; updated = r.updated; skipped = r.skipped || 0; saveErrors.push(...r.errors); out.warnings.push(...(r.warnings || [])); autoCreated = r.autoCreated; merged = r.merged; outcomes = r.outcomes;
  }
  const failedRows = new Set([...out.errors, ...saveErrors].map((e) => e.row));
  const errors = [...out.errors, ...saveErrors].sort((a, b) => a.row - b.row);
  const uploaded = !blocked && items.length > 0;
  const outcome = out.fileErrors.length ? out.fileErrors[0]
    : tool.allOrNothing && out.invalid > 0 ? `Upload failed - ${out.invalid} record(s) have errors; nothing was uploaded (see the Not Uploaded List)`
    : !out.total ? "The file has no data rows"
    : failedRows.size === 0 ? "Successful" : `${failedRows.size} record(s) not uploaded (see the Not Uploaded List)`;
  const saveFailed: FailedRow[] = saveErrors.map((e) => ({ row: e.row, cells: rows[e.row - 2] || {}, reasons: [`${e.field}: ${e.reason}`] }));
  const allFailed = [...failed, ...saveFailed];
  const summary = { fileName, total: out.total, ok: out.total - failedRows.size, failed: failedRows.size, inserted, updated, skipped, deactivated, uploaded, outcome, fileErrors: out.fileErrors, errors, warnings: out.warnings, autoCreatedManagers: autoCreated || [], mergedManagers: merged || [] };
  // The table the admin page opens under the result: the columns of the uploaded file as read, one line per row with what happened to it.
  const reasonsOf = new Map<number, string[]>();
  for (const e of errors) reasonsOf.set(e.row, [...(reasonsOf.get(e.row) || []), `${e.field ? `${e.field}: ` : ""}${e.reason}`]);
  const outcomeOf = new Map((outcomes || []).map((o) => [o.row, o.outcome]));
  const cellText = (v: unknown) => (v instanceof Date ? dmy(v) : S(v));
  const RESULT_ROWS_MAX = 1000;
  const resultTable = {
    columns: headersIn,
    truncated: rows.length > RESULT_ROWS_MAX,
    rows: rows.slice(0, RESULT_ROWS_MAX).map((raw, i) => {
      const row = i + 2;
      const reasons = reasonsOf.get(row);
      const status = reasons ? "Rejected" : outcomeOf.get(row) === "inserted" ? "Inserted" : outcomeOf.get(row) === "updated" ? "Updated" : blocked ? "Not uploaded" : "Uploaded";
      return { row, status, reason: reasons ? reasons.join("; ") : "", cells: headersIn.map((h) => cellText(raw[h])) };
    })
  };
  const hist = await UploadHistoryModel.create({ tenantSlug: tenant, toolKey: tool.key, fileName, uploadedBy: who, totalRows: summary.total, okRows: summary.ok, failedRows: summary.failed, inserted, updated, fileErrors: out.fileErrors, rowErrors: errors.slice(0, 1000) });
  return { ...summary, startedAt, resultTable, historyId: String((hist as any)._id), notUploaded: allFailed.length ? { fileName: "Not_Uploaded_List.xlsx", base64: notUploadedList(headersIn, allFailed) } : null };
}
