// Round 51 in-memory verification (no MongoDB). Run: npx tsx scripts/r51-tests/compute.ts
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
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Delhi", division: "SUBDIV", status: "ACTIVE", joinDate: new Date("2024-03-01"), ...extra });
store["employees"] = [
  emp(1, "RAJ RBM", "R1", "RBM", "RBM", undefined, "ERNAKULAM"), emp(2, "ABE ABM", "A1", "ABM", "ABM", "R1", "KOCHI"),
  emp(3, "BEE ONE", "B1", "BE", "MR", "A1", "K1"), emp(4, "BEE TWO", "B2", "BE", "MR", "A1", "K2"),
  emp(5, "GONE MR", "V1", "BE", "MR", "A1", "K3", { status: "INACTIVE", leftDate: new Date("2026-08-01") })
];
const doc = (n: number, emp: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name: "Dr" + n, mappedEmployeeCode: emp, status: "ACTIVE", doctorCode: "D" + n, specialty: "CP", category: "A", territory: "T1", territoryType: "HQ", ...o });
store["doctors"] = [
  doc(1, "B1", { campaign: "C1", mappedProducts: ["ZIVIMOX LP"] }), doc(2, "B1", { territory: "T2", territoryType: "EX", priorityProducts: ["PREDIRA"] }), doc(3, "B1", {}),
  doc(4, "B2", { campaign: "C2", mappedProducts: ["PREDIRA"] }), doc(5, "A1", { territory: "T9" }), doc(6, "V1", {}), doc(7, "V1", {})
];
const dcr = (n: number, e: string, d: string, doctor: number, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, status: "SUBMITTED", productsDetailed: [], ...extra });
store["dcrs"] = [
  dcr(1, "B1", "2026-10-01", 1, { productsDetailed: ["ZIVIMOX LP"] }),
  dcr(2, "B1", "2026-10-01", 1, { productsDetailed: ["PREDIRA"] }),        // same doctor+day -> one call, products merged
  dcr(3, "B1", "2026-10-05", 1),
  dcr(4, "B1", "2026-10-06", 2, { productsDetailed: ["PREDIRA"] }),
  dcr(5, "B2", "2026-10-02", 4, { productsDetailed: ["PREDIRA"] }),
  dcr(6, "B2", "2026-10-03", 4, { status: "REJECTED" }),
  dcr(7, "A1", "2026-10-09", 5), dcr(8, "A1", "2026-10-10", 6),            // ABM visits vacant MR's doctor
  dcr(9, "R1", "2026-10-11", 7),                                           // RBM visits vacant MR's other doctor
  dcr(10, "R1", "2026-10-12", 6),                                          // RBM visits the same doctor as the ABM
  dcr(11, "B1", "2026-09-04", 3)
];
store["chemist_calls"] = [
  { tenantSlug: T, employeeCode: "B1", chemistId: "c1", visitDateOnly: "2026-10-02" }, { tenantSlug: T, employeeCode: "B1", chemistId: "c1", visitDateOnly: "2026-10-09" },
  { tenantSlug: T, employeeCode: "B2", chemistId: "c2", visitDateOnly: "2026-10-04" }
];
store["field_visit_logs"] = [
  { tenantSlug: T, employeeCode: "B1", visitType: "UnlistedDoctor", entityName: "U One", visitDateOnly: "2026-10-03" },
  { tenantSlug: T, employeeCode: "B1", visitType: "UnlistedDoctor", entityName: "u one", visitDateOnly: "2026-10-12" },
  { tenantSlug: T, employeeCode: "B2", visitType: "Stockist", entityName: "S1", visitDateOnly: "2026-10-05" }
];
store["products"] = [{ _id: asId(900), tenantSlug: T, productName: "ZIVIMOX LP", status: "ACTIVE" }, { _id: asId(901), tenantSlug: T, productName: "PREDIRA", status: "ACTIVE" }];
const R = await import("../../src/utils/r51-reports.js");

// ── 2) At a Glance ──
const g: any = await R.computeAtGlance(T, "R1", "2026-10", "2026-10");
assert.deepEqual(g.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1", "R1"]);   // resigned V1 is not in the active org scope
const b1 = g.rows[0].perMonth["2026-10"];
assert.deepEqual([b1.fwd, b1.ttl, b1.met, b1.once, b1.twice, b1.seen, b1.missed, b1.rpt, b1.unl], [3, 3, 2, 1, 1, 3, 1, 1, 1]);   // d1: days 1,5 ; d2: day 6 -> 3 calls (same-day duplicate merged), FWD days {1,5,6}
assert.deepEqual([b1.coverage, b1.callAvg, b1.missedPct, b1.repeatedPct], [66.67, 1, 33.33, 50]);
const b2 = g.rows[1].perMonth["2026-10"];
assert.deepEqual([b2.fwd, b2.met, b2.coverage, b2.missed], [1, 1, 100, 0]);          // rejected ignored
const ab = g.rows[2].perMonth["2026-10"];
assert.deepEqual([ab.ttl, ab.met, ab.fwd, ab.seen, ab.coverage], [5, 4, 2, 2, 80]);   // team-rolled ttl 3+1+own 1; met by anyone in team (B1 2, B2 1, A1 d5); own fwd/seen = d5 + vacant MR doctor d6
assert.equal(g.rows[0].subDivision, "SUBDIV"); assert.equal(g.rows[0].lastDcrDate, "06/10/2026");
assert.equal(g.rows[1].lastDcrDate, "02/10/2026");

// ── 3) Vacant HQ manager visits ──
const v: any = await R.computeVacantManagerVisits(T, "R1", "2026-09", "2026-10");
assert.deepEqual(v.rows.map((r: any) => r.employeeCode), ["V1"]);
const vm = v.rows[0].perMonth["2026-10"];
assert.deepEqual([vm.ABM, vm.RBM, vm.ZBM, vm.BH], [1, 2, 0, 0]);                     // ABM saw d6; RBM saw d7 + d6
assert.equal(v.rows[0].perMonth["2026-09"].RBM, 0);

// ── 4) Chemist / unlisted / stockist ──
const ch: any = await R.computeChemistUnlisted(T, "A1", "2026-10", "2026-10");
assert.deepEqual(ch.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1"]);
assert.deepEqual(ch.rows[0].perMonth["2026-10"], { chemist: { met: 1, seen: 2 }, unlisted: { met: 1, seen: 2 }, stockist: { met: 0, seen: 0 } });
assert.deepEqual(ch.rows[2].perMonth["2026-10"], { chemist: { met: 2, seen: 3 }, unlisted: { met: 1, seen: 2 }, stockist: { met: 1, seen: 1 } });   // ABM = team rollup

// ── 5) Territory wise ──
const tw: any = await R.computeTerritoryWise(T, "A1", "2026-10");
assert.deepEqual(tw.rows.map((r: any) => r.employeeCode), ["B1", "B2"]);              // base-level only
const t1 = tw.rows[0].territories;
assert.deepEqual(t1.map((t: any) => [t.territory, t.type, t.available, t.visited, t.days, t.missed]), [["T1", "HQ", 2, 1, [1, 5], 1], ["T2", "EX", 1, 1, [6], 0]]);
const mc: any = await R.computeManagerCoverage(T, "R1", "2026-10", "2026-09");
assert.deepEqual(mc.rows.map((r: any) => [r.employeeCode, r.total]), [["A1", 1], ["R1", 0]]);

// ── 6) Product exposure ──
const pe: any = await R.computeProductExposure(T, "A1", "PREDIRA", "2026-10", "2026-10");
assert.deepEqual(pe.rows.map((r: any) => r.perMonth["2026-10"]), [2, 1, 0]);          // B1 d1 (merged) + d2 ; B2 d4 ; A1
assert.equal(pe.grand["2026-10"], 3);
const pa: any = await R.computeProductExposure(T, "A1", "ALL", "2026-10", "2026-10");
assert.equal(pa.grand["2026-10"], 3);
const dr: any = await R.productExposureDrill(T, ["B1"], "PREDIRA", "2026-10");
assert.deepEqual(dr.rows.map((r: any) => [r.doctorName, r.dates]), [["Dr1", ["01/10/2026"]], ["Dr2", ["06/10/2026"]]]);
assert.deepEqual(await R.productOptions(T), ["ZIVIMOX LP", "PREDIRA"]);

// ── 7) ListedDr product visit ──
const lp: any = await R.computeListedDrProductVisit(T, "A1", "2026-10", "2026-10");
assert.deepEqual(lp.rows.map((r: any) => [r.employeeCode, r.taggedDrs, r.perMonth["2026-10"]]), [["B1", 2, 2], ["B2", 1, 1], ["A1", 3, 3]]);

// ── 8) Unlisted exposure (honest gap) ──
const un: any = await R.computeProductExposureUnlisted(T, "A1", "PREDIRA", "2026-09", "2026-10");
assert.equal(un.dataAvailable, false); assert.ok(un.rows.every((r: any) => Object.values(r.perMonth).every((x) => x === 0)));
assert.equal(await R.computeAtGlance(T, "NOPE", "2026-10", "2026-10"), null);
console.log("R51 compute tests passed");
