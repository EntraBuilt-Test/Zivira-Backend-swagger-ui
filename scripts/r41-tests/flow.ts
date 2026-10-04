// Round 41 in-memory verification (no MongoDB): patches mongoose statics with sift over seeded data.
// Run: npm i --no-save sift && npx tsx scripts/r41-tests/flow.ts
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
// ── extra in-memory statics for the route-handler flow ──
(Q.prototype as any).limit = function (n: number) { this.docs = this.docs.slice(0, n); return this; };
(Q.prototype as any).skip = function (n: number) { this.docs = this.docs.slice(n); return this; };
const idOf = (d: any) => String(d._id);
(mongoose.Model as any).create = async function (doc: any) {
  const many = Array.isArray(doc);
  const out: any[] = [];
  for (const one of many ? doc : [doc]) {
    const d = new (this as any)(one);
    await d.validate();
    const o = d.toObject({ depopulate: true });
    for (const k of Object.keys(o)) if (o[k] instanceof mongoose.Types.ObjectId && k !== "_id") o[k] = String(o[k]);
    if (o.visitDate && (this as any).schema.path("visitDateOnly") && !o.visitDateOnly) o.visitDateOnly = new Date(o.visitDate).toISOString().slice(0, 10); // mirrors the pre-save hook
    coll(this).push(o);
    out.push(Object.assign(new (this as any)(o), { _id: o._id }));
  }
  return many ? out : out[0];
};
(mongoose.Model as any).findById = function (id: any) { const q = new Q(coll(this).filter((d) => idOf(d) === String(id)), this); const t = q.then.bind(q); (q as any).then = (res: any, rej: any) => t((arr: any[]) => arr[0] || null).then(res, rej); return q; };
(mongoose.Model as any).updateOne = function (f: any, u: any) { const hit = coll(this).filter(sift(f))[0]; if (hit) Object.assign(hit, u.$set || {}); return Promise.resolve({ modifiedCount: hit ? 1 : 0 }); };
(mongoose.Model as any).deleteMany = function (f: any) { const arr = coll(this); const keep = arr.filter((d) => !sift(f)(d)); const n = arr.length - keep.length; arr.length = 0; arr.push(...keep); return Promise.resolve({ deletedCount: n }); };
(mongoose.Model as any).findOneAndUpdate = async function (f: any, u: any, o: any = {}) { let hit = coll(this).filter(sift(f))[0]; if (!hit && o.upsert) { hit = { _id: asId(800000 + coll(this).length), ...Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v !== "object")), ...(u.$setOnInsert || {}) }; coll(this).push(hit); } if (hit) Object.assign(hit, u.$set || {}); return hit || null; };
(mongoose.Model as any).updateMany = function (f: any, u: any) { const hit = coll(this).filter(sift(f)); for (const d of hit) Object.assign(d, u.$set || {}); return Promise.resolve({ modifiedCount: hit.length }); };

const assert = (await import("node:assert")).default;
const express = (await import("express")).default;
const { signToken } = await import("../../src/http/auth.js");
const { errorHandler } = await import("../../src/http/errors.js");
const { fieldRouter } = await import("../../src/routes/field.routes.js");
const { managerRouter } = await import("../../src/routes/manager.routes.js");
const { companyRouter } = await import("../../src/routes/company.routes.js");
const XLSX = (await import("xlsx")).default;

store["users"] = [
  { _id: asId(501), tenantSlug: T, username: "e2", role: "MR", portal: "FIELD_FORCE" },
  { _id: asId(502), tenantSlug: T, username: "e1", role: "ABM", portal: "FIELD_FORCE" },
  { _id: asId(503), tenantSlug: T, username: "admin", role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN" }
];
store["dcrs"] = []; store["chemist_calls"] = []; store["products"].forEach((p: any) => { p.code = p.productName; });
const app = express(); app.use(express.json());
app.use("/api/field", fieldRouter); app.use("/api/manager", managerRouter); app.use("/api/company", companyRouter); const { ZodError } = await import("zod"); const { HttpError } = await import("../../src/http/errors.js");
app.use((error: any, _req: any, _res: any, next: any) => { if (error instanceof ZodError) { next(new HttpError(400, error.errors.map((i: any) => i.message).join(", "))); return; } next(error); }); // same as server.ts
app.use(errorHandler);
const server = app.listen(0); const port = (server.address() as any).port;
const call = async (method: string, path: string, user: string, body?: any) => {
  const claims: Record<string, any> = { e2: { sub: String(asId(501)), role: "MR", portal: "FIELD_FORCE", tenantSlug: T }, e1: { sub: String(asId(502)), role: "ABM", portal: "FIELD_FORCE", tenantSlug: T }, admin: { sub: String(asId(503)), role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN", tenantSlug: T } };
  const r = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${signToken(claims[user])}` }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, json: ct.includes("json") ? await r.json() : null, buf: ct.includes("json") || ct.includes("csv") ? null : Buffer.from(await r.arrayBuffer()), text: ct.includes("csv") ? await r.text() : "" };
};
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

// 1. field submits a DCR with POB + Rx + call time 22:15
const sub = await call("POST", "/field/dcrs", "e2", { doctorId: String(asId(101)), productsDetailed: ["DEXNOVA"], callSession: "MORNING", callTime: "22:15",
  pob: [{ productCode: "DEXNOVA", productName: "DEXNOVA", qty: 3, valueRs: 300 }], pobAmountRs: 999, rxItems: [{ productCode: "DEXNOVA", productName: "DEXNOVA", qty: 4 }], submissionChannel: "Apps" });
console.log("FIELD SUBMIT", sub.status, JSON.stringify(sub.json).slice(0, 200));
assert.equal(sub.status, 201); console.log("STORED", JSON.stringify(store["dcrs"][0]).slice(0,600));

// duplicate same day -> 409
assert.equal((await call("POST", "/field/dcrs", "e2", { doctorId: String(asId(101)), productsDetailed: [] })).status, 409);
// negative POB -> 400
assert.equal((await call("POST", "/field/dcrs", "e2", { doctorId: String(asId(102)), productsDetailed: [], pob: [{ productName: "X", qty: -1 }] })).status, 400);
// back-dated locked date -> 423 (need a lockable working day: pick 9 days ago, ensure not weekly off by scanning)
let lockedStatus = 0, lockedDate = "";
for (let i = 8; i <= 20 && lockedStatus !== 423; i++) {
  lockedDate = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
  lockedStatus = (await call("POST", "/field/dcrs", "e2", { doctorId: String(asId(103)), productsDetailed: [], visitDate: lockedDate })).status;
}
console.log("BACKDATED LOCKED ->", lockedStatus, lockedDate);
assert.equal(lockedStatus, 423);
const lk = await call("GET", "/field/dcr-locks", "e2");
assert.ok(lk.json.data.some((l: any) => l.date === lockedDate && l.locked));
const rq = await call("POST", "/field/dcr-locks/request-release", "e2", { date: lockedDate, note: "network" });
assert.equal(rq.status, 200);
// admin releases via delayed release action
const rl = await call("POST", "/company/masters/delayedRelease/action/release", "admin", { employeeCodes: ["E2"], dates: [lockedDate] });
console.log("ADMIN RELEASE", rl.status, JSON.stringify(rl.json));
const again = await call("POST", "/field/dcrs", "e2", { doctorId: String(asId(103)), productsDetailed: [], visitDate: lockedDate, pob: [{ productName: "ZIVIFRESH", qty: 1 }] });
console.log("SUBMIT AFTER RELEASE", again.status);
assert.equal(again.status, 201);

// 2. manager sees POB / Rx
const mdcr = await call("GET", "/manager/dcrs", "e1");
console.log("MGR", mdcr.status, JSON.stringify(mdcr.json).slice(0,300));
const mine = (mdcr.json.data as any[]).find((d) => d.pobAmountRs === 999);
assert.ok(mine, "manager sees DCR"); assert.equal(mine.pob[0].qty, 3); assert.equal(mine.rxItems[0].qty, 4); assert.equal(mine.submissionChannel, "Apps");
console.log("MANAGER SEES pob", JSON.stringify(mine.pob), "amount", mine.pobAmountRs, "rx", JSON.stringify(mine.rxItems));

// 3. admin reports
const dump = await call("GET", `/company/mis/dcr-dump?month=${month}&employeeCode=E1&format=csv`, "admin");
const lines = dump.text.trim().split("\r\n");
console.log("DUMP header cols", lines[0].split(",").length, "rows", lines.length - 1);
const hdr = lines[0].split(","); const sIdx = hdr.indexOf("Session");
const row = lines.slice(1).find((l) => l.includes("22:15") || l.split(",")[sIdx] === "E");
console.log("DUMP row with E:", !!row, row?.split(",")[sIdx]);
assert.ok(row, "dump shows session E from 22:15");
const xl = await call("GET", `/company/mis/dcr-dump?month=${month}&employeeCode=E1&format=xlsx`, "admin");
const wb = XLSX.read(xl.buf!, { type: "buffer" });
const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["DCR Analysis Dump"], { header: 1 }) as any[][];
assert.equal(aoa[0][0], hdr[0]); assert.ok(aoa.length > 1);
console.log("XLSX via route opens:", aoa.length, "rows,", xl.buf!.length, "bytes");
const pw = await call("GET", `/company/mis/pob-wise?employeeCode=E1&fromMonth=${month}&toMonth=${month}`, "admin");
console.log("POB-WISE", pw.status, JSON.stringify(pw.json?.data?.grandTotal?.total ?? pw.json).slice(0, 200));
const an = await call("GET", `/company/mis/dcr-analysis?employeeCode=E2&month=${month}`, "admin");
console.log("DCR-ANALYSIS", an.status, JSON.stringify(an.json?.data?.reports?.[0]?.delayed ?? an.json).slice(0, 300));
const st = await call("GET", `/company/mis/review-report?employeeCode=E2&month=${month}`, "admin");
console.log("REVIEW", st.status, "doctorPobValue", st.json?.data?.metrics?.doctorPobValue, "delayedDays", st.json?.data?.metrics?.delayedDays);
const sset = await call("PUT", "/company/settings/r41", "admin", { dcrDelayDays: 5 });
assert.equal(sset.json.data.dcrDelayDays, 5);
console.log("FLOW OK");
server.close(); process.exit(0);
