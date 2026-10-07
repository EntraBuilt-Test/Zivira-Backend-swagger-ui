// Round 50 in-memory verification (no MongoDB). Run: npx tsx scripts/r50-tests/compute.ts
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
const T = "demo";
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string) =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Delhi", division: "Z", status: "ACTIVE", joinDate: new Date("2024-03-01") });
store["employees"] = [
  emp(1, "ZED ZBM", "Z0", "ZBM", "ZBM", undefined, "DELHI"), emp(2, "ROY RBM", "R1", "RBM", "RBM", "Z0", "DELHI"), emp(3, "ABE ABM", "A1", "ABM", "ABM", "R1", "DELHI (NORTH)"),
  emp(4, "BEE ONE", "B1", "BE", "MR", "A1", "NORTH 1"), emp(5, "BEE TWO", "B2", "BE", "MR", "A1", "NORTH 2")
];
const doc = (n: number, emp: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name: "Dr" + n, mappedEmployeeCode: emp, status: "ACTIVE", doctorCode: "D" + n, ...o });
store["doctors"] = [
  doc(1, "B1", { specialty: "CP", doctorCategory: "CORE", category: "A", campaign: "C1" }),
  doc(2, "B1", { specialty: "GP", doctorCategory: "CORE", category: "B" }),
  doc(3, "B1", { specialty: "CP", doctorCategory: "NIL", category: "C", campaign: "C1" }),
  doc(4, "B2", { specialty: "CP", doctorCategory: "S CORE", category: "A", campaign: "C2" }),
  doc(5, "A1", { specialty: "GP", doctorCategory: "N CORE", category: "B" }),
  doc(6, "Z0", { specialty: "CP", doctorCategory: "CORE", category: "A", campaign: "C1" }),
  doc(7, "B2", { specialty: "CP", doctorCategory: "CORE", category: "A", status: "INACTIVE" })
];
const dcr = (n: number, e: string, d: string, doctor: number, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, status: "SUBMITTED", ...extra });
store["dcrs"] = [
  dcr(1, "B1", "2026-10-01", 1), dcr(2, "B1", "2026-10-02", 1), dcr(3, "B1", "2026-10-03", 2), dcr(4, "B1", "2026-10-04", 3),
  dcr(5, "B1", "2026-09-05", 1),
  dcr(6, "B2", "2026-10-06", 4, { status: "REJECTED" }),   // ignored -> B2 met 0
  dcr(7, "A1", "2026-10-07", 5),
  dcr(8, "A1", "2026-10-08", 1),                            // ABM joint call on a campaign doctor (counts as a campaign call, not as A1's coverage)
  dcr(9, "Z0", "2026-10-09", 6)
];
store["doctorCategories"] = [];
const R = await import("../../src/utils/r50-reports.js");

// ── Campaign ──
const c: any = await R.computeModewise(T, "Z0", "campaign", "2026-09", "2026-10");
assert.deepEqual(c.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1", "R1", "Z0"]);   // hierarchy order, root last
assert.deepEqual(c.rows.map((r: any) => r.cells["2026-10"]), [3, 0, 4, 4, 5]);               // B1 3 calls; ABM = 3+0+own joint campaign call 1; RBM=ABM; ZBM=+1
assert.deepEqual(c.rows.map((r: any) => r.cells["2026-09"]), [1, 0, 1, 1, 1]);
assert.deepEqual(c.rows.map((r: any) => r.isManager), [false, false, true, true, true]);
assert.deepEqual(c.rows.map((r: any) => r.sno), [1, 2, 3, 4, 5]);

// ── Category ──
const k: any = await R.computeModewise(T, "A1", "category", "2026-09", "2026-10");
assert.deepEqual(k.groups, ["COVERAGE", "CORE", "N CORE", "Nil", "S CORE"]);
assert.deepEqual(k.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1"]);
const b1 = k.rows[0].perMonth["2026-10"];
assert.deepEqual([b1.COVERAGE.ttl, b1.COVERAGE.met, b1.COVERAGE.coverage], [3, 3, 100]);
assert.deepEqual([b1.CORE.ttl, b1.CORE.met, b1["N CORE"].ttl, b1["N CORE"].coverage, b1.Nil.met], [2, 2, 0, null, 1]);
const b2 = k.rows[1].perMonth["2026-10"];
assert.deepEqual([b2.COVERAGE.ttl, b2.COVERAGE.met, b2.COVERAGE.coverage, b2["S CORE"].coverage], [1, 0, 0, 0]);   // rejected DCR ignored, inactive doctor excluded
assert.equal(k.rows[0].perMonth["2026-09"].COVERAGE.coverage, 33.33);
const mg = k.rows[2].perMonth["2026-10"];
assert.deepEqual([mg.COVERAGE.ttl, mg.COVERAGE.met, mg.COVERAGE.coverage], [5, 4, 80]);   // team sums, recomputed
assert.deepEqual([mg["N CORE"].ttl, mg["N CORE"].met, mg["N CORE"].coverage], [1, 1, 100]);
assert.equal(k.rows[2].isManager, true);

// ── Speciality / Class (inferred layouts) ──
const s: any = await R.computeModewise(T, "A1", "speciality", "2026-10", "2026-10");
assert.deepEqual(s.groups, ["COVERAGE", "CP", "GP"]);                       // by doctor count
assert.deepEqual([s.rows[2].perMonth["2026-10"].CP.ttl, s.rows[2].perMonth["2026-10"].GP.ttl], [3, 2]);
const cl: any = await R.computeModewise(T, "A1", "class", "2026-10", "2026-10");
assert.deepEqual(cl.groups, ["COVERAGE", "Nil", "A", "B", "C"]);
assert.deepEqual([cl.rows[2].perMonth["2026-10"].A.ttl, cl.rows[2].perMonth["2026-10"].B.ttl, cl.rows[2].perMonth["2026-10"].C.ttl], [2, 2, 1]);
assert.ok(s.notes.some((n: string) => /inferred/.test(n)));

// individual BE, unknown code
const one: any = await R.computeModewise(T, "B1", "campaign", "2026-10", "2026-10");
assert.equal(one.rows.length, 1); assert.equal(one.rows[0].isManager, false);
assert.equal(await R.computeModewise(T, "NOPE", "category", "2026-10", "2026-10"), null);
console.log("R50 compute tests passed");
