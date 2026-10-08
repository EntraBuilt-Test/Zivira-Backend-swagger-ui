// Round 59 -- approval trail for DCR, Tour Plan and Leave, shared by the admin, manager and field routes.
//
//  * pushDecision / pushCancel   record WHO acted (id, name, role ADMIN|MANAGER), when, remarks, and append to approvalHistory
//  * applyAdminDecision / applyManagerDecision   keep the two halves in step: the admin approval tabs work on the "approvalDcr / approvalTp /
//    approvalLeave" mirror rows, the manager portal works on the real DCR / TourPlan / LeaveApplication records -- a decision on one side is
//    now written to the other, with the same trail.
//  * cancelLeave                  admin cancel of an APPROVED leave (status CANCELLED, who/when/why); every reader of leave filters status APPROVED,
//                                 so cancelled days stop counting for day-status, attendance, leave reports and payroll LWP.
//  * notifyDecision               in-app Notice (type + deep link + dedupe key) for the field user, the manager chain (admin actions) or the admin portal
//                                 (manager actions); the actor is never notified of their own action.
//  * approvalLabel                the ONE label helper ("Approved by Admin", "Approved by Manager (Name)", "Rejected by ...", "Leave cancelled by ...", "Pending").
//                                 The three portals carry an identical copy in lib/approval-label.ts (parity is covered by scripts/r59-tests).
import { DcrModel } from "../models/dcr.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { NoticeModel } from "../models/notice.model.js";
import { CompOffModel } from "../models/comp-off.model.js";
import { UserModel } from "../models/user.model.js";
import { ApprovalAuditLogModel } from "../models/approval-audit-log.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { HttpError } from "../http/errors.js";
import { notifyEmployeeEmail } from "./notify.js";
import { approvalLabel as _label } from "./approval-label.js";
void _label;

export type ApprovalKind = "DCR" | "TP" | "LEAVE";
export type Actor = { id: string; name: string; role: "ADMIN" | "MANAGER" };
export type Action = "Approved" | "Rejected";

// ───────────────────────── label helper (src/utils/approval-label.ts; byte-identical copies live in each portal at lib/approval-label.ts)
export { approvalLabel, approvalDate } from "./approval-label.js";

// ───────────────────────── actors
export async function adminActor(req: any): Promise<Actor> {
  const id = String(req?.auth?.sub ?? "admin");
  try {
    const u = (await UserModel.findById(id).select("displayName username").lean()) as any;
    return { id, name: (u && (u.displayName || u.username)) || "Admin", role: "ADMIN" };
  } catch { return { id, name: "Admin", role: "ADMIN" }; }
}
export const managerActor = (mgr: { employeeCode: string; name?: string | null }): Actor => ({ id: mgr.employeeCode, name: mgr.name || mgr.employeeCode, role: "MANAGER" });

// ───────────────────────── in-memory record helpers (work on mongoose docs and plain objects)
const sameDecision = (rec: any, action: Action, actor: Actor) => {
  const h = rec.approvalHistory;
  const last = Array.isArray(h) && h.length ? h[h.length - 1] : null;
  return !!last && last.action === action && last.byId === actor.id && last.byRole === actor.role;
};
// Returns false (and changes nothing) when the very same actor repeats the very same decision on a record already in that state.
export function pushDecision(rec: any, action: Action, actor: Actor, remarks = "", now = new Date()): boolean {
  if (rec.approval?.status === action && sameDecision(rec, action, actor)) return false;
  rec.approval = { status: action, approvedBy: { id: actor.id, name: actor.name, role: actor.role }, approvedAt: now, remarks };
  if (!Array.isArray(rec.approvalHistory)) rec.approvalHistory = [];
  rec.approvalHistory.push({ action, byId: actor.id, byName: actor.name, byRole: actor.role, at: now, remarks });
  return true;
}
const decisionSet = (action: Action, actor: Actor, remarks: string, now: Date) => ({
  approval: { status: action, approvedBy: { id: actor.id, name: actor.name, role: actor.role }, approvedAt: now, remarks },
  entry: { action, byId: actor.id, byName: actor.name, byRole: actor.role, at: now, remarks }
});

// ───────────────────────── employees / hierarchy
export async function managerChain(tenantSlug: string, employeeCode: string, depth = 8): Promise<any[]> {
  const out: any[] = [];
  const seen = new Set<string>([employeeCode]);
  let cur: any = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
  for (let i = 0; i < depth && cur?.reportingManager && !seen.has(cur.reportingManager); i++) {
    seen.add(cur.reportingManager);
    const m: any = await EmployeeModel.findOne({ tenantSlug, employeeCode: cur.reportingManager }).lean();
    if (!m) break;
    out.push(m); cur = m;
  }
  return out;
}

// ───────────────────────── notifications
const LINKS = {
  ADMIN: { DCR: "/admin/workspace/division-dashboard/division-navigation-tabs/activities/approvals/dcr", TP: "/admin/workspace/division-dashboard/division-navigation-tabs/activities/approvals/tp", LEAVE: "/admin/workspace/division-dashboard/division-navigation-tabs/activities/approvals/leave" },
  MANAGER: { DCR: "/manager/dcrs", TP: "/manager/tour-plans", LEAVE: "/manager/leave" },
  MR: { DCR: "/field/dcr", TP: "/field/tour-plan", LEAVE: "/field/leave" }
} as const;
const KIND_NAME: Record<ApprovalKind, string> = { DCR: "DCR", TP: "Tour Plan", LEAVE: "Leave" };
const fmtDate = (d: any) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x.toISOString().slice(0, 10) : ""; };
const actorText = (a: Actor) => (a.role === "ADMIN" ? "Admin" : `Manager ${a.name}`);

async function createNotice(p: { tenantSlug: string; audience: "MR" | "MANAGER" | "ADMIN"; target: string | null; title: string; message: string; type: string; kind: ApprovalKind; refId: string; dedupeKey: string }) {
  try {
    const dupe = await NoticeModel.findOne({ tenantSlug: p.tenantSlug, dedupeKey: p.dedupeKey }).lean();
    if (dupe) return false;
    await NoticeModel.create({
      tenantSlug: p.tenantSlug, title: p.title, message: p.message, audience: p.audience, priority: "NORMAL", postedBy: "system",
      targetEmployeeCode: p.target, type: p.type, refKind: p.kind, refId: p.refId, link: LINKS[p.audience === "MR" ? "MR" : p.audience][p.kind], dedupeKey: p.dedupeKey
    });
    return true;
  } catch (err) { console.error("[approval-trail] notice failed:", err); return false; }
}

export type NotifyArgs = { tenantSlug: string; kind: ApprovalKind; refId: string; employeeCode: string; employeeName: string; action: Action | "Cancelled"; actor: Actor; detail: string; remarks?: string; version: number };
// Who is told: the field user whose record it is; for an ADMIN action also the manager chain; for a MANAGER action also the admin portal.
// The actor never gets a notification for their own action; the dedupe key (record + action + recipient + decision number) makes repeats harmless.
export async function notifyDecision(a: NotifyArgs) {
  const name = KIND_NAME[a.kind];
  const verb = a.action === "Cancelled" ? "cancelled" : a.action.toLowerCase();
  const type = a.action === "Cancelled" ? "LEAVE_CANCELLED" : `${a.kind}_${a.action.toUpperCase()}`;
  const tail = `${a.remarks ? ` Remarks: ${a.remarks}` : ""}`;
  const titleOwn = a.action === "Cancelled" ? `Your leave was cancelled by ${actorText(a.actor)}` : `Your ${name} was ${verb} by ${actorText(a.actor)}`;
  const base = { tenantSlug: a.tenantSlug, type, kind: a.kind, refId: a.refId };
  const key = (who: string) => `${a.kind}:${a.refId}:${a.action}:${who}:${a.version}`;
  const sent: string[] = [];
  if (!(a.actor.role === "MANAGER" && a.actor.id === a.employeeCode)) {
    if (await createNotice({ ...base, audience: "MR", target: a.employeeCode, title: titleOwn, message: `${actorText(a.actor)} ${verb} your ${name}${a.detail ? ` (${a.detail})` : ""}.${tail}`, dedupeKey: key(`MR-${a.employeeCode}`) })) {
      sent.push(`MR:${a.employeeCode}`);
      try {   // keep the e-mail the field user already received for manager decisions (best effort, same channel as before)
        const e: any = await EmployeeModel.findOne({ tenantSlug: a.tenantSlug, employeeCode: a.employeeCode }).lean();
        if (e?.email) await notifyEmployeeEmail({ toEmail: e.email, toName: e.name, subject: titleOwn, message: `${actorText(a.actor)} ${verb} your ${name}${a.detail ? ` (${a.detail})` : ""}.${tail}` });
      } catch { /* e-mail is best effort */ }
    }
  }
  const about = `${a.employeeName} (${a.employeeCode})`;
  if (a.actor.role === "ADMIN") {
    for (const m of await managerChain(a.tenantSlug, a.employeeCode)) {
      if (m.employeeCode === a.actor.id) continue;
      if (await createNotice({ ...base, audience: "MANAGER", target: m.employeeCode, title: `${name} ${verb} by Admin`, message: `Admin ${verb} ${about}'s ${name}${a.detail ? ` (${a.detail})` : ""}.${tail}`, dedupeKey: key(`MGR-${m.employeeCode}`) })) sent.push(`MANAGER:${m.employeeCode}`);
    }
  } else {
    if (await createNotice({ ...base, audience: "ADMIN", target: null, title: `${name} ${verb} by Manager ${a.actor.name}`, message: `Manager ${a.actor.name} ${verb} ${about}'s ${name}${a.detail ? ` (${a.detail})` : ""}.${tail}`, dedupeKey: key("ADMIN") })) sent.push("ADMIN");
  }
  return sent;
}

// ───────────────────────── mirror rows (admin approval tabs) <-> real records
const MIRROR_KEY: Record<ApprovalKind, string> = { DCR: "approvalDcr", TP: "approvalTp", LEAVE: "approvalLeave" };
const isoDay = (d: any) => fmtDate(d);

async function findMirror(tenantSlug: string, kind: ApprovalKind, src: any, emp: any) {
  const M = getMasterModel(MIRROR_KEY[kind]);
  const byId = (await M.findOne({ tenantSlug, sourceId: String(src._id) }).lean()) as any;
  if (byId) return byId;
  if (kind === "TP") return (await M.findOne({ tenantSlug, tpId: src.tpId }).lean()) as any;
  if (kind === "LEAVE") return (await M.findOne({ tenantSlug, fieldForceName: emp?.name, fromDate: isoDay(src.fromDate) }).lean()) as any;
  return (await M.findOne({ tenantSlug, sfName: emp?.name, activityDate: src.visitDate }).lean()) as any;       // DCR: employee + visit date
}

async function writeMirror(tenantSlug: string, kind: ApprovalKind, mirror: any, action: Action | "Cancelled", actor: Actor, remarks: string, now: Date) {
  const M = getMasterModel(MIRROR_KEY[kind]);
  const { approval, entry } = decisionSet(action === "Cancelled" ? "Rejected" : action, actor, remarks, now);
  const set: Record<string, unknown> = action === "Cancelled"
    ? { approvalStatus: "Cancelled", cancelledBy: { id: actor.id, name: actor.name, role: actor.role }, cancelledAt: now, cancelReason: remarks }
    : { approvalStatus: action, approval };
  entry.action = action as any;
  await M.updateOne({ _id: mirror._id }, { $set: set, $push: { approvalHistory: entry } });
  try {
    await ApprovalAuditLogModel.create({
      tenantSlug, masterKey: MIRROR_KEY[kind], recordId: String(mirror._id), sfName: mirror.sfName || mirror.fieldForceName || "", activityDate: mirror.activityDate || null,
      action, reason: remarks, actedBy: actor.name, actedById: actor.id, actedByRole: actor.role, actedAt: now
    });
  } catch (err) { console.error("[approval-trail] audit log failed:", err); }
}

// Keeps the admin "Leave Cancellation (After Approval)" list in step: one Active row per approved leave.
async function upsertCancellationRow(tenantSlug: string, leave: any, emp: any, approvedByName: string) {
  try {
    const C = getMasterModel("leaveCancellation");
    const existing = (await C.findOne({ tenantSlug, fieldForceName: emp?.name, fromDate: leave.fromDate }).lean()) as any;
    const doc = { tenantSlug, fieldForceName: emp?.name, leaveAppliedDate: leave.createdAt, fromDate: leave.fromDate, toDate: leave.toDate, noOfDays: leave.days, approvedBy: approvedByName, status: "Active", sourceId: String(leave._id) };
    if (existing) await C.updateOne({ _id: existing._id }, { $set: doc }); else await C.create(doc);
  } catch (err) { console.error("[approval-trail] cancellation row failed:", err); }
}

const detailOf = (kind: ApprovalKind, r: any) =>
  kind === "LEAVE" ? `${fmtDate(r.fromDate)}${fmtDate(r.toDate) !== fmtDate(r.fromDate) ? ` to ${fmtDate(r.toDate)}` : ""}, ${r.days} day(s), ${r.leaveType}`
  : kind === "TP" ? `${r.tpId} for ${r.month}` : `visit on ${fmtDate(r.visitDate)}`;

const statusFor = (kind: ApprovalKind, action: Action, actor: Actor) =>
  action === "Rejected" ? "REJECTED" : kind === "DCR" && actor.role === "MANAGER" ? "MANAGER_APPROVED" : "APPROVED";

// A decision taken by a MANAGER on a real record (the route has already validated team/assignment and changed status): record the trail on the
// real record, mirror it to the admin row, notify.
export async function afterManagerDecision(p: { tenantSlug: string; kind: ApprovalKind; rec: any; action: Action; actor: Actor; remarks?: string }) {
  const { tenantSlug, kind, rec, action, actor } = p; const remarks = p.remarks || ""; const now = new Date();
  const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode: rec.employeeCode }).lean()) as any;
  const Model: any = kind === "DCR" ? DcrModel : kind === "TP" ? TourPlanModel : LeaveApplicationModel;
  const fresh = (await Model.findOne({ _id: rec._id }).lean()) as any;
  if (fresh && fresh.approval?.status === action && sameDecision(fresh, action, actor)) return { changed: false };
  const { approval, entry } = decisionSet(action, actor, remarks, now);
  await Model.updateOne({ _id: rec._id }, { $set: { approval }, $push: { approvalHistory: entry } });
  const mirror = await findMirror(tenantSlug, kind, rec, emp);
  if (mirror) await writeMirror(tenantSlug, kind, mirror, action, actor, remarks, now);
  if (kind === "LEAVE" && action === "Approved") await upsertCancellationRow(tenantSlug, rec, emp, actor.name);
  const version = ((fresh?.approvalHistory?.length) ?? 0) + 1;
  await notifyDecision({ tenantSlug, kind, refId: String(rec._id), employeeCode: rec.employeeCode, employeeName: emp?.name || rec.employeeCode, action, actor, detail: detailOf(kind, rec), remarks, version });
  return { changed: true };
}

// A decision taken by ADMIN on a mirror row (generic masters approve/reject, DCR bulk, HR leave endpoints call the real-record variant below).
export async function afterAdminMirrorDecision(p: { tenantSlug: string; masterKey: string; mirror: any; action: Action; actor: Actor; remarks?: string }) {
  const kind = (Object.keys(MIRROR_KEY) as ApprovalKind[]).find((k) => MIRROR_KEY[k] === p.masterKey);
  if (!kind) return { changed: false };
  const { tenantSlug, mirror, action, actor } = p; const remarks = p.remarks || ""; const now = new Date();
  const M = getMasterModel(p.masterKey);
  const fresh = (await M.findOne({ _id: mirror._id }).lean()) as any;
  const hist: any[] = Array.isArray(fresh?.approvalHistory) ? fresh.approvalHistory : [];
  const last = hist[hist.length - 1];
  const repeat = !!last && last.action === action && last.byId === actor.id && last.byRole === actor.role && fresh?.approval?.status === action;
  // the status itself was already written by the caller; here we add the trail
  if (!repeat) {
    const { approval, entry } = decisionSet(action, actor, remarks, now);
    await M.updateOne({ _id: mirror._id }, { $set: { approval }, $push: { approvalHistory: entry } });   // (the ApprovalAuditLog row is written by the caller)
  }
  const sources = await findSources(tenantSlug, kind, mirror);
  let changedAny = false;
  for (const s of sources) {
    const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode: s.employeeCode }).lean()) as any;
    const r = await applyAdminToSource(tenantSlug, kind, s, action, actor, remarks, now, emp, false);
    if (r.changed) changedAny = true;
  }
  // one notification set per mirror row (a DCR date can hold several visits), skipped when this is a pure repeat
  const empName = mirror.sfName || mirror.fieldForceName;
  const emp = sources.length ? ((await EmployeeModel.findOne({ tenantSlug, employeeCode: sources[0].employeeCode }).lean()) as any) : empName ? ((await EmployeeModel.findOne({ tenantSlug, name: empName }).lean()) as any) : null;
  if (emp && (!repeat || changedAny)) {
    const detail = kind === "DCR" ? `visits on ${fmtDate(mirror.activityDate)}` : kind === "TP" ? `${mirror.tpId} for ${mirror.month}` : `${fmtDate(mirror.fromDate)} to ${fmtDate(mirror.toDate)}, ${mirror.leaveDays} day(s), ${mirror.leaveType}`;
    await notifyDecision({ tenantSlug, kind, refId: String(mirror._id), employeeCode: emp.employeeCode, employeeName: emp.name, action, actor, detail, remarks, version: hist.length + (repeat ? 0 : 1) });
  }
  return { changed: !repeat || changedAny, sources: sources.length };
}

async function findSources(tenantSlug: string, kind: ApprovalKind, mirror: any): Promise<any[]> {
  if (mirror.sourceId) {
    const Model: any = kind === "DCR" ? DcrModel : kind === "TP" ? TourPlanModel : LeaveApplicationModel;
    const s = (await Model.findOne({ _id: mirror.sourceId, tenantSlug }).lean()) as any;
    return s ? [s] : [];
  }
  const name = mirror.sfName || mirror.fieldForceName;
  const emp = name ? ((await EmployeeModel.findOne({ tenantSlug, name }).lean()) as any) : null;
  if (!emp) return [];
  if (kind === "TP") { const t = (await TourPlanModel.findOne({ tenantSlug, tpId: mirror.tpId }).lean()) as any; return t ? [t] : []; }
  if (kind === "LEAVE") return (await LeaveApplicationModel.find({ tenantSlug, employeeCode: emp.employeeCode, status: { $in: ["PENDING", "APPROVED", "REJECTED"] } }).lean() as any[]).filter((l) => fmtDate(l.fromDate) === fmtDate(mirror.fromDate));
  const day = fmtDate(mirror.activityDate);          // DCR: every visit that day for that rep (the admin approves the date)
  return day ? ((await DcrModel.find({ tenantSlug, employeeCode: emp.employeeCode, visitDateOnly: day }).lean()) as any[]) : [];
}

async function applyAdminToSource(tenantSlug: string, kind: ApprovalKind, src: any, action: Action, actor: Actor, remarks: string, now: Date, emp: any, notify = true) {
  const status = String(src.status).toUpperCase();
  if (kind === "TP" && status === "VOIDED") return { changed: false };
  if (kind === "LEAVE" && status === "CANCELLED") return { changed: false };
  const target = statusFor(kind, action, actor);
  const same = status === target && src.approval?.status === action && sameDecision(src, action, actor);
  if (same) return { changed: false };
  const Model: any = kind === "DCR" ? DcrModel : kind === "TP" ? TourPlanModel : LeaveApplicationModel;
  const { approval, entry } = decisionSet(action, actor, remarks, now);
  const set: Record<string, unknown> = { status: target, approval };
  if (kind !== "DCR") { set.approvedBy = actor.id; set.approvedAt = now; }
  if (action === "Rejected") { if (kind === "TP") set.rejectReason = remarks; if (kind === "LEAVE") set.rejectReason = remarks; }
  await Model.updateOne({ _id: src._id }, { $set: set, $push: { approvalHistory: entry } });
  if (kind === "LEAVE") {
    if (action === "Approved") await upsertCancellationRow(tenantSlug, src, emp, actor.name);
    if (action === "Rejected" && src.isCompOff && src.compOffId) await CompOffModel.updateOne({ _id: src.compOffId, tenantSlug }, { $set: { status: "AVAILABLE", usedInLeaveId: null } });
  }
  if (notify) await notifyDecision({ tenantSlug, kind, refId: String(src._id), employeeCode: src.employeeCode, employeeName: emp?.name || src.employeeCode, action, actor, detail: detailOf(kind, src), remarks, version: (Array.isArray(src.approvalHistory) ? src.approvalHistory.length : 0) + 1 });
  return { changed: true };
}

// Admin acting on a real LeaveApplication directly (HR portal approve/reject endpoints): sets the status through the same path and mirrors it.
export async function adminDecideLeave(tenantSlug: string, leaveId: string, action: Action, actor: Actor, remarks = "") {
  const leave = (await LeaveApplicationModel.findOne({ _id: leaveId, tenantSlug }).lean()) as any;
  if (!leave) throw new HttpError(404, "Leave application not found");
  if (String(leave.status).toUpperCase() === "CANCELLED") throw new HttpError(409, "This leave is already cancelled");
  const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode: leave.employeeCode }).lean()) as any;
  const now = new Date();
  const r = await applyAdminToSource(tenantSlug, "LEAVE", leave, action, actor, remarks, now, emp);
  const mirror = await findMirror(tenantSlug, "LEAVE", leave, emp);
  if (mirror && r.changed) await writeMirror(tenantSlug, "LEAVE", mirror, action, actor, remarks, now);
  return (await LeaveApplicationModel.findOne({ _id: leaveId, tenantSlug }).lean()) as any;
}

// ───────────────────────── leave cancellation (after approval)
export async function cancelLeave(tenantSlug: string, leaveId: string, actor: Actor, reason: string) {
  const why = (reason || "").trim();
  if (!why) throw new HttpError(400, "A reason is required to cancel an approved leave");
  const leave = (await LeaveApplicationModel.findOne({ _id: leaveId, tenantSlug }).lean()) as any;
  if (!leave) throw new HttpError(404, "Leave application not found");
  const st = String(leave.status).toUpperCase();
  if (st === "CANCELLED") throw new HttpError(409, "This leave is already cancelled");
  if (st !== "APPROVED") throw new HttpError(400, `Only an approved leave can be cancelled (this one is ${st.toLowerCase()})`);
  const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode: leave.employeeCode }).lean()) as any;
  const now = new Date();
  const entry = { action: "Cancelled", byId: actor.id, byName: actor.name, byRole: actor.role, at: now, remarks: why };
  await LeaveApplicationModel.updateOne({ _id: leave._id }, { $set: { status: "CANCELLED", cancelledBy: { id: actor.id, name: actor.name, role: actor.role }, cancelledAt: now, cancelReason: why }, $push: { approvalHistory: entry } });
  if (leave.isCompOff && leave.compOffId) await CompOffModel.updateOne({ _id: leave.compOffId, tenantSlug }, { $set: { status: "AVAILABLE", usedInLeaveId: null } });
  const mirror = await findMirror(tenantSlug, "LEAVE", leave, emp);
  if (mirror) await writeMirror(tenantSlug, "LEAVE", mirror, "Cancelled", actor, why, now);
  try {
    const C = getMasterModel("leaveCancellation");
    const row = (await C.findOne({ tenantSlug, fieldForceName: emp?.name, fromDate: leave.fromDate }).lean()) as any;
    if (row) await C.updateOne({ _id: row._id }, { $set: { status: "Cancelled", cancelledBy: actor.name, cancelledByRole: actor.role, cancelledAt: now, cancelReason: why } });
  } catch (err) { console.error("[approval-trail] cancellation row update failed:", err); }
  await notifyDecision({ tenantSlug, kind: "LEAVE", refId: String(leave._id), employeeCode: leave.employeeCode, employeeName: emp?.name || leave.employeeCode, action: "Cancelled", actor, detail: detailOf("LEAVE", leave), remarks: why, version: (Array.isArray(leave.approvalHistory) ? leave.approvalHistory.length : 0) + 1 });
  return (await LeaveApplicationModel.findOne({ _id: leaveId, tenantSlug }).lean()) as any;
}

// Cancelling from the admin "Leave Cancellation (After Approval)" master row (status -> Cancelled).
export async function cancelLeaveFromMasterRow(tenantSlug: string, row: any, actor: Actor, reason: string) {
  let leaveId = row.sourceId ? String(row.sourceId) : "";
  if (!leaveId) {
    const emp = (await EmployeeModel.findOne({ tenantSlug, name: row.fieldForceName }).lean()) as any;
    if (emp) {
      const cands = (await LeaveApplicationModel.find({ tenantSlug, employeeCode: emp.employeeCode, status: "APPROVED" }).lean()) as any[];
      const hit = cands.find((l) => fmtDate(l.fromDate) === fmtDate(row.fromDate));
      if (hit) leaveId = String(hit._id);
    }
  }
  if (!leaveId) throw new HttpError(404, "No approved leave found for this row (it may already be cancelled or removed)");
  return cancelLeave(tenantSlug, leaveId, actor, reason);
}
