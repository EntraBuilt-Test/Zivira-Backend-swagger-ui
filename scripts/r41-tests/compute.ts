// Round 41 in-memory verification (no MongoDB): patches mongoose statics with sift over seeded data.
// Run: npm i --no-save sift && npx tsx scripts/r41-tests/compute.ts
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
const fs = await import("node:fs");
const E1 = (await mongoose.model("Employee").findOne({ employeeCode: "E1" }).lean()) as any;
(mongoose.Model as any).insertMany = function (docs: any[]) { const arr = coll(this); const out = docs.map((d, i) => ({ _id: asId(900000 + arr.length + i), ...d })); arr.push(...out); return Promise.resolve(out); };
(mongoose.Model as any).updateMany = function (f: any, u: any) { const hit = coll(this).filter(sift(f)); for (const d of hit) Object.assign(d, u.$set || {}); return Promise.resolve({ modifiedCount: hit.length }); };
const assert = (await import("node:assert")).default;
const lock = await import("../../src/utils/dcr-lock.js");
const XLSX = (await import("xlsx")).default;

// Gap C: session from call time
assert.equal(c.sessionOfCall("22:15", "MORNING"), "E");
assert.equal(c.sessionOfCall("09:05", "EVENING"), "M");
assert.equal(c.sessionOfCall("", "EVENING"), "E");
console.log("GAP C session ok");

// Gap B: per-product POB + Rx + amount
store["dcrs"].push(dcr(7, "E2", "2026-10-03", 1, "MORNING", { callTime: "09:30", pob: [{ productName: "DEXNOVA", qty: 2 }], pobAmountRs: 999, rxItems: [{ productName: "DEXNOVA", qty: 4 }] }));
const rows = await c.buildDcrDump(T, "E1", "2026-10", [], false);
const hdr = c.DUMP_HEADERS;
const sIdx = hdr.indexOf("Session");
const sessions = rows.map((r) => r[sIdx]);
console.log("DUMP sessions", sessions.join(","), "rows", rows.length, "cols", hdr.length);
assert.ok(sessions.includes("E") && sessions.includes("M"));
assert.ok(rows.every((r) => r.length === hdr.length));

// Gap D (dump): xlsx buffer opens and values re-read
const aoa = [hdr, ...rows];
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Dump");
const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
const wb2 = XLSX.read(buf, { type: "buffer" });
const back = XLSX.utils.sheet_to_json<string[]>(wb2.Sheets["Dump"], { header: 1 }) as any[][];
assert.equal(back[0][0], hdr[0]);
assert.equal(back.length, aoa.length);
assert.equal(back[1][sIdx], rows[0][sIdx]);
console.log("GAP D dump xlsx re-read ok:", back.length, "rows", buf.length, "bytes");

// Gap A: locks. now = 2026-10-10 => with delay 3, dates <= 2026-10-06 lockable
const now = new Date("2026-10-10T08:00:00Z");
const emps = (await mongoose.model("Employee").find({ tenantSlug: T, employeeCode: { $in: ["E2", "E3"] } }).lean()) as any[];
const created = await lock.detectLocks(T, emps, "2026-10-01", "2026-10-09", now);
const locks = store["dcr_locks"] || [];
console.log("LOCKS created", created, locks.map((l) => l.employeeCode + ":" + l.dcrDate).join(" "));
assert.ok(created > 0);
assert.ok(!locks.some((l) => l.employeeCode === "E2" && l.dcrDate === "2026-10-01"), "submitted day must not lock");
assert.ok(!locks.some((l) => l.dcrDate > "2026-10-06"), "inside window must not lock");
const st = await lock.getLockState(T, "E3", "2026-10-05", now);
console.log("E3 10-04 state", JSON.stringify(st));
const rel = await lock.releaseLocks(T, "E3", ["2026-10-05"], "admin:x", now);
assert.equal(rel, 1);
assert.equal((await lock.getLockState(T, "E3", "2026-10-05", now)).locked, false);
const lk = (store["dcr_locks"] as any[]).find((l) => l.employeeCode === "E3" && l.dcrDate === "2026-10-05");
assert.ok(lk.releasedAt && lk.releasedBy === "admin:x");
console.log("GAP A lock + release ok");

// Tier + review
const E2 = (await mongoose.model("Employee").findOne({ employeeCode: "E2" }).lean()) as any;
const rv = await c.computeReviewReport(T, E2, "2026-10");
console.log("REVIEW keys", JSON.stringify(Object.fromEntries(Object.entries(rv.metrics).filter(([k]) => /nil|core|Core|delayed|chemistPob|rcpa|crm|spend/i.test(k)))));
const as = await c.computeAssessment(T, E2, ["2026-10"]);
console.log("ASSESS", JSON.stringify(Object.fromEntries(Object.entries(as.cols["2026-10"]).filter(([, v]) => v !== ""))));
console.log("ALL OK");
process.exit(0);
