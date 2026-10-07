// Round 53 in-memory verification (no MongoDB). Run: npx tsx scripts/r53-tests/compute.ts
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

let seq = 5000;
(mongoose.Model as any).create = function (arg: any) { const arr = Array.isArray(arg) ? arg : [arg]; const made = arr.map((d: any) => { const doc = { ...new (this as any)(d).toObject(), _id: asId(seq++), createdAt: new Date(), updatedAt: new Date() }; coll(this).push(doc); return doc; }); return Promise.resolve(Array.isArray(arg) ? made : made[0]); };
import assert from "node:assert";
const T = "demo";
const emp = (n: number, name: string, code: string, desig: string, role: string, mgr: string | undefined, hq: string, extra: any = {}) =>
  ({ _id: asId(n), tenantSlug: T, name, employeeCode: code, designation: desig, role, reportingManager: mgr, territory: hq, state: "Kerala", division: "Z", status: "ACTIVE", joinDate: new Date("2024-03-05"), ...extra });
store["employees"] = [
  emp(1, "Raj Rbm", "R1", "RBM", "RBM", undefined, "ERNAKULAM", { email: "raj@x.com" }), emp(2, "Abe Abm", "A1", "ABM", "ABM", "R1", "KOCHI"),
  emp(3, "Bee One", "B1", "BE", "MR", "A1", "K1", { email: "bee@x.com" }), emp(4, "Bee Two", "B2", "BE", "MR", "A1", "K2"),
  emp(5, "Gone Mr", "V1", "BE", "MR", "A1", "K3", { status: "INACTIVE", leftDate: new Date("2026-08-01") })
];
store["territoryHqMaster"] = [{ tenantSlug: T, headquartersName: "K1", region: "REG1" }];
store["products"] = [{ _id: asId(900), tenantSlug: T, productName: "PREDIRA", brandName: "PREDIRA", status: "ACTIVE" }, { _id: asId(901), tenantSlug: T, productName: "ZIVIMOX LP", status: "ACTIVE" }];
store["productBrands"] = [{ tenantSlug: T, brandName: "TIZTA", sortOrder: 2 }, { tenantSlug: T, brandName: "PREDIRA", sortOrder: 1 }];
store["doctors"] = [1, 2].map((n) => ({ _id: asId(100 + n), tenantSlug: T, name: "Dr" + n, mappedEmployeeCode: "B1", status: "ACTIVE", doctorCode: "D" + n, specialty: "CP" }));
const dcr = (n: number, e: string, d: string, doctor: number, extra: any = {}) =>
  ({ _id: asId(200 + n), tenantSlug: T, employeeCode: e, doctorId: asId(100 + doctor), visitDate: new Date(d), month: d.slice(0, 7), visitDateOnly: d, status: "SUBMITTED", workType: "Field Work", productsDetailed: [], samplesGiven: [], inputsGiven: [], rxItems: [], ...extra });
store["dcrs"] = [
  dcr(1, "B1", "2026-10-01", 1, { samplesGiven: [{ productName: "PREDIRA", qty: 2 }], inputsGiven: [{ inputName: "PEN", qty: 3 }] }),
  dcr(2, "B1", "2026-10-05", 1, { rxItems: [{ productName: "PREDIRA", qty: 5 }], inputsGiven: [{ inputName: "PEN", qty: 2 }] }),
  dcr(3, "B1", "2026-09-30", 1, { rxItems: [{ productName: "PREDIRA", qty: 4 }] }),
  dcr(4, "B1", "2026-10-02", 2, { rxItems: [{ productName: "predira", qty: 7 }] }),
  dcr(5, "B1", "2026-10-08", 1), dcr(6, "B1", "2026-10-09", 2),
  dcr(7, "B2", "2026-10-02", 1, { status: "REJECTED", inputsGiven: [{ inputName: "PEN", qty: 99 }] })
];
store["dispatches"] = [{ tenantSlug: T, employeeCode: "B2", type: "INPUT", dispatchDate: new Date("2026-10-10"), items: [{ name: "PEN", code: "I", dispatchQty: 40, despatchDate: new Date("2026-10-10") }] },
  { tenantSlug: T, employeeCode: "B2", type: "SAMPLE", dispatchDate: new Date("2026-10-10"), items: [{ name: "X", code: "S", dispatchQty: 7, despatchDate: new Date("2026-10-10") }] }];
store["dcr_locks"] = [
  { tenantSlug: T, employeeCode: "B1", dcrDate: "2026-10-03", releasedAt: null }, { tenantSlug: T, employeeCode: "B1", dcrDate: "2026-10-04", releasedAt: new Date("2026-10-08T10:00:00Z") },
  { tenantSlug: T, employeeCode: "B1", dcrDate: "2026-09-04", releasedAt: null }
];
const lv = (e: string, type: string, f: string, t: string, extra: any = {}) => ({ tenantSlug: T, employeeCode: e, leaveType: type, fromDate: new Date(f), toDate: new Date(t), days: 1, status: "APPROVED", ...extra });
store["leave_applications"] = [lv("B1", "Casual Leave", "2026-10-05", "2026-10-07"), lv("B2", "Leave Without Pay", "2026-10-10", "2026-10-12", { isLWP: true }), lv("A1", "Sick Leave", "2026-10-01", "2026-10-01", { status: "PENDING" }), lv("V1", "Sick Leave", "2026-10-01", "2026-10-02"), lv("B1", "Marriage Leave", "2026-10-14", "2026-10-14")];
store["mail_logs"] = [
  { tenantSlug: T, to: "bee@x.com", subject: "[Zivira HR] Hi", mailType: "hr-notice", status: "sent", channel: "sendgrid", sentAt: new Date("2026-10-07T09:00:00Z") },
  { tenantSlug: T, to: "raj@x.com", subject: "[Zivira] Alert", mailType: "manager-notice", status: "failed", error: "SendGrid 401", sentAt: new Date("2026-10-08T09:00:00Z") },
  { tenantSlug: "other", to: "z@z.com", subject: "x", status: "sent", sentAt: new Date("2026-10-08T09:00:00Z") },
  { tenantSlug: T, to: "old@x.com", subject: "old", status: "sent", sentAt: new Date("2026-09-01T09:00:00Z") }
];
store["tourplans"] = [{ tenantSlug: T, employeeCode: "B1", month: "2026-10", status: "APPROVED", locations: [
  { date: "2026-10-05", area: "A", town: "KOCHI", purpose: "Field Work" }, { date: "2026-10-06", area: "A", town: "KOCHI", purpose: "Field Work" }, { date: "2026-10-08", area: "", town: "KOCHI", purpose: "Meeting" }] },
  { tenantSlug: T, employeeCode: "B1", month: "2026-10", status: "SUBMITTED", locations: [{ date: "2026-10-20", area: "", town: "NOPE", purpose: "" }] }];
const R = await import("../../src/utils/r53-reports.js");

// ── 1) Input details ──
const i: any = await R.computeInputDetails(T, "A1", "2026-10", "2026-10");
assert.deepEqual(i.rows.map((r: any) => r.employeeCode), ["B1", "B2", "V1", "A1"]);           // includes vacant HQ
assert.deepEqual(i.rows.map((r: any) => r.name), ["Bee One", "Bee Two", "Vacant", "Abe Abm"]);
assert.deepEqual(i.rows.map((r: any) => r.total), [5, 0, 0, 0]);                                // rejected DCR ignored
assert.equal(i.rows[0].region, "REG1"); assert.equal(i.totals["2026-10"], 5); assert.equal(i.grandTotal, 5);
const id: any = await R.computeInputDetails(T, "A1", "2026-10", "2026-10", "despatch");
assert.deepEqual(id.rows.map((r: any) => r.total), [0, 40, 0, 0]);                              // INPUT despatch only
assert.equal((await R.computeInputDetails(T, "A1", "2026-10", "2026-10", "both") as any).grandTotal, 45);

// ── 2) Sample Rx quantity ──
assert.deepEqual(await R.sampleRxOptions(T, "product"), ["PREDIRA", "ZIVIMOX LP"]);
assert.deepEqual(await R.sampleRxOptions(T, "brand"), ["Nil", "PREDIRA", "TIZTA"]);
const rx: any = await R.computeSampleRxQuantity(T, "A1", "2026-09", "2026-10", "product", ["PREDIRA", "ZIVIMOX LP"]);
assert.deepEqual(rx.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1"]);                 // active only
assert.deepEqual([rx.rows[0].multiple, rx.rows[0].unique, rx.rows[0].totalQty], [1, 1, 5]);      // sampled basis: only d1's Rx after the sample
assert.deepEqual(rx.rows[0].perMonth["2026-10"], { PREDIRA: 5, "ZIVIMOX LP": 0 }); assert.equal(rx.rows[0].perMonth["2026-09"].PREDIRA, 0);
const rxa: any = await R.computeSampleRxQuantity(T, "A1", "2026-09", "2026-10", "product", ["PREDIRA"], "all");
assert.deepEqual([rxa.rows[0].multiple, rxa.rows[0].unique, rxa.rows[0].totalQty], [3, 2, 16]);  // 5 + 4 + 7 (case-insensitive name)
assert.deepEqual([rxa.total.multiple, rxa.total.totalQty, rxa.rows[2].multiple], [3, 16, 0]);
const rb: any = await R.computeSampleRxQuantity(T, "A1", "2026-10", "2026-10", "brand", ["PREDIRA", "Nil"], "all");
assert.deepEqual(rb.rows[0].perMonth["2026-10"], { PREDIRA: 12, Nil: 0 });
await assert.doesNotReject(async () => R.computeSampleRxQuantity(T, "A1", "2026-10", "2026-10", "product", ["PREDIRA"]));

// ── 3) Delayed status ──
const ds: any = await R.computeDelayedStatus(T, "admin", "2026-10");
assert.deepEqual(ds.rows.map((r: any) => r.employeeCode), ["B1", "B2", "V1", "A1", "R1"]);
const b1 = ds.rows[0];
assert.deepEqual([b1.notReleased, b1.released, b1.joiningDate, b1.lastDcrDate, b1.manager1, b1.manager2], [["03/10/2026"], ["04/10/2026 (08/10/2026)"], "05/03/2024", "09/10/2026", "Abe Abm", "Raj Rbm"]);
assert.equal(ds.rows[2].resignedDate, "01/08/2026"); assert.equal(ds.employee.name, "admin");
assert.deepEqual((await R.computeDelayedStatus(T, "A1", "2026-10") as any).rows.map((r: any) => r.employeeCode), ["B1", "B2", "V1", "A1"]);
assert.equal(await R.computeDelayedStatus(T, "NOPE", "2026-10"), null);

// ── 4) Leave - active ──
assert.deepEqual(R.leaveKind("Privilege Leave"), "PL"); assert.equal(R.leaveKind("Annual", true), "LOP"); assert.equal(R.leaveKind("Marriage Leave"), "OTHER");
const la: any = await R.computeLeaveActive(T, "A1", "2026-10", "2026-10");
assert.deepEqual(la.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1"]);                 // inactive V1 excluded
assert.deepEqual(la.rows[0].perMonth["2026-10"], { CL: 3, PL: 0, SL: 0, LOP: 0, total: 4 });     // 3 CL days + 1 other leave day
assert.deepEqual(la.rows[1].totals, { CL: 0, PL: 0, SL: 0, LOP: 2, total: 2 });                 // Sat + Mon; Sunday excluded
assert.equal(la.rows[2].totals.total, 0);                                                        // pending ignored

// ── 5) Leave - periodically ──
const lp: any = await R.computeLeavePeriodically(T, "A1", "2026-10-06", "2026-10-11", false);
assert.deepEqual(lp.rows.map((r: any) => r.employeeCode), ["B1", "B2"]);                        // managers omitted when not detailed
assert.deepEqual([lp.rows[0].leaveDates, lp.rows[0].CL, lp.rows[0].total, lp.rows[1].leaveDates, lp.rows[0].joiningDate], [["06/10/2026", "07/10/2026"], 2, 2, ["10/10/2026"], "05/03/2024"]);
const lpd: any = await R.computeLeavePeriodically(T, "A1", "2026-10-06", "2026-10-11", true);
assert.deepEqual(lpd.rows.map((r: any) => r.employeeCode), ["B1", "B2", "A1"]);

// ── 6) Mail status ──
const ms: any = await R.computeMailStatus(T, "2026-10-01", "2026-10-31");
assert.deepEqual(ms.rows.map((r: any) => [r.to, r.status, r.error, r.mailType]), [["raj@x.com", "failed", "SendGrid 401", "manager-notice"], ["bee@x.com", "sent", "", "hr-notice"]]);   // tenant-only, newest first, in range

// ── 7) TP deviation ──
const tp: any = await R.computeTpDeviationLegacy(T, "B1", "2026-10");
assert.deepEqual(tp.rows.map((r: any) => [r.date, r.day, r.asPerTp, r.asPerDcr]), [
  ["01/10/2026", "Thursday", "", "Field Work"], ["02/10/2026", "Friday", "", "Field Work"],
  ["06/10/2026", "Tuesday", "KOCHI, A (Field Work)", "Leave"], ["08/10/2026", "Thursday", "KOCHI,  (Meeting)", "Field Work"], ["09/10/2026", "Friday", "", "Field Work"]]);
assert.equal(tp.employee.name, "Bee One"); assert.equal(await R.computeTpDeviationLegacy(T, "NOPE", "2026-10"), null);
// ── mail logging through notify.ts (no provider configured -> logged as failed, tenant resolved from the recipient) ──
for (const k of ["SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL", "RESEND_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD"]) delete process.env[k];
const before = store["mail_logs"].length;
const N = await import("../../src/utils/notify.js");
await N.notifyEmployeeEmail({ toEmail: "bee@x.com", toName: "Bee One", subject: "Test", message: "hello" });
await N.notifyEmployeeEmail({ toEmail: "stranger@nowhere.com", toName: "S", subject: "Test2", message: "hello" });
const added = store["mail_logs"].slice(before);
assert.equal(added.length, 2);
assert.deepEqual([added[0].tenantSlug, added[0].mailType, added[0].status, added[0].subject], [T, "hr-notice", "failed", "[Zivira HR] Test"]);
assert.match(added[0].error, /provider/i); assert.equal(added[1].tenantSlug, "");               // unknown recipient -> never shown to a tenant
console.log("R53 compute tests passed");
