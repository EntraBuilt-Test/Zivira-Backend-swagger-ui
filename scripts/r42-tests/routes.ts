// Round 42 in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r42-tests/routes.ts
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


const fs2 = await import("node:fs");
const get = (p: string) => call("GET", p, "admin");
const month2 = "2026-10";
let r = await get(`/company/mis/pobrx/product-wise?employeeCode=admin&fromMonth=${month2}&toMonth=${month2}&mode=Doctors`);
assert.equal(r.status, 200); assert.equal(r.json.data.products[0].perMonth[month2].qty, 5);
r = await get(`/company/mis/pobrx/product-wise?employeeCode=admin&fromMonth=${month2}&toMonth=${month2}&mode=Chemists`);
assert.equal(r.json.data.products[0].perMonth[month2].value, 700);
r = await get(`/company/mis/pobrx/fieldforce-wise?employeeCode=E1&fromMonth=${month2}&toMonth=${month2}&mode=Doctors`);
assert.equal(r.status, 200); assert.equal(r.json.data.rows.length, 3);
r = await get(`/company/mis/pobrx/day-wise?employeeCode=E1&month=${month2}&mode=Datewise&withoutVacant=true`);
assert.equal(r.status, 200); assert.equal(r.json.data.days, 31);
r = await get(`/company/mis/pobrx/day-wise?employeeCode=E1&month=${month2}&mode=Productwise`);
assert.equal(r.status, 400); // needs products
r = await get(`/company/mis/pobrx/day-wise?employeeCode=E1&month=${month2}&mode=Productwise&products=BEPIREX||DEXNOVA`);
assert.equal(r.status, 200); assert.ok(r.json.data.rows.length >= 2);
r = await get(`/company/mis/pobrx/dump?employeeCode=E2&month=${month2}&mode=`);
assert.equal(r.status, 400);
r = await get(`/company/mis/pobrx/dump?employeeCode=E2&month=${month2}&mode=Chemists&option=Brand%20Wise&checkVacant=true&products=DEXNOVA`);
assert.equal(r.status, 200); fs2.writeFileSync((await import("node:os")).tmpdir() + "/r42-route.xlsx", r.buf!);
const XL = (await import("xlsx")).default; const wbk = XL.read(r.buf!, { type: "buffer" });
const aoa = XL.utils.sheet_to_json<any[]>(wbk.Sheets["Dr_Che_POB"], { header: 1 }) as any[][];
assert.equal(aoa[1].length, 72); assert.equal(aoa[2][5], "CITY MEDICALS"); assert.equal(aoa[2][7], "DX");
console.log("DUMP via route ok:", aoa.length, "rows; product filter kept only DEXNOVA ->", aoa.length - 2, "data row(s)");
for (const k of ["drs", "products"]) { r = await get(`/company/mis/heat/${k}?employeeCode=E1&months=4`); assert.equal(r.status, 200); assert.equal(r.json.data.rows.at(-1).isSelected, true); assert.equal(r.json.data.rows[0].isSelected, false); }
r = await get(`/company/mis/heat/hqs?employeeCode=E1&months=4`); assert.equal(r.status, 200); assert.equal(r.json.data.designations.length, 14); assert.ok(r.json.data.rows.every((x: any) => !x.isSelected));
assert.equal((await get(`/company/mis/heat/drs?employeeCode=E1&months=9`)).status, 400);
assert.equal((await get(`/company/mis/heat/drs?months=3`)).status, 400);
// Round 44 routes
r = await get(`/company/mis/visit-details/options`); assert.equal(r.status, 200); assert.ok(Array.isArray(r.json.data.specialities)); assert.deepEqual(r.json.data.classes, ["Nil", "A", "B", "C"]);
r = await get(`/company/mis/visit-details/cat-cls?employeeCode=E1&mode=Category&fromMonth=2026-10&toMonth=2026-10&values=Nil||CORE`); assert.equal(r.status, 200); assert.equal(r.json.data.rows.at(-1).isManager, true); assert.deepEqual(r.json.data.values, ["Nil", "CORE"]);
r = await get(`/company/mis/visit-details/cat-cls?employeeCode=E1&mode=Category&fromMonth=2026-10&toMonth=2026-10`); assert.equal(r.status, 400);
r = await get(`/company/mis/visit-details/cat-cls?employeeCode=E1&mode=Bogus&fromMonth=2026-10&toMonth=2026-10`); assert.equal(r.status, 400);
r = await get(`/company/mis/visit-details/cat-cls?employeeCode=E1&mode=Listed Doctor&fromMonth=2026-10&toMonth=2026-09`); assert.equal(r.status, 400);
r = await get(`/company/mis/visit-details/cat-cls?employeeCode=E1&mode=Listed Doctor&fromMonth=2026-09&toMonth=2026-10&withVacants=true`); assert.equal(r.status, 200); assert.deepEqual(r.json.data.months, ["2026-09", "2026-10"]);
r = await get(`/company/mis/visit-details/datewise?employeeCode=E2&month=2026-10`); assert.equal(r.status, 200); assert.equal(r.json.data.matrix, false); assert.equal(r.json.data.weeks.length, 5);
r = await get(`/company/mis/visit-details/datewise?employeeCode=E2&month=2026-10&week=1`); assert.equal(r.status, 200); assert.equal(r.json.data.days.length, 4);
r = await get(`/company/mis/visit-details/datewise?employeeCode=E2&month=2026-10&week=9`); assert.equal(r.status, 404);
r = await get(`/company/mis/visit-details/datewise?employeeCode=E2&month=bad`); assert.equal(r.status, 400);
// Round 45 routes
{
  const nowMonth = new Date().toISOString().slice(0, 7), today = new Date().toISOString().slice(0, 10);
  const drC = String(asId(103)), drOther = String(asId(104));
  let x = await call("POST", `/field/slide-views`, "e2", { doctorId: drC, brandName: "DEXNOVA", productName: "DEXNOVA", durationSec: 42 });
  assert.equal(x.status, 201, JSON.stringify(x.json));
  x = await call("POST", `/field/slide-views`, "e2", { doctorId: drOther, durationSec: 5 }); assert.equal(x.status, 404);          // not in his list
  x = await call("POST", `/field/dcrs`, "e2", { doctorId: drC, productsDetailed: ["DEXNOVA"], brandRatings: [{ brandName: "DEXNOVA", stars: 6 }] }); assert.equal(x.status, 400);
  x = await call("POST", `/field/dcrs`, "e2", { doctorId: drC, productsDetailed: ["DEXNOVA"], brandRatings: [{ brandName: "DEXNOVA", stars: 4 }] });
  assert.equal(x.status, 201, JSON.stringify(x.json));
  assert.equal(x.json.data.submissionChannel, "E-detailing");                                                                       // slides were shown to this doctor today
  assert.equal((store["doctor_brand_ratings"] || []).length, 1); assert.equal(store["doctor_brand_ratings"][0].stars, 4); assert.equal(store["doctor_brand_ratings"][0].month, nowMonth);
  x = await call("GET", `/field/slide-views?date=${today}`, "e2"); assert.equal(x.json.data.length, 1);
  let y = await get(`/company/mis/quiz-result?employeeCode=E1&month=${nowMonth}`); assert.equal(y.status, 200); assert.equal(y.json.data.rows.at(-1).name, "SANDEEP R SHENOY");
  y = await get(`/company/mis/quiz-result?employeeCode=E1&month=bad`); assert.equal(y.status, 400);
  y = await get(`/company/mis/daywise-dump?employeeCode=E1&month=2026-10&format=xls`); assert.equal(y.status, 200); assert.ok(String(y.buf).startsWith("<table width = '100%' border='1'><tr><th style='background-color:lightblue'>ECODE</th>"));
  y = await get(`/company/mis/daywise-dump?employeeCode=E1&month=2026-10`); assert.equal(y.status, 200); assert.ok(y.buf && y.buf.length > 1000);
  y = await get(`/company/mis/call-report-dump?employeeCode=admin&month=2026-10`); assert.equal(y.status, 200); assert.ok(String(y.text).startsWith("Field Force Name,Employee Code,hq,"));
  y = await get(`/company/mis/call-report-dump?employeeCode=E1&month=2026-10&format=xlsx&days=1,2`); assert.equal(y.status, 200);
  y = await get(`/company/mis/call-report-dump?month=2026-10`); assert.equal(y.status, 400);
  y = await get(`/company/mis/detailing/options`); assert.equal(y.json.data.brands[0], "Nil");
  y = await get(`/company/mis/detailing/visit-wise?employeeCode=admin&month=2026-10&mode=Product&names=DEXNOVA`); assert.equal(y.status, 200); assert.ok(y.json.data.rows.length >= 1);
  y = await get(`/company/mis/detailing/visit-wise?employeeCode=admin&month=2026-10&mode=Bogus&names=A`); assert.equal(y.status, 400);
  y = await get(`/company/mis/detailing/visit-wise?employeeCode=admin&month=2026-10&mode=Brand`); assert.equal(y.status, 400);
  y = await get(`/company/mis/detailing/star-rating?employeeCode=admin&month=${nowMonth}&names=DEXNOVA`); assert.equal(y.status, 200);
  assert.equal(y.json.data.rows.find((r: any) => r.employeeCode === "E2").groups["DEXNOVA"].stars[3], 1);                      // the 4-star rating just captured
  y = await get(`/company/mis/slide-analysis?employeeCode=admin&fromMonth=${nowMonth}&toMonth=${nowMonth}&basedOn=Product`); assert.equal(y.status, 200); assert.equal(y.json.data.rows.length, 1);
  y = await get(`/company/mis/slide-analysis?employeeCode=admin&fromMonth=${nowMonth}&toMonth=${nowMonth}&filterKind=Nope`); assert.equal(y.status, 400);
  y = await get(`/company/mis/slide-analysis/options`); assert.ok(Array.isArray(y.json.data["Doctor Speciality"]));
  y = await get(`/company/mis/drs-analysis?employeeCode=E1&fromMonth=${nowMonth}&toMonth=${nowMonth}`); assert.equal(y.status, 200);
  assert.equal(y.json.data.rows.find((r: any) => r.employeeCode === "E2").perMonth[nowMonth].edet, 1);
  y = await get(`/company/mis/drs-analysis?fromMonth=${nowMonth}`); assert.equal(y.status, 400);
}
console.log("R42 ROUTES OK");
server.close(); process.exit(0);
