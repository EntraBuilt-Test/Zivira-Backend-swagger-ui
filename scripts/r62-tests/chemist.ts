// Round 62 in-memory verification (no MongoDB): Chemists Upload Tool end to end through the real routers over HTTP.
// Run: npx tsx scripts/r62-tests/chemist.ts
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
const UC = "/company/upload-tools/chemist";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dealers = () => store["dealers"] || (store["dealers"] = []);
const post = async (as: string, buf: Buffer, name: string, fields: Record<string, string> = {}, key = "chemist") => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); fd.append("file", new Blob([buf]), name); const r = await fetch(`${base}/company/upload-tools/${key}/import`, { method: "POST", headers: { authorization: `Bearer ${tokens.admin}` }, body: fd }); assert.equal(r.status, 200); return ((await r.json()) as any).data; };
const logs = async () => (await j("admin", "GET", `${UC}/uploads`)).body.data as any[];
const rowsOf = (buf: Buffer, sheet?: string) => { const wb = XLSX.read(buf, { type: "buffer" }); return XLSX.utils.sheet_to_json<any>(wb.Sheets[sheet || wb.SheetNames[0]]); };
const headersOf = (buf: Buffer) => (XLSX.utils.sheet_to_json<any[]>(XLSX.read(buf, { type: "buffer" }).Sheets[XLSX.read(buf, { type: "buffer" }).SheetNames[0]], { header: 1 })[0] as string[]);

// ═══ 0) the doctor Class message
{ const r = await post("admin", xl(["User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "Speciality", "Class"], [["MR1", "Dr Cls", "Vadodara", "Eye", "A+"]]), "cls.xlsx", {}, "listed-doctor");
  assert.equal(r.failed, 1); assert.equal(r.errors[0].reason, "Class must be A, B, C or Nil"); console.log("0 doctor Class message ok"); }

// ═══ 1) columns: legacy order, four always included, nothing pre-ticked by the server
let r = await j("admin", "GET", `${UC}/columns`); assert.equal(r.status, 200);
const cols: any[] = r.body.data;
assert.deepEqual(cols.map((c) => c.label), ["SI No", "User Name", "Chemist Name", "Territory", "Category", "Class", "Address", "Address 2", "City Name", "Pin Code", "Contact person", "Contact Person Designation", "Mobile No", "Shop landline No", "EMail ID", "Website", "Stockist ERP Code", "Chemist ERP Code", "State", "Others 1", "Others 2", "Others 3", "Others 4", "Others 5"]);
assert.deepEqual(cols.filter((c) => c.mandatory).map((c) => c.label), ["SI No", "User Name", "Chemist Name", "Territory"]);
console.log("1 columns ok (24, legacy order, 4 always included)");

// ═══ 2) generate: tick nothing / some, state per admin, delete clears, template = mandatory only
r = await j("admin", "GET", `${UC}/generated`); assert.equal(r.status, 200); assert.ok(!r.body.data || !r.body.data.columns?.length);
let g = await bin("admin", `${UC}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ columns: [] }) }); assert.equal(g.status, 200);
assert.deepEqual(headersOf(g.buf), ["SI No", "User Name", "Chemist Name", "Territory"]);
r = await j("admin", "GET", `${UC}/generated`); assert.deepEqual(r.body.data.columns, ["SI No", "User Name", "Chemist Name", "Territory"]);
assert.equal((await j("admin", "DELETE", `${UC}/generated`)).status, 200); r = await j("admin", "GET", `${UC}/generated`); assert.ok(!r.body.data?.columns?.length);
g = await bin("admin", `${UC}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ columns: ["State", "Category", "Class", "Mobile No"] }) });
assert.deepEqual(headersOf(g.buf), ["SI No", "User Name", "Chemist Name", "Territory", "Category", "Class", "Mobile No", "State"]);
{ const ex = new ExcelJS.Workbook(); await ex.xlsx.load(g.buf as any); const hr = ex.worksheets[0].getRow(1); assert.equal(hr.getCell(1).fill && (hr.getCell(1).fill as any).fgColor.argb, "FFFFFF00"); assert.ok(!(hr.getCell(5).fill as any)?.fgColor, "optional headers are not yellow"); }
const genBuf = g.buf;
{ const t = await bin("admin", `${UC}/template`); assert.deepEqual(headersOf(t.buf), ["SI No", "User Name", "Chemist Name", "Territory"]); }
console.log("2 generate / state / delete / template ok");

// ═══ 3) filled generated file: upload, mapped to employees, visible to admin, field user, manager
emp("MR3", "Third Rep", "MR", "M1");
const fillRows = [[1, "MR1", "Apollo Pharmacy", "Vadodara-West", "Retail", "A", "9811111111", "Gujarat"], [2, "mr2", "City Medicals", "Vadodara-East", "Retail", "B", "9822222222", "Gujarat"], [3, "Meera Shah", "Manager Side Chemist", "Vadodara-Central", "", "", "", ""], [4, "X9", "Outside Chemist", "Surat", "Retail", "C", "", "Gujarat"]];
const hdrs = headersOf(genBuf);
const filled = xl(hdrs, fillRows, "Chemist Upload");
await sleep(5);
let u = await post("admin", filled, "chemists_1.xlsx");
assert.deepEqual([u.total, u.inserted, u.updated, u.failed, u.uploaded], [4, 4, 0, 0, true], JSON.stringify(u.errors));
assert.equal(dealers().length, 4);
{ const d = dealers().find((x: any) => x.dealerName === "Apollo Pharmacy"); assert.deepEqual([d.employeeCode, d.employeeName, d.patchName, d.chemistClass, d.category, d.dealerPhone, d.state, d.status], ["MR1", "Rahul Mehta", "Vadodara-West", "A", "Retail", "9811111111", "Gujarat", "ACTIVE"]);
  assert.deepEqual(dealers().map((x: any) => x.sourceSNo), [1, 2, 3, 4], "new chemists get CH001.. codes in file order"); }
r = await j("admin", "GET", `/company/dealers`); assert.equal(r.status, 200); assert.equal(r.body.data.length, 4); assert.ok(r.body.data.every((d: any) => d.updatedAt), "admin chemist list carries updatedAt for the last-upload highlight");
r = await j("mr1", "GET", `/field/chemists`); assert.equal(r.status, 200); assert.deepEqual(r.body.data.map((d: any) => d.dealerName), ["Apollo Pharmacy"], "field user sees only the chemists mapped to them");
r = await j("mr2", "GET", `/field/chemists`); assert.deepEqual(r.body.data.map((d: any) => d.dealerName), ["City Medicals"]);
r = await j("m1", "GET", `/manager/chemists`); assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.data.rows.map((x: any) => x.chemistName).sort(), ["Apollo Pharmacy", "City Medicals"], "manager sees the direct team's chemists only (Outside Chemist belongs to X9, Manager Side Chemist to M1)");
assert.deepEqual(r.body.data.rows[0].callCount, 0);
let l = await logs(); assert.equal(l[0].fileName, "chemists_1.xlsx"); assert.deepEqual([l[0].success, l[0].rejected, l[0].read], [4, 0, 4]); assert.equal(l[0].uploadedBy, "Corporate HQ");
// re-upload = updates in place, same codes
await sleep(5); u = await post("admin", filled, "chemists_1b.xlsx"); assert.deepEqual([u.inserted, u.updated, u.failed], [0, 4, 0]); assert.deepEqual(dealers().map((x: any) => x.sourceSNo), [1, 2, 3, 4]);
console.log("3 filled upload ok: mapped, listed for admin / field / manager, codes CH001-CH004, re-upload updates");

// ═══ 4) messy files: instructions sheet first + title line + padded headers; csv
{ const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Read me"], ["Fill the Data sheet"]]), "Instructions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Chemists - Zivira"], [], ["SI No ", " User Name", "Chemist Name\u00a0", "Territory ", "Class"], [1, " mr1 ", "Messy Chemist", "Vadodara-West", "A"], [2, "MR2", "Messy Two", "Vadodara-East", "B"]]), "Data");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  u = await post("admin", buf, "messy.xlsx"); assert.deepEqual([u.total, u.inserted, u.failed], [2, 2, 0], JSON.stringify(u.errors) + u.outcome); assert.ok(dealers().some((d: any) => d.dealerName === "Messy Chemist" && d.employeeCode === "MR1"));
  const csv = Buffer.from(XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([["User Name", "Chemist Name", "Territory", "Mobile No"], ["MR1", "Csv Chemist", "Vadodara-West", "9800000000"]])));
  u = await post("admin", csv, "chemists.csv"); assert.deepEqual([u.total, u.inserted, u.failed], [1, 1, 0], JSON.stringify(u.errors)); }
console.log("4 messy xlsx (instructions sheet, title line, padded headers) and csv ok");

// ═══ 5) partial / all rejected: reasons, top reason, Not Uploaded List
await sleep(5);
u = await post("admin", xl(["User Name", "Chemist Name", "Territory"], [["MR1", "Good One", "T1"], ["nobody", "Bad One", "T1"], ["MR1", "No Territory", ""]]), "partial.xlsx"); assert.deepEqual([u.inserted, u.failed], [1, 2]);
l = await logs(); assert.deepEqual([l[0].success, l[0].rejected], [1, 2]);
{ const dl = await bin("admin", `${UC}/uploads/${l[0].id}/not-uploaded`); assert.equal(dl.status, 200); const rows = rowsOf(dl.buf, "Not Uploaded List"); assert.equal(rows.length, 2);
  const reasons = rows.map((x) => x.Reason).join(" | "); assert.ok(/User Name: User Name "nobody" not found in Field Force/.test(reasons), reasons); assert.ok(/Territory: required/.test(reasons), reasons); assert.equal(rows[0]["Chemist Name"], "Bad One"); }
await sleep(5);
u = await post("admin", xl(["User Name", "Chemist Name", "Territory"], [["ghost1", "A", "T"], ["ghost2", "B", "T"], ["ghost3", "C", "T"]]), "allbad.xlsx"); assert.equal(u.failed, 3);
l = await logs(); assert.deepEqual([l[0].read, l[0].rejected, l[0].topReasonRows, l[0].topReason], [3, 3, 3, "User Name not found in Field Force"]);
assert.equal((await bin("admin", `${UC}/uploads/${l[1].id}/not-uploaded`)).status, 200);
{ const ok = l.find((x) => x.fileName === "chemists_1.xlsx"); assert.equal((await bin("admin", `${UC}/uploads/${ok.id}/not-uploaded`)).status, 404); }
for (let i = 1; i < l.length; i++) assert.ok(new Date(l[i - 1].uploadedAt) >= new Date(l[i].uploadedAt));
// a different company's / tool's rows are not shared
assert.equal((await j("admin", "GET", `/company/upload-tools/product/uploads`)).status, 404);
console.log("5 partial + all-rejected: reasons, top reason, Not Uploaded List ok");

// ═══ 6) deactivate flag
{ const before = dealers().filter((d: any) => d.status === "ACTIVE").length; assert.ok(before > 3);
  await sleep(5); u = await post("admin", xl(["User Name", "Chemist Name", "Territory"], [["MR1", "Apollo Pharmacy", "Vadodara-West"]]), "deact.xlsx", { deactivate: "true" });
  assert.deepEqual([u.inserted, u.updated, u.deactivated], [0, 1, before]);
  const act = dealers().filter((d: any) => d.status === "ACTIVE"); assert.deepEqual(act.map((d: any) => d.dealerName), ["Apollo Pharmacy"]);
  r = await j("mr2", "GET", `/field/chemists`); assert.deepEqual(r.body.data, [], "deactivated chemists leave the field list"); }
console.log("6 deactivate existing ok");

// ═══ 7) empty Field Force master / master without these employees
{ const saved = store["employees"]; store["employees"] = [];
  u = await post("admin", xl(["User Name", "Chemist Name", "Territory"], [["MR1", "X", "T"]]), "empty.xlsx"); assert.equal(u.uploaded, false); assert.ok(/Field Force master has no employees/.test(u.outcome));
  l = await logs(); assert.equal(l[0].fileName, "empty.xlsx"); assert.ok(/Field Force master has no employees/.test(l[0].topReason)); store["employees"] = saved; }
console.log("7 empty-master message ok");

// ═══ 8) legacy Listed Doctor log rows (written before the shared model) stay readable and downloadable
{ const { DoctorUploadLogModel } = await import("../../src/models/doctor-upload-log.model.js");
  const nu = (await post("admin", xl(["User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "Speciality"], [["zz", "Dr Z", "T", "S"]]), "newdoc.xlsx", {}, "listed-doctor")); assert.ok(nu.logId);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["a", "Reason"], ["x", "old error"]]), "Not Uploaded List");
  const old = await DoctorUploadLogModel.create({ tenantSlug: T, fileName: "old_doctor_file.xlsx", uploadedAt: new Date(2024, 1, 1), uploadedBy: "x", read: 1, rejected: 1, notUploadedFile: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) });
  const dl = (await j("admin", "GET", `/company/upload-tools/listed-doctor/uploads`)).body.data as any[]; assert.equal(dl[0].fileName, "newdoc.xlsx"); const o = dl.find((x) => x.fileName === "old_doctor_file.xlsx"); assert.ok(o, "legacy row listed");
  const d = await bin("admin", `/company/upload-tools/listed-doctor/uploads/${o.id}/not-uploaded`); assert.equal(d.status, 200); assert.equal(rowsOf(d.buf)[0].Reason, "old error"); }
console.log("8 legacy doctor log rows still readable");

// ═══ 9) the ready file and the demo pack file after a real Salesforce upload, re-saved by other writers
{ for (const k of ["doctors", "dealers", "uploadLogs", "employees"]) store[k] = [];
  const DEMO = `${process.env.HOME}/mnt/Zivira/Claude outputs/upload-demo-data/upload-demo-data`;
  const sfFile = fs.existsSync(`${DEMO}/06_Upload_SalesforceUpload.xlsx`) ? `${DEMO}/06_Upload_SalesforceUpload.xlsx` : `${process.env.STRESS_DIR || process.env.HOME + "/tmp/stress"}/salesforce.xlsx`;
  const sf = await post("admin", fs.readFileSync(sfFile), "06_Upload_SalesforceUpload.xlsx", {}, "field-force"); assert.ok(sf.uploaded && sf.failed === 0);
  const ready = fs.readFileSync(new URL("./fixtures/Chemist_Upload_READY_TO_UPLOAD.xlsx", import.meta.url));
  assert.deepEqual(headersOf(ready), ["SI No", "User Name", "Chemist Name", "Territory", "Category", "Class", "Address", "City Name", "Contact person", "Mobile No", "EMail ID", "State"]);
  u = await post("admin", ready, "Chemist_Upload_READY_TO_UPLOAD.xlsx"); assert.deepEqual([u.total, u.inserted, u.updated, u.failed], [10, 10, 0, 0], JSON.stringify(u.errors)); assert.equal(dealers().length, 10);
  { const d = dealers().find((x: any) => x.dealerName === "Alappy opticals"); assert.deepEqual([d.employeeCode, d.patchName, d.city, d.chemistClass, d.state, d.contactPersonName], ["E0255", "ERNAKULAM", "Ernakulam", "A", "Kerala", "Mr. Demo Contact"]); }
  await sleep(5); u = await post("admin", ready, "Chemist_Upload_READY_TO_UPLOAD.xlsx"); assert.deepEqual([u.inserted, u.updated, u.failed], [0, 10, 0]);
  l = await logs(); assert.deepEqual([l[0].success, l[0].rejected], [10, 0]);
  const demo = `${DEMO}/02_Customer_ChemistsUpload.xlsx`;
  if (fs.existsSync(demo)) { const n = rowsOf(fs.readFileSync(demo)).length; u = await post("admin", fs.readFileSync(demo), "02_Customer_ChemistsUpload.xlsx");
    assert.equal(u.total, n); assert.ok(u.errors.every((e: any) => e.field === "(key)" && /duplicate of row/.test(e.reason)), JSON.stringify(u.errors.slice(0, 3))); assert.equal(u.inserted + u.updated + u.failed, n);
    console.log(`   demo pack 02: ${n} rows -> ${u.inserted} inserted, ${u.updated} updated, ${u.failed} duplicate rows inside the file`); }
  if (fs.existsSync(`${process.env.STRESS_DIR || process.env.HOME + "/tmp/stress"}/chemist_demo_lo.xlsx`)) { const buf = fs.readFileSync(`${process.env.STRESS_DIR || process.env.HOME + "/tmp/stress"}/chemist_demo_lo.xlsx`); u = await post("admin", buf, "chemist_demo_lo.xlsx"); assert.ok(u.errors.every((e: any) => e.field === "(key)"), JSON.stringify(u.errors.slice(0, 3))); console.log("   LibreOffice-saved demo pack accepted the same way"); }
  const ready_lo = `${process.env.STRESS_DIR || process.env.HOME + "/tmp/stress"}/chemist_ready_lo.xlsx`;
  if (fs.existsSync(ready_lo)) { u = await post("admin", fs.readFileSync(ready_lo), "chemist_ready_lo.xlsx"); assert.deepEqual([u.total, u.failed], [10, 0]); console.log("   LibreOffice / openpyxl re-saves of the ready file import 10/0"); } }
console.log("9 ready file 10/0, then 10 updated ok");
console.log("R62 chemist tests passed"); server.close(); process.exit(0);
