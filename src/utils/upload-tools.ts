// Round 48 Part B -- 12 validated, idempotent bulk-upload tools.
//   Options > Customer Upload: Listed Doctor, Chemists, Sample Despatch, Input Despatch, Target
//   Options > Upload:          Salesforce, Stockist, Product, Product Rate, Slide (E-Detailing metadata),
//                              Holiday Fixation, Leave
// Every tool: header check -> per-row validation (row / field / reason) -> import of VALID rows only
// (upsert on a natural key, so re-uploading the same file changes nothing) -> history row.
// Real models only. Dates are dd/mm/yyyy (ISO yyyy-mm-dd and Excel date cells are also accepted).
import * as XLSX from "xlsx";
import { EmployeeModel } from "../models/employee.model.js";
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

export type RowErr = { row: number; field: string; reason: string };
type Raw = Record<string, unknown>;
type Getter = (header: string) => string;
type Check = { errors: { field: string; reason: string }[]; warnings?: string[]; value?: any; key: string };
type Ctx = any;
type Tool = {
  key: string; title: string; group: "Customer Upload" | "Upload"; headers: string[]; required: string[]; dateHeaders: string[];
  note: string;
  load: (tenant: string) => Promise<Ctx>;
  check: (g: Getter, ctx: Ctx, rowNo: number) => Check;
  apply: (tenant: string, items: { row: number; value: any }[], ctx: Ctx) => Promise<{ inserted: number; updated: number; errors: RowErr[] }>;
};

// ── helpers ───────────────────────────────────────────────────────────────
export const norm = (h: unknown) => String(h ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const S = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const lc = (v: unknown) => S(v).toLowerCase();
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
  let mt = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
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
async function loadEmployees(tenant: string) {
  const list = (await EmployeeModel.find({ tenantSlug: tenant }).lean()) as unknown as Emp[];
  const byCode = new Map(list.map((e) => [lc(e.employeeCode), e]));
  const byName = new Map<string, Emp[]>();
  for (const e of list) { const k = lc(e.name); byName.set(k, [...(byName.get(k) || []), e]); }
  return { byCode, byName };
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
async function upsert(Model: any, filter: Record<string, unknown>, set: Record<string, unknown>): Promise<"inserted" | "updated"> {
  const existing = (await Model.findOne(filter).lean()) as any;
  if (existing) { await Model.updateOne({ _id: existing._id }, { $set: set }); return "updated"; }
  await Model.create([{ ...filter, ...set }], { validateBeforeSave: false });
  return "inserted";
}
const catching = async (rows: { row: number; value: any }[], fn: (v: any) => Promise<"inserted" | "updated">) => {
  let inserted = 0, updated = 0; const errors: RowErr[] = [];
  for (const r of rows) {
    try { (await fn(r.value)) === "inserted" ? inserted++ : updated++; }
    catch (e) { errors.push({ row: r.row, field: "(save)", reason: e instanceof Error ? e.message : String(e) }); }
  }
  return { inserted, updated, errors };
};

// ── 1. Listed Doctor (legacy 66-column Listeddr layout) ───────────────────
const H = LISTEDDR_HEADERS;
const DOCTOR_CLASSES = ["A", "B", "C", "Nil"];
const listedDoctor: Tool = {
  key: "listed-doctor", title: "Listed Doctor Upload Tool", group: "Customer Upload",
  headers: H, required: ["Employee Code", "Listed Dr Name", "Speciality", "Territory"], dateHeaders: ["DOB", "DOW"],
  note: "Legacy Listeddr 66-column layout (same columns as the Listeddr dump, so a dump can be re-uploaded). Key = Employee Code + Unique Code (or Listed Dr Name + Territory when no Unique Code). Employee-derived columns (Fieldforce Name, Designation, HQ, DOJ, reporting levels...) are read-only context and are ignored on import.",
  load: loadEmployees,
  check(g, ctx, rowNo) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors);
    const name = reqd(g, "Listed Dr Name", errors);
    const spec = reqd(g, "Speciality", errors);
    const terr = reqd(g, "Territory", errors);
    const emp = code ? ctx.byCode.get(lc(code)) : null;
    if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
    const cat = g("Category");
    let tier: Tier | null = null;
    if (cat) { tier = TIERS.find((t) => lc(t) === lc(cat)) || null; if (!tier) errors.push({ field: "Category", reason: `"${cat}" must be one of ${TIERS.join(", ")}` }); }
    const cls = g("Class");
    if (cls && !DOCTOR_CLASSES.some((c) => lc(c) === lc(cls))) errors.push({ field: "Class", reason: `"${cls}" must be A, B, C or Nil` });
    const tt = g("Territory_type");
    if (tt && !["HQ", "EX", "OS"].includes(tt.toUpperCase())) errors.push({ field: "Territory_type", reason: `"${tt}" must be HQ, EX or OS` });
    const dob = dateField(g, "DOB", errors, false), dow = dateField(g, "DOW", errors, false);
    const mail = g("Email"); if (mail && !isEmail(mail)) errors.push({ field: "Email", reason: "invalid email address" });
    const mob = g("Mobile"); if (mob && !isPhone(mob)) errors.push({ field: "Mobile", reason: "invalid mobile number" });
    const uniq = g("Unique Code");
    const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    const value = {
      employeeCode: emp?.employeeCode || code, empName: emp?.name || "", empState: emp?.state || "", name, specialty: spec, territory: terr, doctorCode: uniq || undefined,
      doctorCategory: tier ? enumFromTier(tier) : undefined, category: cls && cls.toLowerCase() !== "nil" ? cls.toUpperCase() : undefined,
      set: {
        qualification: g("Qualification") || null, territoryType: tt ? tt.toUpperCase() : undefined, city: g("City Name") || terr, address1: g("ListedDr_Address1") || null,
        clinicName: g("Hospital Name") || null, hospitalAddress: g("Hospital Address") || null, dob: dob || undefined, anniversaryDate: dow || undefined,
        phone: mob || null, email: mail ? mail.toLowerCase() : null, gender: g("Gender") || null, postalCode: g("Pincode") || null, registrationNo: g("Register Number") || null, telephone: g("Telephone No") || null,
        drPotential: g("Dr_Potential") || null, businessValue: g("Business Value") || null, expBusinessValue: g("Exp Business Value") || null, currentBusiness: g("Current Business") || null,
        communication: g("Communication") || null, workingPlace: g("Working Place") || null, visitingDays: g("Visiting days") || null, iuiCycle: g("IUI Cycle") || null,
        avgPatientsPerDay: g("Average Number of Patients Per Day") || null, classOfPatients: g("Class of Patients") || null, timeOfMeeting: g("Time Of Meeting") || null, consultationFees: g("Consultation_Fees") || null,
        campaign: g("campaign") || null, doctorTypes: split(g("Doctor_Type")), priorityProducts: ["P0", "P1", "P2", "P3", "P4", "P5"].map((p) => g(p)).some(Boolean) ? ["P0", "P1", "P2", "P3", "P4", "P5"].map((p) => g(p)) : undefined,
        mappedProducts: split(g("MappedProduct"))
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
  required: ["Employee Code", "Chemists Name"], dateHeaders: [],
  note: "Key = Employee Code + Chemists Name + Territory. Fieldforce Name / Designation / HQ are checked against the employee record and ignored on import.",
  load: loadEmployees,
  check(g, ctx) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors), name = reqd(g, "Chemists Name", errors);
    const emp = code ? ctx.byCode.get(lc(code)) : null;
    if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
    const mob = g("Mobile"); if (mob && !isPhone(mob)) errors.push({ field: "Mobile", reason: "invalid mobile number" });
    const cls = g("Class"); if (cls && cls.length > 20) errors.push({ field: "Class", reason: "too long" });
    return { errors, key: `${lc(code)}|${lc(name)}|${lc(g("Territory"))}`, value: { code: emp?.employeeCode || code, empName: emp?.name || "", state: emp?.state || null, name, cls, address: g("Address"), territory: g("Territory"), contact: g("Contact Person"), mobile: mob, ref: g("Common Reference Number") } };
  },
  async apply(tenant, items) {
    return catching(items, (v) => upsert(DealerModel, { tenantSlug: tenant, employeeCode: v.code, dealerName: v.name, patchName: v.territory || null },
      { employeeName: v.empName, chemistClass: v.cls || null, address: v.address || null, contactPersonName: v.contact || null, dealerPhone: v.mobile || null, commonRefNo: v.ref || null, state: v.state, status: "ACTIVE" }));
  }
};

// ── 3. Stockist ───────────────────────────────────────────────────────────
const stockist: Tool = {
  key: "stockist", title: "Stockist Upload Tool", group: "Upload",
  headers: ["ERP Code", "Stockist Name", "HQ Name", "State", "Emp Code", "Fieldforce Name", "HQ Code"],
  required: ["ERP Code", "Stockist Name", "HQ Name", "State"], dateHeaders: [],
  note: "Key = ERP Code. The Stockist master requires an address, which this layout does not carry, so imported stockists have no address until edited.",
  load: loadEmployees,
  check(g, ctx) {
    const errors: Er[] = [];
    const erp = reqd(g, "ERP Code", errors), name = reqd(g, "Stockist Name", errors), hq = reqd(g, "HQ Name", errors), state = reqd(g, "State", errors);
    const code = g("Emp Code");
    const emp = code ? ctx.byCode.get(lc(code)) : null;
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
  required: ["Employee Code", "Name", "Designation", "HQ"], dateHeaders: ["DOJ"],
  note: "Key = Employee Code. Reporting manager resolved by code, else by name (a manager defined earlier in the same file counts); unresolved managers are errors. Role is derived from Designation (unknown designations become OTHER with a warning). Division is stored as SubDivision when given. Reporting Manager II Name is informational (level 2 comes from the manager's own manager). Login credentials are never touched.",
  async load(tenant) { return loadEmployees(tenant); },
  check(g, ctx) {
    const errors: Er[] = []; const warnings: string[] = [];
    const code = reqd(g, "Employee Code", errors), name = reqd(g, "Name", errors), desig = reqd(g, "Designation", errors), hq = reqd(g, "HQ", errors);
    const doj = dateField(g, "DOJ", errors, false);
    const mail = g("Email"); if (mail && !isEmail(mail)) errors.push({ field: "Email", reason: "invalid email address" });
    const mob = g("Mobile"); if (mob && !isPhone(mob)) errors.push({ field: "Mobile", reason: "invalid mobile number" });
    const division = g("SubDivision") || g("Division");
    const mc = g("Reporting Manager Code"), mn = g("Reporting Manager Name");
    if (code && mc && lc(mc) === lc(code)) errors.push({ field: "Reporting Manager Code", reason: "an employee cannot report to themselves" });
    const role = desig ? roleFromDesignation(desig) : "OTHER";
    if (desig && role === "OTHER") warnings.push(`Designation "${desig}" not recognised; role stored as OTHER`);
    return { errors, warnings, key: lc(code), value: { code, name, desig, hq, state: g("State") || null, doj, mc, mn, mob, mail, division, role } };
  },
  async apply(tenant, items, ctx) {
    // resolve managers against DB + this file
    const fileByCode = new Map(items.map((i) => [lc(i.value.code), i.value]));
    const fileByName = new Map<string, any[]>();
    for (const i of items) fileByName.set(lc(i.value.name), [...(fileByName.get(lc(i.value.name)) || []), i.value]);
    const resolve = (v: any): { code: string | null; err?: string } => {
      if (v.mc) {
        const hit = ctx.byCode.get(lc(v.mc)) || fileByCode.get(lc(v.mc));
        return hit ? { code: hit.employeeCode || hit.code } : { code: null, err: `reporting manager code "${v.mc}" not found` };
      }
      if (v.mn) {
        const db = ctx.byName.get(lc(v.mn)) || [], fl = fileByName.get(lc(v.mn)) || [];
        const all = [...new Set([...db.map((e: any) => e.employeeCode), ...fl.map((e: any) => e.code)])];
        if (all.length === 1) return { code: all[0] };
        return { code: null, err: all.length ? `reporting manager name "${v.mn}" is ambiguous (${all.join(", ")})` : `reporting manager "${v.mn}" not found` };
      }
      return { code: null };
    };
    const errors: RowErr[] = []; const ok: typeof items = [];
    const mgr = new Map<number, string | null>();
    for (const it of items) {
      const r = resolve(it.value);
      if (r.err) errors.push({ row: it.row, field: it.value.mc ? "Reporting Manager Code" : "Reporting Manager Name", reason: r.err }); else { mgr.set(it.row, r.code); ok.push(it); }
    }
    const res = await catching(ok, (v) => {
      const row = items.find((i) => i.value === v)!.row;
      return upsert(EmployeeModel, { tenantSlug: tenant, employeeCode: v.code }, {
        name: v.name, designation: v.desig, territory: v.hq, role: v.role, division: v.division || "General", state: v.state, joinDate: v.doj || undefined,
        reportingManager: mgr.get(row) || null, phone: v.mob || null, email: v.mail ? v.mail.toLowerCase() : null
      }).then(async (r) => { if (r === "inserted") await EmployeeModel.updateOne({ tenantSlug: tenant, employeeCode: v.code }, { $set: { status: "ACTIVE" } }); return r; });
    });
    return { inserted: res.inserted, updated: res.updated, errors: [...errors, ...res.errors] };
  }
};

// ── 5. Product ────────────────────────────────────────────────────────────
const product: Tool = {
  key: "product", title: "Product Upload Tool", group: "Upload",
  headers: ["Product Code", "Product Name", "Brand", "Pack", "Division", "Category", "Active"],
  required: ["Product Code", "Product Name", "Category"], dateHeaders: [],
  note: "Key = Product Code (an existing product with the same Brand + Product Name and no code is adopted). Also mirrored into the Product Master screen.",
  load: async () => ({}),
  check(g) {
    const errors: Er[] = [];
    const code = reqd(g, "Product Code", errors), name = reqd(g, "Product Name", errors), cat = reqd(g, "Category", errors);
    const act = yes(g("Active")); if (act === null) errors.push({ field: "Active", reason: `"${g("Active")}" must be Yes or No` });
    return { errors, key: lc(code), value: { code, name, brand: g("Brand"), pack: g("Pack"), division: g("Division"), cat, active: act !== false } };
  },
  async apply(tenant, items) {
    const Mirror = getMasterModel("productMaster");
    return catching(items, async (v) => {
      let filter: any = { tenantSlug: tenant, code: v.code };
      if (!(await ProductModel.findOne(filter).lean())) {
        const legacy = (await ProductModel.findOne({ tenantSlug: tenant, productName: v.name, brandName: v.brand || null }).lean()) as any;
        if (legacy && !legacy.code) filter = { tenantSlug: tenant, _id: legacy._id };
      }
      const r = await upsert(ProductModel, filter, { code: v.code, name: v.name, productName: v.name, brandName: v.brand || null, pack: v.pack || null, division: v.division || "", category: v.cat, status: v.active ? "ACTIVE" : "INACTIVE" });
      await upsert(Mirror, { tenantSlug: tenant, productCode: v.code }, { productName: v.name, brand: v.brand || null, division: v.division || "", pack: v.pack || null, status: v.active ? "Active" : "Inactive" });
      return r;
    });
  }
};

// ── 6. Product Rate ───────────────────────────────────────────────────────
const productRate: Tool = {
  key: "product-rate", title: "Product Rate Upload", group: "Upload",
  headers: ["Product Code", "Product Name", "PTR", "PTS", "MRP", "Effective From"],
  required: ["Product Code", "PTR", "Effective From"], dateHeaders: ["Effective From"],
  note: "Key = Product Code + Effective From (rate history is kept). The product's current rate (used for POB / Rx values) is set to the PTR of the latest rate effective on or before today; PTR is the assumed basis for 'rate'.",
  async load(tenant) { return { products: await loadProducts(tenant) }; },
  check(g, ctx) {
    const errors: Er[] = [];
    const code = reqd(g, "Product Code", errors);
    const p = code ? ctx.products.get(lc(code)) : null;
    if (code && !p) errors.push({ field: "Product Code", reason: `product "${code}" not found (upload the Product first)` });
    const nm = g("Product Name"); if (p && nm && lc(nm) !== lc(p.name)) errors.push({ field: "Product Name", reason: `does not match product ${code} ("${p.name}")` });
    const n = (h: string, required: boolean) => { const v = num(g(h)); if (v === null) { if (required) errors.push({ field: h, reason: "required" }); return null; } if (Number.isNaN(v) || v < 0) { errors.push({ field: h, reason: `"${g(h)}" must be a number of 0 or more` }); return null; } return v; };
    const ptr = n("PTR", true), pts = n("PTS", false), mrp = n("MRP", false);
    const eff = dateField(g, "Effective From", errors, true);
    return { errors, key: `${lc(code)}|${eff ? iso(eff) : ""}`, value: { code: p?.code || code, name: p?.name || nm, ptr, pts, mrp, eff } };
  },
  async apply(tenant, items) {
    const res = await catching(items, (v) => upsert(ProductRateModel, { tenantSlug: tenant, productCode: v.code, effectiveFrom: v.eff }, { productName: v.name, ptr: v.ptr, pts: v.pts, mrp: v.mrp }));
    const today = new Date();
    for (const code of new Set(items.map((i) => i.value.code))) {
      const rates = ((await ProductRateModel.find({ tenantSlug: tenant, productCode: code }).lean()) as any[]).filter((r) => new Date(r.effectiveFrom) <= today).sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom));
      if (rates[0] && typeof rates[0].ptr === "number") await ProductModel.updateMany({ tenantSlug: tenant, code }, { $set: { rate: rates[0].ptr } });
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
  required: ["Date", "Holiday Name", "State"], dateHeaders: ["Date"],
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
  required: ["Employee Code", "Leave Type", "From Date", "To Date"], dateHeaders: ["From Date", "To Date"],
  note: "Key = Employee Code + Leave Type + From Date + To Date. Leave Type must exist in the Leave Type master. Days default to the inclusive day count; Status defaults to Approved.",
  async load(tenant) {
    const types = ((await LeaveTypeModel.find({ tenantSlug: tenant }).lean()) as any[]).map((t) => t.leaveTypeDesc as string);
    return { ...(await loadEmployees(tenant)), types };
  },
  check(g, ctx) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors), lt = reqd(g, "Leave Type", errors);
    const emp = code ? ctx.byCode.get(lc(code)) : null;
    if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
    const type = ctx.types.find((t: string) => lc(t) === lc(lt));
    if (lt && !type) errors.push({ field: "Leave Type", reason: `"${lt}" is not in the Leave Type master (${ctx.types.join(", ") || "none defined"})` });
    const from = dateField(g, "From Date", errors, true), to = dateField(g, "To Date", errors, true);
    if (from && to && to < from) errors.push({ field: "To Date", reason: "is before From Date" });
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
const target: Tool = {
  key: "target", title: "Target Upload", group: "Customer Upload",
  headers: ["Employee Code", "Month", "Year", "Product Code", "Target Qty", "Target Value"],
  required: ["Employee Code", "Month", "Year", "Product Code", "Target Qty"], dateHeaders: [],
  note: "Key = Employee Code + Month + Year + Product Code. Writes the Target Master. Unit Price is derived as Target Value / Target Qty when both are given.",
  async load(tenant) { return { ...(await loadEmployees(tenant)), products: await loadProducts(tenant) }; },
  check(g, ctx) {
    const errors: Er[] = [];
    const code = reqd(g, "Employee Code", errors), pc = reqd(g, "Product Code", errors);
    const emp = code ? ctx.byCode.get(lc(code)) : null;
    if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
    const p = pc ? ctx.products.get(lc(pc)) : null;
    if (pc && !p) errors.push({ field: "Product Code", reason: `product "${pc}" not found` });
    const mRaw = reqd(g, "Month", errors); const m = mRaw ? parseMonth(mRaw) : null;
    if (mRaw && !m) errors.push({ field: "Month", reason: `"${mRaw}" is not a month (1-12 or name)` });
    const yRaw = reqd(g, "Year", errors); const y = Number(yRaw);
    if (yRaw && !(Number.isInteger(y) && y >= 2000 && y <= 2100)) errors.push({ field: "Year", reason: "must be a 4-digit year" });
    const q = num(g("Target Qty")); if (g("Target Qty") === "") errors.push({ field: "Target Qty", reason: "required" }); else if (Number.isNaN(q) || (q as number) < 0) errors.push({ field: "Target Qty", reason: "must be a number of 0 or more" });
    const val = num(g("Target Value")); if (val !== null && (Number.isNaN(val) || val < 0)) errors.push({ field: "Target Value", reason: "must be a number of 0 or more" });
    return { errors, key: `${lc(code)}|${y}-${m}|${lc(pc)}`, value: { code: emp?.employeeCode || code, emp, p, m, y, q, val } };
  },
  async apply(tenant, items) {
    const Targets = getMasterModel("targetMaster");
    return catching(items, (v) => {
      const monthKey = `${v.y}-${String(v.m).padStart(2, "0")}`;
      return upsert(Targets, { tenantSlug: tenant, employeeCode: v.code, monthKey, productCode: v.p.code }, {
        fieldForceName: v.emp?.name || "", hq: v.emp?.territory || "", division: v.emp?.division || v.p.division || "", product: v.p.name, month: MONTHS_LONG[v.m - 1], year: String(v.y),
        targetUnit: v.q, unitPrice: v.val !== null && v.q ? Math.round((v.val / v.q) * 100) / 100 : null, targetValue: v.val, status: "Active"
      });
    });
  }
};

// ── 11 / 12. Despatch (Sample / Input) ────────────────────────────────────
function despatchTool(type: "SAMPLE" | "INPUT"): Tool {
  const itemHeader = type === "SAMPLE" ? "Product Code" : "Input Item";
  return {
    key: type === "SAMPLE" ? "sample" : "input", title: type === "SAMPLE" ? "Sample Despatch Upload" : "Input Despatch Upload", group: "Customer Upload",
    headers: ["Employee Code", itemHeader, "Qty", "Despatch Date", "Docket/LR No", "Courier"], required: ["Employee Code", itemHeader, "Qty", "Despatch Date"], dateHeaders: ["Despatch Date"],
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
    check(g, ctx) {
      const errors: Er[] = [];
      const code = reqd(g, "Employee Code", errors), it = reqd(g, itemHeader, errors);
      const emp = code ? ctx.byCode.get(lc(code)) : null;
      if (code && !emp) errors.push({ field: "Employee Code", reason: `employee "${code}" not found` });
      let item: { code: string; name: string } | null = null;
      if (it) {
        if (type === "SAMPLE") { const p = ctx.products.get(lc(it)); if (p) item = { code: p.code, name: p.name }; }
        else item = ctx.inputs.find((i: any) => lc(i.code) === lc(it) || lc(i.name) === lc(it)) || null;
        if (!item) errors.push({ field: itemHeader, reason: `"${it}" not found in the ${type === "SAMPLE" ? "Product" : "Input"} master` });
      }
      const q = num(g("Qty")); if (g("Qty") === "") errors.push({ field: "Qty", reason: "required" }); else if (Number.isNaN(q) || (q as number) < 0 || !Number.isInteger(q)) errors.push({ field: "Qty", reason: "must be a whole number of 0 or more" });
      const date = dateField(g, "Despatch Date", errors, true);
      const docket = g("Docket/LR No");
      return { errors, key: `${lc(code)}|${lc(item?.code || it)}|${date ? iso(date) : ""}|${lc(docket)}`, value: { code: emp?.employeeCode || code, empName: emp?.name || "", item, q, date, docket, courier: g("Courier") } };
    },
    async apply(tenant, items) {
      const groups = new Map<string, { row: number; value: any }[]>();
      for (const i of items) { const k = `${i.value.code}|${MONTHS_SHORT[i.value.date.getUTCMonth()]}|${i.value.date.getUTCFullYear()}`; groups.set(k, [...(groups.get(k) || []), i]); }
      let inserted = 0, updated = 0; const errors: RowErr[] = [];
      for (const [, rows] of groups) {
        const first = rows[0].value; const month = MONTHS_SHORT[first.date.getUTCMonth()], year = String(first.date.getUTCFullYear());
        try {
          const batch = (await DispatchModel.findOne({ tenantSlug: tenant, employeeCode: first.code, type, month, year }).lean()) as any;
          const lines: any[] = batch ? [...batch.items] : [];
          for (const r of rows) {
            const v = r.value;
            const idx = lines.findIndex((l) => l.code === v.item.code && l.despatchDate && iso(new Date(l.despatchDate)) === iso(v.date) && (l.docketNo || "") === v.docket);
            const line = { code: v.item.code, name: v.item.name, dispatchQty: v.q, receivedQty: idx >= 0 ? lines[idx].receivedQty ?? null : null, remarks: idx >= 0 ? lines[idx].remarks ?? null : null, despatchDate: v.date, docketNo: v.docket || null, courier: v.courier || null };
            if (idx >= 0) { lines[idx] = line; updated++; } else { lines.push(line); inserted++; }
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
      return { inserted, updated, errors };
    }
  };
}

export const TOOLS: Tool[] = [listedDoctor, chemist, despatchTool("SAMPLE"), despatchTool("INPUT"), target, salesforce, stockist, product, productRate, slide, holiday, leave];
export const getTool = (key: string) => TOOLS.find((t) => t.key === key);

// ── file parsing (server) ─────────────────────────────────────────────────
export function parseBuffer(buf: Buffer): { headers: string[]; rows: Raw[] } {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], rows: [] };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: false });
  const headers = (aoa[0] || []).map((h) => S(h));
  const rows = aoa.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows };
}

export function sampleWorkbook(tool: Tool): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([tool.headers]);
  ws["!cols"] = tool.headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Upload");
  const info = [["Field", "Required", "Format"], ...tool.headers.map((h) => [h, tool.required.includes(h) ? "Yes" : "No", tool.dateHeaders.includes(h) ? "dd/mm/yyyy" : ""])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...info, [], [tool.note]]), "Instructions");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── validate / import ─────────────────────────────────────────────────────
export type Validation = {
  fileErrors: string[]; total: number; valid: number; invalid: number; errors: RowErr[]; warnings: { row: number; reason: string }[];
  preview: { row: number; cells: string[]; errors: string[] }[];
};
export async function validateRows(tool: Tool, tenant: string, headersIn: string[], rows: Raw[], previewLimit = 50) {
  const headerMap = new Map(headersIn.map((h) => [norm(h), h]));
  const missing = tool.required.filter((h) => !headerMap.has(norm(h)));
  const out: Validation = { fileErrors: missing.length ? [`Missing required column(s): ${missing.join(", ")}`] : [], total: 0, valid: 0, invalid: 0, errors: [], warnings: [], preview: [] };
  const items: { row: number; value: any }[] = [];
  if (missing.length) return { out, items, ctx: null as Ctx };
  const ctx = await tool.load(tenant);
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
    const res = tool.check(gd, ctx, rowNo);
    const errs = [...res.errors];
    if (errs.length === 0) {
      const dupe = seen.get(res.key);
      if (dupe) errs.push({ field: "(key)", reason: `duplicate of row ${dupe} (same ${tool.title} key); only the first is imported` });
      else seen.set(res.key, rowNo);
    }
    for (const w of res.warnings || []) out.warnings.push({ row: rowNo, reason: w });
    if (errs.length) { out.invalid++; for (const e of errs) out.errors.push({ row: rowNo, ...e }); }
    else { out.valid++; items.push({ row: rowNo, value: res.value }); }
    if (out.preview.length < previewLimit) out.preview.push({ row: rowNo, cells: tool.headers.map((h) => { const v = rawG(h); return typeof v === "number" && tool.dateHeaders.includes(h) ? gd(h) : S(v); }), errors: errs.map((e) => `${e.field}: ${e.reason}`) });
  });
  return { out, items, ctx };
}

export async function importRows(tool: Tool, tenant: string, who: string, fileName: string, headersIn: string[], rows: Raw[]) {
  const { out, items, ctx } = await validateRows(tool, tenant, headersIn, rows, 0);
  let inserted = 0, updated = 0; const saveErrors: RowErr[] = [];
  if (!out.fileErrors.length && items.length) {
    const r = await tool.apply(tenant, items, ctx);
    inserted = r.inserted; updated = r.updated; saveErrors.push(...r.errors);
  }
  const failedRows = new Set([...out.errors, ...saveErrors].map((e) => e.row));
  const errors = [...out.errors, ...saveErrors].sort((a, b) => a.row - b.row);
  const summary = { fileName, total: out.total, ok: out.total - failedRows.size, failed: failedRows.size, inserted, updated, fileErrors: out.fileErrors, errors, warnings: out.warnings };
  const hist = await UploadHistoryModel.create({ tenantSlug: tenant, toolKey: tool.key, fileName, uploadedBy: who, totalRows: summary.total, okRows: summary.ok, failedRows: summary.failed, inserted, updated, fileErrors: out.fileErrors, rowErrors: errors.slice(0, 1000) });
  return { ...summary, historyId: String((hist as any)._id) };
}
