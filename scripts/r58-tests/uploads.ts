// Round 58 in-memory verification (no MongoDB): the 12 legacy upload tools, driven over real HTTP (express + multer) with the demo data pack. Run: npx tsx scripts/r58-tests/uploads.ts
import mongoose from "mongoose";
import sift from "sift";

// ── Tiny in-memory stand-in for Mongo: patches Model query statics so the
// REAL compute code (mis-reports-compute.ts + helpers) runs unmodified over
// seeded documents. sift evaluates the real Mongo filter operators.
const store: Record<string, any[]> = {};
const asId = (n: number) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"));
class Q {
  constructor(private docs: any[], private model: any) {}
  select() { return this; }
  sort(spec: any) { const [k, dir] = Object.entries(spec)[0] as [string, number]; this.docs = [...this.docs].sort((a, b) => (a[k] > b[k] ? 1 : -1) * (dir < 0 ? -1 : 1)); return this; }
  populate(path: string) {
    const doctors = store["doctors"] || [];
    this.docs = this.docs.map((d) => ({ ...d, [path]: doctors.find((x) => String(x._id) === String(d[path])) || d[path] }));
    return this;
  }
  lean() { return this; }
  then(res: any, rej: any) { return Promise.resolve(JSON.parse(JSON.stringify(this.docs), (k, v) => v)).then((x) => x.map((d: any, i: number) => ({ ...this.docs[i], ...d, _id: this.docs[i]._id }))).then(res, rej); }
}
const coll = (m: any) => store[m.collection.name] || (store[m.collection.name] = []);
(mongoose.Model as any).find = function (f: any = {}) { return new Q(coll(this).filter(sift(f)), this); };
(mongoose.Model as any).findOne = function (f: any = {}) { const q = new Q(coll(this).filter(sift(f)), this); const t = q.then.bind(q); (q as any).then = (res: any, rej: any) => t((arr: any[]) => arr[0] || null).then(res, rej); const s = q.sort.bind(q); (q as any).sort = (x: any) => { s(x); return q; }; return q; };
(mongoose.Model as any).countDocuments = function (f: any = {}) { return Promise.resolve(coll(this).filter(sift(f)).length); };
(mongoose.Model as any).aggregate = function (pipe: any[]) {
  const match = pipe[0].$match; const docs = coll(this).filter(sift(match)); const g = pipe[1].$group; const out = new Map<string, any>();
  for (const d of docs) { const id = d.employeeCode; const cur = out.get(id); const v = d.visitDateOnly; if (!cur || v > cur.last) out.set(id, { _id: id, last: v }); }
  return Promise.resolve(Array.from(out.values()));
};
(mongoose.Model as any).distinct = function (k: string, f: any = {}) { return Promise.resolve([...new Set(coll(this).filter(sift(f)).map((d) => d[k]))]); };
let seq = 5000;
(mongoose.Model as any).create = function (arg: any) {
  const arr = Array.isArray(arg) ? arg : [arg];
  const made = arr.map((d: any) => { const doc = { _id: asId(seq++), ...d }; coll(this).push(doc); return doc; });
  return Promise.resolve(Array.isArray(arg) ? made : made[0]);
};
const applyUpdate = (docs: any[], u: any) => { for (const d of docs) { Object.assign(d, u.$set || {}); } };
(mongoose.Model as any).updateOne = function (f: any, u: any, o: any = {}) { const d = coll(this).filter(sift(f))[0]; if (d) applyUpdate([d], u); else if (o.upsert) coll(this).push({ _id: asId(seq++), ...f, ...(u.$set || {}) }); return Promise.resolve({}); };
(mongoose.Model as any).updateMany = function (f: any, u: any) { applyUpdate(coll(this).filter(sift(f)), u); return Promise.resolve({}); };
(Q.prototype as any).limit = function (n: number) { this.docs = this.docs.slice(0, n); return this; };
(mongoose.Model as any).deleteMany = function (f: any = {}) { const c = coll(this); const hit = new Set(c.filter(sift(f))); const keep = c.filter((d) => !hit.has(d)); c.length = 0; c.push(...keep); return Promise.resolve({ deletedCount: hit.size }); };
(mongoose.Model as any).deleteOne = function (f: any = {}) { const c = coll(this); const d = c.find(sift(f)); if (d) c.splice(c.indexOf(d), 1); return Promise.resolve({ deletedCount: d ? 1 : 0 }); };

import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import express from "express";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

const T = "demo";
const DEMO = process.env.UPLOAD_DEMO_DIR || path.join(process.env.HOME || "", "mnt/Zivira/Claude outputs/upload-demo-data/upload-demo-data");
const demo = (f: string) => fs.readFileSync(path.join(DEMO, f));
const xl = (headers: string[], rows: unknown[][], sheet = "Sheet1") => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), sheet); return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer; };
const rowsOf = (buf: Buffer) => { const wb = XLSX.read(buf, { type: "buffer" }); return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" }); };

// ── seed the prerequisites that are NOT part of the 12 uploads (masters the uploads refer to)
store["tenants"] = [{ slug: T, name: "Zivira Labs Pvt Ltd" }];
store["states"] = ["Gujarat", "Kerala", "Karnataka", "Tamil Nadu"].map((n) => ({ tenantSlug: T, stateName: n, status: "ACTIVE" }));
store["leaveTypes"] = ["Casual Leave", "Sick Leave", "Earned Leave"].map((n) => ({ tenantSlug: T, leaveTypeDesc: n, status: "ACTIVE" }));
store["inputMaster"] = ["Visual Aid", "Prescription Pad", "Leave Behind Card"].map((n, i) => ({ tenantSlug: T, inputCode: `IN${i + 1}`, inputName: n }));
store["subdivisions"] = [{ tenantSlug: T, division: "Zivira Labs Pvt Ltd", subdivisionName: "Astra", status: "ACTIVE" }];
store["productBrands"] = [{ tenantSlug: T, brandName: "BEPIREX", status: "ACTIVE" }, { tenantSlug: T, brandName: "STRIOS", status: "ACTIVE" }];

// ── Round 59: slide files live in GridFS in production; the test swaps in an in-memory store with the same interface
const { setSlideStore } = await import("../../src/utils/slide-store.js");
const slideFiles = new Map<string, Buffer>(); let slideSeq = 1;
setSlideStore({ put: async (buf) => { const id = `f${slideSeq++}`; slideFiles.set(id, Buffer.from(buf)); return id; }, read: async (id) => { const b = slideFiles.get(id); if (!b) throw new Error("missing"); return b; }, remove: async (id) => { slideFiles.delete(id); } });

// ── real HTTP server around the real router (multer parses the real multipart bodies)
const { uploadToolsRouter } = await import("../../src/routes/upload-tools.routes.js");
const { HttpError } = await import("../../src/http/errors.js");
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((req: any, _res, next) => { req.auth = { tenantSlug: T, sub: String(req.headers["x-user"] || "000000000000000000000001") }; next(); });
app.use("/api/company/upload-tools", uploadToolsRouter);
app.use((err: any, _req: any, res: any, _next: any) => { res.status(err instanceof HttpError ? err.statusCode : err?.name === "ZodError" ? 400 : err?.code === "LIMIT_FILE_SIZE" ? 413 : 500).json({ error: err.message }); });
const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}/api/company/upload-tools`;
const form = (fields: Record<string, string>, files: { name: string; field?: string; buf: Buffer; type?: string }[] = []) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); for (const f of files) fd.append(f.field || "file", new Blob([f.buf], f.type ? { type: f.type } : {}), f.name); return fd; };
const imp = async (key: string, buf: Buffer, fields: Record<string, string> = {}, name = "demo.xlsx") => (await (await fetch(`${base}/${key}/import`, { method: "POST", body: form(fields, [{ name, buf }]) })).json() as any).data;
const get = async (p: string) => { const r = await fetch(`${base}${p}`); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") || "" }; };
const brief = (r: any) => `${r.outcome} | total ${r.total} ok ${r.ok} failed ${r.failed} ins ${r.inserted} upd ${r.updated} skipped ${r.skipped} uploaded ${r.uploaded}`;

const log = (n: string, r: any) => { console.log(`-- ${n}: ${brief(r)}`); for (const e of (r.errors || []).slice(0, 3)) console.log(`     row ${e.row} ${e.field}: ${e.reason}`); for (const w of (r.warnings || []).slice(0, 2)) console.log(`     warn: ${w.reason}`); };
const tplOf = async (key: string, q = "") => { const r = await get(`/${key}/template${q}`); assert.equal(r.status, 200, `${key} template ${r.status}`); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf as any); return wb; };
const header = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as any[]).slice(1).map(String);
const yellow = (ws: ExcelJS.Worksheet) => header(ws).filter((_, i) => (ws.getRow(1).getCell(i + 1).fill as any)?.fgColor?.argb === "FFFFFF00");

// ═══ meta + legacy sheet names / yellow mandatory columns
const list = (await (await fetch(base)).json() as any).data; assert.equal(list.length, 12);
const tpl: [string, string, string[], string[]][] = [
  ["sample", "Upl_Despatch_Master", ["Employee ID", "Sample ERP Code", "Despatch Qty"], ["Employee ID", "Sample ERP Code", "Despatch Qty"]],
  ["input", "Upl_Despatch_Master", ["Employee ID", "Input Code", "Despatch Qty"], ["Employee ID", "Input Code", "Despatch Qty"]],
  ["target", "Upl_Target_Master", ["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"], ["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"]],
  ["field-force", "UPL_SalesForce", ["Employee Code", "Name", "Designation", "HQ", "State", "DOJ", "Reporting Manager Code", "Reporting Manager Name", "Reporting Manager II Name", "Mobile", "Email", "Division", "SubDivision"], ["Employee Code", "Name", "Designation", "HQ"]],
  ["stockist", "UPL_Stockist_Master", ["ERP Code", "Stockist Name", "HQ Name", "State", "Emp Code", "Fieldforce Name", "HQ Code"], ["ERP Code", "Stockist Name", "State"]],
  ["product", "UPL_Product_Master", ["Product Code", "Product Name", "Group", "Category", "Brand", "Pack", "Division", "Active"], ["Product Code", "Product Name"]],
  ["holiday-fixation", "UPL_Holiday_Fixation", ["Date", "Holiday Name", "State", "HQ", "Type"], ["Date", "Holiday Name", "State"]],
  ["leave-bulk-upload", "Leave_Upload", ["Employee Code", "Leave Type", "From Date", "To Date", "Days", "Reason", "Status"], ["Employee Code", "Leave Type", "From Date", "To Date"]]
];
for (const [key, sheet, cols, req] of tpl) { const ws = (await tplOf(key)).getWorksheet(sheet)!; assert.ok(ws, `${key}: sheet ${sheet}`); assert.deepEqual(header(ws), cols, key); assert.deepEqual(yellow(ws), req, `${key} yellow`); }
assert.equal((await get("/product-rate/template")).status, 400);                                   // state is required
console.log("templates OK");

// ═══ product reference tables: legacy fallback only while the product master is empty
const ref0 = (await (await fetch(`${base}/product/reference`)).json() as any).data;
assert.equal(ref0.source, "legacy-fallback"); assert.equal(ref0.groups.length, 8); assert.ok(ref0.brands.includes("STRIOS"));

const ok = (r: any, total: number, failed = 0) => { assert.equal(r.total, total, brief(r)); assert.equal(r.failed, failed, brief(r)); assert.deepEqual(r.fileErrors, []); };
const unList = (r: any) => { assert.ok(r.notUploaded, "notUploaded list"); const rows = rowsOf(Buffer.from(r.notUploaded.base64, "base64")); return rows; };

// ═══ 6) Salesforce (demo 06 as-is), wrong sheet name, Deactivate Existing
let r = await imp("field-force", demo("06_Upload_SalesforceUpload.xlsx")); ok(r, 71); assert.equal(r.inserted, 71); assert.equal(r.outcome, "Successful");
assert.ok(r.warnings.some((w: any) => /sheet is named 'Sheet1'/.test(w.reason)));                                  // single-sheet fallback is disclosed
// Round 60: a manager NAME that exists nowhere gets a flagged stub instead of leaving the employee without a manager
assert.ok(r.autoCreatedManagers.length > 0 && r.warnings.some((w: any) => w.row === 0 && /manager\(s\) auto-created, code pending/.test(w.reason)));
const withMgr = store["employees"].filter((e) => !e.codePending && e.reportingManager).length;
const stubsMade = store["employees"].filter((e) => e.codePending);
const namedMgr = rowsOf(demo("06_Upload_SalesforceUpload.xlsx")).filter((x) => String(x["Reporting Manager Name"] ?? "").trim() || String(x["Reporting Manager Code"] ?? "").trim()).length;
console.log(`salesforce: 71 imported, ${withMgr} of ${namedMgr} rows naming a manager now resolved, ${stubsMade.length} manager stub(s) auto-created: ${stubsMade.map((e) => `${e.employeeCode} ${e.name} [${e.role}]`).join(" | ")}`);
assert.equal(withMgr, namedMgr, "every row that names a manager is linked");
for (const st of stubsMade) { assert.ok(/^MGR-PENDING-\d{3}$/.test(st.employeeCode)); assert.equal(st.status, "ACTIVE"); assert.equal(st.autoCreatedSource, "auto-created from Salesforce upload"); }
const upChain = async (code: string) => { const out: string[] = []; let c = store["employees"].find((e) => e.employeeCode === code); const seen = new Set<string>(); while (c?.reportingManager && !seen.has(c.reportingManager)) { seen.add(c.reportingManager); out.push(c.reportingManager); c = store["employees"].find((e) => e.employeeCode === c.reportingManager); } return out; };
for (const e of store["employees"].filter((x) => !x.codePending && x.reportingManager)) assert.ok(store["employees"].some((m) => m.employeeCode === e.reportingManager), "no dangling manager link");
(globalThis as any).__stubs = stubsMade.length; (globalThis as any).__upChain = upChain;
const two = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(two, XLSX.utils.aoa_to_sheet([["Employee Code"]]), "A"); XLSX.utils.book_append_sheet(two, XLSX.utils.aoa_to_sheet([["x"]]), "B");
const bad = await imp("field-force", XLSX.write(two, { type: "buffer", bookType: "xlsx" }) as Buffer);
assert.equal(bad.outcome, "Sheet Name Must be 'UPL_SalesForce'"); assert.equal(bad.uploaded, false);
const named = XLSX.read(demo("06_Upload_SalesforceUpload.xlsx"), { type: "buffer" }); named.SheetNames = ["UPL_SalesForce"]; named.Sheets = { UPL_SalesForce: named.Sheets[Object.keys(named.Sheets)[0]] };
r = await imp("field-force", XLSX.write(named, { type: "buffer", bookType: "xlsx" }) as Buffer); ok(r, 71); assert.equal(r.updated, 71); assert.ok(!r.warnings.some((w: any) => /sheet is named/.test(w.reason)));   // legacy sheet name: no note, idempotent

{ const sfp = await imp("field-force", xl(["Employee Code", "Name", "Designation", "HQ", "Reporting Manager Name"], [["T001", "Test Rep One", "BE", "SURAT", "test  manager.  two"], ["T002", "TEST MANAGER TWO", "ABM", "SURAT", ""], ["T003", "Test Rep Three", "BE", "SURAT", "Nobody Known"]]), {}, "t.xlsx");
  assert.equal(sfp.failed, 0); assert.equal(store["employees"].find((e) => e.employeeCode === "T001").reportingManager, "T002", "manager defined LATER in the same file, spacing/case/punctuation-insensitive");
  const t3 = store["employees"].find((e) => e.employeeCode === "T003"); const stubN = store["employees"].find((e) => e.employeeCode === t3.reportingManager);
  assert.ok(stubN && stubN.codePending && stubN.name === "Nobody Known" && stubN.role === "ABM", "an unknown manager name becomes a flagged stub (BE reports -> ABM)"); assert.ok(sfp.warnings.some((w: any) => /1 manager\(s\) auto-created, code pending/.test(w.reason)));
  store["employees"] = store["employees"].filter((e) => !/^T00/.test(e.employeeCode) && e.name !== "Nobody Known"); }

// ═══ 8) Product (demo 08) and its reference tables (distinct values from the real master)
r = await imp("product", demo("08_Upload_ProductUpload.xlsx")); ok(r, 28); assert.equal(r.inserted, 28);
const ref1 = (await (await fetch(`${base}/product/reference`)).json() as any).data;
assert.equal(ref1.source, "product-master"); assert.equal(ref1.brands.length, new Set(store["products"].map((p) => p.brandName)).size); assert.ok(ref1.brands.includes("STRIOS"));
// Round 59: the demo Product file now carries real Category / Group values (legacy lists), so the reference tables come from the master
assert.deepEqual(ref1.categories, [...new Set(store["products"].filter((p) => p.category).map((p) => p.category))].sort((a: string, b: string) => a.localeCompare(b)));
assert.ok(ref1.categories.length >= 7 && ref1.groups.length >= 6 && store["products"].filter((p) => p.code?.startsWith("ZV") && p.category && p.group).length === 28);
// each list falls back to the legacy list on its own when the master has no values for it
{ const keep = store["products"].map((p) => [p.category, p.group]); store["products"].forEach((p) => { p.category = ""; p.group = null; });
  const mixed = (await (await fetch(`${base}/product/reference`)).json() as any).data;
  assert.equal(mixed.source, "mixed"); assert.deepEqual(mixed.sources, { categories: "legacy-fallback", groups: "legacy-fallback", brands: "product-master" }); assert.equal(mixed.categories.length, 10); assert.equal(mixed.groups.length, 8); assert.ok(mixed.brands.includes("STRIOS"));
  store["products"].forEach((p, i) => { p.category = keep[i][0]; p.group = keep[i][1]; }); }
// Group / Category columns import
r = await imp("product", xl(["Product Code", "Product Name", "Group", "Category", "Brand", "Pack", "Division", "Active"], [["ZVX1", "NEWPROD", "AIC", "ANTI-INFECTIVE", "NEWB", "10ml", "Zivira Labs Pvt Ltd", "Yes"]]), {}, "p.xlsx");
ok(r, 1); const np = store["products"].find((p) => p.code === "ZVX1"); assert.deepEqual([np.group, np.category, np.brandName], ["AIC", "ANTI-INFECTIVE", "NEWB"]);

// ═══ 9) Product Rate (demo 09): state-wise
const sts = (await (await fetch(`${base}/product-rate/states`)).json() as any).data; assert.equal(sts.default, "Gujarat"); assert.deepEqual(sts.states, ["Gujarat", "Karnataka", "Kerala", "Tamil Nadu"]);
r = await imp("product-rate", demo("09_Upload_ProductRate_DEMO_VALUES.xlsx")); assert.equal(r.uploaded, false); assert.match(r.outcome, /State/);
r = await imp("product-rate", demo("09_Upload_ProductRate_DEMO_VALUES.xlsx"), { state: "Gujarat" }); ok(r, 28); assert.equal(r.inserted, 28);
r = await imp("product-rate", demo("09_Upload_ProductRate_DEMO_VALUES.xlsx"), { state: "Kerala" }); ok(r, 28); assert.equal(r.inserted, 28);
assert.equal(store["productRates"].length, 56); assert.deepEqual([...new Set(store["productRates"].map((x) => x.stateName))].sort(), ["Gujarat", "Kerala"]);
r = await imp("product-rate", demo("09_Upload_ProductRate_DEMO_VALUES.xlsx"), { state: "Gujarat" }); assert.equal(r.updated, 28); assert.equal(store["productRates"].length, 56);   // idempotent per state
const tws = (await tplOf("product-rate", "?state=Gujarat")).getWorksheet("UPL_Product_Rate")!; assert.equal(tws.rowCount - 1, 29);   // every active product (28 demo + ZVX1), rates pre-filled
assert.deepEqual((tws.getRow(2).values as any[]).slice(1, 6), ["ZV001", "BEPIREX", 110, 99, 137.5]);
assert.equal(store["products"].find((p) => p.code === "ZV001").rate, 110);                                      // no field force has a state yet -> tie -> first state
// Round 59: Product.rate = the rate of the state with the most ACTIVE field force (tie: the state uploaded first)
{ const act = store["employees"].filter((e) => e.status === "ACTIVE"); act.slice(0, 3).forEach((e) => (e.state = "Kerala")); act.slice(3, 4).forEach((e) => (e.state = "Gujarat"));
  await imp("product-rate", xl(["Product Code", "PTR", "Effective From"], [["ZV001", 200, "02/10/2026"]]), { state: "Kerala" });
  const z = store["products"].find((p) => p.code === "ZV001"); assert.equal(z.rate, 200); assert.equal(z.rateState, "Kerala");           // Kerala has 3 field force vs Gujarat 1
  act.slice(4, 9).forEach((e) => (e.state = "Gujarat"));                                                                                       // Gujarat now has 6
  await imp("product-rate", xl(["Product Code", "PTR", "Effective From"], [["ZV001", 110, "01/10/2026"]]), { state: "Gujarat" });
  assert.equal(z.rate, 110); assert.equal(z.rateState, "Gujarat");
  assert.equal(store["productRates"].filter((x) => x.productCode === "ZV001" && x.stateName === "Kerala").length, 2); }               // per-state rows untouched

// ═══ 7) Stockist (demo 07, Round 59): every row has an ERP Code and a real employee code from the Salesforce demo -> imports fully
r = await imp("stockist", demo("07_Upload_StockistUpload.xlsx")); ok(r, 73, 0); assert.equal(r.uploaded, true); assert.equal(r.outcome, "Successful"); assert.equal(r.notUploaded, null);
{ const erps = new Set(rowsOf(demo("07_Upload_StockistUpload.xlsx")).map((x) => String(x["ERP Code"]))); assert.equal(r.inserted, erps.size); assert.equal(r.inserted + r.updated, 73); assert.equal(erps.size, 73); }
assert.ok(store["stockists"].every((x) => x.hqName), "HQ defaults to the mapped employee's HQ");

// ═══ 1) Listed Doctor (demo 01, 66-col as-is) + Generate Excel round trip + Deactivate Existing
r = await imp("listed-doctor", demo("01_Customer_ListedDoctorUpload.xlsx")); ok(r, 378, 1); assert.equal(r.inserted, 377); assert.equal(unList(r).length, 1);
const dd = store["doctors"][0]; assert.ok(dd.name && dd.specialty && dd.territory && dd.mappedEmployeeCode && dd.status === "ACTIVE");
const cols = (await (await fetch(`${base}/listed-doctor/columns`)).json() as any).data;
assert.equal(cols.length, 40); assert.deepEqual(cols.filter((c: any) => c.mandatory).map((c: any) => c.label), ["SI No", "User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "City Name(For Expense)", "Speciality", "Category", "Qualification", "Class", "Territory Type", "Address", "EMail ID", "Mobile No", "Gender", "State"]);
assert.deepEqual(cols.slice(0, 12).map((c: any) => c.label), ["SI No", "User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "City Name(For Expense)", "Speciality", "Category", "Qualification", "Class", "Territory Type", "Address", "Hospital Name"]);   // screen order, row by row
const gen = await fetch(`${base}/listed-doctor/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: ["Hospital Name", "Fax", "Others 1"] }) });
const genWb = new ExcelJS.Workbook(); await genWb.xlsx.load(Buffer.from(await gen.arrayBuffer()) as any); const gws = genWb.worksheets[0];
assert.deepEqual(header(gws), ["SI No", "User Name", "Listed Doctor Name", "Territory/Cluster(For DCR)", "City Name(For Expense)", "Speciality", "Category", "Qualification", "Class", "Territory Type", "Address", "Hospital Name", "EMail ID", "Mobile No", "Gender", "State", "Fax", "Others 1"]);
assert.equal(yellow(gws).length, 15);
assert.equal((await fetch(`${base}/listed-doctor/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: ["Nope"] }) })).status, 400);
// Round 59: the generated state is kept on the server per company user; "Delete and Generate New Excel" clears it
{ const g1 = (await (await fetch(`${base}/listed-doctor/generated`)).json() as any).data; assert.deepEqual(g1.columns, ["Hospital Name", "Fax", "Others 1"]); assert.ok(g1.generatedAt);
  assert.equal((await (await fetch(`${base}/listed-doctor/generated`, { headers: { "x-user": "000000000000000000000002" } })).json() as any).data, null, "another user has no generated state");
  assert.equal((await (await fetch(`${base}/chemist/generated`)).json() as any).data, null, "per tool");
  assert.equal((await fetch(`${base}/listed-doctor/generated`, { method: "DELETE" })).status, 200); assert.equal((await (await fetch(`${base}/listed-doctor/generated`)).json() as any).data, null);
  assert.equal((await fetch(`${base}/target/generated`)).status, 404); }
// Round 59: "Speciality / Category" popup = real distinct values with counts from the doctor master
{ const rf = (await (await fetch(`${base}/listed-doctor/reference`)).json() as any).data; const act = store["doctors"].filter((d) => d.status === "ACTIVE");
  assert.equal(rf.total, act.length); assert.equal(rf.specialities.reduce((a: number, x: any) => a + x.count, 0), act.length); assert.ok(rf.specialities.every((x: any) => x.value && x.count > 0));
  assert.deepEqual(rf.specialities.slice(0, 1), [{ value: rf.specialities[0].value, count: Math.max(...rf.specialities.map((x: any) => x.count)) }]);
  assert.equal(rf.categories.reduce((a: number, x: any) => a + x.count, 0), act.filter((d) => d.doctorCategory).length); }
const emps = store["employees"]; const byNameCount = (n: string) => emps.filter((e) => e.name.toLowerCase() === n.toLowerCase()).length;
const uniqueEmp = emps.find((e) => byNameCount(e.name) === 1)!;
gws.addRow([1, emps[0].employeeCode, "Dr Gen One", "T-GEN", "Calicut", "OPT", "CORE", "MBBS", "A", "HQ", "1 Road", "Gen Hospital", "gen1@x.com", "9876543210", "Male", "Kerala", "0471-2", "note1"]);
gws.addRow([2, uniqueEmp.name, "Dr Gen Two", "T-GEN", "Calicut", "MSO", "Nil", "MS", "B", "EX", "2 Road", "", "gen2@x.com", "9876543211", "Female", "Kerala", "", ""]);   // User Name = a unique employee NAME
const genBuf = Buffer.from(await genWb.xlsx.writeBuffer());
r = await imp("listed-doctor", genBuf, { deactivate: "true" }, "gen.xlsx"); ok(r, 2); assert.equal(r.inserted, 2); assert.equal(r.deactivated, 377);
const g1 = store["doctors"].find((d) => d.name === "Dr Gen One"), g2 = store["doctors"].find((d) => d.name === "Dr Gen Two");
assert.deepEqual([g1.mappedEmployeeCode, g1.state, g1.clinicName, g1.uploadExtras, g1.email, g1.doctorCategory, g1.category], [emps[0].employeeCode, "Kerala", "Gen Hospital", { fax: "0471-2", others1: "note1" }, "gen1@x.com", "CORE", "A"]);
assert.equal(g2.mappedEmployeeCode, uniqueEmp.employeeCode); assert.equal(g2.territoryType, "EX");
assert.equal(store["doctors"].filter((d) => d.status === "ACTIVE").length, 2); assert.equal(store["doctors"].filter((d) => d.status === "INACTIVE").length, 377);   // Deactivate Existing Doctor List

// ═══ 2) Chemists (demo 02 as-is) + generated format + Deactivate Existing
r = await imp("chemist", demo("02_Customer_ChemistsUpload.xlsx")); ok(r, 287, 1); assert.equal(r.inserted, 286);
{ const rf = (await (await fetch(`${base}/chemist/reference`)).json() as any).data; assert.equal(rf.total, 286); assert.ok(Array.isArray(rf.categories) && Array.isArray(rf.classes)); }
const ccols = (await (await fetch(`${base}/chemist/columns`)).json() as any).data; assert.equal(ccols.length, 24); assert.deepEqual(ccols.filter((c: any) => c.mandatory).map((c: any) => c.label), ["SI No", "User Name", "Chemist Name", "Territory"]);
const cg = await fetch(`${base}/chemist/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: ["Category", "Contact person", "Contact Person Designation", "Shop landline No", "Chemist ERP Code", "Others 2"] }) });
const cwb = new ExcelJS.Workbook(); await cwb.xlsx.load(Buffer.from(await cg.arrayBuffer()) as any); const cws = cwb.worksheets[0];
assert.deepEqual(header(cws), ["SI No", "User Name", "Chemist Name", "Territory", "Category", "Contact person", "Contact Person Designation", "Shop landline No", "Chemist ERP Code", "Others 2"]);
cws.addRow([1, emps[0].employeeCode, "Gen Chemist", "T-GEN", "A", "Mr Z", "Owner", "0471-99", "CH-9", "x2"]);
r = await imp("chemist", Buffer.from(await cwb.xlsx.writeBuffer()), { deactivate: "true" }, "cgen.xlsx"); ok(r, 1); assert.equal(r.deactivated, 286);
const gc = store["dealers"].find((d) => d.dealerName === "Gen Chemist"); assert.deepEqual([gc.employeeCode, gc.patchName, gc.category, gc.contactPersonName, gc.contactDesignation, gc.shopLandline, gc.chemistErpCode, gc.uploadExtras], [emps[0].employeeCode, "T-GEN", "A", "Mr Z", "Owner", "0471-99", "CH-9", { others2: "x2" }]);
assert.equal(store["dealers"].filter((d) => d.status === "ACTIVE").length, 1);

// ═══ 11) Holiday (demo 11), 12) Leave (demo 12, Financial Year 2026)
r = await imp("holiday-fixation", demo("11_Upload_HolidayFixationBulkUpload.xlsx")); ok(r, 13); assert.equal(r.inserted, 13); assert.ok(store["holidays"].some((h) => h.stateName === "All"));
r = await imp("holiday-fixation", xl(["Date", "Holiday Name", "State", "HQ", "Type"], [["2026-11-14", "Iso Day", "Kerala", "", "State"]], "UPL_Holiday_Fixation"), {}, "h.xlsx"); ok(r, 1);   // YYYY-MM-DD as the legacy note requires
assert.equal(new Date(store["holidays"].find((h) => h.otherHolidayDescription === "Iso Day").otherHolidayDate).toISOString().slice(0, 10), "2026-11-14");
r = await imp("leave-bulk-upload", demo("12_Upload_LeaveUpload_DEMO_VALUES.xlsx"), { fy: "2026" }); ok(r, 69); assert.equal(r.inserted, 69);
r = await imp("leave-bulk-upload", xl(["Employee Code", "Leave Type", "From Date", "To Date", "Days", "Reason", "Status"], [[emps[0].employeeCode, "Casual Leave", "10/05/2025", "10/05/2025", 1, "old", "Approved"], [emps[0].employeeCode, "Casual Leave", "04/02/2027", "04/02/2027", 1, "fy ok", "Approved"], [emps[0].employeeCode, "Casual Leave", "05/04/2027", "05/04/2027", 1, "after fy", "Approved"]], "Leave_Upload"), { fy: "2026" }, "l.xlsx");
ok(r, 3, 2); assert.match(r.errors[0].reason, /outside financial year 2026 - 2027/);

// ═══ 5) Target (demo 05): Financial Year 2026 - 2027, all-or-nothing, FY replace
r = await imp("target", demo("05_Customer_TargetUpload_DEMO_VALUES.xlsx"), { fy: "2026" }); ok(r, 552); assert.equal(r.inserted, 552); assert.equal(store["targetMaster"].length, 552);
const goodRow = ["E0038", "ZV024", 4, 10, 5, 50] as unknown[];
const TH6 = ["HQ Code", "Sale ERP Code", "Month", "Target Qty", "Target Rate", "Target Value"];
r = await imp("target", xl(TH6, [goodRow, ["E0038", "NOPE", 5, 1, 1, 1], ["E0038", "ZV024", 99, 1, 1, 1]]), { fy: "2026" }, "t.xlsx");
assert.equal(r.uploaded, false); assert.equal(r.failed, 2); assert.equal(r.inserted, 0); assert.equal(store["targetMaster"].length, 552);          // nothing changed
assert.match(r.outcome, /nothing was uploaded/); const nu = unList(r); assert.equal(nu.length, 2); assert.ok(String(nu[0].Reason).includes("Sale ERP Code") || String(nu[0].Reason).includes("Product Code"));
r = await imp("target", xl(TH6, [["E0038", "ZV024", 4, 10, 5, ""], ["E0038", "ZV024", 2, 20, "", 400]]), { fy: "2026" }, "t.xlsx"); ok(r, 2);       // legacy columns: no Year (derived from the FY), Value = Qty x Rate
assert.equal(store["targetMaster"].length, 2);                                                                                                     // the FY was replaced
const t1 = store["targetMaster"].find((t) => t.monthKey === "2026-04"), t2 = store["targetMaster"].find((t) => t.monthKey === "2027-02");
assert.deepEqual([t1.targetUnit, t1.targetValue, t1.unitPrice, t2.targetUnit, t2.targetValue, t2.unitPrice], [10, 50, 5, 20, 400, 20]);
r = await imp("target", xl([...TH6, "Year"], [["E0038", "ZV024", 6, 1, 1, 1, 2026]]), {}, "t.xlsx"); assert.equal(r.inserted, 1);                                       // without FY nothing is replaced
assert.equal(store["targetMaster"].length, 3);

// ═══ 3) Sample despatch (demo 03) / 4) Input despatch (demo 04): Month/Year + Overwrite / Only Insert
const MY = { month: "10", year: "2026" };
r = await imp("sample", demo("03_Customer_SampleDespatchUpload_DEMO_VALUES.xlsx"), { ...MY, mode: "insert" }); ok(r, 276); assert.equal(r.inserted, 276);
const batches = store["dispatches"].filter((d) => d.type === "SAMPLE"); assert.ok(batches.length > 0 && batches.every((b) => b.month === "Oct" && b.year === "2026"));
assert.equal(batches.reduce((n, b) => n + b.items.length, 0), 276);
batches[0].items[0].receivedQty = 7;
r = await imp("sample", demo("03_Customer_SampleDespatchUpload_DEMO_VALUES.xlsx"), { ...MY, mode: "insert" }); ok(r, 276); assert.deepEqual([r.inserted, r.updated, r.skipped], [0, 0, 276]);   // Only Insert leaves existing records alone
assert.equal(batches[0].items[0].receivedQty, 7);
r = await imp("sample", demo("03_Customer_SampleDespatchUpload_DEMO_VALUES.xlsx"), { ...MY, mode: "overwrite" }); ok(r, 276); assert.deepEqual([r.inserted, r.updated, r.skipped], [0, 276, 0]);
assert.equal(batches[0].items[0].receivedQty, 7);                                                                                                  // overwrite keeps what the rep already received
r = await imp("sample", demo("03_Customer_SampleDespatchUpload_DEMO_VALUES.xlsx"), { month: "11", year: "2026", mode: "insert" }); assert.equal(r.failed, 276); assert.equal(r.uploaded, false); assert.match(r.errors[0].reason, /must fall in Nov 2026/);
// legacy template columns (Employee ID / Sample ERP Code / Despatch Qty), no date -> 1st of the selected month
r = await imp("sample", xl(["Employee ID", "Sample ERP Code", "Despatch Qty"], [["E0038", "ZV024", 25], ["E0038", "ZV999", 5], ["E0038", "ZV026", "x"]], "Upl_Despatch_Master"), { month: "11", year: "2026", mode: "insert" }, "s.xlsx");
assert.deepEqual([r.total, r.ok, r.failed, r.inserted], [3, 1, 2, 1]); const nov = store["dispatches"].find((d) => d.type === "SAMPLE" && d.month === "Nov"); assert.equal(new Date(nov.items[0].despatchDate).toISOString().slice(0, 10), "2026-11-01"); assert.equal(nov.items[0].dispatchQty, 25);
assert.equal(unList(r).length, 2);
r = await imp("input", demo("04_Customer_InputDespatchUpload_DEMO_VALUES.xlsx"), { ...MY, mode: "insert" }); ok(r, 207); assert.equal(r.inserted, 207);
r = await imp("input", xl(["Employee ID", "Input Code", "Despatch Qty"], [["E0038", "IN1", 10]]), { month: "12", year: "2026", mode: "overwrite" }, "i.xlsx"); ok(r, 1); assert.equal(store["dispatches"].find((d) => d.type === "INPUT" && d.month === "Dec").items[0].name, "Visual Aid");
assert.ok(store["despatch_logs"].length > 0);

// ═══ 6b) Deactivate Existing Field Force List (Salesforce), then re-uploading reactivates
const before = store["employees"].length;
r = await imp("field-force", xl(["Employee Code", "Name", "Designation", "HQ"], [["E0038", "BALAKRISHNA SHENOY", "BE", "ERNAKULAM"]], "UPL_SalesForce"), { deactivate: "true" }, "sf.xlsx"); ok(r, 1); assert.equal(r.deactivated, 71 + (globalThis as any).__stubs);
assert.equal(store["employees"].filter((e) => e.status === "ACTIVE").length, 1); assert.equal(store["employees"].length, before);
r = await imp("field-force", demo("06_Upload_SalesforceUpload.xlsx"), { deactivate: "true" }); ok(r, 71); assert.equal(store["employees"].filter((e) => e.status === "ACTIVE" && !e.codePending).length, 71); assert.ok(store["employees"].filter((e) => e.codePending).every((e) => e.status === "ACTIVE"), "stubs reactivated with their reports");

// ═══ /validate keeps working and returns the preview
const vr = await (await fetch(`${base}/product/validate`, { method: "POST", body: form({}, [{ name: "v.xlsx", buf: demo("08_Upload_ProductUpload.xlsx") }]) })).json() as any; assert.equal(vr.data.total, 28); assert.equal(vr.data.invalid, 0); assert.equal(vr.data.preview.length, 28);
const hist = (await (await fetch(`${base}/target/history`)).json() as any).data; assert.ok(hist.length >= 4);

// ═══ 10) Slide Upload - E-Detailing (storage = base64 file inside the slideUploadEDetailing master doc; 5 GB + 2%)
let meta = (await (await fetch(`${base}/slides/meta`)).json() as any).data;
assert.deepEqual([meta.division, meta.subDivisions, meta.brands.includes("BEPIREX"), meta.consumedBytes, meta.allocatedBytes], ["Zivira Labs Pvt Ltd", ["Astra"], true, 0, 5 * 1024 ** 3]);
assert.ok(Math.abs(meta.remainingBytes / 1024 ** 3 - 5.1) < 1e-9);
assert.ok(meta.brandRows.some((b: any) => b.name === "BEPIREX" && typeof b.subDivision === "string"));          // brand -> sub division cascade data
{ const ld = (await tplOf("listed-doctor")).worksheets[0]; assert.equal(header(ld).length, 15); assert.equal(yellow(ld).length, 15);   // LD template = the 15 mandatory columns
  const ch = (await tplOf("chemist")).worksheets[0]; assert.deepEqual(header(ch), ["SI No", "User Name", "Chemist Name", "Territory"]); }                                              // "5.10 GB Remaining"
const pdf = (n: number) => Buffer.from(`%PDF-1.4\n${Array.from({ length: n }, () => "<< /Type /Page >>").join("\n")}\n%%EOF`);
const PF = (name: string, buf: Buffer) => ({ name, field: "files", buf, type: "application/pdf" });
let up = await fetch(`${base}/slides/upload`, { method: "POST", body: form({ subDivision: "Astra", brands: "BEPIREX|STRIOS" }, [PF("one.pdf", pdf(3)), PF("two.pdf", pdf(5))]) });
assert.equal(up.status, 201); const upd = (await up.json() as any).data; assert.equal(upd.saved.length, 4);                // 2 files x 2 brands
const sizes = pdf(3).length + pdf(5).length; assert.equal(upd.usage.consumedBytes, sizes, "each stored file counts once, not once per brand");
assert.equal(slideFiles.size, 2, "ONE stored copy per file"); assert.equal(store["slideUploadEDetailing"].length, 4, "one metadata row per brand"); assert.ok(store["slideUploadEDetailing"].every((x) => x.fileRef && !x.fileData));
assert.equal(new Set(store["slideUploadEDetailing"].filter((x) => x.fileName === "one.pdf").map((x) => x.fileRef)).size, 1, "both brand rows reference the same stored file");
let sl = (await (await fetch(`${base}/slides/list?brands=BEPIREX`)).json() as any).data; assert.deepEqual(sl.map((x: any) => [x.fileName, x.pages, x.brand, x.subDivision]).sort(), [["one.pdf", 3, "BEPIREX", "Astra"], ["two.pdf", 5, "BEPIREX", "Astra"]]);
assert.equal((await (await fetch(`${base}/slides/list?brands=BEPIREX|STRIOS`)).json() as any).data.length, 4);
const dl = await get(`/slides/${sl.find((x: any) => x.fileName === "one.pdf").id}/download`); assert.deepEqual(dl.buf, pdf(3));
up = await fetch(`${base}/slides/upload`, { method: "POST", body: form({ subDivision: "Astra", brands: "BEPIREX" }, [PF("one.pdf", pdf(4))]) }); assert.equal(up.status, 201);   // same file name + brand replaces, not duplicates
assert.equal((await (await fetch(`${base}/slides/list?brands=BEPIREX`)).json() as any).data.length, 2);
assert.equal(slideFiles.size, 3, "the replaced BEPIREX row now points at the new file; the old one is still used by the STRIOS row");
assert.equal((await fetch(`${base}/slides/upload`, { method: "POST", body: form({ subDivision: "Astra" }, [PF("x.pdf", pdf(1))]) })).status, 400);                     // brand required
assert.equal((await fetch(`${base}/slides/upload`, { method: "POST", body: form({ brands: "BEPIREX" }, []) })).status, 400);                                          // file required
assert.equal((await fetch(`${base}/slides/upload`, { method: "POST", body: form({ brands: "BEPIREX" }, [PF("big.pdf", Buffer.alloc(10 * 1024 * 1024 + 1))]) })).status, 413);   // 10 MB per-file cap
store["slideUploadEDetailing"].push({ tenantSlug: "demo", fileName: "huge", fileData: "x", fileSize: Math.floor(5 * 1024 ** 3 * 1.02) - 50 });                       // storage nearly full (a pre-Round-59 base64 row)
assert.equal((await fetch(`${base}/slides/upload`, { method: "POST", body: form({ brands: "BEPIREX" }, [PF("late.pdf", pdf(9))]) })).status, 413);
store["slideUploadEDetailing"].pop();
const del = await fetch(`${base}/slides/${sl[0].id}`, { method: "DELETE" }); assert.equal(del.status, 200); assert.equal((await (await fetch(`${base}/slides/list?brands=BEPIREX`)).json() as any).data.length, 1);
// deleting the last row that references a stored file removes the file; a legacy base64 row is still served
{ const left = (await (await fetch(`${base}/slides/list?brands=STRIOS`)).json() as any).data; const before = slideFiles.size;
  for (const x of left) await fetch(`${base}/slides/${x.id}`, { method: "DELETE" });
  assert.ok(slideFiles.size < before, "stored files are released when no row references them");
  store["slideUploadEDetailing"].push({ _id: asId(77777), tenantSlug: "demo", fileName: "legacy.pdf", brand: "BEPIREX", subDivision: "Astra", fileData: Buffer.from("legacy-bytes").toString("base64"), mimeType: "application/pdf", fileSize: 12 });
  const lg = await get(`/slides/${asId(77777)}/download`); assert.equal(lg.buf.toString(), "legacy-bytes"); }

console.log("R58 upload tests passed");
server.close();
process.exit(0);
