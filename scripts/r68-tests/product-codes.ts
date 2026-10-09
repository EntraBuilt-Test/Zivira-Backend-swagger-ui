// Round 68 in-memory verification (no MongoDB): product codes match with or without hyphens/case/spaces; the rebuilt files import with 0 rejected against the live employees + live products.
// Run: npx tsx scripts/r68-tests/product-codes.ts
import mongoose from "mongoose";
import sift from "sift";

const store: Record<string, any[]> = {};
const asId = (n: number) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"));
let seq = 9000;
const wrap = (d: any) => {
  if (!d || d.__wrapped) return d;
  Object.defineProperty(d, "__wrapped", { value: true, enumerable: false });
  Object.defineProperty(d, "save", { value: function () { return Promise.resolve(this); }, enumerable: false });
  Object.defineProperty(d, "toObject", { value: function () { return JSON.parse(JSON.stringify(this), (k, v) => (k === "createdAt" || k === "updatedAt" || /At$|Date$|from$|to$/.test(k)) && typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v); }, enumerable: false });
  return d;
};
const norm = (f: any): any => JSON.parse(JSON.stringify(f ?? {}), (_k, v) => v);
const matcher = (f: any) => {
  const g = { ...(f || {}) };
  if (g._id !== undefined && typeof g._id !== "object") g._id = String(g._id);
  return (d: any) => sift({ ...g, ...(g._id !== undefined ? { _id: undefined } : {}) })({ ...d, _id: undefined }) && (g._id === undefined || String(d._id) === String(g._id));
};
const matchOne = (f: any) => {
  const clean: any = {}; let id: any;
  for (const [k, v] of Object.entries(f || {})) { if (k === "_id") id = v; else clean[k] = v; }
  const s = sift(clean);
  return (d: any) => s(d) && (id === undefined || (typeof id === "object" && id && "$ne" in (id as any) ? String(d._id) !== String((id as any).$ne) : String(d._id) === String(id)));
};
const coll = (m: any) => store[m.collection.name] || (store[m.collection.name] = []);
class Q {
  constructor(public docs: any[]) {}
  select() { return this; } lean() { return this; } populate() { return this; }
  sort(spec: any) { const [k, dir] = Object.entries(spec)[0] as [string, number]; this.docs = [...this.docs].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir < 0 ? -1 : 1)); return this; }
  limit(n: number) { this.docs = this.docs.slice(0, n); return this; }
  then(res: any, rej: any) { return Promise.resolve(this.docs.map(wrap)).then(res, rej); }
}
class Q1 extends Q { then(res: any, rej: any) { return Promise.resolve(wrap(this.docs[0] ?? null)).then(res, rej); } }
const M: any = mongoose.Model;
M.find = function (f: any = {}) { return new Q(coll(this).filter(matchOne(f))); };
M.findOne = function (f: any = {}) { return new Q1(coll(this).filter(matchOne(f))); };
M.findById = function (id: any) { return new Q1(coll(this).filter((d) => String(d._id) === String(id))); };
M.countDocuments = function (f: any = {}) { return Promise.resolve(coll(this).filter(matchOne(f)).length); };
M.distinct = function (k: string, f: any = {}) { return Promise.resolve([...new Set(coll(this).filter(matchOne(f)).map((d) => d[k]))]); };
M.create = function (arg: any) { const arr = Array.isArray(arg) ? arg : [arg]; const made = arr.map((d: any) => { const doc = wrap({ _id: asId(seq++), createdAt: new Date(), updatedAt: new Date(), ...d }); coll(this).push(doc); return doc; }); return Promise.resolve(Array.isArray(arg) ? made : made[0]); };
const applyUpdate = (d: any, u: any) => { Object.assign(d, u.$set || {}); for (const [k, v] of Object.entries(u.$push || {})) (d[k] ||= []).push(v); for (const [k, v] of Object.entries(u.$addToSet || {})) { (d[k] ||= []); if (!d[k].includes(v)) d[k].push(v); } d.updatedAt = new Date(); };
M.updateOne = function (f: any, u: any) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); return Promise.resolve({ matchedCount: d ? 1 : 0 }); };
M.updateMany = function (f: any, u: any) { const ds = coll(this).filter(matchOne(f)); ds.forEach((d) => applyUpdate(d, u)); return Promise.resolve({ modifiedCount: ds.length }); };
M.findOneAndUpdate = function (f: any, u: any) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); return Promise.resolve(wrap(d ?? null)); };
M.deleteMany = function (f: any = {}) { const c = coll(this); const hit = new Set(c.filter(matchOne(f))); const keep = c.filter((d) => !hit.has(d)); c.length = 0; c.push(...keep); return Promise.resolve({ deletedCount: hit.size }); };
M.deleteOne = function (f: any = {}) { const c = coll(this); const d = c.find(matchOne(f)); if (d) c.splice(c.indexOf(d), 1); return Promise.resolve({ deletedCount: d ? 1 : 0 }); };

(Q.prototype as any).skip = function (n: number) { this.docs = this.docs.slice(n); return this; };
M.aggregate = function () { return Promise.resolve([]); };
M.updateOne = function (f: any, u: any, o: any = {}) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); else if (o.upsert) coll(this).push(wrap({ _id: asId(seq++), createdAt: new Date(), ...f, ...(u.$set || {}) })); return Promise.resolve({ matchedCount: d ? 1 : 0 }); };

import assert from "node:assert";
import http from "node:http";
import express from "express";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

const T = "demo";
store["users"] = [
  wrap({ _id: asId(1), username: "admin", displayName: "Corporate HQ", role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN", tenantSlug: T }),
  wrap({ _id: asId(2), username: "m1", displayName: "Meera Shah", role: "ABM", portal: "FIELD_FORCE", tenantSlug: T }),
  wrap({ _id: asId(3), username: "mr1", displayName: "Rahul Mehta", role: "MR", portal: "FIELD_FORCE", tenantSlug: T }),
  wrap({ _id: asId(4), username: "mr2", displayName: "Sneha Iyer", role: "MR", portal: "FIELD_FORCE", tenantSlug: T }),
  wrap({ _id: asId(5), username: "admin2", displayName: "Second Admin", role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN", tenantSlug: T })
];
store["employees"] = [];
const emp = (code: string, name: string, role: string, mgr?: string, extra: any = {}) => store["employees"].push(wrap({ _id: asId(100 + store["employees"].length), tenantSlug: T, employeeCode: code, name, role, designation: role, division: "Zivira", territory: "Vadodara", state: "Gujarat", reportingManager: mgr, status: "ACTIVE", ...extra }));
emp("M1", "Meera Shah", "ABM"); emp("MR1", "Rahul Mehta", "MR", "M1"); emp("MR2", "Sneha Iyer", "MR", "M1"); emp("X9", "Outside Rep", "MR", "M9");

const { uploadToolsRouter } = await import("../../src/routes/upload-tools.routes.js");
const { companyRouter } = await import("../../src/routes/company.routes.js");
const { managerRouter } = await import("../../src/routes/manager.routes.js");
const { fieldRouter } = await import("../../src/routes/field.routes.js");
const { HttpError } = await import("../../src/http/errors.js");
const { signToken } = await import("../../src/http/auth.js");
const { GENERATE_COLUMNS } = await import("../../src/utils/upload-tools.js");
const { LISTEDDR_HEADERS } = await import("../../src/utils/r46-reports.js");

const app = express();
app.use(express.json());
app.use("/api/company", companyRouter);          // includes /company/upload-tools behind requireAuth + requireCompanyAdmin
app.use("/api/manager", managerRouter);
app.use("/api/field", fieldRouter);
app.use((err: any, _req: any, res: any, _next: any) => { res.status(err instanceof HttpError ? err.statusCode : err?.name === "ZodError" ? 400 : 500).json({ error: err.message }); });
const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
const tok = (id: number, role: string, portal: string) => signToken({ sub: String(asId(id)), role, portal, tenantSlug: T } as any);
const tokens: Record<string, string> = { admin: tok(1, "COMPANY_ADMIN", "COMPANY_ADMIN"), admin2: tok(5, "COMPANY_ADMIN", "COMPANY_ADMIN"), m1: tok(2, "ABM", "FIELD_FORCE"), mr1: tok(3, "MR", "FIELD_FORCE"), mr2: tok(4, "MR", "FIELD_FORCE") };
const j = async (as: string, method: string, url: string, body?: any) => { const r = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${tokens[as]}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: (await r.json().catch(() => ({}))) as any }; };
const bin = async (as: string, url: string, init: any = {}) => { const r = await fetch(`${base}${url}`, { ...init, headers: { authorization: `Bearer ${tokens[as]}`, ...(init.headers || {}) } }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "" }; };
const UP = "/company/upload-tools/listed-doctor";
const xl = (headers: string[], rows: unknown[][], sheet = "Listed Doctor Upload") => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), sheet); return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer; };
import fs from "node:fs";
const F = (n: string) => fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = async (key: string, buf: Buffer, name: string, fields: Record<string, string> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); fd.append("file", new Blob([buf]), name); const r = await fetch(`${base}/company/upload-tools/${key}/import`, { method: "POST", headers: { authorization: `Bearer ${tokens.admin}` }, body: fd }); assert.equal(r.status, 200, `${key}: HTTP ${r.status}`); return ((await r.json()) as any).data; };
const logs = async (key: string) => { const r = await j("admin", "GET", `/company/upload-tools/${key}/uploads`); assert.equal(r.status, 200); return r.body.data as any[]; };
const rowsOf = (buf: Buffer, sheet?: string) => { const wb = XLSX.read(buf, { type: "buffer" }); return XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet || wb.SheetNames[0]]); };
const col = (n: string) => (store[n] ||= []);
// field users named after employee codes (field routes resolve the profile from the username)
for (const [id, code] of [[61, "E0038"], [62, "E0048"], [63, "E0095"]] as const) { store["users"].push(wrap({ _id: asId(id), username: code.toLowerCase(), displayName: code, role: "MR", portal: "FIELD_FORCE", tenantSlug: T })); tokens[code] = tok(id, "MR", "FIELD_FORCE"); }
const { getMasterModel } = await import("../../src/models/master-record.model.js");
const { StateModel } = await import("../../src/models/state.model.js");
const { LeaveTypeModel } = await import("../../src/models/leave-type.model.js");
const reset = () => { for (const k of ["employees", "products", "dealers", "doctors", "stockists", "productrates", "productRates", "dispatches", "despatchLogs", "holidays", "leave_applications", "despatch_logs", "uploadLogs", "uploadHistories", "states", "leaveTypes", "targetMaster", "inputMaster", "productMaster"]) store[k] = []; for (const k of Object.keys(store)) if (/master|Master/.test(k)) store[k] = []; };
const names = () => Object.keys(store);

reset();
// exactly the 11 live employees of the user's Field Force master (HQ / manager columns were off screen: designations by code prefix, chain MR -> ABM -> RBM -> NBH)
const LIVE: [string, string, string, string, string?][] = [
  ["Tes_57", "Testing", "Testing", "OTHER"], ["MR-005", "Farhan Sheikh", "Medical Representative", "MR", "ABM-002"], ["MR-002", "Anjali Menon", "Medical Representative", "MR", "ABM-001"], ["MR-004", "Manoj Pillai", "Medical Representative", "MR", "ABM-002"],
  ["ABM-001", "Vikram Shah", "Area Business Manager", "ABM", "RBM-001"], ["NBH-001", "Arvind Rao", "National Business Head", "NBH"], ["MR-003", "Karthik Subramaniam", "Medical Representative", "MR", "ABM-001"],
  ["RBM-001", "Sunita Kulkarni", "Regional Business Manager", "RBM", "NBH-001"], ["MR-001", "Rahul Deshmukh", "Medical Representative", "MR", "ABM-001"], ["ABM-002", "Priya Nair", "Area Business Manager", "ABM", "RBM-001"], ["SR-MR-001", "Deepa Iyer", "Senior Medical Representative", "SR_MR", "ABM-002"]];
const seed = () => { store["employees"] = []; LIVE.forEach(([code, name, designation, role, mgr], i) => store["employees"].push(wrap({ _id: asId(500 + i), tenantSlug: T, employeeCode: code, name, designation, role, reportingManager: mgr, division: "Zivira Labs Pvt Ltd", status: "ACTIVE" }))); };
seed();
const FILES: Record<string, Buffer> = {}; for (const f of fs.readdirSync(new URL("./fixtures/", import.meta.url)).filter((x) => x.endsWith(".xlsx"))) FILES[f] = F(f);
const ok = (r: any, total: number, label: string) => { assert.deepEqual([r.total, r.failed, r.uploaded], [total, 0, true], `${label}: ${r.outcome} ${JSON.stringify(r.errors?.slice(0, 3))}`); return r; };
const ym = { month: "10", year: "2026", mode: "insert" };
// the LIVE Product Master (screenshot): ZV-002 is inferred
const LIVEP = [["ZV-001", "Zivacard 10", "Zivacard", "Zivira"], ["ZV-002", "Zivabeta 5", "Zivabeta", "Astra"], ["ZV-003", "Zivaflox 3", "Zivaflox", "Aura"], ["ZV-004", "Zivalergy 2", "Zivalergy", "Zivira"], ["ZV-005", "Zivaglauc 1", "Zivaglauc", "Astra"], ["ZV-006", "Zivapress 20", "Zivapress", "Aura"], ["ZV-007", "Zivakid 15", "Zivakid", "Zivira"], ["ZV-008", "Zivapain 8", "Zivapain", "Astra"], ["ZV-009", "Zivaskin 4", "Zivaskin", "Aura"], ["ZV-010", "Zivaneuro 6", "Zivaneuro", "Zivira"]];
const { ProductModel } = await import("../../src/models/product.model.js");
const seedProducts = (fmt: (c: string) => string) => {
  store["products"] = []; store["productMaster"] = []; store["productmasters"] = [];
  for (const [c, n, b, d] of LIVEP) store["products"].push(wrap({ _id: asId(900 + store["products"].length), tenantSlug: T, code: fmt(c), name: n, productName: n, brandName: b, division: d, pack: "old", status: "ACTIVE" }));
};
const codesIn = (buf: Buffer, header: string) => rowsOf(buf).map((x: any) => String(x[header]));
// every product code in the rebuilt files is a live hyphenated code
for (const [f, h] of [["02_Product_READY_TO_UPLOAD.xlsx", "Product Code"], ["03_Product_Rate_READY_TO_UPLOAD.xlsx", "Product Code"], ["09_Target_READY_TO_UPLOAD.xlsx", "Sale ERP Code"], ["10_Sample_Despatch_READY_TO_UPLOAD.xlsx", "Sample ERP Code"], ["Upl_Despatch_Master_SAMPLE.xlsx", "Sample ERP Code"]] as const)
  assert.ok(codesIn(FILES[f], h).every((c) => /^ZV-0(0\d|10)$/.test(c)), `${f} uses only ZV-001..ZV-010`);
assert.deepEqual(codesIn(FILES["02_Product_READY_TO_UPLOAD.xlsx"], "Product Code"), LIVEP.map((x) => x[0]));

for (const [label, fmt] of [["hyphenated master (as live)", (c: string) => c], ["master WITHOUT hyphens", (c: string) => c.replace("-", "")], ["master lower-case with a space", (c: string) => c.toLowerCase().replace("-", " ")]] as [string, (c: string) => string][]) {
  reset(); seed(); seedProducts(fmt); for (const k of Object.keys(store)) if (!["users", "employees", "products"].includes(k)) store[k] = [];
  store["states"] = []; for (const n of ["TAMIL NADU", "KERALA"]) await StateModel.create({ tenantSlug: T, stateName: n, status: "ACTIVE" });
  // 02 Product updates the live products (no duplicates) and never renames a stored code
  let r = ok(await post("product", FILES["02_Product_READY_TO_UPLOAD.xlsx"], "02.xlsx"), 10, `${label}: product`);
  assert.deepEqual([r.inserted, r.updated], [0, 10], `${label}: product upsert onto the live products`);
  assert.equal(store["products"].length, 10, `${label}: no duplicate products`);
  assert.deepEqual(store["products"].map((p: any) => p.code).sort(), LIVEP.map((x) => fmt(x[0])).sort(), `${label}: stored codes unchanged`);
  assert.ok(store["products"].every((p: any) => p.pack !== "old"), "pack updated");
  r = ok(await post("product-rate", FILES["03_Product_Rate_READY_TO_UPLOAD.xlsx"], "03.xlsx", { state: "TAMIL NADU" }), 10, `${label}: product rate`);
  assert.deepEqual(store["productRates"].map((x: any) => x.productCode).sort(), LIVEP.map((x) => fmt(x[0])).sort(), `${label}: rates stored against the master's own codes`);
  ok(await post("target", FILES["09_Target_READY_TO_UPLOAD.xlsx"], "09.xlsx", { fy: "2026" }), 10, `${label}: target`);
  r = ok(await post("sample", FILES["10_Sample_Despatch_READY_TO_UPLOAD.xlsx"], "10.xlsx", ym), 10, `${label}: sample`); assert.equal(r.inserted, 10);
  r = ok(await post("sample", FILES["Upl_Despatch_Master_SAMPLE.xlsx"], "sample6.xlsx", ym), 6, `${label}: user template`);
  console.log("ok:", label);
}

// ad-hoc spellings against the hyphenated live master: either style, any case, stray spaces
seed(); seedProducts((c) => c);
const spell = ["ZV024", "zv-024", " zv 024 ", "Zv_024"];
store["products"].push(wrap({ _id: asId(990), tenantSlug: T, code: "ZV-024", name: "Zivaextra", productName: "Zivaextra", brandName: "Zivaextra", division: "Zivira", status: "ACTIVE" }));
const one = async (code: string) => ok(await post("sample", xl(["Employee ID", "Sample ERP Code", "Despatch Qty"], [["MR-001", code, 5]], "Upl_Despatch_Master"), `s_${code}.xlsx`, { ...ym, mode: "insert" }), 1, `spelling ${code}`);
for (const sp of spell) { const before = store["dispatches"]?.length ?? 0; await one(sp); }
// ambiguity: a master holding both "ZV-050" and "ZV050" -> the row is rejected with a clear message
store["products"].push(wrap({ _id: asId(991), tenantSlug: T, code: "ZV-050", name: "A", productName: "A", status: "ACTIVE" }), wrap({ _id: asId(992), tenantSlug: T, code: "ZV050", name: "B", productName: "B", status: "ACTIVE" }));
for (const [key, buf, fields] of [["sample", xl(["Employee ID", "Sample ERP Code", "Despatch Qty"], [["MR-001", "zv 050", 5]], "Upl_Despatch_Master"), ym], ["target", xl(["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"], [["MR-001", "ZV-050", 10, 5, 10, 50]], "Upl_Target_Master"), { fy: "2026" }], ["product-rate", xl(["Product Code", "Product Name", "PTR", "Effective From"], [["ZV050", "B", 10, "01/10/2026"]], "UPL_Product_Rate"), { state: "TAMIL NADU" }], ["product", xl(["Product Code", "Product Name"], [["zv-050", "C"]], "UPL_Product_Master"), {}]] as const) {
  const res = await post(key, buf, `amb_${key}.xlsx`, fields as any);
  assert.equal(res.failed, 1, `${key}: ambiguous code rejected`); assert.match(JSON.stringify(res.errors), /more than one product/, `${key}: clear message`);
}
console.log("r68 product codes ok: ZV-001..ZV-010 files import with 0 rejected against hyphenated, hyphen-less and lower-case/spaced masters; stored codes untouched; ambiguity rejected");
console.log("ALL r68 CHECKS PASSED"); server.close(); process.exit(0);
