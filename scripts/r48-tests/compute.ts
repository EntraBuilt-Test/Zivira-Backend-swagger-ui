// Round 48 in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r44-tests/compute.ts
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
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string, status = "ACTIVE") =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Kerala", division: "ZIVIRA LAB", status, joinDate: new Date("2024-03-01") });
store["employees"] = [
  emp(1, "RAJ RBM", "E0", "RBM", "RBM", undefined, "KOCHI"),
  emp(2, "THARUN C", "E1", "ABM", "ABM", "E0", "BANGALORE"),
  emp(3, "AMITH K", "E2", "BE", "MR", "E1", "KANNUR"),
  emp(4, "DARSHAN B", "E3", "BE", "MR", "E1", "BANGALORE")
];
const doc = (n: number, name: string, emp: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name, mappedEmployeeCode: emp, status: "ACTIVE", territory: "T" + (n % 2), qualification: "MBBS", category: "B", doctorCode: "D" + n, uniqueSlNo: String(n), updatedAt: new Date("2026-08-05"), ...o });
store["doctors"] = [
  doc(1, "Dr A", "E2", { specialty: "CP", doctorCategory: "CORE", category: "A", campaign: "Camp1" }),
  doc(2, "Dr B", "E2", { specialty: "GENPHY", doctorCategory: "CORE", category: "A" }),
  doc(3, "Dr C", "E2", { specialty: "CP", doctorCategory: "NIL", category: "C" }),
  doc(4, "Dr D", "E3", { specialty: "CP", doctorCategory: "S CORE", category: "B" }),
  doc(5, "Dr E", "E2", { specialty: "CP", doctorCategory: "CORE", status: "INACTIVE" })
];
const dcr = (n: number, e: string, d: string, doctor: number, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, status: "SUBMITTED", ...extra });
store["dcrs"] = [
  dcr(1, "E2", "2026-10-01", 1, { notes: "likes brand" }),
  dcr(2, "E2", "2026-10-01", 1),                            // same day twice -> 1 day
  dcr(3, "E2", "2026-10-05", 1),
  dcr(4, "E2", "2026-10-02", 2),
  dcr(5, "E1", "2026-10-10", 1, { notes: "joint call" }),    // ABM visit of Dr A
  dcr(6, "E0", "2026-10-19", 1),                             // RBM visit of Dr A (empty remark)
  dcr(7, "E2", "2026-09-15", 2, { status: "REJECTED" }),     // ignored
  dcr(8, "E2", "2026-09-16", 2, { productFeedback: "good" }),
  dcr(9, "E3", "2026-10-03", 4)
];
store["unlisted_doctors"] = [{ tenantSlug: T, mr: "AMITH K", name: "U1" }, { tenantSlug: T, mr: "amith k", name: "U2" }];
store["doctorCategories"] = [];

const R = await import("../../src/utils/r48-reports.js");
const P = (mode: any, extra: any = {}) => ({ mode, employeeCode: "E1", scope: "Team" as const, fromMonth: "2026-09", toMonth: "2026-10", ...extra });

// base levels
const bl = (await R.baseLevelOptions(T, "E1"))!;
assert.deepEqual(bl.map((b) => b.name).sort(), ["AMITH K", "DARSHAN B"]);

// (a) baselevel
const a: any = await R.computeDoctorwise(T, P("baselevel", { baseLevel: "E2" }));
assert.deepEqual(a.rows.map((r: any) => r.name), ["Dr A", "Dr B", "Dr C"]);      // active only, E2's doctors
assert.deepEqual(a.rows[0].perMonth["2026-10"], { count: 2, days: [1, 5] });       // BE's own visits only, day 1 once
assert.deepEqual(a.rows[1].perMonth["2026-09"], { count: 1, days: [16] });         // rejected 15th ignored
assert.equal(a.rows[2].perMonth["2026-10"].count, 0);
assert.equal(a.rows[0].category, "CORE"); assert.equal(a.rows[0].cls, "A"); assert.equal(a.rows[0].uniNo, "1");
await assert.rejects(() => R.computeDoctorwise(T, P("baselevel")), /Base Level/);
await assert.rejects(() => R.computeDoctorwise(T, P("baselevel", { baseLevel: "E0" })), /not under/);

// (b) baselevels/managers
const b: any = await R.computeDoctorwise(T, P("baselevel-managers", { baseLevel: "E2" }));
const bm = b.rows[0].perMonth["2026-10"];
assert.deepEqual([bm.BE.days, bm.ABM.days, bm.RBM.days, bm.ZBM.count, bm.BH.count], [[1, 5], [10], [19], 0, 0]);

// (c) deactivate
const c: any = await R.computeDoctorwise(T, P("deactivate", { baseLevel: "E2" }));
assert.deepEqual(c.rows.map((r: any) => [r.name, r.deactivateDate]), [["Dr E", "05/08/2026"]]);
const c2: any = await R.computeDoctorwise(T, P("deactivate"));
assert.equal(c2.rows.length, 1);

// (d) daywise remarks
const d: any = await R.computeDoctorwise(T, P("daywise-remarks", { fromMonth: "2026-10" }));
assert.equal(d.days.length, 31);
assert.deepEqual(d.days[0].cells.BE, ["Dr A : likes brand"]);
assert.deepEqual(d.days[9].cells.ABM, ["Dr A : joint call"]);
assert.deepEqual(d.days[18].cells.RBM, []);                                         // empty remark is not listed

// (e) listed drwise remarks
const e: any = await R.computeDoctorwise(T, P("listed-remarks", { fromMonth: "2026-10", employeeCode: "E0" }));
const ea = e.rows.find((r: any) => r.name === "Dr A").cells;
assert.deepEqual(ea.BE, { visited: true, remark: "likes brand" });
assert.deepEqual(ea.RBM, { visited: true, remark: "" });                            // renders "[]"
assert.deepEqual(ea.ZBM, { visited: false, remark: "" });

// (f) core mapwise
const f: any = await R.computeDoctorwise(T, P("core-mapwise"));
assert.deepEqual(f.rows.map((r: any) => r.name), ["Dr B", "Dr A"]);                  // T0 before T1; only CORE
assert.ok(f.notes.some((n: string) => /inferred/.test(n)));

// (g) II level
const g: any = await R.computeDoctorwise(T, P("ii-level", { employeeCode: "E0" }));
assert.equal(g.rows.length, 4); assert.equal(g.rows[0].sfName, "AMITH K - BE - KANNUR");
assert.equal(g.rows.find((r: any) => r.name === "Dr D").perMonth["2026-10"].count, 1);

// (h) core periodically
const h: any = await R.computeDoctorwise(T, P("core-periodically", { toMonth: "2026-10" }));
const h2 = h.rows.find((r: any) => r.employeeCode === "E2").perMonth;
assert.deepEqual(h2["2026-10"], { tot: 2, visited: 2, missed: 0, per: 100 });
assert.deepEqual(h2["2026-09"], { tot: 2, visited: 1, missed: 1, per: 50 });

// (i) campaignwise
const i: any = await R.computeDoctorwise(T, P("campaignwise", { baseLevel: "E2" }));
assert.deepEqual(i.rows.map((r: any) => r.name), ["Dr A"]);

// individual scope
const ind: any = await R.computeDoctorwise(T, P("core-periodically", { scope: "Individual" }));
assert.equal(ind.rows.length, 1);

// call feedbackwise
const cf: any = await R.computeCallFeedbackwise(T, "E1", "2026-09", "2026-10");
assert.deepEqual(cf.rows.map((r: any) => r.name), ["THARUN C", "AMITH K", "DARSHAN B"]);
assert.deepEqual(cf.rows[1].perMonth["2026-10"], { tdrs: 3, met: 2, feedback: 1 });   // Dr A, Dr B seen; only Dr A has a remark
assert.deepEqual(cf.rows[1].perMonth["2026-09"], { tdrs: 3, met: 1, feedback: 1 });   // Dr B (feedback), rejected call ignored

// fixation: category
const fxr: any = await R.computeFixation(T, "E1", "2026-10", "2026-10", "Category");
assert.deepEqual(fxr.values, [{ value: "Nil", norm: 2 }, { value: "CORE", norm: 2 }, { value: "N CORE", norm: 2 }, { value: "S CORE", norm: 1 }]);
assert.deepEqual(fxr.rows.map((r: any) => [r.name, r.isManager]), [["AMITH K", false], ["DARSHAN B", false], ["THARUN C", true]]);
const core = fxr.rows[0].perMonth["2026-10"]["CORE"];
assert.deepEqual(core, { tdrs: 2, v0: 0, v1: 1, v2: 1, vm2: 0, miss: 1 });            // Dr A 2 days, Dr B 1 day (<2 norm -> Miss)
assert.deepEqual(fxr.rows[0].perMonth["2026-10"]["Nil"], { tdrs: 1, v0: 1, v1: 0, v2: 0, vm2: 0, miss: 1 });
assert.deepEqual(fxr.rows[2].perMonth["2026-10"]["S CORE"], { tdrs: 1, v0: 0, v1: 1, v2: 0, vm2: 0, miss: 0 });  // team totals
assert.equal(fxr.rows[0].nlDrs, 2); assert.equal(fxr.rows[2].nlDrs, 2);
// speciality / class / campaign
const sp: any = await R.computeFixation(T, "E1", "2026-10", "2026-10", "Speciality");
assert.deepEqual(sp.values.map((v: any) => v.value), ["CP", "GENPHY"]);
const cl: any = await R.computeFixation(T, "E1", "2026-10", "2026-10", "Class");
assert.equal(cl.rows[0].perMonth["2026-10"]["A"].tdrs, 2);
const ca: any = await R.computeFixation(T, "E1", "2026-10", "2026-10", "Campaign");
assert.deepEqual(ca.values.map((v: any) => v.value), ["Camp1"]);
// a BE selected -> single row, not manager
const one: any = await R.computeFixation(T, "E2", "2026-10", "2026-10", "Category");
assert.equal(one.rows.length, 1); assert.equal(one.rows[0].isManager, false);
assert.equal(await R.computeFixation(T, "NOPE", "2026-10", "2026-10", "Category"), null);

console.log("R48 compute tests passed");
