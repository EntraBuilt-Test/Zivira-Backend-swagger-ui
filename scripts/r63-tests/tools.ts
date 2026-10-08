// Round 63 in-memory verification (no MongoDB): the Sample / Input / Target / Salesforce / Stockist / Product / Product Rate / Holiday / Leave upload tools end to end, with the READY files.
// Run: npx tsx scripts/r63-tests/tools.ts
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

// ═══ 0) empty masters: ONE clear message (no per-row rejects)
reset();
{ const cases: [string, Buffer, Record<string, string>, RegExp][] = [
    ["sample", F("Sample_Despatch_READY_TO_UPLOAD.xlsx"), { month: "10", year: "2026", mode: "insert" }, /Field Force master has no employees/],
    ["target", F("Target_READY_TO_UPLOAD.xlsx"), { fy: "2026" }, /Field Force master has no employees/],
    ["leave-bulk-upload", F("Leave_READY_TO_UPLOAD.xlsx"), { fy: "2026" }, /Field Force master has no employees/],
    ["product-rate", F("Product_Rate_READY_TO_UPLOAD.xlsx"), { state: "Tamil Nadu" }, /Product master has no products/]];
  for (const [key, buf, f, re] of cases) { const r = await post(key, buf, `${key}.xlsx`, f); assert.equal(r.uploaded, false); assert.ok(re.test(r.outcome), `${key}: ${r.outcome}`); assert.equal(r.errors.length, 0); const l = await logs(key); assert.ok(re.test(l[0].topReason)); }
  console.log("0 empty-master messages ok (employees / products)"); }

// ═══ 1) Salesforce: 71 real employees, stubs, history, wrong sheet, csv
{ let r = await post("field-force", F("Salesforce_READY_TO_UPLOAD.xlsx"), "Salesforce_READY_TO_UPLOAD.xlsx");
  assert.deepEqual([r.total, r.failed, r.uploaded, r.outcome], [71, 0, true, "Successful"], JSON.stringify(r.errors));
  assert.equal(r.inserted, 71); assert.ok(r.autoCreatedManagers.length > 0, "manager stubs are reported (code pending)"); assert.ok(store["employees"].some((e: any) => e.codePending));
  const n = store["employees"].length;
  await sleep(5); r = await post("field-force", F("Salesforce_READY_TO_UPLOAD.xlsx"), "again.xlsx"); assert.deepEqual([r.inserted, r.updated, r.failed], [0, 71, 0]); assert.equal(store["employees"].length, n, "no duplicate stubs on re-upload");
  const l = await logs("field-force"); assert.deepEqual([l[0].fileName, l[0].success, l[0].rejected], ["again.xlsx", 71, 0]);
  // a multi-sheet workbook without the required sheet name: the legacy message, logged
  { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["a"]]), "One"); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["b"]]), "Two");
    r = await post("field-force", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, "wrongsheet.xlsx"); assert.equal(r.uploaded, false); assert.equal(r.outcome, "Sheet Name Must be 'UPL_SalesForce'"); assert.equal((await logs("field-force"))[0].fileName, "wrongsheet.xlsx"); }
  // admin / field / manager see the employees
  let g = await j("admin", "GET", `/company/employees`); assert.ok(g.body.data.length >= n);
  console.log(`1 salesforce ok: 71 imported, ${r ? n - 71 : 0} manager stub(s) code-pending, re-upload updates without duplicates, wrong sheet name message`); }

// ═══ 2) Product: 28 real products, Product master mirror, reference tables, deactivate
{ let r = await post("product", F("Product_READY_TO_UPLOAD.xlsx"), "Product_READY_TO_UPLOAD.xlsx"); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [28, 28, 0, "Successful"], JSON.stringify(r.errors));
  assert.equal(store["products"].length, 28); assert.ok(store["products"].every((p: any) => p.category && p.status === "ACTIVE"));
  const ref = (await j("admin", "GET", `/company/upload-tools/product/reference`)).body.data; assert.equal(ref.source, "product-master"); assert.ok(ref.categories.includes("ANTI-GLAUCOMA") && ref.groups.includes("AG") && ref.brands.includes("BRINZIA"));
  await sleep(5); r = await post("product", F("Product_READY_TO_UPLOAD.xlsx"), "p2.xlsx", { deactivate: "true" }); assert.deepEqual([r.inserted, r.updated, r.failed, r.deactivated], [0, 28, 0, 28]); assert.ok(store["products"].every((p: any) => p.status === "ACTIVE"));
  assert.equal((await logs("product")).length, 2);
  console.log("2 product ok: 28/0, reference tables from the master, re-upload + deactivate"); }

// ═══ 3) Stockist: 73 real stockists, csv, unknown employee
{ let r = await post("stockist", F("Stockist_READY_TO_UPLOAD.xlsx"), "Stockist_READY_TO_UPLOAD.xlsx"); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [73, 73, 0, "Successful"], JSON.stringify(r.errors.slice(0, 3)));
  await sleep(5); r = await post("stockist", F("Stockist_READY_TO_UPLOAD.xlsx"), "s2.xlsx"); assert.deepEqual([r.inserted, r.updated, r.failed], [0, 73, 0]);
  const csv = Buffer.from(XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([["ERP Code", "Stockist Name", "State", "Emp Code"], ["9990001", "Csv Stockist", "KERALA", "E0038"], ["9990002", "Ghost Stockist", "KERALA", "NOBODY"]])));
  r = await post("stockist", csv, "s.csv"); assert.deepEqual([r.inserted, r.failed], [1, 1]); assert.equal(r.outcome, "1 record(s) not uploaded (see the Not Uploaded List)");
  const l = await logs("stockist"); assert.equal(l[0].topReason, "Employee not found in Field Force"); assert.equal(l[0].rejected, 1);
  console.log("3 stockist ok: 73/0, re-upload updates, csv, unknown employee reported"); }

// ═══ 4) Product Rate: state-wise, ALL, Product.rate rule
store["states"] = []; for (const n of ["TAMIL NADU", "KERALA"]) await StateModel.create({ tenantSlug: T, stateName: n, status: "ACTIVE" });
{ const st = (await j("admin", "GET", `/company/upload-tools/product-rate/states`)).body.data; assert.deepEqual(st.states.sort(), ["KERALA", "TAMIL NADU"]);
  let r = await post("product-rate", F("Product_Rate_READY_TO_UPLOAD.xlsx"), "rate_tn.xlsx", { state: "TAMIL NADU" }); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [28, 28, 0, "Successful"], JSON.stringify(r.errors.slice(0, 3)));
  const rates = () => (store["productRates"] || []).length; assert.equal(rates(), 28);
  r = await post("product-rate", F("Product_Rate_READY_TO_UPLOAD.xlsx"), "rate_all.xlsx", { state: "ALL" }); assert.equal(r.failed, 0); assert.equal(rates(), 56, "ALL stores the rates for every state (TAMIL NADU already had them)");
  assert.ok(store["products"].every((p: any) => typeof p.rate === "number"), "Product.rate follows the latest PTR of the reference state");
  assert.equal((await post("product-rate", F("Product_Rate_READY_TO_UPLOAD.xlsx"), "nostate.xlsx")).outcome, "Select the State Name first");
  console.log("4 product rate ok: per-state 28/0, ALL -> every state, Product.rate set, state required"); }

// ═══ 5) Sample Despatch: insert / overwrite semantics, field + admin log
{ const f = { month: "10", year: "2026", mode: "insert" };
  let r = await post("sample", F("Sample_Despatch_READY_TO_UPLOAD.xlsx"), "Sample_Despatch_READY_TO_UPLOAD.xlsx", f); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [10, 10, 0, "Successful"], JSON.stringify(r.errors));
  const batches = col("dispatches").filter((d: any) => d.type === "SAMPLE"); assert.ok(batches.length >= 1); assert.equal(batches.reduce((a: number, b: any) => a + b.items.length, 0), 10);
  assert.ok(col("despatch_logs").length > 0, "mirrored into the admin Despatch View/Status log");
  const e38 = batches.find((b: any) => b.employeeCode === "E0038"); assert.ok(e38 && e38.month === "Oct" && e38.year === "2026");
  const fd = await j("E0038", "GET", `/field/dispatches`); assert.equal(fd.status, 200, JSON.stringify(fd.body)); assert.equal(fd.body.data.filter((d: any) => d.type === "SAMPLE").reduce((a: number, d: any) => a + d.itemCount, 0), e38.items.length, "the field user sees their own despatch lines");
  await sleep(5); r = await post("sample", F("Sample_Despatch_READY_TO_UPLOAD.xlsx"), "again_insert.xlsx", f); assert.deepEqual([r.inserted, r.updated, r.skipped, r.failed], [0, 0, 10, 0], "Only Insert leaves existing lines untouched");
  await sleep(5); r = await post("sample", F("Sample_Despatch_READY_TO_UPLOAD.xlsx"), "again_over.xlsx", { ...f, mode: "overwrite" }); assert.deepEqual([r.inserted, r.updated, r.failed], [0, 10, 0], "Overwrite replaces the month's lines");
  assert.equal(col("dispatches").filter((d: any) => d.type === "SAMPLE").reduce((a: number, b: any) => a + b.items.length, 0), 10);
  // a date outside the chosen month is rejected with the reason
  r = await post("sample", xl(["Employee ID", "Sample ERP Code", "Despatch Qty", "Despatch Date"], [["E0038", "ZV024", 5, "03/11/26"]], "Upl_Despatch_Master"), "other_month.xlsx", f); assert.equal(r.failed, 1); assert.ok(/must fall in Oct 2026/.test(r.errors[0].reason));
  const demo = `${process.env.HOME}/mnt/Zivira/Claude outputs/upload-demo-data/upload-demo-data/03_Customer_SampleDespatchUpload_DEMO_VALUES.xlsx`;
  if (fs.existsSync(demo)) { const n = rowsOf(fs.readFileSync(demo)).length; r = await post("sample", fs.readFileSync(demo), "03_demo.xlsx", { ...f, mode: "overwrite" }); assert.equal(r.total, n); assert.ok(r.errors.every((e: any) => e.field === "(key)" || /Despatch Date/.test(e.field) === false), JSON.stringify(r.errors.slice(0, 2))); console.log(`   demo pack 03: ${n} rows -> ${r.inserted + r.updated} written, ${r.failed} rejected`); }
  console.log("5 sample despatch ok: 10/0, Only Insert skips, Overwrite replaces, field list, admin log, month check"); }

// ═══ 6) Input Despatch (needs the Input master)
{ const inputs = [...new Set(rowsOf(F("Input_Despatch_READY_TO_UPLOAD.xlsx")).map((x: any) => x["Input Code"]))]; const f = { month: "10", year: "2026", mode: "insert" };
  let r = await post("input", F("Input_Despatch_READY_TO_UPLOAD.xlsx"), "empty_input_master.xlsx", f); assert.ok(/Input master has no inputs/.test(r.outcome), r.outcome);
  let k = 1; for (const n of inputs) await getMasterModel("inputMaster").create({ tenantSlug: T, inputCode: `IN${k++}`, inputName: n });
  r = await post("input", F("Input_Despatch_READY_TO_UPLOAD.xlsx"), "Input_Despatch_READY_TO_UPLOAD.xlsx", f); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [10, 10, 0, "Successful"], JSON.stringify(r.errors));
  assert.equal(col("dispatches").filter((d: any) => d.type === "INPUT").reduce((a: number, b: any) => a + b.items.length, 0), 10);
  await sleep(5); r = await post("input", F("Input_Despatch_READY_TO_UPLOAD.xlsx"), "i2.xlsx", { ...f, mode: "overwrite" }); assert.deepEqual([r.inserted, r.updated, r.failed], [0, 10, 0]);
  console.log("6 input despatch ok: Input master message, 10/0, overwrite"); }

// ═══ 7) Target: all-or-nothing, replace-the-year, field + manager
{ const f = { fy: "2026" };
  let r = await post("target", F("Target_READY_TO_UPLOAD.xlsx"), "Target_READY_TO_UPLOAD.xlsx", f); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [10, 10, 0, "Successful"], JSON.stringify(r.errors));
  const T0 = col("targetMaster").length; assert.equal(T0, 10);
  const bad = xl(["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"], [["E0038", "ZV024", 10, 5, 10, 50], ["E0038", "NOPE", 10, 5, 10, 50]], "Upl_Target_Master");
  r = await post("target", bad, "bad_target.xlsx", f); assert.equal(r.uploaded, false); assert.ok(/nothing was uploaded/.test(r.outcome)); assert.equal(r.failed, 1); assert.equal(col("targetMaster").length, 10, "a bad row blocks the whole upload; the year is left as it was");
  const l = await logs("target"); assert.deepEqual([l[0].success, l[0].rejected], [0, 1]); const dl = await bin("admin", `/company/upload-tools/target/uploads/${l[0].id}/not-uploaded`); assert.equal(dl.status, 200); assert.ok(/Product Code: .*not found/.test(rowsOf(dl.buf, "Not Uploaded List")[0].Reason));
  const first = rowsOf(F("Target_READY_TO_UPLOAD.xlsx"))[0]["HQ Code"];
  const mine = await j(first === "E0038" ? "E0038" : "E0038", "GET", `/field/targets`); assert.equal(mine.status, 200, JSON.stringify(mine.body)); assert.ok(mine.body.data.rows.length >= 1 && mine.body.data.totalValue > 0);
  console.log("7 target ok: 10/0 'Successful', bad row blocks everything with a Not Uploaded List, field targets endpoint"); }
{ // manager: E0038 reports to someone: give M1 a team member with targets
  store["employees"].find((e: any) => e.employeeCode === "E0038").reportingManager = "M1"; emp("M1", "Meera Shah", "ABM");
  const m = await j("m1", "GET", `/manager/targets`); assert.equal(m.status, 200, JSON.stringify(m.body)); assert.deepEqual(m.body.data.people.map((p: any) => p.employeeCode), ["E0038"]); assert.ok(m.body.data.totalValue > 0);
  console.log("   manager targets endpoint ok"); }

// ═══ 8) Holiday: 'All' (national) holidays reach the day-status logic
{ let r = await post("holiday-fixation", F("Holiday_READY_TO_UPLOAD.xlsx"), "Holiday_READY_TO_UPLOAD.xlsx"); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [13, 13, 0, "Successful"], JSON.stringify(r.errors));
  await sleep(5); r = await post("holiday-fixation", F("Holiday_READY_TO_UPLOAD.xlsx"), "h2.xlsx"); assert.deepEqual([r.inserted, r.updated], [0, 13]);
  const { buildDayStatusContext } = await import("../../src/utils/day-status.js"); const ctx = await buildDayStatusContext(T, "2026-01", [], ["Gujarat"]); assert.ok(ctx.holidaysByDate.has("2026-01-26"), "Republic Day (State All) applies to a Gujarat employee");
  r = await post("holiday-fixation", xl(["Date", "Holiday Name", "State"], [["20/09/26", "Company Foundation Day", "All"], ["not a date", "Bad", "All"]], "UPL_Holiday_Fixation"), "h3.xlsx"); assert.deepEqual([r.inserted, r.failed], [1, 1]); assert.ok(/not a valid date/.test(r.errors[0].reason));
  console.log("8 holiday ok: 13/0, re-upload updates, State All feeds day-status, 2-digit-year date, bad date rejected"); }

// ═══ 9) Leave: Leave Type master, FY, field + admin
{ const types = [...new Set(rowsOf(F("Leave_READY_TO_UPLOAD.xlsx")).map((x: any) => x["Leave Type"]))]; for (const t of types) await LeaveTypeModel.create({ tenantSlug: T, leaveTypeDesc: t });
  let r = await post("leave-bulk-upload", F("Leave_READY_TO_UPLOAD.xlsx"), "Leave_READY_TO_UPLOAD.xlsx", { fy: "2026" }); assert.deepEqual([r.total, r.inserted, r.failed, r.outcome], [10, 10, 0, "Successful"], JSON.stringify(r.errors));
  assert.equal(col("leave_applications").length, 10);
  const mine = await j("E0048", "GET", `/field/leave-applications`); assert.equal(mine.status, 200); assert.ok(mine.body.data.length >= 1, "the field user sees the uploaded leave");
  await sleep(5); r = await post("leave-bulk-upload", F("Leave_READY_TO_UPLOAD.xlsx"), "l2.xlsx", { fy: "2026" }); assert.deepEqual([r.inserted, r.updated], [0, 10]);
  r = await post("leave-bulk-upload", F("Leave_READY_TO_UPLOAD.xlsx"), "wrongfy.xlsx", { fy: "2025" }); assert.equal(r.failed, 10); assert.equal((await logs("leave-bulk-upload"))[0].topReasonRows, 10);
  // messy: instructions sheet first, title row, padded headers, 2-digit-year dates
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Read me"]]), "Instructions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Leave upload - Zivira"], [], ["Employee Code ", " Leave Type", "From Date", "To Date ", "Days"], ["E0038", "Casual Leave", "05/11/26", "06/11/26", 2]]), "Leave_Upload");
  r = await post("leave-bulk-upload", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, "messy_leave.xlsx", { fy: "2026" }); assert.deepEqual([r.total, r.inserted, r.failed], [1, 1, 0], JSON.stringify(r.errors) + r.outcome);
  console.log("9 leave ok: 10/0, field list, re-upload updates, FY check reported once, messy file with 2-digit-year dates"); }

// ═══ 10) every tool keeps a history, newest first
for (const k of ["sample", "input", "target", "field-force", "stockist", "product", "product-rate", "holiday-fixation", "leave-bulk-upload"]) { const l = await logs(k); assert.ok(l.length >= 1, k); for (let i = 1; i < l.length; i++) assert.ok(new Date(l[i - 1].uploadedAt) >= new Date(l[i].uploadedAt), k); assert.ok(l.every((x) => x.uploadedBy === "Corporate HQ")); }
console.log("10 upload history for every tool ok");
console.log("R63 upload tools tests passed"); server.close(); process.exit(0);
