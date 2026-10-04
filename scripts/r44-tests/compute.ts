// Round 44 in-memory verification (no MongoDB). Run: npm i --no-save sift && npx tsx scripts/r44-tests/compute.ts
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

import assert from "node:assert";
const T = "demo";
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string, status = "ACTIVE") =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Kerala", division: "ZIVIRA LAB", status, joinDate: new Date("2024-03-01") });
store["employees"] = [
  emp(1, "THARUN C", "E1", "ABM", "ABM", undefined, "BANGALORE"),
  emp(2, "AMITH K", "E2", "BE", "MR", "E1", "KANNUR"),
  emp(3, "DARSHAN B", "E3", "BE", "MR", "E1", "BANGALORE"),
  emp(5, "OLD ABM", "E5", "ABM", "ABM", "E1", "MYSORE", "INACTIVE"),
  emp(6, "ORPHAN BE", "E6", "BE", "MR", "E5", "MYSORE")
];
const doc = (n: number, name: string, emp: string, o: any) => ({ _id: asId(100 + n), tenantSlug: T, name, mappedEmployeeCode: emp, status: "ACTIVE", territory: "T" + n % 2, qualification: "MBBS", category: "B", doctorCode: "D" + n, ...o });
store["doctors"] = [
  doc(1, "Dr A", "E2", { specialty: "CP", doctorCategory: "NIL", category: "A", doctorTypes: ["Core drs"], campaign: "Camp1" }),
  doc(2, "Dr B", "E2", { specialty: "cp", doctorCategory: "CORE", category: "A", doctorTypes: ["Academica", "Core drs"] }),
  doc(3, "Dr C", "E2", { specialty: "ENT", doctorCategory: "S CORE", category: "C" }),
  doc(4, "Dr D", "E3", { specialty: "CP", doctorCategory: "N CORE", category: "B" }),
  doc(5, "Dr E", "E1", { specialty: "ENT", doctorCategory: "CORE", category: "A" }),
  doc(6, "Dr F", "E5", { specialty: "CP", doctorCategory: "NIL" })
];
store["products"] = [];
const dcr = (n: number, e: string, d: string, doctor: number, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, callTime: "10:00", createdAt: new Date(d + "T10:00:00Z"), productsDetailed: [], ...extra });
store["dcrs"] = [
  dcr(1, "E2", "2026-10-01", 1, { productsDetailed: ["DEXNOVA", "ZIVI"], callTime: "11:00" }),
  dcr(2, "E2", "2026-10-01", 2, { callTime: "09:30" }),
  dcr(3, "E2", "2026-10-02", 2),
  dcr(4, "E2", "2026-10-02", 2, { callTime: "16:00" }),   // 2nd call on the same doctor, same day
  dcr(5, "E2", "2026-09-15", 3),
  dcr(6, "E3", "2026-10-03", 4),
  dcr(7, "E2", "2026-10-04", 1)                            // a Sunday call
];
store["holidays"] = [{ tenantSlug: T, stateName: "Kerala", status: "ACTIVE", otherHolidayDate: new Date("2026-10-02"), otherHolidayDescription: "Gandhi Jayanti" }];
store["campaignmasters"] = [];
store["campaignMaster"] = [{ tenantSlug: T, campaignName: "Camp1", status: "Active" }];
store["doctorTypeMaster"] = DEFAULT_ROWS();
function DEFAULT_ROWS() { return ["Core drs", "Academica", "BILFL", "Clinic Utilitie", "Just for You"].map((n) => ({ tenantSlug: T, doctorTypeName: n, status: "Active" })); }

const V = await import("../../src/utils/visit-details-reports.js");

// ── week ranges
const wr = (m: string) => V.weekRanges(m).map((w) => `${w.from}-${w.to}`).join(",");
assert.equal(wr("2026-09"), "1-6,7-13,14-20,21-27,28-30");
assert.equal(wr("2026-10"), "1-4,5-11,12-18,19-25,26-31");
assert.equal(wr("2026-02"), "1-1,2-8,9-15,16-22,23-28"); // Feb 1 2026 is a Sunday
assert.equal(V.weekRanges("2026-10")[0].label, "week 1[1-4]");

// ── options
const opt = await V.visitDetailOptions(T);
assert.deepEqual(opt.specialities.map((x) => x.toLowerCase()), ["cp", "ent"]);   // by doctor count, CP/cp merged
assert.equal(opt.specialities.filter((s) => s.toLowerCase() === "cp").length, 1);   // CP / cp merged
assert.deepEqual(opt.doctorTypes, ["Core drs", "Academica", "BILFL", "Clinic Utilitie", "Just for You"]);
assert.deepEqual(opt.campaigns, ["Camp1"]);

// ── Category, all four ticked, Oct only
const cat = (await V.computeCatClsVisit(T, "E1", "2026-10", "2026-10", "Category", ["Nil", "CORE", "N CORE", "S CORE"], false))!;
assert.deepEqual(cat.rows.map((r) => r.name), ["AMITH K", "DARSHAN B", "THARUN C"]);          // BEs, selected manager last
const a = cat.rows[0].perMonth["2026-10"], m = cat.rows[2].perMonth["2026-10"];
assert.equal(a.total.list, 3);                                                                // Dr A,B,C
assert.deepEqual(a.groups["Nil"], { list: 1, met: 1, seen: 2, missed: 0 });                   // Dr A: calls on Oct 1 and Oct 4 -> met 1, seen 2
assert.deepEqual(a.groups["CORE"], { list: 1, met: 1, seen: 3, missed: 0 });                  // Dr B: 3 calls
assert.deepEqual(a.groups["S CORE"], { list: 1, met: 0, seen: 0, missed: 1 });
assert.equal(a.total.met, 2);
assert.equal(m.total.list, 3 + 1 + 1);                                                        // team + own rollup
assert.deepEqual(m.groups["CORE"], { list: 2, met: 0, seen: 0, missed: 0 });                  // Dr B + Dr E, met/seen/missed blank on the manager row
assert.equal(cat.rows[2].isManager, true);
// Category = Nil only: total == Nil list
const nil = (await V.computeCatClsVisit(T, "E1", "2026-10", "2026-10", "Category", ["Nil"], false))!;
assert.equal(nil.rows[0].perMonth["2026-10"].total.list, nil.rows[0].perMonth["2026-10"].groups["Nil"].list);
// ── multi-month
const mm = (await V.computeCatClsVisit(T, "E1", "2026-09", "2026-10", "Speciality", ["CP", "ENT"], false))!;
assert.deepEqual(mm.months, ["2026-09", "2026-10"]);
assert.deepEqual(mm.rows[0].perMonth["2026-09"].groups["ENT"], { list: 1, met: 1, seen: 1, missed: 0 });   // Dr C in September
assert.deepEqual(mm.rows[0].perMonth["2026-10"].groups["ENT"], { list: 1, met: 0, seen: 0, missed: 1 });
assert.deepEqual(mm.rows[0].perMonth["2026-10"].groups["CP"], { list: 2, met: 2, seen: 5, missed: 0 });   // speciality match is case-insensitive
// ── class / doctor type / campaign / listed doctor
const cl = (await V.computeCatClsVisit(T, "E1", "2026-10", "2026-10", "Class", ["Nil", "A", "B", "C"], false))!;
assert.equal(cl.rows[0].perMonth["2026-10"].groups["A"].list, 2);
assert.equal(cl.rows[0].perMonth["2026-10"].groups["C"].list, 1);
const dt = (await V.computeCatClsVisit(T, "E1", "2026-10", "2026-10", "Doctor Type", ["Core drs", "Academica"], false))!;
assert.equal(dt.rows[0].perMonth["2026-10"].groups["Core drs"].list, 2);
assert.equal(dt.rows[0].perMonth["2026-10"].total.list, 2);                                   // distinct doctors, Dr B counted once
assert.equal(dt.rows[0].perMonth["2026-10"].groups["Academica"].list, 1);
const cp = (await V.computeCatClsVisit(T, "E1", "2026-10", "2026-10", "Campaign", ["Camp1"], false))!;
assert.equal(cp.rows[0].perMonth["2026-10"].groups["Camp1"].list, 1);
const ld = (await V.computeCatClsVisit(T, "E1", "2026-10", "2026-10", "Listed Doctor", [], false))!;
assert.equal(ld.grouped, false);
assert.deepEqual(ld.rows[0].perMonth["2026-10"].total, { list: 3, met: 2, seen: 5, missed: 1 });
// ── a base-level employee selected -> single row
const one = (await V.computeCatClsVisit(T, "E2", "2026-10", "2026-10", "Listed Doctor", [], false))!;
assert.equal(one.rows.length, 1); assert.equal(one.rows[0].isManager, false);
// ── with vacants: the inactive ABM seat appears (no vacant -> absent)
assert.equal(cat.rows.some((r) => r.isVacant), false);
const vac = (await V.computeCatClsVisit(T, "E1", "2026-10", "2026-10", "Category", ["Nil"], true))!;
assert.deepEqual(vac.rows.map((r) => r.name), ["AMITH K", "DARSHAN B", "OLD ABM", "THARUN C"]);
assert.equal(vac.rows[2].isVacant, true);
assert.equal(vac.rows[2].perMonth["2026-10"].groups["Nil"].list, 1);
assert.equal(vac.rows[3].perMonth["2026-10"].groups["Nil"].list, 1 + 0 + 1);                  // roll-up now includes the vacant seat's Dr F

// ── DateWise
const dw = (await V.computeDateWise(T, "E2", "2026-10"))! as any;
assert.equal(dw.numDays, 31);
assert.deepEqual(dw.rows.map((r: any) => [r.name, r.total]), [["Dr B", 3], ["Dr A", 2]]);   // territory T0 before T1
const byName = Object.fromEntries(dw.rows.map((r: any) => [r.name, r]));
assert.equal(byName["Dr A"].total, 2); assert.deepEqual(Object.keys(byName["Dr A"].days).map(Number), [1, 4]);
assert.equal(byName["Dr B"].total, 3); assert.equal(byName["Dr B"].days[2], 2);
assert.equal(byName["Dr C"], undefined);                                                       // no visit in October -> not listed
assert.equal(byName["Dr A"].category, "Nil"); assert.equal(byName["Dr B"].category, "CORE"); assert.equal(byName["Dr A"].cls, "A");
const terrs = dw.rows.map((r: any) => r.territory); assert.deepEqual(terrs, [...terrs].sort());
// matrix: week 1 of Oct 2026 = 1-4 (Thu..Sun)
const mx = (await V.computeDateWise(T, "E2", "2026-10", 1))! as any;
assert.deepEqual(mx.days.map((d: any) => [d.day, d.weekday]), [[1, "Thursday"], [2, "Friday"], [3, "Saturday"], [4, "Sunday"]]);
assert.deepEqual(mx.days[0].calls.map((c: any) => [c.name, c.time]), [["Dr B", "09:30"], ["Dr A", "11:00"]]);   // by call time
assert.equal(mx.days[0].calls[1].products, "DEXNOVA, ZIVI");
assert.equal(mx.days[1].status, "");                                                           // Oct 2 has calls even though it is a state holiday
assert.equal(mx.days[2].status, "");                                                           // no calls, plain Saturday
assert.equal(mx.days[3].calls.length, 1);                                                      // Sunday WITH a call lists the call, no "Weekly Off"
const mx2 = (await V.computeDateWise(T, "E3", "2026-10", 2))! as any;                         // Oct 5-11, E3 worked none; Oct 11 = Sunday
assert.equal(mx2.days.find((d: any) => d.day === 11).status, "Weekly Off");
assert.equal(mx2.days.find((d: any) => d.day === 6).status, "");
const mx3 = (await V.computeDateWise(T, "E3", "2026-10", 1))! as any;
assert.equal(mx3.days.find((d: any) => d.day === 2).status, "Holiday");
assert.equal(mx3.days.find((d: any) => d.day === 4).status, "Weekly Off");
assert.equal(await V.computeDateWise(T, "E3", "2026-10", 9), null);
console.log("R44 COMPUTE OK");
process.exit(0);
