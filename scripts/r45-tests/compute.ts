// Round 45 in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r45-tests/compute.ts
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

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
const T = "demo";
const out = fs.mkdtempSync(`${os.tmpdir()}/r45-`);
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string, status = "ACTIVE") =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Karnataka", division: "ZIVIRA LAB", status, joinDate: new Date("2024-03-05") });
store["employees"] = [
  emp(1, "THARUN C", "E0001", "ABM", "ABM", undefined, "BANGALORE"),
  emp(2, "DARSHAN B", "E0427", "BE", "MR", "E0001", "BANGALORE"),
  emp(3, "AMITH K", "E0300", "BE", "MR", "E0001", "KANNUR"),
  emp(5, "OLD ABM", "E0005", "ABM", "ABM", "E0001", "MYSORE", "INACTIVE"),
  emp(6, "ORPHAN BE", "E0006", "BE", "MR", "E0005", "MYSORE")      // still points at the inactive seat -> E0005 is a vacant seat
];
store["tenants"] = [{ slug: T, name: "Zivira Labs Pvt Ltd" }];
store["patchNameMaster"] = [{ tenantSlug: T, patchName: "BANGALORE", patchCode: "108647" }, { tenantSlug: T, patchName: "YELAHANKA", patchCode: "108649" }];
const doc = (n: number, name: string, code: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name, doctorCode: code, mappedEmployeeCode: "E0427", status: "ACTIVE", territory: "BANGALORE", territoryType: "HQ", ...o });
store["doctors"] = [
  doc(1, "PINKY SINGHANIA", "2043655", { address1: "LINK ROAD,SECOND CROSS ROAD, MALLESHEARAM", specialty: "OPT", doctorCategory: "S CORE", category: "A" }),
  doc(2, "DR DANESHWARI", "2197431", { address1: "SHESHADRIPURAM", specialty: "GLAUCO", doctorCategory: "N CORE", category: "B" }),
  doc(3, "ANISHA A SHETTY", "2043627", { address1: "16TH,B CROSS,NEW TOWN,YELAHANKA", specialty: "OPT", doctorCategory: "S CORE", category: "A", territory: "YELAHANKA", territoryType: "EX" }),
  doc(4, "DR PRAMOD P.V", "2305357", { address1: "KRISHNA EYE CLINIC ", specialty: "CRS", doctorCategory: "N CORE", category: "C", territory: "YELAHANKA", territoryType: "EX" }),
  doc(5, "KAVYA R", "5001", { mappedEmployeeCode: "E0300", specialty: "ENT", doctorCategory: "CORE", category: "B", territory: "KANNUR", qualification: "MBBS" })
];
store["products"] = ["ZIVIFRESH", "NEPAWEL", "ZIVIMOX-D", "ENVISA", "DUCIRA GEL", "TIZTA 10ML", "MACUMER"].map((n, i) => ({ _id: asId(400 + i), tenantSlug: T, productName: n, name: n, brandName: n.split(" ")[0].replace(/-D$/, ""), rate: 10 + i, status: "ACTIVE" }));
store["productBrands"] = [{ tenantSlug: T, brandName: "ZIVIFRESH", status: "ACTIVE", sortOrder: 1 }, { tenantSlug: T, brandName: "NEPAWEL", status: "ACTIVE", sortOrder: 2 }];
const at = (hms: string) => new Date(new Date(`2026-10-01T${hms}Z`).getTime() - 330 * 60000); // IST clock -> UTC
const dcr = (n: number, e: string, doctor: number, hms: string, prods: string[], extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date("2026-10-01T12:00:00Z"), month: "2026-10", visitDateOnly: "2026-10-01", callAt: at(hms), productsDetailed: prods, createdAt: at(hms), pob: [], ...extra });
store["dcrs"] = [
  dcr(1, "E0427", 1, "22:38:27", ["ZIVIFRESH"]),
  dcr(2, "E0427", 2, "22:48:03", ["NEPAWEL", "ZIVIFRESH", "ZIVIMOX-D"]),
  dcr(3, "E0427", 3, "22:49:55", ["ZIVIFRESH", "NEPAWEL", "ENVISA", "DUCIRA GEL", "TIZTA 10ML", "MACUMER", "ZIVIMOX-D"]),
  dcr(4, "E0427", 4, "22:53:33", ["ZIVIFRESH", "NEPAWEL", "TIZTA 10ML"]),
  dcr(5, "E0300", 5, "10:00:00", ["ZIVIFRESH"], { jointWork: { accompanyingManager: "THARUN C" } })
];
store["dealers"] = [{ _id: asId(300), tenantSlug: T, sourceSNo: 794312, dealerName: "SOLANKI PHARMACY", patchName: "BANGALORE", employeeCode: "E0427", status: "ACTIVE" }];
store["chemist_calls"] = [{ tenantSlug: T, employeeCode: "E0427", chemistId: String(asId(300)), chemistName: "SOLANKI PHARMACY", visitDateOnly: "2026-10-01", createdAt: at("22:51:31"), pob: [] }];
store["field_visit_logs"] = [];
store["leave_applications"] = [{ tenantSlug: T, employeeCode: "E0300", status: "APPROVED", fromDate: new Date("2026-10-05"), toDate: new Date("2026-10-06"), leaveType: "CL" }];
store["holidays"] = [];

const R = await import("../../src/utils/r45-reports.js");

// ── Item 3: Call Report Dump CSV, row-for-row against the user's legacy file
const expected: string[] = JSON.parse(fs.readFileSync(new URL("./legacy-call-report-lines.json", import.meta.url), "utf8"));
const cr = await R.buildCallLines(T, "E0427", "2026-10", [], false, false);
assert.equal(cr.division, "Zivira Labs Pvt Ltd");
const csv = R.callReportCsv(cr.lines, cr.division);
assert.ok(csv.endsWith("\r\n") && !/[^\r]\n/.test(csv), "CRLF everywhere");
const got = csv.split("\r\n").slice(0, -1);
assert.equal(got[0], expected[0]);                                      // header: 34 names + trailing comma
assert.equal(expected[0].split(",").length, 35);
// our order is DCRs, then chemist calls; the legacy file interleaves by clock time, so compare by clock time
const byTime = (ls: string[]) => Object.fromEntries(ls.map((l) => [l.split(",")[18], l]));
const g = byTime(got.slice(1));
for (const e of expected.slice(1)) assert.equal(g[e.split(",")[18]], e, `row @${e.split(",")[18]}`);
assert.deepEqual(got.slice(1).map((l) => l.split(",")[18]), ["22:38:27", "22:48:03", "22:49:55", "22:53:33", "22:51:31"].sort());
// day filter + vacant + whole company
const only = await R.buildCallLines(T, "E0427", "2026-10", [2], false, false); assert.equal(only.lines.length, 0);
const day1 = await R.buildCallLines(T, "E0427", "2026-10", [1], false, false); assert.equal(day1.lines.length, 5);
const co = await R.buildCallLines(T, "admin", "2026-10", [], false, false);
assert.ok(co.lines.some((l) => l.emp.employeeCode === "E0300" && l.dayType === "Leave"));
assert.equal(co.lines.filter((l) => l.dayType === "Leave").length, 2);                            // Oct 5-6 approved leave
assert.equal(co.lines.find((l) => l.emp.employeeCode === "E0300" && l.callType === "Listeddr")!.workedWith, "THARUN C");
assert.equal(co.lines.some((l) => l.dayType === "Vacant"), false);
const vac = await R.buildCallLines(T, "admin", "2026-10", [], true, false);
assert.equal(vac.lines.filter((l) => l.dayType === "Vacant").length, 1);                          // the inactive ABM seat
// ── Item 2: Day Wise dump
assert.equal(R.DAYWISE_HEADERS.length, 27);
const dw = await R.buildCallLines(T, "E0427", "2026-10", [], false, true);
assert.equal(new Set(dw.lines.map((l) => l.date)).size, 31);                                       // every day present
const cells = R.dayWiseCells(dw.lines[0]);
assert.equal(cells.length, 27);
assert.deepEqual(cells.slice(0, 8), ["E0427", "DARSHAN B", "BANGALORE", "BE", "10-01-2026", "Thursday", "Field Work", "Listeddr"]);
assert.equal(dw.lines.find((l) => l.date === "2026-10-04")!.dayType, "Weekly Off");
assert.equal(dw.lines.find((l) => l.date === "2026-10-04")!.callType, "");
assert.equal(dw.lines.find((l) => l.date === "2026-10-06")!.dayType, "Not Reported");
fs.writeFileSync(`${out}/daywise_header_only.xls`, R.dayWiseHtmlXls([]));
fs.writeFileSync(`${out}/daywise_rows.xls`, R.dayWiseHtmlXls(dw.lines));
fs.writeFileSync(`${out}/daywise.xlsx`, await R.aoaToXlsx("DayWise_Report_Dump", R.DAYWISE_HEADERS, dw.lines.map(R.dayWiseCells), "FFADD8E6"));
fs.writeFileSync(`${out}/callreport.csv`, csv);
fs.writeFileSync(`${out}/callreport.xlsx`, await R.aoaToXlsx("Call_Report_Dump", R.CALL_REPORT_HEADERS, cr.lines.map((l) => R.callReportCells(l, cr.division))));
console.log("OUTDIR", out);

// ── Item 1: Quiz
store["quizzes"] = [{ _id: asId(900), tenantSlug: T, title: "Q1", questions: [{ correctOptionIndex: 0, points: 1 }, { correctOptionIndex: 1, points: 1 }, { correctOptionIndex: 2, points: 2 }] }];
store["quiz_attempts"] = [
  { tenantSlug: T, quizId: String(asId(900)), employeeCode: "E0427", answers: [{ questionIndex: 0, selectedOptionIndex: 0 }, { questionIndex: 1, selectedOptionIndex: 0 }, { questionIndex: 2, selectedOptionIndex: 2 }], score: 3, totalPossible: 4, submittedAt: new Date("2026-10-02T09:00:00Z") },
  { tenantSlug: T, quizId: String(asId(900)), employeeCode: "E0300", answers: [{ questionIndex: 0, selectedOptionIndex: 1 }], score: 0, totalPossible: 4, submittedAt: new Date("2026-09-30T09:00:00Z") }
];
const qz = (await R.computeQuizResult(T, "E0001", "Team", "2026-10"))!;
assert.deepEqual(qz.rows.map((r) => r.name), ["AMITH K", "DARSHAN B", "THARUN C"]);                // BEs, then the manager last
assert.equal(qz.days.length, 31); assert.equal(qz.days[0].label, "1 - Thu"); assert.equal(qz.days[1].label, "2 - Fri");
assert.deepEqual(qz.rows[1].perDay[2], { total: 3, correct: 2, pct: 75 });
assert.equal(Object.keys(qz.rows[0].perDay).length, 0);                                            // E0300's attempt is September
assert.equal(qz.rows[1].doj, "05-03-2024"); assert.equal(qz.rows[1].firstManager, "THARUN C");
const qi = (await R.computeQuizResult(T, "E0427", "Individual", "2026-10"))!; assert.equal(qi.rows.length, 1);

// ── Items 4/5: detailing + star rating
const opts = await R.detailingOptions(T);
assert.equal(opts.brands[0], "Nil"); assert.ok(opts.brands.includes("ZIVIFRESH")); assert.equal(opts.products[0], "ZIVIFRESH");
store["dcrs"].push(dcr(6, "E0427", 1, "11:00:00", ["ZIVIFRESH"], { visitDateOnly: "2026-10-03" }), dcr(7, "E0427", 1, "11:00:00", ["ZIVIFRESH"], { visitDateOnly: "2026-10-04" }), dcr(8, "E0427", 2, "11:00:00", [], { visitDateOnly: "2026-10-05" }));
const dp = (await R.computeDetailingVisitWise(T, "E0001", "2026-10", "Product", ["ZIVIFRESH", "NEPAWEL"]))!;
assert.deepEqual(dp.rows.map((r) => r.name), ["AMITH K", "DARSHAN B", "THARUN C"]);
assert.deepEqual(dp.rows[1].groups["ZIVIFRESH"], { drs: 4, one: 3, two: 0, more: 1 });          // Dr1 x3 calls (more), Dr2/3/4 once each
assert.deepEqual(dp.rows[1].groups["NEPAWEL"], { drs: 3, one: 3, two: 0, more: 0 });
assert.equal(dp.rows[1].label, "DARSHAN B-BANGALORE-BE");
assert.deepEqual(dp.rows[0].groups["ZIVIFRESH"], { drs: 1, one: 1, two: 0, more: 0 });
const db = (await R.computeDetailingVisitWise(T, "admin", "2026-10", "Brand", ["ZIVIFRESH", "Nil"]))!;
assert.equal(db.rows.length, 3);                                                                  // whole company: base-level only (3 BEs, no managers)
assert.deepEqual(db.rows.find((r) => r.employeeCode === "E0427")!.groups["Nil"], { drs: 1, one: 1, two: 0, more: 0 });   // the call with no product
store["doctor_brand_ratings"] = [
  { tenantSlug: T, doctorId: String(asId(101)), brandName: "ZIVIFRESH", stars: 2, ratedBy: "E0427", month: "2026-10", ratedAt: new Date("2026-10-01T10:00:00Z") },
  { tenantSlug: T, doctorId: String(asId(101)), brandName: "ZIVIFRESH", stars: 5, ratedBy: "E0427", month: "2026-10", ratedAt: new Date("2026-10-03T10:00:00Z") },   // latest wins
  { tenantSlug: T, doctorId: String(asId(102)), brandName: "ZIVIFRESH", stars: 3, ratedBy: "E0427", month: "2026-10", ratedAt: new Date("2026-10-02T10:00:00Z") },
  { tenantSlug: T, doctorId: String(asId(103)), brandName: "ZIVIFRESH", stars: 1, ratedBy: "E0427", month: "2026-09", ratedAt: new Date("2026-09-02T10:00:00Z") }   // other month
];
const st = (await R.computeBrandStarRating(T, "E0001", "2026-10", ["ZIVIFRESH", "NEPAWEL"]))!;
assert.deepEqual(st.rows[1].groups["ZIVIFRESH"], { stars: [0, 0, 1, 0, 1], nil: 2 });
assert.deepEqual(st.rows[1].groups["NEPAWEL"], { stars: [0, 0, 0, 0, 0], nil: 4 });
assert.deepEqual(st.rows[0].groups["ZIVIFRESH"], { stars: [0, 0, 0, 0, 0], nil: 1 });

// ── Items 6/7: slide views
const sv = (emp: string, doc: number, prod: string, brand: string, d: string, sec: number) => ({ tenantSlug: T, employeeCode: emp, doctorId: String(asId(100 + doc)), productName: prod, brandName: brand, startedAt: new Date(d + "T10:00:00Z"), durationSec: sec, visitDateOnly: d, month: d.slice(0, 7) });
const empty = (await R.computeSlideAnalysis(T, "E0001", "2026-10", "2026-10", "Product", "ALL", ""))!;
assert.equal(empty.rows.length, 0);                                                               // -> "No Record Found"
store["slide_views"] = [sv("E0427", 1, "ZIVIFRESH", "ZIVIFRESH", "2026-10-02", 60), sv("E0427", 1, "ZIVIFRESH", "ZIVIFRESH", "2026-10-03", 30), sv("E0427", 1, "NEPAWEL", "NEPAWEL", "2026-10-03", 20), sv("E0427", 3, "ZIVIFRESH", "ZIVIFRESH", "2026-10-04", 45), sv("E0300", 5, "ZIVIFRESH", "ZIVIFRESH", "2026-09-10", 10)];
const sa = (await R.computeSlideAnalysis(T, "E0001", "2026-10", "2026-10", "Product", "ALL", ""))!;
assert.deepEqual(sa.columns, ["NEPAWEL", "ZIVIFRESH"]); assert.equal(sa.rows.length, 2);
const pinky = sa.rows.find((r) => r.doctor === "PINKY SINGHANIA")!; assert.deepEqual(pinky.cells["ZIVIFRESH"], { views: 2, seconds: 90 }); assert.equal(pinky.totalViews, 3); assert.equal(pinky.totalSeconds, 110);
const sa2 = (await R.computeSlideAnalysis(T, "E0001", "2026-09", "2026-10", "Product", "ALL", ""))!; assert.equal(sa2.rows.length, 3);   // range includes Sept
const sf = (await R.computeSlideAnalysis(T, "E0001", "2026-10", "2026-10", "Brand", "Doctor Territory", "YELAHANKA"))!; assert.equal(sf.rows.length, 1); assert.equal(sf.rows[0].doctor, "ANISHA A SHETTY");
const sc = (await R.computeSlideAnalysis(T, "E0001", "2026-10", "2026-10", "Brand", "Doctor Category", "S CORE"))!; assert.equal(sc.rows.length, 2);
const sp = (await R.computeSlideAnalysis(T, "E0001", "2026-10", "2026-10", "Product", "Product / Brand", "NEPAWEL"))!; assert.equal(sp.rows.length, 1); assert.deepEqual(sp.columns, ["NEPAWEL"]);
const so = await R.slideAnalysisOptions(T); assert.deepEqual(so["Doctor Qualification"], ["MBBS"]); assert.ok(so["Doctor Speciality"].includes("GLAUCO"));
const da = (await R.computeDrsAnalysis(T, "E0001", "2026-09", "2026-10"))!;
const dar = da.rows.find((r) => r.employeeCode === "E0427")!;
assert.deepEqual(dar.perMonth["2026-10"], { total: 4, met: 4, edet: 2, pct: 50 }); assert.deepEqual(dar.perMonth["2026-09"], { total: 4, met: 0, edet: 0, pct: 0 });
assert.deepEqual(da.rows.map((r) => r.name), ["AMITH K", "DARSHAN B", "THARUN C"]);
assert.deepEqual(da.rows[0].perMonth["2026-09"], { total: 1, met: 0, edet: 1, pct: 100 });
console.log("R45 COMPUTE OK");
process.exit(0);
