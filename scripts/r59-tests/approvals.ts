// Round 59 in-memory verification (no MongoDB): approvals by Admin and by Manager (trail, label, mirror <-> real sync, notifications, repeats),
// leave cancellation with side effects on day-status, driven through the REAL masters / manager / company routers over HTTP.
// Run: npx tsx scripts/r59-tests/approvals.ts
import mongoose from "mongoose";
import sift from "sift";

const store: Record<string, any[]> = {};
const asId = (n: number) => new mongoose.Types.ObjectId(String(n).padStart(24, "0"));
let seq = 9000;
const wrap = (d: any) => {
  if (!d || d.__wrapped) return d;
  Object.defineProperty(d, "__wrapped", { value: true, enumerable: false });
  Object.defineProperty(d, "save", { value: function () { return Promise.resolve(this); }, enumerable: false });
  Object.defineProperty(d, "toObject", { value: function () { return JSON.parse(JSON.stringify(this), (k, v) => (k === "createdAt" || k === "updatedAt" || /At$|Date$|from$|to$/.test(k)) && typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v); }, enumerable: false });
  return d;
};
const norm = (f: any): any => JSON.parse(JSON.stringify(f ?? {}), (_k, v) => v);
const matcher = (f: any) => {
  const g = { ...(f || {}) };
  if (g._id !== undefined && typeof g._id !== "object") g._id = String(g._id);
  return (d: any) => sift({ ...g, ...(g._id !== undefined ? { _id: undefined } : {}) })({ ...d, _id: undefined }) && (g._id === undefined || String(d._id) === String(g._id));
};
const matchOne = (f: any) => {
  const clean: any = {}; let id: any;
  for (const [k, v] of Object.entries(f || {})) { if (k === "_id") id = v; else clean[k] = v; }
  const s = sift(clean);
  return (d: any) => s(d) && (id === undefined || (typeof id === "object" && id && "$ne" in (id as any) ? String(d._id) !== String((id as any).$ne) : String(d._id) === String(id)));
};
const coll = (m: any) => store[m.collection.name] || (store[m.collection.name] = []);
class Q {
  constructor(public docs: any[]) {}
  select() { return this; } lean() { return this; } populate() { return this; }
  sort(spec: any) { const [k, dir] = Object.entries(spec)[0] as [string, number]; this.docs = [...this.docs].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir < 0 ? -1 : 1)); return this; }
  limit(n: number) { this.docs = this.docs.slice(0, n); return this; }
  then(res: any, rej: any) { return Promise.resolve(this.docs.map(wrap)).then(res, rej); }
}
class Q1 extends Q { then(res: any, rej: any) { return Promise.resolve(wrap(this.docs[0] ?? null)).then(res, rej); } }
const M: any = mongoose.Model;
M.find = function (f: any = {}) { return new Q(coll(this).filter(matchOne(f))); };
M.findOne = function (f: any = {}) { return new Q1(coll(this).filter(matchOne(f))); };
M.findById = function (id: any) { return new Q1(coll(this).filter((d) => String(d._id) === String(id))); };
M.countDocuments = function (f: any = {}) { return Promise.resolve(coll(this).filter(matchOne(f)).length); };
M.distinct = function (k: string, f: any = {}) { return Promise.resolve([...new Set(coll(this).filter(matchOne(f)).map((d) => d[k]))]); };
M.create = function (arg: any) { const arr = Array.isArray(arg) ? arg : [arg]; const made = arr.map((d: any) => { const doc = wrap({ _id: asId(seq++), createdAt: new Date(), updatedAt: new Date(), ...d }); coll(this).push(doc); return doc; }); return Promise.resolve(Array.isArray(arg) ? made : made[0]); };
const applyUpdate = (d: any, u: any) => { Object.assign(d, u.$set || {}); for (const [k, v] of Object.entries(u.$push || {})) (d[k] ||= []).push(v); for (const [k, v] of Object.entries(u.$addToSet || {})) { (d[k] ||= []); if (!d[k].includes(v)) d[k].push(v); } d.updatedAt = new Date(); };
M.updateOne = function (f: any, u: any) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); return Promise.resolve({ matchedCount: d ? 1 : 0 }); };
M.updateMany = function (f: any, u: any) { const ds = coll(this).filter(matchOne(f)); ds.forEach((d) => applyUpdate(d, u)); return Promise.resolve({ modifiedCount: ds.length }); };
M.findOneAndUpdate = function (f: any, u: any) { const d = coll(this).find(matchOne(f)); if (d) applyUpdate(d, u); return Promise.resolve(wrap(d ?? null)); };
M.deleteMany = function (f: any = {}) { const c = coll(this); const hit = new Set(c.filter(matchOne(f))); const keep = c.filter((d) => !hit.has(d)); c.length = 0; c.push(...keep); return Promise.resolve({ deletedCount: hit.size }); };
M.deleteOne = function (f: any = {}) { const c = coll(this); const d = c.find(matchOne(f)); if (d) c.splice(c.indexOf(d), 1); return Promise.resolve({ deletedCount: d ? 1 : 0 }); };

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";

const T = "demo";
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
store["users"] = [
  wrap({ _id: asId(1), username: "admin", displayName: "Corporate HQ", role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN", tenantSlug: T }),
  wrap({ _id: asId(2), username: "m1", displayName: "Meera Shah", role: "ABM", portal: "FIELD_FORCE", tenantSlug: T }),
  wrap({ _id: asId(3), username: "mr1", displayName: "Rahul Mehta", role: "MR", portal: "FIELD_FORCE", tenantSlug: T })
];
const emp = (code: string, name: string, role: string, mgr?: string) => wrap({ _id: asId(100 + store["employees"]?.length || 100), tenantSlug: T, employeeCode: code, name, role, designation: role, division: "Zivira", territory: "Vadodara", reportingManager: mgr, status: "ACTIVE" });
store["employees"] = [];
for (const e of [["M2", "Rina Desai", "RBM", undefined], ["M1", "Meera Shah", "ABM", "M2"], ["MR1", "Rahul Mehta", "MR", "M1"]] as const) store["employees"].push(emp(e[0], e[1], e[2], e[3]));
store["tourplans"] = [wrap({ _id: asId(200), tenantSlug: T, tpId: "TP-2026-10-MR1-001", employeeCode: "MR1", employeeName: "Rahul Mehta", primaryManager: "M1", assignedManager: "M1", month: "2026-10", locations: [{ date: "2026-10-12", area: "Alkapuri", town: "Vadodara", purpose: "" }], status: "SUBMITTED", approvalHistory: [] })];
const dcr = (id: number, vd: string) => wrap({ _id: asId(id), tenantSlug: T, employeeCode: "MR1", visitDate: day(vd), visitDateOnly: vd, month: vd.slice(0, 7), status: "SUBMITTED", approvalHistory: [] });
store["dcrs"] = [dcr(300, "2026-10-13"), dcr(301, "2026-10-13"), dcr(302, "2026-10-14")];
const leave = (id: number, from: string, to: string, days: number, status = "PENDING") => wrap({ _id: asId(id), tenantSlug: T, employeeCode: "MR1", leaveType: "Casual Leave", fromDate: day(from), toDate: day(to), days, reason: "Family", status, workTypeCode: "L", createdAt: new Date("2026-10-01"), approvalHistory: [] });
store["leave_applications"] = [leave(400, "2026-10-19", "2026-10-21", 3), leave(401, "2026-10-26", "2026-10-26", 1), leave(402, "2026-10-28", "2026-10-28", 1)];
const mir = (key: string, doc: any) => { (store[key] ||= []).push(wrap({ _id: asId(seq++), tenantSlug: T, approvalStatus: "Pending", approvalHistory: [], ...doc })); return store[key][store[key].length - 1]; };
const mTp = mir("approvalTp", { sfName: "Rahul Mehta", sourceId: String(asId(200)), tpId: "TP-2026-10-MR1-001", month: "2026-10" });
const mD1 = mir("approvalDcr", { sfName: "Rahul Mehta", sourceId: String(asId(300)), activityDate: day("2026-10-13") });
const mD2 = mir("approvalDcr", { sfName: "Rahul Mehta", sourceId: String(asId(301)), activityDate: day("2026-10-13") });
const mDold = mir("approvalDcr", { sfName: "Rahul Mehta", activityDate: day("2026-10-14") });                       // legacy mirror row: no sourceId
const mL1 = mir("approvalLeave", { fieldForceName: "Rahul Mehta", sourceId: String(asId(400)), fromDate: "2026-10-19", toDate: "2026-10-21", leaveDays: 3, leaveType: "Casual Leave" });
const mL2 = mir("approvalLeave", { fieldForceName: "Rahul Mehta", fromDate: "2026-10-26", toDate: "2026-10-26", leaveDays: 1, leaveType: "Casual Leave" });   // legacy, no sourceId
const mL3 = mir("approvalLeave", { fieldForceName: "Rahul Mehta", fromDate: "2026-10-28", toDate: "2026-10-28", leaveDays: 1, leaveType: "Casual Leave" });

const { managerRouter } = await import("../../src/routes/manager.routes.js");
const { fieldRouter } = await import("../../src/routes/field.routes.js");
const { companyRouter } = await import("../../src/routes/company.routes.js");
const { HttpError } = await import("../../src/http/errors.js");
const { approvalLabel } = await import("../../src/utils/approval-label.js");
const { buildDayStatusContext, classifyDay } = await import("../../src/utils/day-status.js");

const app = express();
app.use(express.json());
const { signToken } = await import("../../src/http/auth.js");
app.use("/api/company", companyRouter);
app.use("/api/manager", managerRouter);
app.use("/api/field", fieldRouter);
app.use((err: any, _req: any, res: any, _next: any) => { res.status(err instanceof HttpError ? err.statusCode : err?.name === "ZodError" ? 400 : 500).json({ error: err.message }); });
const server = http.createServer(app); await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
const tokens: Record<string, string> = { admin: signToken({ sub: String(asId(1)), role: "COMPANY_ADMIN", portal: "COMPANY_ADMIN", tenantSlug: T }), m1: signToken({ sub: String(asId(2)), role: "ABM", portal: "FIELD_FORCE", tenantSlug: T }), mr1: signToken({ sub: String(asId(3)), role: "MR", portal: "FIELD_FORCE", tenantSlug: T }) };
const call = async (as: string, method: string, url: string, body?: any) => { const r = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${tokens[as]}` }, body: body ? JSON.stringify(body) : undefined }); const j: any = await r.json().catch(() => ({})); return { status: r.status, body: j }; };
const notices = (type?: string) => (store["notices"] || []).filter((n) => n.type && (!type || n.type === type));
const to = (n: any) => `${n.audience}${n.targetEmployeeCode ? ":" + n.targetEmployeeCode : ""}`;
const sortedTo = (ns: any[]) => ns.map(to).sort();
const tp = () => store["tourplans"][0], dc = (id: number) => store["dcrs"].find((d) => String(d._id) === String(asId(id))), lv = (id: number) => store["leave_applications"].find((d) => String(d._id) === String(asId(id)));

// ═══ 1) Admin approves TP (mirror row path) -> real TP approved by Admin, mirror trail, notices to field user + manager chain, nothing for the admin
let r = await call("admin", "PUT", `/company/masters/approvalTp/${mTp._id}`, { approvalStatus: "Approved" });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(tp().status, "APPROVED"); assert.equal(tp().approval.approvedBy.role, "ADMIN"); assert.equal(tp().approval.approvedBy.name, "Corporate HQ");
assert.equal(approvalLabel(tp()), "Approved by Admin"); assert.equal(tp().approvalHistory.length, 1);
assert.equal(approvalLabel(mTp), "Approved by Admin"); assert.equal(mTp.approvalHistory.length, 1);
assert.deepEqual(sortedTo(notices("TP_APPROVED")), ["MANAGER:M1", "MANAGER:M2", "MR:MR1"]);
assert.ok(notices("TP_APPROVED").every((n) => n.refKind === "TP" && n.link && n.dedupeKey));
assert.ok(notices("TP_APPROVED").find((n) => to(n) === "MR:MR1").title.includes("Admin"));
const nBefore = notices().length;
r = await call("admin", "PUT", `/company/masters/approvalTp/${mTp._id}`, { approvalStatus: "Approved" });          // repeat
assert.equal(tp().approvalHistory.length, 1, "repeat admin approve must not add history"); assert.equal(notices().length, nBefore, "repeat must not duplicate notices");
const audit1 = (store["approval_audit_log"] || []).filter((a) => a.masterKey === "approvalTp");
assert.ok(audit1.length >= 1 && audit1[0].actedByRole === "ADMIN" && audit1[0].actedBy === "Corporate HQ");
console.log("1 admin TP approve ok");

// ═══ 2) Admin rejects a DCR date through bulk-action: both visits that day (one with sourceId, the other too) are rejected by Admin
r = await call("admin", "POST", `/company/masters/approvalDcr/bulk-action`, { ids: [String(mD1._id), String(mD2._id)], status: "Rejected", reason: "Doctor list incomplete" });
assert.equal(r.status, 200, JSON.stringify(r.body));
for (const id of [300, 301]) { assert.equal(dc(id).status, "REJECTED"); assert.equal(approvalLabel(dc(id)), "Rejected by Admin"); assert.equal(dc(id).approval.remarks, "Doctor list incomplete"); }
assert.equal(approvalLabel(mD1), "Rejected by Admin");
assert.equal(notices("DCR_REJECTED").filter((n) => n.audience === "MR").length, 2, "one MR notice per mirror row/date record");
assert.ok(notices("DCR_REJECTED").some((n) => to(n) === "MANAGER:M1") && notices("DCR_REJECTED").some((n) => to(n) === "MANAGER:M2"));
// legacy mirror (no sourceId): matched by employee + date
r = await call("admin", "PUT", `/company/masters/approvalDcr/${mDold._id}`, { approvalStatus: "Approved" });
assert.equal(dc(302).status, "APPROVED"); assert.equal(approvalLabel(dc(302)), "Approved by Admin");
console.log("2 admin DCR reject/approve ok (incl. legacy mirror)");

// ═══ 3) Manager approves a leave -> real leave + mirror row + cancellation row; notices to field user and the admin portal, not the manager
r = await call("m1", "POST", `/manager/leave-applications/${asId(400)}/approve`);
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(lv(400).status, "APPROVED"); assert.equal(approvalLabel(lv(400)), "Approved by Manager (Meera Shah)"); assert.equal(lv(400).approval.approvedBy.id, "M1");
assert.equal(approvalLabel(mL1), "Approved by Manager (Meera Shah)");
assert.deepEqual(sortedTo(notices("LEAVE_APPROVED")), ["ADMIN", "MR:MR1"]);
assert.ok((store["leaveCancellation"] || []).some((c) => c.status === "Active" && c.fieldForceName === "Rahul Mehta" && c.sourceId === String(asId(400))));
const hist = (store["approval_audit_log"] || []).filter((a) => a.masterKey === "approvalLeave");
assert.ok(hist.some((a) => a.actedByRole === "MANAGER" && a.actedBy === "Meera Shah" && a.action === "Approved"));
// manager approves a TP-style DCR and rejects a TP: trail on real records
r = await call("m1", "POST", `/manager/dcrs/${asId(300)}/approve`);
assert.equal(dc(300).status, "MANAGER_APPROVED"); assert.equal(approvalLabel(dc(300)), "Approved by Manager (Meera Shah)"); assert.equal(approvalLabel(mD1), "Approved by Manager (Meera Shah)", "admin DCR row must show the manager decision");
console.log("3 manager leave/DCR approve ok");

// ═══ 4) Leave cancellation: guards, then admin cancels the approved leave from the Leave Cancellation row
r = await call("admin", "POST", `/company/leave/${asId(401)}/cancel`, { reason: "x" });                 // PENDING leave
assert.equal(r.status, 400); assert.match(r.body.error, /Only an approved leave/);
r = await call("admin", "POST", `/company/leave/${asId(400)}/cancel`, {});                              // no reason
assert.equal(r.status, 400); assert.match(r.body.error, /reason is required/);
r = await call("admin", "POST", `/company/leave/${asId(999)}/cancel`, { reason: "x" }); assert.equal(r.status, 404);
const ctx0 = await buildDayStatusContext(T, "2026-10", ["MR1"], []);
assert.equal(classifyDay(ctx0, "MR1", "2026-10-20").kind, "leave", "approved leave counts before cancel");
const crow = store["leaveCancellation"].find((c) => c.sourceId === String(asId(400)));
const nPre = notices().length;
r = await call("admin", "PUT", `/company/masters/leaveCancellation/${crow._id}`, { status: "Cancelled", reason: "Rescheduled by HQ" });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(lv(400).status, "CANCELLED"); assert.equal(lv(400).cancelledBy.role, "ADMIN"); assert.equal(lv(400).cancelReason, "Rescheduled by HQ"); assert.ok(lv(400).cancelledAt);
assert.equal(approvalLabel(lv(400)), "Leave cancelled by Admin"); assert.equal(lv(400).approvalHistory.at(-1).action, "Cancelled");
assert.equal(crow.status, "Cancelled"); assert.equal(mL1.approvalStatus, "Cancelled");
assert.deepEqual(sortedTo(notices("LEAVE_CANCELLED")), ["MANAGER:M1", "MANAGER:M2", "MR:MR1"], "field user + manager chain; the acting admin is not notified");
assert.ok(notices("LEAVE_CANCELLED").every((n) => /2026-10-19 to 2026-10-21/.test(n.message) && /Admin/.test(n.message)));
r = await call("admin", "POST", `/company/leave/${asId(400)}/cancel`, { reason: "again" }); assert.equal(r.status, 409); assert.match(r.body.error, /already cancelled/);
r = await call("admin", "PUT", `/company/masters/leaveCancellation/${crow._id}`, { status: "Cancelled", reason: "again" }); assert.equal(r.status, 409);
assert.equal(notices().length, nPre + 3, "no extra notices from the rejected repeats");
const ctx1 = await buildDayStatusContext(T, "2026-10", ["MR1"], []);
assert.equal(classifyDay(ctx1, "MR1", "2026-10-20").kind, "notPlanned", "cancelled leave no longer counts as leave in day-status");
// leave status report lists it as Cancelled with who/why
r = await call("admin", "GET", `/company/masters/leaveStatusReport/action/list`);
const row = (r.body.data || []).find((x: any) => x.id === String(asId(400)));
assert.ok(row && row.status === "Cancelled" && row.statusLabel === "Leave cancelled by Admin" && row.cancelReason === "Rescheduled by HQ", JSON.stringify(row));
console.log("4 leave cancellation ok");

// ═══ 5) Manager cancels nothing (no manager cancel exists) -- a manager-approved leave cancelled by admin shows; admin approves a leave via the HR endpoint; manager rejects a TP
r = await call("admin", "PATCH", `/company/leave/${asId(402)}/approve`);
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(approvalLabel(lv(402)), "Approved by Admin"); assert.equal(approvalLabel(mL3), "Approved by Admin");
assert.deepEqual(sortedTo(notices("LEAVE_APPROVED").filter((n) => n.refId === String(asId(402)))), ["MANAGER:M1", "MANAGER:M2", "MR:MR1"]);
r = await call("admin", "PUT", `/company/masters/approvalLeave/${mL2._id}`, { approvalStatus: "Rejected", reason: "Peak week" });    // legacy mirror, no sourceId
assert.equal(lv(401).status, "REJECTED"); assert.equal(approvalLabel(lv(401)), "Rejected by Admin"); assert.equal(lv(401).rejectReason, "Peak week");
console.log("5 admin leave approve/reject ok");

// ═══ 6) old records without a trail show plain "Approved" / "Rejected" / "Pending" (no "by")
assert.equal(approvalLabel({ status: "APPROVED" }), "Approved"); assert.equal(approvalLabel({ status: "REJECTED" }), "Rejected"); assert.equal(approvalLabel({ status: "SUBMITTED" }), "Pending");
assert.equal(approvalLabel({ approvalStatus: "Approved" }), "Approved"); assert.equal(approvalLabel({ status: "CANCELLED" }), "Leave cancelled");
assert.equal(approvalLabel({ status: "APPROVED", approval: { status: "Rejected", approvedBy: { role: "ADMIN" } } }), "Approved", "a stale trail that disagrees with the status is ignored");

// ═══ 6b) Round 60: the field endpoints return the decision label, date and remarks (real data from the stored trail)
{
  const dc2 = (await call("mr1", "GET", `/field/dcrs`)).body.data as any[];
  const d = (id: number) => dc2.find((x) => x.id === String(asId(id)));
  assert.equal(d(300).statusLabel, "Approved by Manager (Meera Shah)"); assert.ok(d(300).statusDate);
  assert.equal(d(301).statusLabel, "Rejected by Admin"); assert.equal(d(301).statusRemarks, "Doctor list incomplete");
  assert.equal(d(302).statusLabel, "Approved by Admin");
  const lvs = (await call("mr1", "GET", `/field/leave-applications`)).body.data as any[];
  const l = (id: number) => lvs.find((x) => x.id === String(asId(id)));
  assert.equal(l(400).statusLabel, "Leave cancelled by Admin"); assert.equal(l(400).statusRemarks, "Rescheduled by HQ"); assert.ok(l(400).statusDate && l(400).approvalHistory.length >= 2);
  assert.equal(l(401).statusLabel, "Rejected by Admin"); assert.equal(l(401).statusRemarks, "Peak week");
  assert.equal(l(402).statusLabel, "Approved by Admin");
  const tps = (await call("mr1", "GET", `/field/tour-plans`)).body.data as any[];
  assert.equal(tps[0].statusLabel, "Approved by Admin"); assert.ok(tps[0].statusDate);
  store["dcrs"].push(wrap({ _id: asId(310), tenantSlug: T, employeeCode: "MR1", visitDate: day("2026-10-15"), visitDateOnly: "2026-10-15", month: "2026-10", status: "APPROVED" }));       // older record, no trail
  const old = ((await call("mr1", "GET", `/field/dcrs`)).body.data as any[]).find((x) => x.id === String(asId(310)));
  assert.equal(old.statusLabel, "Approved"); assert.equal(old.statusRemarks, ""); store["dcrs"].pop();
  console.log("6b field endpoints carry the label ok");
}

// ═══ 6c) Round 60: manager team-leave endpoint -- per-person list + history, scoped to the manager's team
{
  store["employees"].push(emp("X1", "Outsider One", "MR", "M9"), emp("MR2", "Sneha Iyer", "MR", "M1"));
  store["leave_applications"].push(wrap({ _id: asId(420), tenantSlug: T, employeeCode: "X1", leaveType: "Casual Leave", fromDate: day("2026-10-05"), toDate: day("2026-10-05"), days: 1, status: "PENDING" }));
  let tl = await call("m1", "GET", `/manager/team-leave`);
  assert.equal(tl.status, 200, JSON.stringify(tl.body));
  const names = tl.body.data.map((x: any) => x.employeeCode).sort();
  assert.deepEqual(names, ["MR1", "MR2"], "only people below this manager; X1 (another manager's team) is not listed");
  const mr1 = tl.body.data.find((x: any) => x.employeeCode === "MR1");
  assert.equal(mr1.isDirectReport, true); assert.deepEqual(mr1.counts, { pending: 0, approved: 1, rejected: 1, cancelled: 1 }, JSON.stringify(mr1.counts));
  assert.equal(mr1.approvedDays, 1);
  const lab = (id: number) => mr1.leaves.find((x: any) => x.id === String(asId(id)));
  assert.equal(lab(400).statusLabel, "Leave cancelled by Admin"); assert.equal(lab(401).statusLabel, "Rejected by Admin"); assert.equal(lab(402).statusLabel, "Approved by Admin");
  assert.equal(lab(400).approvalHistory.map((h: any) => h.action).join(","), "Approved,Cancelled");
  assert.deepEqual(tl.body.data.find((x: any) => x.employeeCode === "MR2").leaves, [], "a team member with no leave is still listed");
  tl = await call("m1", "GET", `/manager/team-leave?employeeCode=X1`); assert.equal(tl.status, 404);
  tl = await call("m1", "GET", `/manager/team-leave?employeeCode=MR1`); assert.equal(tl.body.data.length, 1);
  tl = await call("mr1", "GET", `/manager/team-leave`); assert.equal(tl.status, 403, "a field user cannot read it");
  // the Round 59 leave notices for managers deep-link into this screen
  const mgrLeave = notices("LEAVE_CANCELLED").filter((n) => n.audience === "MANAGER");
  assert.ok(mgrLeave.length === 2 && mgrLeave.every((n) => n.link === "/manager/leave?tab=team&emp=MR1"), JSON.stringify(mgrLeave.map((n) => n.link)));
  store["employees"] = store["employees"].filter((e) => !["X1", "MR2"].includes(e.employeeCode));
  store["leave_applications"] = store["leave_applications"].filter((x) => String(x._id) !== String(asId(420)));
  console.log("6c manager team-leave ok");
}

// ═══ 6d) Round 60: completing an auto-created manager stub renames its code and re-links every report; admin bell hides per-user system notices
{
  store["employees"].push(wrap({ _id: asId(900), tenantSlug: T, employeeCode: "MGR-PENDING-001", name: "Anil Kapoor", role: "ABM", designation: "Area Business Manager", division: "Zivira", territory: "Not provided (code pending)", reportingManager: "M2", status: "ACTIVE", codePending: true, autoCreatedSource: "auto-created from Salesforce upload" }),
    emp("MR7", "Report One", "MR", "MGR-PENDING-001"), emp("MR8", "Report Two", "MR", "MGR-PENDING-001"));
  let pr = await call("admin", "PATCH", `/company/employees/M1`, { employeeCode: "M1X" });
  assert.equal(pr.status, 400); assert.match(pr.body.error, /code is pending/);                                   // a normal employee's code is never changed this way
  pr = await call("admin", "PATCH", `/company/employees/MGR-PENDING-001`, { employeeCode: "MR1" }); assert.equal(pr.status, 409);   // clash
  pr = await call("admin", "PATCH", `/company/employees/MGR-PENDING-001`, { employeeCode: "ABM-0042", designation: "Area Business Manager" });
  assert.equal(pr.status, 200, JSON.stringify(pr.body));
  const stub = store["employees"].find((e) => e._id.toString() === asId(900).toString());
  assert.equal(stub.employeeCode, "ABM-0042"); assert.equal(stub.codePending, false); assert.ok(!stub.autoCreatedSource);
  assert.equal(String(stub._id), String(asId(900)), "the internal id never changes");
  assert.equal(store["employees"].find((e) => e.employeeCode === "MR7").reportingManager, "ABM-0042"); assert.equal(store["employees"].find((e) => e.employeeCode === "MR8").reportingManager, "ABM-0042");
  assert.equal(pr.body.relinked, 2);
  assert.equal(store["employees"].find((e) => e.employeeCode === "ABM-0042").reportingManager, "M2", "its own upward link is untouched");
  const { getUpwardChain } = await import("../../src/utils/org-hierarchy.js");
  assert.deepEqual((await getUpwardChain(T, "MR7")).map((e: any) => e.employeeCode), ["ABM-0042", "M2"], "reports still resolve through the completed manager");
  // admin bell: system notices addressed to one MR / one manager are not shown; admin-audience ones are
  const an = (await call("admin", "GET", `/company/notices`)).body.data as any[];
  assert.ok(an.length > 0 && an.every((n) => !(n.postedBy === "system" && (n.audience === "MR" || n.audience === "MANAGER"))), "admin bell has no per-user system notices");
  assert.ok(an.some((n) => n.audience === "ADMIN" && n.link && n.link.startsWith("/admin/")));
  store["employees"] = store["employees"].filter((e) => !["ABM-0042", "MR7", "MR8"].includes(e.employeeCode));
  console.log("6d stub completion + admin bell ok");
}

// ═══ 7) label parity: portal copies are byte-identical to the backend helper (when the repos are present)
const here = path.resolve(import.meta.dirname, "../../src/utils/approval-label.ts");
const want = fs.readFileSync(here, "utf8");
for (const p of ["updated-zivira-admin--main/updated-zivira-admin--main", "updated-zivira-manager-portal-main/updated-zivira-manager-portal-main", "updated-filed-repo--main/updated-filed-repo--main"]) {
  const f = path.resolve(import.meta.dirname, "../../../..", p, "lib/approval-label.ts");
  if (fs.existsSync(f)) { assert.equal(fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"), want.replace(/\r\n/g, "\n"), `${p} approval-label.ts differs`); console.log(`parity ok: ${p}`); }
  else console.log(`(skipped parity: ${p}/lib/approval-label.ts not found)`);
}
console.log("R59 approval tests passed");
server.close(); process.exit(0);
