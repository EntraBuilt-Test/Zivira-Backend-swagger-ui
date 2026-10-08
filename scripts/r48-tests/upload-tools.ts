// Round 48 Part B in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r44-tests/compute.ts
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
  limit(n: number) { this.docs = this.docs.slice(0, n); return this; }
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
(mongoose.Model as any).updateOne = function (f: any, u: any) { const d = coll(this).filter(sift(f))[0]; if (d) applyUpdate([d], u); return Promise.resolve({}); };
(mongoose.Model as any).updateMany = function (f: any, u: any) { applyUpdate(coll(this).filter(sift(f)), u); return Promise.resolve({}); };
(mongoose.Model as any).findById = function (id: any) { return new Q(coll(this).filter((d) => String(d._id) === String(id)), this).then ? (async () => coll(this).find((d) => String(d._id) === String(id)) || null)() : null; };

import assert from "node:assert";
import * as XLSX from "xlsx";
const T = "demo";
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string) =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Kerala", division: "ZIVIRA LAB", status: "ACTIVE" });
store["employees"] = [emp(1, "RAJ RBM", "E0", "RBM", "RBM", undefined, "KOCHI"), emp(2, "THARUN C", "E1", "ABM", "ABM", "E0", "BANGALORE"), emp(3, "AMITH K", "E2", "BE", "MR", "E1", "KANNUR")];
store["products"] = [{ _id: asId(20), tenantSlug: T, name: "DEXNOVA", productName: "DEXNOVA", brandName: "DEX", code: "P001", category: "Tablet", division: "ZIVIRA LAB", status: "ACTIVE" },
  { _id: asId(21), tenantSlug: T, name: "OLDPROD", productName: "OLDPROD", brandName: "OLD", category: "Syrup", division: "ZIVIRA LAB", status: "ACTIVE" }];
store["leaveTypes"] = [{ tenantSlug: T, leaveTypeDesc: "CL", status: "ACTIVE" }, { tenantSlug: T, leaveTypeDesc: "SL", status: "ACTIVE" }];
store["inputMaster"] = [{ tenantSlug: T, inputCode: "IN1", inputName: "Prescription Pad" }];

const U = await import("../../src/utils/upload-tools.js");
const buf = (headers: string[], rows: any[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "S"); return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer; };
const run = async (key: string, headers: string[], rows: any[][], opts: any = {}) => { const tool = U.getTool(key)!; const p = U.parseBuffer(buf(headers, rows)); return U.importRows(tool, T, "tester", "f.xlsx", p.headers, p.rows, opts); };
const val = async (key: string, headers: string[], rows: any[][]) => { const tool = U.getTool(key)!; const p = U.parseBuffer(buf(headers, rows)); return (await U.validateRows(tool, T, p.headers, p.rows)).out; };
assert.equal(U.TOOLS.length, 12);

// sample workbook = real xlsx with the headers
for (const t of U.TOOLS) { const wb = XLSX.read(await U.templateWorkbook(t, T), { type: "buffer" }); assert.deepEqual((XLSX.utils.sheet_to_json(wb.Sheets[t.sheetName || t.templateSheet || "Upload"], { header: 1 })[0] as string[]), t.templateHeaders || t.headers); }   // Round 58: legacy sheet names / template columns
assert.equal(U.getTool("listed-doctor")!.headers.length, 66);

// missing required column -> file error, nothing imported
const bad = await run("chemist", ["Employee Code"], [["E2"]]);
assert.match(bad.fileErrors[0], /Chemists Name/); assert.equal(bad.ok, 0);

// ── Chemist
const CH = U.getTool("chemist")!.headers;
const chRows = [["AMITH K", "BE", "KANNUR", "E2", "City Meds", "A", "MG Road", "T1", "Mr X", "9876543210", "R1"], ["", "", "", "E9", "Ghost", "", "", "", "", "", ""], ["", "", "", "E2", "", "", "", "", "", "12", ""], ["", "", "", "E2", "City Meds", "", "", "T1", "", "", ""]];
const c1 = await run("chemist", CH, chRows);
assert.deepEqual([c1.total, c1.ok, c1.failed, c1.inserted], [4, 1, 3, 1]);
assert.deepEqual(c1.errors.map((e) => [e.row, e.field]), [[3, "Territory"], [3, "User Name"], [4, "Chemists Name"], [4, "Territory"], [4, "Mobile"], [5, "(key)"]]   /* Round 62: Territory is mandatory and the employee is the "User Name" column */);
assert.equal(store["dealers"].length, 1); assert.equal(store["dealers"][0].employeeName, "AMITH K"); assert.equal(store["dealers"][0].commonRefNo, "R1");
const c2 = await run("chemist", CH, chRows);
assert.deepEqual([c2.inserted, c2.updated], [0, 1]); assert.equal(store["dealers"].length, 1);         // idempotent
assert.equal(store["uploadHistories"].length, 3); assert.equal(store["uploadHistories"][1].okRows, 1);   // history

// ── Product -> Product Rate
const PH = U.getTool("product")!.headers;
const p1 = await run("product", PH, [["P002", "ZIVITAB", "ZIV", "10x10", "ZIVIRA LAB", "Tablet", "Yes"], ["P001", "DEXNOVA", "DEX", "", "ZIVIRA LAB", "Tablet", "maybe"], ["P003", "OLDPROD", "OLD", "1", "ZIVIRA LAB", "Syrup", "No"]]);
assert.deepEqual([p1.ok, p1.failed, p1.inserted, p1.updated], [2, 1, 1, 1]);
assert.equal(p1.errors[0].field, "Active");
assert.equal(store["products"].find((p) => p.code === "P003").productName, "OLDPROD");                    // legacy code-less product adopted, not duplicated
assert.equal(store["products"].length, 3);
assert.equal(store["products"].find((p) => p.code === "P003").status, "INACTIVE");
const RH = U.getTool("product-rate")!.headers;
const r1 = await run("product-rate", RH, [["P002", "ZIVITAB", "12.5", "11", "20", "01/04/2026"], ["P002", "ZIVITAB", "15", "", "25", "01/09/2026"], ["P002", "ZIVITAB", "99", "", "", "01/01/2099"], ["PXXX", "", "1", "", "", "01/04/2026"], ["P002", "ZIVITAB", "x", "", "", "32/13/2026"]], { state: "Gujarat" });
assert.deepEqual([r1.ok, r1.failed], [3, 2]);
assert.deepEqual(r1.errors.map((e) => [e.row, e.field]), [[5, "Product Code"], [6, "PTR"], [6, "Effective From"]]);
assert.equal(store["products"].find((p) => p.code === "P002").rate, 15);                                  // latest rate effective today, future-dated 99 ignored
const r2 = await run("product-rate", RH, [["P002", "ZIVITAB", "12.5", "11", "20", "01/04/2026"]], { state: "Gujarat" }); assert.equal(r2.updated, 1); assert.equal(store["productRates"].length, 3);

// ── Salesforce
const SH = U.getTool("field-force")!.headers;
const s1 = await run("field-force", SH, [
  ["E5", "NEW BE", "BE", "MYSORE", "Karnataka", "15/03/2024", "E1", "", "", "9876500000", "new@x.com", "ZIVIRA LAB", "SUB1"],
  ["E6", "NEW SR", "Sr BE", "HASSAN", "Karnataka", "", "", "THARUN C", "", "", "", "ZIVIRA LAB", ""],
  ["E7", "ORPHAN", "BE", "X", "", "", "NOPE", "", "", "", "", "ZIVIRA LAB", ""],
  ["E8", "AFTER", "BE", "Y", "", "", "E5", "", "", "", "bad-email", "ZIVIRA LAB", ""],
  ["E9", "NBM GUY", "Merchandiser", "DELHI", "Delhi", "", "", "", "", "", "", "ZIVIRA LAB", ""]]);
assert.deepEqual([s1.ok, s1.failed], [3, 2]);
assert.deepEqual(s1.errors.map((e) => [e.row, e.field]), [[4, "Reporting Manager Code"], [5, "Email"]]);
const e5 = store["employees"].find((e) => e.employeeCode === "E5"); const e6 = store["employees"].find((e) => e.employeeCode === "E6");
assert.equal(e5.reportingManager, "E1"); assert.equal(e5.role, "MR"); assert.equal(e5.division, "SUB1"); assert.equal(e5.status, "ACTIVE");
assert.equal(e6.reportingManager, "E1"); assert.equal(e6.role, "SR_MR");                                  // resolved by name
assert.equal(store["employees"].find((e) => e.employeeCode === "E9").role, "OTHER"); assert.ok(s1.warnings.some((w) => /Merchandiser/.test(w.reason)));
assert.equal(U.roleFromDesignation("ZBM"), "ZBM");
const s2 = await run("field-force", SH, [["E5", "NEW BE", "BE", "MYSORE", "Karnataka", "15/03/2024", "E1", "", "", "9876500000", "new@x.com", "ZIVIRA LAB", "SUB1"]]); assert.deepEqual([s2.inserted, s2.updated], [0, 1]);

// ── Listed doctor (66 columns)
const LH = U.getTool("listed-doctor")!.headers;
const dr = (o: Record<string, string>) => LH.map((h) => o[h] ?? "");
const d1 = await run("listed-doctor", LH, [
  dr({ "Employee Code": "E2", "Unique Code": "D100", "Listed Dr Name": "Dr Z", Speciality: "CP", Territory: "KANNUR", Category: "CORE", Class: "A", DOB: "05/06/1980", Email: "Z@X.COM", Mobile: "9000000001", P0: "PROD1", Doctor_Type: "Core drs,Academica" }),
  dr({ "Employee Code": "E2", "Listed Dr Name": "Dr Y", Speciality: "ENT", Territory: "KANNUR" }),
  dr({ "Employee Code": "E2", "Unique Code": "D101", "Listed Dr Name": "Dr Bad", Speciality: "ENT", Territory: "KANNUR", Category: "VIP", DOB: "31/02/2020" }),
  dr({ "Employee Code": "E2", "Unique Code": "D100", "Listed Dr Name": "Dr Z dup", Speciality: "CP", Territory: "KANNUR" })]);
assert.deepEqual([d1.ok, d1.failed], [2, 2]);
assert.deepEqual(d1.errors.map((e) => [e.row, e.field]), [[4, "Category"], [4, "DOB"], [5, "(key)"]]);
const dz = store["doctors"].find((d) => d.doctorCode === "D100");
assert.equal(dz.mappedEmployeeCode, "E2"); assert.equal(dz.doctorCategory, "CORE"); assert.equal(dz.category, "A"); assert.equal(dz.email, "z@x.com"); assert.deepEqual(dz.doctorTypes, ["Core drs", "Academica"]); assert.equal(dz.priorityProducts[0], "PROD1");
assert.equal(new Date(dz.dob).toISOString().slice(0, 10), "1980-06-05");
const d2 = await run("listed-doctor", LH, [dr({ "Employee Code": "E2", "Unique Code": "D100", "Listed Dr Name": "Dr Z", Speciality: "CP", Territory: "KANNUR" }), dr({ "Employee Code": "E2", "Listed Dr Name": "Dr Y", Speciality: "ENT", Territory: "KANNUR" })]);
assert.deepEqual([d2.inserted, d2.updated], [0, 2]); assert.equal(store["doctors"].length, 2);

// ── Stockist, Holiday, Leave, Target
const st = await run("stockist", U.getTool("stockist")!.headers, [["ERP1", "Alpha Stockist", "KANNUR", "Kerala", "E2", "", "HQ1"], ["ERP1", "dup", "K", "Kerala", "", "", ""], ["", "No Erp", "K", "Kerala", "", "", ""], ["ERP2", "Beta", "K", "Kerala", "E77", "", ""]]);
assert.deepEqual([st.ok, st.failed, st.inserted], [1, 3, 1]); assert.equal(store["stockists"][0].fieldForceName, "AMITH K"); assert.equal(store["stockists"][0].hqCode, "HQ1");
const ho = await run("holiday-fixation", U.getTool("holiday-fixation")!.headers, [["02/10/2026", "Gandhi Jayanti", "Kerala", "", "National"], ["bad", "X", "Kerala", "", ""], ["03/10/2026", "", "Kerala", "", ""]]);
assert.deepEqual([ho.ok, ho.failed], [1, 2]); assert.equal(new Date(store["holidays"][0].otherHolidayDate).toISOString().slice(0, 10), "2026-10-02");
const ho2 = await run("holiday-fixation", U.getTool("holiday-fixation")!.headers, [["02/10/2026", "Gandhi Jayanti", "Kerala", "", "National"]]); assert.equal(store["holidays"].length, 1); assert.equal(ho2.updated, 1);
const LV = U.getTool("leave-bulk-upload")!.headers;
const lv = await run("leave-bulk-upload", LV, [["E2", "CL", "05/10/2026", "07/10/2026", "", "Fever", ""], ["E2", "XX", "05/10/2026", "07/10/2026", "", "", ""], ["E2", "SL", "09/10/2026", "08/10/2026", "", "", ""], ["E2", "SL", "10/10/2026", "10/10/2026", "1", "", "Weird"]]);
assert.deepEqual([lv.ok, lv.failed], [1, 3]); assert.equal(store["leave_applications"][0].days, 3); assert.equal(store["leave_applications"][0].status, "APPROVED");
await run("leave-bulk-upload", LV, [["E2", "CL", "05/10/2026", "07/10/2026", "", "Fever", ""]]); assert.equal(store["leave_applications"].length, 1);
const TG = U.getTool("target")!.headers;
const tg = await run("target", TG, [["E2", "October", "2026", "P001", "100", "5000"], ["E2", "13", "2026", "P001", "1", ""], ["E2", "Oct", "2026", "PNOPE", "1", ""]]);
assert.deepEqual([tg.ok, tg.failed, tg.inserted, tg.uploaded], [1, 2, 0, false]); assert.equal((store["targetMaster"] || []).length, 0);   // Round 58: Target is all-or-nothing
await run("target", TG, [["E2", "October", "2026", "P001", "100", "5000"]]); const tm = store["targetMaster"][0]; assert.deepEqual([tm.monthKey, tm.product, tm.targetUnit, tm.unitPrice, tm.targetValue, tm.fieldForceName], ["2026-10", "DEXNOVA", 100, 50, 5000, "AMITH K"]);
await run("target", TG, [["E2", "10", "2026", "P001", "120", "6000"]]); assert.equal(store["targetMaster"].length, 1); assert.equal(store["targetMaster"][0].targetUnit, 120);

// ── Despatch (sample + input)
const SD = U.getTool("sample")!.headers;
const sd = await run("sample", SD, [["E2", "P001", "50", "05/10/2026", "LR123", "BlueDart"], ["E2", "P001", "10", "20/10/2026", "LR124", "BlueDart"], ["E2", "PNOPE", "1", "05/10/2026", "", ""], ["E2", "P001", "-3", "05/10/2026", "", ""]]);
assert.deepEqual([sd.ok, sd.failed, sd.inserted], [2, 2, 2]);
assert.equal(store["dispatches"].length, 1); assert.equal(store["dispatches"][0].items.length, 2); assert.equal(store["dispatches"][0].items[0].docketNo, "LR123"); assert.equal(store["dispatches"][0].month, "Oct");
assert.equal(store["despatch_logs"].find((l) => l.itemName === "DEXNOVA").despatchQty, 60);
store["dispatches"][0].items[0].receivedQty = 48;                                                          // field rep received 48
const sd2 = await run("sample", SD, [["E2", "P001", "55", "05/10/2026", "LR123", "BlueDart"]]);
assert.deepEqual([sd2.inserted, sd2.updated], [0, 1]); assert.equal(store["dispatches"][0].items.length, 2); assert.equal(store["dispatches"][0].items[0].receivedQty, 48); assert.equal(store["dispatches"][0].items[0].dispatchQty, 55);
const idsp = await run("input", U.getTool("input")!.headers, [["E2", "IN1", "200", "05/10/2026", "LR9", "DTDC"], ["E2", "Prescription Pad", "5", "06/10/2026", "", ""], ["E2", "Nope", "1", "05/10/2026", "", ""]]);
assert.deepEqual([idsp.ok, idsp.failed], [2, 1]); assert.equal(store["dispatches"].filter((d) => d.type === "INPUT")[0].items.length, 2);

// ── Slide metadata
const sl = await run("slides-upload", U.getTool("slides-upload")!.headers, [["DEX", "DEXNOVA", "Intro", "1", "intro.pdf", "Yes"], ["DEX", "DEXNOVA", "", "x", "a.pdf", ""], ["DEX", "DEXNOVA", "Dup", "2", "intro.pdf", ""]]);
assert.deepEqual([sl.ok, sl.failed], [1, 2]); assert.equal(store["slideUploadEDetailing"][0].slideName, "Intro"); assert.equal(store["slideUploadEDetailing"][0].division, "ZIVIRA LAB");

// ── Excel date serial + server-side preview limit
const serial = Math.round(Date.UTC(2026, 9, 2) / 86400000 + 25569);
const sv = await val("holiday-fixation", U.getTool("holiday-fixation")!.headers, [[serial, "Serial Day", "Kerala", "", ""]]);
assert.equal(sv.valid, 1); assert.deepEqual(sv.preview[0].cells.slice(0, 2), ["02/10/2026", "Serial Day"]);
assert.equal((await val("chemist", CH, chRows)).preview.length, 4);

console.log("R48 upload-tools tests passed");
