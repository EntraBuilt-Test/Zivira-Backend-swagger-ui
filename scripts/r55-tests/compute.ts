// Round 55 in-memory verification (no MongoDB). Run: npx tsx scripts/r55-tests/compute.ts
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

import assert from "node:assert";
import assert from "node:assert";
const T = "demo";
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string) =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Delhi", division: "SUBDIV", status: "ACTIVE", joinDate: new Date("2020-01-01") });
store["employees"] = [emp(1, "RAJ RBM", "R1", "RBM", "RBM", undefined, "ERNAKULAM"), emp(2, "ABE ABM", "A1", "ABM", "ABM", "R1", "KOCHI"),
  emp(3, "BEE ONE", "B1", "BE", "MR", "A1", "K1"), emp(4, "BEE TWO", "B2", "BE", "MR", "A1", "K2")];
const doc = (n: number, e: string, specialty: string, cat?: string) => ({ _id: asId(100 + n), tenantSlug: T, name: "Dr" + n, mappedEmployeeCode: e, status: "ACTIVE", doctorCode: "D" + n, specialty, doctorCategory: cat });
store["doctors"] = [doc(1, "B1", "CP", "CORE"), doc(2, "B1", "GENPHY", "N CORE"), doc(3, "B1", "CP"), doc(4, "B2", "CP", "CORE"), doc(5, "A1", "CP", "CORE")];
const dcr = (n: number, e: string, d: string, doctor: number, prods: string[], status = "SUBMITTED") =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, status, productsDetailed: prods });
store["dcrs"] = [
  dcr(1, "B1", "2026-10-01", 1, ["STRIOS"]), dcr(2, "B1", "2026-10-04", 1, ["STRIOS"]),   // same doctor twice -> 1
  dcr(3, "B1", "2026-10-02", 2, ["STRIOS"]), dcr(4, "B1", "2026-10-03", 3, ["OTHER"]),   // Dr3 not detailed with STRIOS
  dcr(5, "B2", "2026-10-02", 4, ["strios"]), dcr(6, "B2", "2026-10-05", 4, ["STRIOS"], "REJECTED"),
  dcr(7, "A1", "2026-10-06", 5, ["STRIOS"]), dcr(8, "B1", "2026-09-06", 1, ["STRIOS"])
];
store["doctorSpecialities"] = [
  { tenantSlug: T, specialityName: "GENPHY", sortOrder: 2, status: "ACTIVE" }, { tenantSlug: T, specialityName: "CP", sortOrder: 1, status: "ACTIVE" },
  { tenantSlug: T, specialityName: "OLD", sortOrder: 3, status: "INACTIVE" }, { tenantSlug: T, specialityName: "RES", status: "ACTIVE" }
];
store["field_visit_logs"] = [
  { tenantSlug: T, employeeCode: "B1", visitType: "UnlistedDoctor", entityName: "U One", visitDateOnly: "2026-10-03", productsDetailed: ["STRIOS"] },
  { tenantSlug: T, employeeCode: "B1", visitType: "UnlistedDoctor", entityName: "u one", visitDateOnly: "2026-10-12", productsDetailed: ["STRIOS", "X"] },
  { tenantSlug: T, employeeCode: "B1", visitType: "UnlistedDoctor", entityName: "U Two", visitDateOnly: "2026-10-13", productsDetailed: ["X"] },
  { tenantSlug: T, employeeCode: "B1", visitType: "UnlistedDoctor", entityName: "Old", visitDateOnly: "2026-09-13" },      // pre-change, no products
  { tenantSlug: T, employeeCode: "B2", visitType: "Stockist", entityName: "S1", visitDateOnly: "2026-10-05", productsDetailed: ["STRIOS"] }
];
store["products"] = [{ _id: asId(900), tenantSlug: T, productName: "STRIOS", status: "ACTIVE" }, { _id: asId(901), tenantSlug: T, productName: "X", status: "ACTIVE" }];
const R = await import("../../src/utils/r55-reports.js");
const R51 = await import("../../src/utils/r51-reports.js");

const o: any = await R.specatOptions(T);
assert.deepEqual(o.specialities, ["CP", "GENPHY", "RES"]);            // master order, inactive excluded, null sortOrder last
assert.deepEqual(o.categories, ["Nil", "CORE", "N CORE", "S CORE"]);

const s: any = await R.computeProductExposureSpecat(T, "A1", "STRIOS", "2026-10", "2026-10", "speciality", ["CP", "GENPHY"]);
assert.deepEqual(s.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1"]);
assert.deepEqual(s.rows.map((r: any) => [r.perMonth["2026-10"].CP, r.perMonth["2026-10"].GENPHY]), [[1, 1], [1, 0], [1, 0]]);
const c: any = await R.computeProductExposureSpecat(T, "A1", "STRIOS", "2026-09", "2026-10", "category", ["CORE", "N CORE", "Nil"]);
assert.deepEqual(c.rows.map((r: any) => [r.perMonth["2026-10"].CORE, r.perMonth["2026-10"]["N CORE"]]), [[1, 1], [1, 0], [1, 0]]);
assert.equal(c.rows[0].perMonth["2026-09"].CORE, 1);
const all: any = await R.computeProductExposureSpecat(T, "A1", "ALL", "2026-10", "2026-10", "speciality", ["CP"]);
assert.equal(all.rows[0].perMonth["2026-10"].CP, 2);                  // Dr1 and Dr3 (OTHER) under All Product
const d: any = await R.productExposureSpecatDrill(T, "B1", "STRIOS", "2026-10", "speciality", "CP");
assert.deepEqual(d.rows.map((r: any) => [r.doctorName, r.speciality, r.category, r.dates]), [["Dr1", "CP", "CORE", ["01/10/2026", "04/10/2026"]]]);
assert.equal(await R.computeProductExposureSpecat(T, "NOPE", "ALL", "2026-10", "2026-10", "speciality", ["CP"]), null);

// unlisted: real counts from tagged visits only
const u: any = await R51.computeProductExposureUnlisted(T, "A1", "STRIOS", "2026-09", "2026-10");
assert.deepEqual(u.rows.map((r: any) => [r.employeeCode, r.perMonth["2026-09"], r.perMonth["2026-10"]]), [["B1", 0, 1], ["B2", 0, 0], ["A1", 0, 0]]);   // U One twice -> 1; stockist ignored
assert.equal(u.dataAvailable, true);
const ua: any = await R51.computeProductExposureUnlisted(T, "A1", "ALL", "2026-10", "2026-10");
assert.equal(ua.rows[0].perMonth["2026-10"], 2);                       // U One + U Two
const un: any = await R51.computeProductExposureUnlisted(T, "A1", "NOPE", "2026-10", "2026-10");
assert.equal(un.dataAvailable, false); assert.ok(un.notes[0].startsWith("No unlisted visits with products yet"));
console.log("R55 compute tests passed");
