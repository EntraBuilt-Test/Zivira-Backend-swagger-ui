// Round 54 in-memory verification (no MongoDB). Run: npx tsx scripts/r54-tests/compute.ts
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
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Kerala", division: "ZIV", status: "ACTIVE", joinDate: new Date("2024-03-05"), ...extra });
store["employees"] = [
  emp(1, "Raj Rbm", "R1", "RBM", "RBM", undefined, "ERNAKULAM"), emp(2, "Abe Abm", "A1", "ABM", "ABM", "R1", "KOCHI"),
  emp(3, "Bee One", "B1", "BE", "MR", "A1", "K1"), emp(4, "Bee Two", "B2", "BE", "MR", "A1", "K2"),
  emp(5, "Gone Mr", "V1", "BE", "MR", "A1", "K3", { status: "INACTIVE", leftDate: new Date("2026-08-01") })
];
store["holidays"] = [{ tenantSlug: T, stateName: "Kerala", status: "ACTIVE", otherHolidayDate: new Date("2026-10-02"), otherHolidayDescription: "Gandhi Jayanti" }];
const d = (n: number, emp: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name: "Dr" + n, mappedEmployeeCode: emp, status: "ACTIVE", doctorCode: "D" + n, specialty: "CP", category: "A", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), ...o });
store["doctors"] = [
  d(1, "B1", { createdAt: new Date("2026-09-10") }), d(2, "B1", { createdAt: new Date("2026-10-03"), updatedAt: new Date("2026-10-03") }),
  d(3, "B1", { createdAt: new Date("2026-08-01"), status: "INACTIVE", updatedAt: new Date("2026-10-12") }),
  d(4, "B2", { createdAt: new Date("2026-10-20"), status: "INACTIVE", updatedAt: new Date("2026-10-21") }),
  d(5, "V1", { createdAt: new Date("2026-10-05") })
];
const dcr = (n: number, e: string, day: string, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(101), visitDate: new Date(day), month: day.slice(0, 7), visitDateOnly: day, status: "SUBMITTED", workType: "Field Work", ...extra });
store["dcrs"] = [dcr(1, "B1", "2026-10-05"), dcr(2, "B1", "2026-10-06"), dcr(3, "A1", "2026-10-06"), dcr(4, "R1", "2026-10-07")];
const plan = (e: string, locs: any[], status = "APPROVED") => ({ tenantSlug: T, employeeCode: e, month: "2026-10", status, locations: locs });
store["tourplans"] = [
  plan("B1", [{ date: "2026-10-05", area: "A", town: "KOCHI", purpose: "Field Work" }]),
  plan("A1", [{ date: "2026-10-02", area: "", town: "Gandhi Jayanti", purpose: "" }, { date: "2026-10-06", area: "", town: "KOCHI", purpose: "Field Work" }]),
  plan("R1", [{ date: "2026-10-08", area: "", town: "ERNAKULAM", purpose: "Field Work" }]),
  plan("B2", [{ date: "2026-10-09", area: "", town: "X", purpose: "" }], "SUBMITTED")   // not approved -> ignored
];
const R = await import("../../src/utils/r54-reports.js");

// ── 1) Managers ──
const m: any = await R.computeTpDeviationManagers(T, "R1", "2026-10");
assert.deepEqual(m.rows.map((r: any) => [r.sno, r.fieldForce, r.date, r.day, r.asPerTp, r.asPerDcr]), [
  [1, "Abe Abm - ABM -KOCHI", "02/10/2026", "Friday", "Gandhi Jayanti", "Holiday"],           // holiday-title plan listed against Holiday
  [2, "Raj Rbm - RBM -ERNAKULAM", "07/10/2026", "Wednesday", "", "Field Work"],              // DCR without a plan
  [3, "Raj Rbm - RBM -ERNAKULAM", "08/10/2026", "Thursday", "ERNAKULAM", "No DCR"]]);         // plan without a DCR; A1's honoured 06/10 is absent
assert.equal(m.employee.name, "Raj Rbm");
assert.deepEqual((await R.computeTpDeviationManagers(T, "A1", "2026-10") as any).rows.map((r: any) => r.sno), [1]);   // only A1 under A1
assert.equal((await R.computeTpDeviationManagers(T, "admin", "2026-10") as any).rows.length, 3);
assert.equal(await R.computeTpDeviationManagers(T, "NOPE", "2026-10"), null);

// ── 2) At a glance ──
const g: any = await R.computeTpDeviationAtGlance(T, "R1", "2026-10", "2026-10");
assert.deepEqual(g.rows.map((r: any) => [r.employeeCode, r.name, r.perMonth["2026-10"]]), [["B1", "Bee One", 1], ["B2", "Bee Two", 0], ["V1", "Vacant", 0], ["A1", "Abe Abm", 1], ["R1", "Raj Rbm", 2]]);
const gd: any = await R.tpDeviationDrill(T, "R1", "2026-10");
assert.deepEqual(gd.rows.map((r: any) => r.date), ["07/10/2026", "08/10/2026"]);
const gb: any = await R.tpDeviationDrill(T, "B1", "2026-10");
assert.deepEqual(gb.rows.map((r: any) => [r.date, r.asPerTp, r.asPerDcr]), [["06/10/2026", "", "Field Work"]]);

// ── 3) Doctors addition / deactivation ──
const a: any = await R.computeDoctorsAddDeact(T, "admin", "2026-09", "2026-10");
assert.deepEqual(a.rows.map((r: any) => r.employeeCode), ["B1", "B2"]);                      // base-level, active, name order (V1 inactive excluded)
assert.deepEqual([a.rows[0].level1, a.rows[0].level2, a.rows[0].level3, a.rows[0].division], ["KOCHI", "ERNAKULAM", "", "ZIV"]);
assert.deepEqual(a.rows[0].perMonth, { "2026-09": { added: 1, deactivated: 0 }, "2026-10": { added: 1, deactivated: 1 } });
assert.deepEqual(a.rows[1].perMonth["2026-10"], { added: 1, deactivated: 1 });
assert.deepEqual(a.totals["2026-10"], { added: 2, deactivated: 2 }); assert.deepEqual(a.totals["2026-09"], { added: 1, deactivated: 0 });
assert.deepEqual((await R.computeDoctorsAddDeact(T, "A1", "2026-10", "2026-10") as any).rows.map((r: any) => r.employeeCode), ["B1", "B2"]);
const dd: any = await R.doctorsAddDeactDrill(T, "B1", "2026-10", "deactivated");
assert.deepEqual(dd.rows.map((r: any) => [r.doctorName, r.specialty, r.cls, r.date]), [["Dr3", "CP", "A", "12/10/2026"]]);
const da: any = await R.doctorsAddDeactDrill(T, "B1", "2026-10", "added");
assert.deepEqual(da.rows.map((r: any) => [r.doctorName, r.date, r.category]), [["Dr2", "03/10/2026", "Nil"]]);
assert.equal(await R.computeDoctorsAddDeact(T, "NOPE", "2026-10", "2026-10"), null);
console.log("R54 compute tests passed");
