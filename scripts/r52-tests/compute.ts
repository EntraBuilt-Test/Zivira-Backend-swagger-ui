// Round 52 in-memory verification (no MongoDB). Run: npx tsx scripts/r52-tests/compute.ts
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
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string, extra: any = {}) =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Kerala", division: "Z", status: "ACTIVE", ...extra });
store["employees"] = [
  emp(1, "Raj Rbm", "R1", "RBM", "RBM", undefined, "ERNAKULAM"), emp(2, "Abe Abm", "A1", "ABM", "ABM", "R1", "KOCHI"),
  emp(3, "Bee One", "B1", "BE", "MR", "A1", "K1"), emp(4, "Bee Two", "B2", "BE", "MR", "A1", "K2"),
  emp(5, "Gone Mr", "V1", "BE", "MR", "A1", "K3", { status: "INACTIVE", leftDate: new Date("2026-08-01") })
];
store["territoryHqMaster"] = [{ tenantSlug: T, headquartersName: "k1", region: "KOCHI REGION" }, { tenantSlug: T, headquartersName: "KOCHI", region: "SOUTH" }];
const doc = (n: number, emp: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name: "Dr" + n, mappedEmployeeCode: emp, status: "ACTIVE", doctorCode: "D" + n, specialty: "CP", ...o });
store["doctors"] = [
  doc(1, "B1", { priorityProducts: ["PREDIRA", "ZIVIMOX LP"] }), doc(2, "B1", { priorityProducts: ["ZIVIMOX LP", "predira"] }), doc(3, "B1", {}),
  doc(4, "B2", { priorityProducts: ["PREDIRA"] }), doc(5, "A1", { priorityProducts: ["", "", "PREDIRA"] })
];
const dcr = (n: number, e: string, d: string, doctor: number, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, status: "SUBMITTED", productsDetailed: [], samplesGiven: [], ...extra });
store["dcrs"] = [
  dcr(1, "B1", "2026-10-01", 1, { samplesGiven: [{ productName: "PREDIRA", qty: 5 }, { productName: "ZIVIMOX LP", qty: 3 }] }),
  dcr(2, "B1", "2026-10-05", 2, { samplesGiven: [{ productName: "PREDIRA", qty: 2 }] }),
  dcr(3, "B1", "2026-09-04", 1, { samplesGiven: [{ productName: "PREDIRA", qty: 4 }] }),
  dcr(4, "B2", "2026-10-02", 4, { samplesGiven: [{ productName: "PREDIRA", qty: 9 }], status: "REJECTED" }),   // ignored
  dcr(5, "A1", "2026-10-09", 5, { samplesGiven: [{ productName: "PREDIRA", qty: 1 }] })
];
store["dispatches"] = [{ tenantSlug: T, employeeCode: "B2", type: "SAMPLE", dispatchDate: new Date("2026-10-03"), items: [{ name: "PREDIRA", code: "P", dispatchQty: 50, despatchDate: new Date("2026-10-03"), docketNo: "LR1" }] },
  { tenantSlug: T, employeeCode: "B2", type: "INPUT", dispatchDate: new Date("2026-10-03"), items: [{ name: "PEN", code: "I", dispatchQty: 99, despatchDate: new Date("2026-10-03") }] }];
const R = await import("../../src/utils/r52-reports.js");

// ── Priority wise ──
const p: any = await R.computePriorityWise(T, "R1", "PREDIRA", "2026-09", "2026-10");
assert.deepEqual(p.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1", "R1"]);          // active hierarchy order, root last
const b1 = p.rows[0].perMonth["2026-10"];
assert.deepEqual([b1["0"], b1["1"], b1["2"]], [{ drs: 1, visited: 2 - 1 }, { drs: 1, visited: 1 }, { drs: 0, visited: 0 }]);   // d1 slot0 (visited), d2 slot1 case-insensitive (visited)
assert.deepEqual(p.rows[0].perMonth["2026-09"]["0"], { drs: 1, visited: 1 });
assert.deepEqual(p.rows[1].perMonth["2026-10"]["0"], { drs: 1, visited: 0 });                   // B2's only DCR was rejected
const ab = p.rows[2].perMonth["2026-10"];
assert.deepEqual([ab["0"].drs, ab["1"].drs, ab["2"].drs, ab["2"].visited], [2, 1, 1, 1]);        // team rollup incl. own slot-2 doctor
const all: any = await R.computePriorityWise(T, "A1", "ALL", "2026-10", "2026-10");
assert.equal(all.rows[2].perMonth["2026-10"]["1"].drs, 2);                                       // d1 + d2 have a slot-1 product
assert.ok(p.notes[0].includes("INFERRED"));
assert.equal(await R.computePriorityWise(T, "NOPE", "ALL", "2026-10", "2026-10"), null);

// ── Sample details ──
const s: any = await R.computeSampleDetails(T, "R1", "2026-09", "2026-10");
assert.deepEqual(s.rows.map((r: any) => r.employeeCode), ["B1", "B2", "V1", "A1", "R1"]);       // includes the vacant HQ
assert.deepEqual(s.rows.map((r: any) => r.name), ["Bee One", "Bee Two", "Vacant", "Abe Abm", "Raj Rbm"]);
assert.deepEqual([s.rows[0].perMonth["2026-09"], s.rows[0].perMonth["2026-10"], s.rows[0].total], [4, 10, 14]);   // 5+3+2 in Oct
assert.equal(s.rows[1].total, 0);                                                                // rejected DCR ignored
assert.equal(s.rows[3].perMonth["2026-10"], 1);                                                  // manager's own only
assert.deepEqual([s.rows[0].region, s.rows[3].region, s.rows[1].region, s.rows[0].state], ["KOCHI REGION", "SOUTH", "", "Kerala"]);
const sd: any = await R.computeSampleDetails(T, "R1", "2026-10", "2026-10", "despatch");
assert.equal(sd.rows[1].perMonth["2026-10"], 50);                                                // SAMPLE despatch only (INPUT ignored)
const sb: any = await R.computeSampleDetails(T, "R1", "2026-10", "2026-10", "both");
assert.deepEqual([sb.rows[0].total, sb.rows[1].total], [10, 50]);
const dr: any = await R.sampleDetailsDrill(T, "B1", "2026-10");
assert.deepEqual(dr.rows.map((r: any) => [r.date, r.doctor, r.product, r.qty, r.source]), [["01/10/2026", "Dr1", "PREDIRA", 5, "DCR"], ["01/10/2026", "Dr1", "ZIVIMOX LP", 3, "DCR"], ["05/10/2026", "Dr2", "PREDIRA", 2, "DCR"]]);
const dd: any = await R.sampleDetailsDrill(T, "B2", "2026-10", "despatch");
assert.deepEqual(dd.rows.map((r: any) => [r.product, r.qty, r.source, r.ref]), [["PREDIRA", 50, "Despatch", "LR1"]]);
assert.equal(await R.computeSampleDetails(T, "NOPE", "2026-10", "2026-10"), null);
console.log("R52 compute tests passed");
