// Round 65 in-memory verification (no MongoDB): the LIVE-CODES test files import with 0 rejected against exactly the 11 live Field Force employees (no Salesforce file needed).
// Run: npx tsx scripts/r65-tests/live-codes.ts
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
const FILES = fs.readdirSync(new URL("./fixtures/", import.meta.url)).filter((f) => f.endsWith(".xlsx")).sort();
assert.equal(FILES.length, 11);
const liveCodes = new Set(LIVE.map((x) => x[0]).filter((c) => c !== "Tes_57"));
// 0) every employee reference in every file is a live code (or, in the optional Salesforce file, a DEMO- code whose managers are live codes); never Tes_57
const EMPCOL = ["User Name", "Emp Code", "Employee Code", "Employee ID", "HQ Code"];
const used: Record<string, string[]> = {};
for (const f of FILES) {
  const rows = rowsOf(F(f)); const col = EMPCOL.find((c) => rows[0] && c in rows[0]);
  if (/^0[237]_/.test(f)) { assert.equal(col, undefined, `${f} has no employee codes`); continue; }
  assert.ok(col, f); const codes = [...new Set(rows.map((r: any) => String(r[col!]).trim()))]; used[f] = codes;
  if (/^01_/.test(f)) { assert.ok(codes.every((c) => /^DEMO-MR-\d{3}$/.test(c)), f); assert.ok(rows.every((r: any) => liveCodes.has(r["Reporting Manager Code"]))); }
  else assert.ok(codes.every((c) => liveCodes.has(c) && !/^(ABM|RBM|NBH)-/.test(c)), `${f}: ${codes.join(",")}`);
}
assert.ok(!JSON.stringify(Object.values(used)).includes("Tes_57"));

// 1) uploads, in the README order, against the 11 live employees only
const ok = (r: any, total: number, label: string) => { assert.deepEqual([r.total, r.failed, r.uploaded], [total, 0, true], `${label}: ${r.outcome} ${JSON.stringify(r.errors.slice(0, 3))}`); return r; };
const ym = { month: "10", year: "2026", mode: "insert" };
let r = ok(await post("product", F("02_Product_READY_TO_UPLOAD.xlsx"), "02.xlsx"), 28, "product"); assert.equal(r.inserted, 28);
store["states"] = []; for (const n of ["TAMIL NADU", "KERALA", "KARNATAKA"]) await StateModel.create({ tenantSlug: T, stateName: n, status: "ACTIVE" });
r = ok(await post("product-rate", F("03_Product_Rate_READY_TO_UPLOAD.xlsx"), "03.xlsx", { state: "TAMIL NADU" }), 28, "product rate");
r = ok(await post("stockist", F("04_Stockist_READY_TO_UPLOAD.xlsx"), "04.xlsx"), 73, "stockist"); assert.equal(r.inserted, 73);
assert.ok(store["stockists"].every((s: any) => liveCodes.has(s.empCode)), "every stockist is linked to a live rep");
r = ok(await post("listed-doctor", F("05_Listed_Doctor_READY_TO_UPLOAD.xlsx"), "05.xlsx"), 10, "listed doctor"); assert.equal(r.inserted, 10);
r = ok(await post("chemist", F("06_Chemists_READY_TO_UPLOAD.xlsx"), "06.xlsx"), 10, "chemists"); assert.equal(r.inserted, 10);
r = ok(await post("holiday-fixation", F("07_Holiday_READY_TO_UPLOAD.xlsx"), "07.xlsx"), 13, "holiday");
for (const t of new Set(rowsOf(F("08_Leave_READY_TO_UPLOAD.xlsx")).map((x: any) => x["Leave Type"]))) await LeaveTypeModel.create({ tenantSlug: T, leaveTypeDesc: t });
r = ok(await post("leave-bulk-upload", F("08_Leave_READY_TO_UPLOAD.xlsx"), "08.xlsx", { fy: "2026" }), 10, "leave"); assert.equal(r.inserted, 10);
r = ok(await post("target", F("09_Target_READY_TO_UPLOAD.xlsx"), "09.xlsx", { fy: "2026" }), 10, "target");
r = ok(await post("sample", F("10_Sample_Despatch_READY_TO_UPLOAD.xlsx"), "10.xlsx", ym), 10, "sample"); assert.equal(r.inserted, 10);
const inputs = [...new Set(rowsOf(F("11_Input_Despatch_READY_TO_UPLOAD.xlsx")).map((x: any) => x["Input Code"]))]; let k = 1; for (const n of inputs) await getMasterModel("inputMaster").create({ tenantSlug: T, inputCode: `IN${k++}`, inputName: n });
r = ok(await post("input", F("11_Input_Despatch_READY_TO_UPLOAD.xlsx"), "11.xlsx", ym), 10, "input"); assert.equal(r.inserted, 10);
assert.equal(store["employees"].length, 11, "no upload invented an employee (no manager stubs, no Salesforce file needed)");

// 2) re-upload behaves as updates / insert-only skips, still 0 rejected
await sleep(5);
for (const [key, f, n, fields, expectUpdated] of [["stockist", "04_Stockist_READY_TO_UPLOAD.xlsx", 73, {}, 73], ["listed-doctor", "05_Listed_Doctor_READY_TO_UPLOAD.xlsx", 10, {}, 10], ["chemist", "06_Chemists_READY_TO_UPLOAD.xlsx", 10, {}, 10], ["leave-bulk-upload", "08_Leave_READY_TO_UPLOAD.xlsx", 10, { fy: "2026" }, 10], ["sample", "10_Sample_Despatch_READY_TO_UPLOAD.xlsx", 10, { ...ym, mode: "overwrite" }, 10], ["input", "11_Input_Despatch_READY_TO_UPLOAD.xlsx", 10, { ...ym, mode: "overwrite" }, 10]] as const) {
  const x = ok(await post(key, F(f), `again_${key}.xlsx`, fields as any), n, `${key} again`); assert.equal(x.inserted, 0, key); assert.equal(x.updated, expectUpdated, key);
}
r = ok(await post("target", F("09_Target_READY_TO_UPLOAD.xlsx"), "9b.xlsx", { fy: "2026" }), 10, "target again");

// 3) the optional Salesforce file: 6 DEMO reps, managers resolved by the live codes, nothing else touched
r = ok(await post("field-force", F("01_Salesforce_OPTIONAL_READY_TO_UPLOAD.xlsx"), "01.xlsx"), 6, "salesforce"); assert.deepEqual([r.inserted, r.autoCreatedManagers.length], [6, 0], "managers resolve by code, no stubs");
const demo = store["employees"].filter((e: any) => /^DEMO-/.test(e.employeeCode)); assert.equal(demo.length, 6); assert.ok(demo.every((e: any) => ["ABM-001", "ABM-002"].includes(e.reportingManager)));
assert.equal(store["employees"].filter((e: any) => !/^DEMO-/.test(e.employeeCode)).length, 11); assert.deepEqual(store["employees"].find((e: any) => e.employeeCode === "ABM-001").designation, "Area Business Manager", "existing employees untouched");
console.log("r65 live codes ok: 11 files, codes used:", JSON.stringify(Object.fromEntries(Object.entries(used).map(([f, c]) => [f.slice(0, 2), c.length > 8 ? `${c.length} codes` : c.join("/")]))));
console.log("ALL r65 CHECKS PASSED"); server.close(); process.exit(0);
