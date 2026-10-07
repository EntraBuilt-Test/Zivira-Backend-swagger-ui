// Round 48 Part C in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r44-tests/compute.ts
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
let queries = 0;
const origFind = (mongoose.Model as any).find, origFindOne = (mongoose.Model as any).findOne;
(mongoose.Model as any).find = function (...a: any[]) { queries++; return origFind.apply(this, a); };
(mongoose.Model as any).findOne = function (...a: any[]) { queries++; return origFindOne.apply(this, a); };
import assert from "node:assert";
const T = "demo";
// 4-level org: 1 BH -> 5 ZBM -> 4 RBM each -> 3 ABM each -> 4 BE each (1 + 5 + 20 + 60 + 240 = 326 employees)
const emps: any[] = []; let n = 1;
const add = (role: string, mgr?: string) => { const code = "E" + n; emps.push({ _id: asId(n++), tenantSlug: T, name: code, employeeCode: code, designation: role, role, reportingManager: mgr, territory: "T", status: "ACTIVE" }); return code; };
const bh = add("BH");
for (let z = 0; z < 5; z++) { const zc = add("ZBM", bh); for (let r = 0; r < 4; r++) { const rc = add("RBM", zc); for (let a = 0; a < 3; a++) { const ac = add("ABM", rc); for (let b = 0; b < 4; b++) add("MR", ac); } } }
store["employees"] = emps;
const { getUpwardChain } = await import("../../src/utils/org-hierarchy.js");
const bes = emps.filter((e) => e.role === "MR");
const t0 = performance.now();
for (const e of bes) { const c = await getUpwardChain(T, e.employeeCode); assert.deepEqual(c.map((x: any) => x.role), ["ABM", "RBM", "ZBM", "BH"]); }
const ms = performance.now() - t0;
console.log(`getUpwardChain x${bes.length} reps: ${queries} DB queries (was ${bes.length * 5} findOne: 1 for the rep + 1 per level), ${ms.toFixed(0)} ms in-memory`);
assert.equal(queries, 1);
console.log("R48 perf test passed");
