// Round 41 upgrader idempotency check. Run: npm i --no-save sift && npx tsx scripts/r41-tests/upgrade.ts
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
const E1 = (await mongoose.model("Employee").findOne({ employeeCode: "E1" }).lean()) as any;
(mongoose.Model as any).insertMany = function (docs: any[]) { const arr = coll(this); const out = docs.map((d, i) => ({ _id: asId(900000 + arr.length + i), ...d })); arr.push(...out); return Promise.resolve(out); };
(mongoose.Model as any).updateMany = function (f: any, u: any) { const hit = coll(this).filter(sift(f)); for (const d of hit) Object.assign(d, u.$set || {}); return Promise.resolve({ modifiedCount: hit.length }); };
const lock = await import("../../src/utils/dcr-lock.js");
(mongoose.Model as any).insertMany = function (docs: any[]) { const arr = coll(this); arr.push(...docs.map((d, i) => ({ _id: asId(700000 + arr.length + i), ...d }))); return Promise.resolve(docs); };
(mongoose.Model as any).updateMany = function (f: any, u: any) { const hit = coll(this).filter(sift(f)); for (const d of hit) Object.assign(d, u.$set || {}); return Promise.resolve({ modifiedCount: hit.length }); };
(mongoose.Model as any).updateOne = function (f: any, u: any, o: any = {}) { let hit = coll(this).filter(sift(f))[0]; if (!hit && o.upsert) { hit = { ...Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v !== "object")), ...(u.$setOnInsert || {}) }; coll(this).push(hit); } if (hit) Object.assign(hit, u.$set || {}); return Promise.resolve({ modifiedCount: hit ? 1 : 0 }); };
const { runRound41Upgrade } = await import("../../src/migrations/round41-upgrade.js");
await runRound41Upgrade(); await runRound41Upgrade(); // idempotent
const docs = store["doctors"] as any[];
console.log("TIERS", docs.map((d) => `${d.doctorCode}:${d.doctorCategory}`).join(" "), "| campaign", docs.map((d) => d.campaign).join(","));
console.log("CODES", (store["work_type_codes"] || []).length, "SETTINGS", (store["companyconfigs"] as any[]).filter((c) => ["DCR_DELAY_DAYS", "CATEGORY_NORMS"].includes(c.key)).map((c) => c.key + "=" + JSON.stringify(c.value)).join(" "));
process.exit(0);
