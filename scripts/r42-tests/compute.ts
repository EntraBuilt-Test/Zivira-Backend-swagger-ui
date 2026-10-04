// Round 42 in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r42-tests/compute.ts
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
const T = "demo";
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string, state: string) =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state, status: "ACTIVE", joinDate: new Date("2024-03-01") });
store["employees"] = [
  emp(1, "SANDEEP R SHENOY", "E1", "ABM", "ABM", undefined, "ERNAKULAM", "Kerala"),
  emp(2, "AMIT K", "E2", "BE", "MR", "E1", "KANNUR", "Kerala"),
  emp(3, "DARSHAN B", "E3", "BE", "MR", "E1", "BANGALORE", "Karnataka")
];
store["states"] = [{ tenantSlug: T, stateName: "Kerala", status: "ACTIVE" }, { tenantSlug: T, stateName: "Karnataka", status: "ACTIVE" }, { tenantSlug: T, stateName: "Assam", status: "ACTIVE" }];
const doc = (n: number, name: string, spec: string, cat: string, code: string, emp: string, terr = "HQ") =>
  ({ _id: asId(100 + n), tenantSlug: T, name, specialty: spec, category: cat, doctorCode: code, mappedEmployeeCode: emp, status: "ACTIVE", territoryType: terr });
store["doctors"] = [doc(1, "Dr A", "CP", "A", "D1", "E2"), doc(2, "Dr B", "GENERAL PHYSICIAN", "B", "D2", "E2"), doc(3, "Dr C", "CP", "C", "D3", "E2", "EX"), doc(4, "Dr D", "ENT", "A", "D4", "E3")];
store["products"] = [{ tenantSlug: T, productName: "DEXNOVA", name: "DEXNOVA", rate: 100, status: "ACTIVE" }, { tenantSlug: T, productName: "ZIVIFRESH", name: "ZIVIFRESH", rate: 50, status: "ACTIVE" }];
const dcr = (n: number, e: string, d: string, doctor: number, session: string, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, callSession: session, workType: "Field Work", checkInTime: "10:00", checkOutTime: "10:30", createdAt: new Date(d + "T18:00:00Z"), pob: [], ...extra });
store["dcrs"] = [
  dcr(1, "E2", "2026-10-01", 1, "MORNING", { jointWork: { accompanyingManager: "SANDEEP R SHENOY" }, pob: [{ productName: "DEXNOVA", qty: 3 }] }),
  dcr(2, "E2", "2026-10-01", 2, "EVENING"),
  dcr(3, "E2", "2026-10-02", 1, "MORNING", { pob: [{ productName: "ZIVIFRESH", qty: 2, valueRs: 80 }] }),
  dcr(4, "E2", "2026-09-10", 1, "MORNING"),
  dcr(5, "E3", "2026-10-02", 4, "EVENING")
];
store["chemist_calls"] = [
  { tenantSlug: T, employeeCode: "E2", chemistId: "C1", visitDate: new Date("2026-10-01"), visitDateOnly: "2026-10-01", createdAt: new Date(), pob: [{ productName: "DEXNOVA", qty: 5 }] },
  { tenantSlug: T, employeeCode: "E3", chemistId: "C2", visitDate: new Date("2026-10-02"), visitDateOnly: "2026-10-02", createdAt: new Date(), pob: [] }
];
store["field_visit_logs"] = [
  { tenantSlug: T, employeeCode: "E2", visitType: "Stockist", entityName: "S1", visitDateOnly: "2026-10-01", createdAt: new Date() },
  { tenantSlug: T, employeeCode: "E2", visitType: "UnlistedDoctor", entityName: "U1", visitDateOnly: "2026-10-01", createdAt: new Date() }
];
store["dealers"] = [{ tenantSlug: T, employeeCode: "E2", status: "ACTIVE" }, { tenantSlug: T, employeeCode: "E2", status: "ACTIVE" }, { tenantSlug: T, employeeCode: "E3", status: "ACTIVE" }];
store["unlisted_doctors"] = [{ tenantSlug: T, mr: "AMIT K", status: "Approved" }];
store["companyconfigs"] = [{ tenantSlug: T, key: "delayedReleased:2026-10:E2", value: true, updatedAt: new Date("2026-10-03") }];


store["leaveapplications"] = [{ tenantSlug: T, employeeCode: "E3", status: "APPROVED", fromDate: new Date("2026-10-05"), toDate: new Date("2026-10-06"), leaveType: "CL", reason: "Internal purpose", createdAt: new Date("2026-10-05") }];
store["dcrs"].push(dcr(6, "E2", "2026-10-03", 2, "EVENING", { callTime: "22:15", notes: "WORK", productsDetailed: ["MACUMER", "NEPAWEL"], samplesGiven: [{ productName: "MACUMER", qty: 1 }], inputsGiven: [{ inputName: "PEN" }], gpsLocation: { latitude: 12.5, longitude: 77.1 }, createdAt: new Date("2026-10-05T10:00:00Z") }));
const mm = await import("../../src/models/master-record.model.js");
const masters: Record<string, any[]> = {
  doctorClassification: [{ tenantSlug: T, doctorCode: "D1", doctorCategory: "A", visitFrequency: "Monthly" }, { tenantSlug: T, doctorCode: "D2", doctorCategory: "B" }],
  doctorCampaignMap: [{ tenantSlug: T, doctorCode: "D1", campaignSubCategory: "Glaucoma Camp" }],
  managerwiseCoreDoctorMap: [{ tenantSlug: T, mrName: "AMIT K", doctorCode: "D1", isCore: "Yes" }, { tenantSlug: T, mrName: "AMIT K", doctorCode: "D2", isCore: "No" }]
};
for (const [k, rows] of Object.entries(masters)) { const model = mm.getMasterModel(k); store[model.collection.name] = rows; }
const c = await import("../../src/utils/mis-reports-2-compute.js");
const E1 = (await mongoose.model("Employee").findOne({ employeeCode: "E1" }).lean()) as any;
const fs = await import("node:fs");
const R = await import("../../src/utils/pob-rx-reports.js");
const month = "2026-10";
store["products"] = [
  { _id: asId(301), tenantSlug: T, productName: "DEXNOVA", name: "DEXNOVA", code: "DX", rate: 100, pack: "10x10", status: "ACTIVE", division: "Eye" },
  { _id: asId(302), tenantSlug: T, productName: "ZIVIFRESH", name: "ZIVIFRESH", code: "ZF", rate: 50, pack: "10ml", status: "ACTIVE", division: "Eye" },
  { _id: asId(303), tenantSlug: T, productName: "BEPIREX", name: "BEPIREX", code: "BP", rate: 20, pack: "5ml", status: "ACTIVE", division: "Eye" }
];
store["employees"].forEach((e: any) => { e.division = "Eye"; });
store["dealers"] = [
  { _id: asId(401), tenantSlug: T, employeeCode: "E2", dealerName: "CITY MEDICALS", patchName: "KANNUR", city: "KANNUR", status: "ACTIVE" },
  { _id: asId(402), tenantSlug: T, employeeCode: "E3", dealerName: "SREE PHARMA", patchName: "BANGALORE", status: "ACTIVE" }
];
const d2 = (n: number, e: string, date: string, doctor: number, extra: any) => ({ _id: asId(600 + n), tenantSlug: T, employeeCode: e, doctorId: String(asId(100 + doctor)), visitDate: new Date(date), month: date.slice(0, 7), visitDateOnly: date, callSession: "MORNING", status: "SUBMITTED", productsDetailed: [], pob: [], createdAt: new Date(date + "T10:00:00Z"), ...extra });
store["dcrs"] = [
  d2(1, "E2", "2026-10-01", 1, { rxItems: [{ productName: "DEXNOVA", qty: 4 }, { productName: "ZIVIFRESH", qty: 2 }], productsDetailed: ["DEXNOVA"] }),
  d2(2, "E2", "2026-10-02", 2, { rxItems: [{ productName: "dexnova", qty: 1 }] }),
  d2(3, "E3", "2026-10-02", 4, { rxItems: [{ productName: "BEPIREX", qty: 10 }], productsDetailed: ["BEPIREX", "ZIVIFRESH"] })
];
store["chemist_calls"] = [
  { _id: asId(701), tenantSlug: T, employeeCode: "E2", chemistId: String(asId(401)), visitDateOnly: "2026-10-01", visitDate: new Date("2026-10-01"), pob: [{ productName: "DEXNOVA", qty: 5 }, { productName: "ZIVIFRESH", qty: 3, valueRs: 200 }] },
  { _id: asId(702), tenantSlug: T, employeeCode: "E2", chemistId: String(asId(401)), visitDateOnly: "2026-10-03", visitDate: new Date("2026-10-03"), pob: [{ productName: "DEXNOVA", qty: 2 }] }
];
store["field_visit_logs"] = [];
const out = `${(await import("node:os")).tmpdir()}/r42-out`; fs.mkdirSync(out, { recursive: true });

const pw = await R.computeProductWise(T, "admin", month, month, "Doctors");
console.log("PRODUCTWISE Doctors", JSON.stringify(pw.products.map((p: any) => [p.name, p.pack, p.perMonth[month].qty, p.perMonth[month].value, p.total.value])), JSON.stringify(pw.totals.total));
assert.equal(pw.products[0].perMonth[month].qty, 5); // 4 + 1 (case-insens match)
assert.equal(pw.products[0].perMonth[month].value, 500);
const pwc = await R.computeProductWise(T, "admin", month, month, "Chemists");
assert.equal(pwc.products[1].perMonth[month].value, 200); // explicit valueRs wins
assert.equal(pwc.products[0].perMonth[month].value, 700); // 7 x 100
const ff = await R.computeFieldforceWise(T, "E1", month, month, "Doctors");
console.log("FFWISE", JSON.stringify(ff.rows.map((r: any) => [r.name, r.isManager, r.total])), ff.employee?.doj);
const dw = await R.computeDayWise(T, "E1", month, true, "Datewise", []);
const e2 = dw.rows.find((r: any) => r.employeeCode === "E2");
console.log("DAYWISE E2 day1/2/3", JSON.stringify([e2.perDay[0], e2.perDay[1], e2.perDay[2]]), JSON.stringify(e2.total));
assert.deepEqual(e2.perDay[0], { drs: 1, che: 1, qty: 4 + 2 + 5 + 3, value: 400 + 100 + 500 + 200 });
const dwp = await R.computeDayWise(T, "E1", month, true, "Productwise", ["BEPIREX"]);
console.log("DAYWISE productwise", dwp.rows.length, dwp.rows[0]?.product, dwp.rows[0]?.total);

for (const [name, mode, option, vac] of [["x1", "Doctors", "Dr Wise", false], ["x2", "Doctors", "Brand Wise", false], ["x3", "Chemists", "Dr Wise", true], ["x4", "Chemists", "Brand Wise", true]] as const) {
  const d = await R.buildPobDump(T, "E2", month, mode, [], vac, option);
  fs.writeFileSync(`${out}/${name}.xlsx`, await R.dumpToXlsx(d));
  console.log("DUMP", name, d.variant, "rows", d.rows.length);
}
const h1 = await R.computeHeat(T, "drs", "E1", 4, new Date("2026-10-04T00:00:00Z"));
console.log("HEAT drs", JSON.stringify(h1!.rows.map((r) => [r.name, r.cnt, r.isSelected])), h1!.from, h1!.to);
const h2 = await R.computeHeat(T, "products", "E1", 2, new Date("2026-10-04T00:00:00Z"));
console.log("HEAT products", JSON.stringify(h2!.rows.map((r) => [r.name, r.cnt])));
// Round 43 -- Not At All Visit HQs. Chain: E2/E3 (BE) -> E1 (ABM) -> E9 (BH). E8 is a ZBM under no one.
store["employees"].push(emp(9, "BHAVYA H", "E9", "BH", "BH", undefined, "KOCHI", "Kerala"));
store["employees"].find((e) => e.employeeCode === "E1").reportingManager = "E9";
store["dcrs"].push(dcr(21, "E2", "2026-10-02", 1, "EVENING", { jointWork: { accompanyingManager: "SANDEEP R SHENOY" } }));
const hv = await R.computeHqVisits(T, "E1", 1, new Date("2026-10-04T00:00:00Z"));
console.log("HQV", JSON.stringify(hv!.rows.map((r) => [r.name, r.hq, r.cells])));
const c2 = hv!.rows.find((r) => r.employeeCode === "E2")!.cells, c3 = hv!.rows.find((r) => r.employeeCode === "E3")!.cells;
assert.equal(hv!.designations.length, 14);
assert.equal(hv!.rows.length, 2);                       // BEs only, the selected ABM is not a row
assert.equal(c2.ABM, "green");                          // E2 named the ABM as accompanying manager on 2026-10-01
assert.equal(c2.BH, "red");                             // BH is in the chain, never visited
assert.equal(c2.BM, "yellow");                          // no BM in the chain
assert.equal(c2.SM, "yellow");
assert.equal(c3.ABM, "red");                            // E3 has no joint work and the ABM worked no Bangalore territory
assert.equal(c3.BH, "red");
// the manager's OWN call in the BE's HQ turns the cell green (Dr D is territory-less, so give the ABM a Dr in BANGALORE)
store["doctors"].push({ ...doc(9, "Dr Z", "CP", "A", "D9", "E1"), territory: "BANGALORE" });
store["dcrs"].push(dcr(9, "E1", "2026-10-03", 9, "MORNING"));
const hv2 = await R.computeHqVisits(T, "E1", 1, new Date("2026-10-04T00:00:00Z"));
assert.equal(hv2!.rows.find((r) => r.employeeCode === "E3")!.cells.ABM, "green");
// window: September joint work is outside a 1-month window, inside a 2-month one
store["dcrs"].push(dcr(10, "E3", "2026-09-05", 4, "MORNING", { jointWork: { accompanyingManager: "BHAVYA H" } }));
assert.equal(hv2!.rows.find((r) => r.employeeCode === "E3")!.cells.BH, "red");
const hv3 = await R.computeHqVisits(T, "E1", 2, new Date("2026-10-04T00:00:00Z"));
assert.equal(hv3!.rows.find((r) => r.employeeCode === "E3")!.cells.BH, "green");
console.log("HQV asserts ok");
process.exit(0);
