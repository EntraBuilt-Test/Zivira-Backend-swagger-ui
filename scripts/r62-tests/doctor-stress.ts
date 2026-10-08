// Round 62 stress test: real demo-pack and ready files, re-saved by other writers, uploaded as browser-like multipart requests (no MongoDB).
// Run: STRESS_DIR=<dir> npx tsx scripts/r62-tests/doctor-stress.ts
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
const docs = () => store["doctors"] || [];
const DIR = process.env.STRESS_DIR || `${process.env.HOME}/tmp/stress`;
const rawUpload = async (as: string, key: string, file: string, type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") => {
  const fd = new FormData(); fd.append("file", new Blob([fs.readFileSync(`${DIR}/${file}`)], { type }), file);
  const r = await fetch(`${base}/company/upload-tools/${key}/import`, { method: "POST", headers: { authorization: `Bearer ${tokens.admin}` }, body: fd });
  assert.equal(r.status, 200, `${file}: HTTP ${r.status}`); return ((await r.json()) as any).data;
};
const reset = () => { for (const k of ["doctors", "employees", "doctorUploadLogs", "uploadLogs", "uploadHistories", "dealers"]) store[k] = []; };
const rowsIn = (file: string) => { const wb = XLSX.read(fs.readFileSync(`${DIR}/${file}`)); const ws = wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json<any>(ws, { defval: "" }).filter((r) => Object.values(r).some((v) => String(v).trim() !== "")).length; };
const FILES: [string, number, string?][] = [
  ["demo.xlsx", rowsIn("demo.xlsx")], ["demo.csv", rowsIn("demo.csv"), "text/csv"], ["demo_openpyxl.xlsx", rowsIn("demo.xlsx")], ["demo_lo.xlsx", rowsIn("demo.xlsx")],
  ["ready.xlsx", 10], ["ready_openpyxl.xlsx", 10], ["ready_lo.xlsx", 10], ["ready_wild.xlsx", 10]
];
const listLog = async () => (await j("admin", "GET", "/company/upload-tools/listed-doctor/uploads")).body.data as any[];

// (a) Field Force master loaded through the real Salesforce upload endpoint first
for (const [file, n, type] of FILES) {
  reset();
  const sf = await rawUpload("admin", "field-force", "salesforce.xlsx");
  assert.ok(sf.uploaded && sf.failed === 0, `salesforce: ${JSON.stringify(sf.errors).slice(0, 300)}`);
  const emps = store["employees"].length;
  const r = await rawUpload("admin", "listed-doctor", file, type);
  // the demo pack itself holds one repeated doctor (rows 219 and 226: same employee, name and territory); the ready file has none
  const dup = file.startsWith("demo") ? 1 : 0; const ok = n - dup;
  assert.deepEqual([r.failed, r.total], [dup, n], `${file} (a): ${r.outcome} ${JSON.stringify(r.errors.slice(0, 3))}`);
  assert.ok(r.errors.every((e: any) => e.field === "(key)" && /duplicate of row/.test(e.reason)));
  assert.equal(r.inserted + r.updated, ok); assert.equal(docs().length, ok, `${file}: doctors stored`);
  const l = await listLog(); assert.deepEqual([l[0].success, l[0].rejected], [ok, dup]);
  const again = await rawUpload("admin", "listed-doctor", file, type); assert.deepEqual([again.inserted, again.updated, again.failed], [0, ok, dup]);
  console.log(`(a) ${file}: ${n} rows -> ${r.inserted} inserted, ${dup} rejected${dup ? " (duplicate inside the file)" : ""} (${emps} employees from Salesforce); re-upload ${again.updated} updated`);
}
// (b) empty Field Force master: one clear message, nothing stored, history says why
for (const [file, n, type] of FILES) {
  reset();
  const r = await rawUpload("admin", "listed-doctor", file, type);
  assert.equal(r.uploaded, false); assert.equal(docs().length, 0);
  assert.ok(/Field Force master has no employees/.test(r.outcome), `${file} (b): ${r.outcome}`);
  const l = await listLog(); assert.equal(l.length, 1); assert.equal(l[0].success, 0); assert.ok(/Field Force master has no employees/.test(l[0].topReason), l[0].topReason);
  console.log(`(b) ${file}: "${r.outcome.slice(0, 70)}..."`);
}
// (c) master has employees, but not the ones in the file: every row rejected for ONE reason, named in the history and the Not Uploaded List
reset(); emp("ZZ1", "Somebody Else", "BE");
for (const file of ["demo.xlsx", "ready.xlsx"]) {
  const r = await rawUpload("admin", "listed-doctor", file);
  const l = await listLog(); const top = l[0];
  assert.deepEqual([top.success, top.rejected, top.read], [0, r.total, r.total]); assert.equal(top.topReasonRows, r.total); assert.equal(top.topReason, "User Name not found in Field Force");
  const dl = await bin("admin", `/company/upload-tools/listed-doctor/uploads/${top.id}/not-uploaded`); assert.equal(dl.status, 200);
  const rows = XLSX.utils.sheet_to_json<any>(XLSX.read(dl.buf, { type: "buffer" }).Sheets["Not Uploaded List"]); assert.equal(rows.length, r.total);
  assert.ok(rows.every((x) => /User Name: User Name ".+" not found in Field Force/.test(x.Reason)), rows[0].Reason);
  console.log(`(c) ${file}: all ${r.total} rejected, topReason="${top.topReason}", Reason column e.g. ${rows[0].Reason.slice(0, 90)}`);
}
// (d) login name and spaced / upper-case code resolve to the same employee
reset(); emp("E0500", "Login Person", "BE"); store["users"].push(wrap({ _id: asId(50), username: "login.p", displayName: "Login Person", role: "MR", portal: "FIELD_FORCE", tenantSlug: T, employeeCode: "E0500" }));
{ const buf = xl(["User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "Speciality"], [[" e0500 ", "Dr L1", "T1", "Eye"], ["login.p", "Dr L2", "T1", "Eye"], ["Login Person", "Dr L3", "T1", "Eye"], ["E 0500", "Dr L4", "T1", "Eye"]]);
  const fd = new FormData(); fd.append("file", new Blob([buf]), "x.xlsx"); const r: any = (await (await fetch(`${base}/company/upload-tools/listed-doctor/import`, { method: "POST", headers: { authorization: `Bearer ${tokens.admin}` }, body: fd })).json()).data;
  assert.deepEqual([r.inserted, r.failed], [4, 0], JSON.stringify(r.errors)); assert.ok(docs().every((d: any) => d.mappedEmployeeCode === "E0500")); }
// the "Uploaded by" is the admin's display name, not an id
{ const l = await listLog(); assert.equal(l[0].uploadedBy, "Corporate HQ"); }
console.log("(d) code with spaces / case, login name and exact name resolve to the same employee; uploaded-by is the display name");
console.log("R62 doctor stress test passed"); server.close(); process.exit(0);
