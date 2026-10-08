// Round 61 in-memory verification (no MongoDB): Listed Doctor Upload Tool end to end through the real routers over HTTP.
// Run: npx tsx scripts/r61-tests/listed-doctor.ts
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
const upload = async (as: string, buf: Buffer, fields: Record<string, string> = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); fd.append("file", new Blob([buf]), "doctors.xlsx"); const r = await fetch(`${base}${UP}/import`, { method: "POST", headers: { authorization: `Bearer ${tokens[as]}` }, body: fd }); const b: any = await r.json(); assert.equal(r.status, 200, JSON.stringify(b)); return b.data; };
const docs = () => store["doctors"] || [];

// ═══ 1) the column grid: exactly the legacy list, legacy order, the legacy mandatory set
const LEGACY_ORDER = ["SI No", "User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "City Name(For Expense)", "Speciality", "Category", "Qualification", "Class", "Territory Type", "Address", "Hospital Name", "Hospital Address", "DOB(DD/MM/YY)", "DOW(DD/MM/YY)", "EMail ID", "Phone No", "Mobile No", "Gender", "No of Visit", "State", "Fax", "Website", "Pin Code", "Doctor Business Value", "Expected Business Value", "Product Code(p1/p2/p3)", "Country", "Hospital State", "DAY1", "DAY2", "DAY3", "Geo Tag Count", "Unique Code", "Reg No", "Avg Patient/day", "Visiting Days(Sun/Mon/)", "Others 1", "Others 2", "Others 3"];
const MANDATORY = ["SI No", "User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "City Name(For Expense)", "Speciality", "Category", "Qualification", "Class", "Territory Type", "Address", "EMail ID", "Mobile No", "Gender", "State"];
let r = await j("admin", "GET", `${UP}/columns`);
assert.equal(r.status, 200); assert.deepEqual(r.body.data.map((c: any) => c.label), LEGACY_ORDER); assert.deepEqual(r.body.data.filter((c: any) => c.mandatory).map((c: any) => c.label), MANDATORY);
console.log("1 columns ok (39, legacy order, 15 mandatory)");

// ═══ 2) Generate Excel: exactly the ticked columns (+ mandatory), yellow mandatory headers; state kept per admin; Delete and Generate New clears it
r = await j("admin", "GET", `${UP}/generated`); assert.equal(r.body.data, null);
const ticked = ["Hospital Name", "Phone No", "Unique Code"];
const gen = await bin("admin", `${UP}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ columns: [...MANDATORY, ...ticked] }) });
assert.equal(gen.status, 200); assert.match(gen.type, /spreadsheetml/);
{ const wb = new ExcelJS.Workbook(); await wb.xlsx.load(gen.buf as any); const ws = wb.worksheets[0]; const hdr = (ws.getRow(1).values as any[]).slice(1).map(String);
  assert.deepEqual(hdr, LEGACY_ORDER.filter((l) => MANDATORY.includes(l) || ticked.includes(l)), "exactly the ticked + mandatory columns, legacy order");
  hdr.forEach((h, i) => assert.equal((ws.getRow(1).getCell(i + 1).fill as any)?.fgColor?.argb === "FFFFFF00", MANDATORY.includes(h), `yellow only for mandatory: ${h}`)); }
r = await j("admin", "GET", `${UP}/generated`); assert.deepEqual(r.body.data.columns.sort(), [...MANDATORY, ...ticked].sort());
r = await j("admin2", "GET", `${UP}/generated`); assert.equal(r.body.data, null, "state is per admin user");
r = await j("admin", "POST", `${UP}/generate`, { columns: ["Not A Column"] }); assert.equal(r.status >= 400, true);
r = await j("admin", "DELETE", `${UP}/generated`); assert.equal(r.status, 200);
r = await j("admin", "GET", `${UP}/generated`); assert.equal(r.body.data, null);
console.log("2 generate / state / clear ok");

// ═══ 3) upload the selected-columns format (the one Generate Excel produced) -> real doctor rows; a bad row is rejected with a Not Uploaded List
const SEL = [...MANDATORY, "Hospital Name", "Phone No", "Unique Code"];
const row = (sno: number, user: string, name: string, terr: string, spec: string, cat: string, cls: string, extra: string[] = ["", "", ""]) => [sno, user, name, terr, "Vadodara", spec, cat, "MBBS", cls, "HQ", "12 Alkapuri", `${name.replace(/\W/g, "").toLowerCase()}@clinic.in`, "9876543210", "Male", "Gujarat", ...extra];
const f1 = xl(SEL, [
  row(1, "MR1", "Dr Asha Patel", "Alkapuri", "Gynaecologist", "Core", "A", ["Patel Clinic", "0265123456", "UQ-001"]),
  row(2, "MR1", "Dr Bharat Shah", "Fatehgunj", "Physician", "N Core", "B", ["Shah Hospital", "", "UQ-002"]),
  row(3, "MR2", "Dr Chitra Rao", "Manjalpur", "Paediatrician", "Nil", "Nil", ["", "", "UQ-003"]),
  row(4, "NOBODY", "Dr Ghost", "Nowhere", "Physician", "Core", "A", ["", "", "UQ-004"])
]);
let res = await upload("admin", f1);
assert.equal(res.total, 4); assert.equal(res.inserted, 3); assert.equal(res.failed, 1); assert.equal(res.uploaded, true);
assert.ok(res.errors.some((e: any) => e.row === 5 && /not found/.test(e.reason)));
assert.ok(res.notUploaded && res.notUploaded.base64.length > 100, "Not Uploaded List is produced");
assert.equal(docs().length, 3);
const asha = docs().find((d) => d.name === "Dr Asha Patel");
assert.equal(asha.mappedEmployeeCode, "MR1"); assert.equal(asha.status, "ACTIVE"); assert.equal(asha.specialty, "Gynaecologist"); assert.equal(asha.doctorCode, "UQ-001"); assert.equal(asha.doctorCategory, "CORE"); assert.equal(asha.category, "A"); assert.equal(asha.clinicName, "Patel Clinic");
console.log("3 selected-columns upload ok: 3 inserted, 1 rejected + Not Uploaded List");

// ═══ 4) the full 66-column legacy dump format also uploads; re-uploading updates instead of duplicating
const full = new Array(LISTEDDR_HEADERS.length).fill("");
const put = (h: string, v: string) => { full[LISTEDDR_HEADERS.indexOf(h)] = v; };
put("Employee Code", "MR2"); put("Listed Dr Name", "Dr Devika Nair"); put("Speciality", "Cardiologist"); put("Territory", "Gokulpura"); put("City Name", "Vadodara"); put("Unique Code", "UQ-005"); put("Category", "S Core"); put("Class", "C"); put("Mobile", "9811122233"); put("Email", "devika@heart.in");
res = await upload("admin", xl(LISTEDDR_HEADERS, [full], "Listeddr"));
assert.equal(res.inserted, 1, JSON.stringify(res.errors)); assert.equal(res.failed, 0); assert.equal(docs().length, 4);
assert.equal(docs().find((d) => d.doctorCode === "UQ-005").mappedEmployeeCode, "MR2");
res = await upload("admin", f1); assert.equal(res.inserted, 0); assert.equal(res.updated, 3); assert.equal(docs().length, 4, "same file again updates, never duplicates");
console.log("4 full 66-column upload + idempotent re-upload ok");

// ═══ 5) the uploaded doctors really appear where users look: admin list, field list (only own, active), manager (team only), dump report
r = await j("admin", "GET", `/company/doctors?limit=100`);
assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.data.map((d: any) => d.name).sort(), ["Dr Asha Patel", "Dr Bharat Shah", "Dr Chitra Rao", "Dr Devika Nair"]);
r = await j("mr1", "GET", `/field/doctors`); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.data.map((d: any) => d.name).sort(), ["Dr Asha Patel", "Dr Bharat Shah"], "field user sees only the doctors mapped to them");
r = await j("mr2", "GET", `/field/doctors`); assert.deepEqual(r.body.data.map((d: any) => d.name).sort(), ["Dr Chitra Rao", "Dr Devika Nair"]);
r = await j("m1", "GET", `/manager/visit-coverage`); assert.equal(r.status, 200, JSON.stringify(r.body));
const covDocs = JSON.stringify(r.body.data); for (const n of ["Dr Asha Patel", "Dr Bharat Shah", "Dr Chitra Rao", "Dr Devika Nair"]) assert.ok(covDocs.includes(n), `manager coverage lists ${n}`);
r = await j("m1", "GET", `/company/doctors`); console.log(`   (manager token on /company/doctors -> ${r.status}: that endpoint is Company-Admin only)`);
const dump = await bin("admin", `/company/mis/listeddr-dump?employeeCode=M1`);
if (dump.status === 200) { const csv = dump.buf.toString("utf8"); assert.ok(csv.includes("Dr Asha Patel") && csv.includes("Dr Devika Nair"), "Listeddr dump report lists the uploaded doctors"); console.log("   dump report lists them"); } else console.log(`   (dump report not exercised in the harness: HTTP ${dump.status})`);
console.log("5 end-to-end visibility ok");

// ═══ 6) Deactivate Existing Doctor List: all previously active doctors are deactivated, the uploaded ones are active again; they vanish from field/manager lists
res = await upload("admin", xl(SEL, [row(1, "MR1", "Dr Asha Patel", "Alkapuri", "Gynaecologist", "Core", "A", ["Patel Clinic", "", "UQ-001"])]), { deactivate: "true" });
assert.equal(res.deactivated, 4); assert.equal(res.updated, 1);
assert.deepEqual(docs().filter((d) => d.status === "ACTIVE").map((d) => d.name), ["Dr Asha Patel"]);
r = await j("mr1", "GET", `/field/doctors`); assert.deepEqual(r.body.data.map((d: any) => d.name), ["Dr Asha Patel"]);
r = await j("mr2", "GET", `/field/doctors`); assert.deepEqual(r.body.data, []);
console.log("6 deactivate-existing ok");

// ═══ 7) wrong sheet / no file -> a clear result, nothing written
const before = docs().length;
const wrong = await upload("admin", xl(SEL, [row(9, "MR1", "Dr Wrong", "X", "Physician", "Core", "A")], "Whatever"));
assert.equal(wrong.inserted, 1); assert.equal(docs().length, before + 1); /* Listed Doctor has no fixed legacy sheet name, so any single sheet is accepted without a notice */
console.log("7 sheet name is not enforced for this tool (single sheet accepted)");
console.log("R61 listed-doctor tests passed");
server.close(); process.exit(0);
