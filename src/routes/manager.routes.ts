import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { requireAuth } from "../http/auth.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { UserModel } from "../models/user.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { AttendanceModel } from "../models/attendance.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { audit } from "../utils/audit.js";
import { getMasterModel } from "../models/master-record.model.js";
import { serializeDocument } from "../utils/serialize.js";
import { createTourPlanWithRetry } from "../utils/tour-plan-id.js";
import { notifyManager, notifyFieldRep } from "../utils/notify.js";
import { afterManagerDecision, managerActor, decisionView } from "../utils/approval-trail.js";
import { getAllDescendants } from "../utils/org-hierarchy.js";
import { enrichTourPlansWithNames } from "../utils/enrich-tour-plans.js";
import { enrichWithEmployeeNames } from "../utils/enrich-employee-names.js";
import { computeComplianceRows } from "../utils/compliance.js";
import { syncPayrollStatuses } from "../utils/payroll.js";
import { PayrollStatusModel } from "../models/payroll-status.model.js";
import { computeRepAnalysisRows } from "../utils/rep-manager-analysis.js";
import { CampaignVisitModel } from "../models/campaign-visit.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { infoDeliveryRouter, announcementsFor } from "./info.routes.js";

export const managerRouter = Router();
managerRouter.use(requireAuth);
// Round 48 Part D -- same feed + Talk to Us for the signed-in manager.
managerRouter.use("/info-center", infoDeliveryRouter);

// PRD 8.1 — Role Architecture: Manager (ABM/RBM) — portal field stays
// FIELD_FORCE, only the role differs. NBH kept for backward compatibility
// with existing seed data / the org hierarchy above ABM.
const MANAGER_ROLES = ["ABM", "RBM", "NBH", "ZBM", "BH"];

const managedEmployeeSchema = z.object({
  name: z.string().min(2),
  employeeCode: z.string().min(2).transform((value) => value.toUpperCase()),
  designation: z.string().min(2).default("Medical Representative"),
  division: z.string().min(2),
  territory: z.string().min(2),
  role: z.enum(["MR", "SR_MR"]).default("MR"),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  password: z.string().min(6).default("zivira123")
});

async function getManagerProfile(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user?.tenantSlug) throw new HttpError(404, "Manager not found");
  // IMPORTANT (PRD 8.1 / Section 14 issue #12): Manager user records must
  // have role=ABM or RBM but portal MUST remain FIELD_FORCE. Never change
  // the portal field to ADMIN — only the role differs from an MR.
  if (user.portal !== "FIELD_FORCE" || !MANAGER_ROLES.includes(user.role)) {
    throw new HttpError(403, "Manager access required");
  }
  const emp = await EmployeeModel.findOne({ tenantSlug: user.tenantSlug, employeeCode: user.username.toUpperCase() });
  if (!emp) throw new HttpError(404, "Employee profile not found");
  return emp;
}

// Item 1 — "if the manager do any changes for the respected field repo, it
// must send a notification." Every manager action below that mutates one
// specific field rep's own record (DCR/Tour Plan/Expense Claim
// approve/reject/void/reassign) calls this so the field rep sees it via
// GET /field/notices (and gets a best-effort email once one is on file).
// Looks the employee up fresh so we always have their current email/name
// rather than threading it through every caller.
async function notifyFieldRepByCode(tenantSlug: string, employeeCode: string, title: string, message: string) {
  try {
    const emp = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    await notifyFieldRep({
      tenantSlug,
      employeeCode,
      employeeEmail: emp?.email,
      employeeName: emp?.name,
      title,
      message
    });
  } catch (err) {
    console.error("[Notify] Failed to notify field rep:", err);
  }
}

// GET /manager/notices — Item 3: real notifications for the Manager
// portal. Tenant-wide broadcasts ("ALL" — Admin master changes), plus
// notices targeted specifically at this manager (audience "MANAGER" +
// targetEmployeeCode === own employeeCode — created by notifyManager()
// whenever another manager voids/reassigns one of this manager's Tour
// Plans). `since` supports polling, same pattern as GET /company/activity
// and GET /field/notices.
managerRouter.get("/notices", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { NoticeModel } = await import("../models/notice.model.js");
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  const filter: Record<string, unknown> = {
    tenantSlug: mgr.tenantSlug,
    $or: [
      { audience: "ALL" },
      { audience: "MANAGER", targetEmployeeCode: mgr.employeeCode }
    ]
  };
  if (since && !Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
  const notices = await NoticeModel.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json({ data: notices.map(serializeDocument) });
}));

// GET /manager/circulars + /manager/manuals -- items 4 and 6 (post-launch
// robustness round). Unlike field reps (who already have a real Manuals
// screen -- GET /field/manuals), managers had NEITHER circulars nor
// manuals anywhere, so both are added here, same real
// fileUploadDesignationwise/userManualUpload masters and download shape
// as the field-rep routes.
managerRouter.get("/circulars", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { getMasterModel } = await import("../models/master-record.model.js");
  const circulars = await getMasterModel("fileUploadDesignationwise").find({ tenantSlug: mgr.tenantSlug }).sort({ createdAt: -1 }).lean();
  const mine = (circulars as any[]).filter((r) => {
    const designations = String(r.designation ?? "").split(",").map((d) => d.trim()).filter(Boolean);
    return designations.length === 0 || designations.includes("All") || designations.includes(mgr.designation);
  });
  res.json({ data: mine.map((r: any) => ({ id: String(r._id), subject: r.subject ?? "", fileName: r.fileName ?? "", uploadedOn: r.uploadedOn ?? r.createdAt })) });
}));

managerRouter.get("/circulars/:id/download", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { getMasterModel } = await import("../models/master-record.model.js");
  const Model = getMasterModel("fileUploadDesignationwise");
  const row = (await Model.findOne({ _id: req.params.id, tenantSlug: mgr.tenantSlug }).lean()) as Record<string, unknown> | null;
  if (!row || !row.fileData) throw new HttpError(404, "File not found");
  const buffer = Buffer.from(row.fileData as string, "base64");
  res.setHeader("Content-Type", (row.mimeType as string) || "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename=\"" + encodeURIComponent(String(row.fileName ?? "download")) + "\"");
  res.send(buffer);
}));

managerRouter.get("/manuals", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { getMasterModel } = await import("../models/master-record.model.js");
  const manuals = await getMasterModel("userManualUpload").find({ tenantSlug: mgr.tenantSlug }).sort({ createdAt: -1 }).lean();
  res.json({ data: (manuals as any[]).map((r: any) => ({ id: String(r._id), subject: r.subject ?? "", fileName: r.fileName ?? "", uploadedOn: r.uploadedOn ?? r.createdAt })) });
}));

managerRouter.get("/manuals/:id/download", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { getMasterModel } = await import("../models/master-record.model.js");
  const Model = getMasterModel("userManualUpload");
  const row = (await Model.findOne({ _id: req.params.id, tenantSlug: mgr.tenantSlug }).lean()) as Record<string, unknown> | null;
  if (!row || !row.fileData) throw new HttpError(404, "File not found");
  const buffer = Buffer.from(row.fileData as string, "base64");
  res.setHeader("Content-Type", (row.mimeType as string) || "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename=\"" + encodeURIComponent(String(row.fileName ?? "download")) + "\"");
  res.send(buffer);
}));

// GET /manager/announcements — same real admin-settings feed as
// GET /field/announcements (item 12, post-launch robustness round); see
// that route's comment for why this exists.
managerRouter.get("/announcements", asyncHandler(async (req, res) => { await getManagerProfile(req.auth!.sub); res.setHeader("Cache-Control", "no-store"); res.json({ data: await announcementsFor(req) }); }));

// GET /manager/team — list of employees reporting to this manager
// Request E, item 1 — every other active manager in the tenant, for the
// Tour Plan "Reassign" modal's manager picker (so the caller selects a real
// manager instead of typing free text that the backend then has to guess
// at). Read-only, additive.
managerRouter.get("/managers", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const managers = await EmployeeModel.find({
    tenantSlug: mgr.tenantSlug,
    role: { $in: MANAGER_ROLES },
    status: "ACTIVE",
    employeeCode: { $ne: mgr.employeeCode }
  }).select("employeeCode name designation").sort({ name: 1 });
  res.json({ data: managers.map(m => ({ employeeCode: m.employeeCode, name: m.name, designation: m.designation })) });
}));

managerRouter.get("/team", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find({
    tenantSlug: mgr.tenantSlug,
    reportingManager: mgr.employeeCode,
    status: "ACTIVE"
  }).sort({ name: 1 });
  res.json({ data: team.map(serializeDocument) });
}));

managerRouter.post("/team", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const body = managedEmployeeSchema.parse(req.body);
  const employee = await EmployeeModel.create({
    ...body,
    tenantSlug: mgr.tenantSlug,
    reportingManager: mgr.employeeCode
  });

  await UserModel.updateOne(
    { username: body.employeeCode.toLowerCase(), portal: "FIELD_FORCE" },
    {
      username: body.employeeCode.toLowerCase(),
      passwordHash: await bcrypt.hash(body.password, 10),
      displayName: body.name,
      role: "MR",
      portal: "FIELD_FORCE",
      tenantSlug: mgr.tenantSlug,
      active: body.status === "ACTIVE"
    },
    { upsert: true }
  );

  // Request C, item 3 — a brand-new MR previously landed with zero doctors
  // (FieldRepo's doctor list is filtered purely by mappedEmployeeCode, so a
  // fresh employeeCode always started empty). Auto-create one starter
  // doctor mapped specifically to this new MR, in the same territory they
  // were just given, so the new MR portal has a doctor to work with from
  // day one. Additive only — never touches any other MR's doctors.
  await DoctorModel.create({
    tenantSlug: mgr.tenantSlug,
    name: `Dr. ${body.territory} General Physician`,
    specialty: "General Physician",
    category: "C",
    state: mgr.territory || body.territory,
    city: body.territory,
    territory: body.territory,
    mappedEmployeeCode: employee.employeeCode,
    status: "ACTIVE"
  });

  await audit("MANAGER_FIELD_EMPLOYEE_CREATED", "Employee", String(employee._id), {
    tenantSlug: mgr.tenantSlug,
    managerCode: mgr.employeeCode,
    employeeCode: employee.employeeCode
  });

  res.status(201).json({ data: { ...serializeDocument(employee), demoPassword: body.password } });
}));

// Request — "add a punch in and punch out time Header in the manager
// portal inside the team dcr, once the MR punch in and punch out it must
// be fallen through the Team DCRs." Joins each DCR row to that same MR's
// daily Attendance record (POST /field/attendance/check-in|check-out) by
// employeeCode + calendar day, so the Team DCRs table can show the MR's
// punch-in/punch-out time alongside their DCR for that day. Best-effort —
// a DCR with no matching Attendance row for that day just shows "—".
async function attachPunchTimes(tenantSlug: string, codes: string[], serializedDcrs: Record<string, unknown>[]) {
  if (!codes.length || !serializedDcrs.length) return serializedDcrs;

  const dateKeys = new Set<string>();
  for (const dcr of serializedDcrs) {
    const key = dcr.visitDateOnly as string | undefined;
    if (key) dateKeys.add(key);
  }

  const attendanceRows = await AttendanceModel.find({
    tenantSlug,
    employeeCode: { $in: codes }
  }).lean();

  // Key attendance rows by "employeeCode:YYYY-MM-DD" (UTC day) so it lines
  // up with DcrModel's server-derived visitDateOnly.
  const byKey = new Map<string, { checkInAt?: Date | null; checkOutAt?: Date | null }>();
  for (const row of attendanceRows) {
    const d = row.attendanceDate as Date;
    const dateOnly = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    byKey.set(`${row.employeeCode}:${dateOnly}`, { checkInAt: row.checkInAt, checkOutAt: row.checkOutAt });
  }

  function formatTime(d?: Date | null) {
    if (!d) return null;
    return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  return serializedDcrs.map((dcr) => {
    const key = `${dcr.employeeCode}:${dcr.visitDateOnly}`;
    const match = byKey.get(key);
    return {
      ...dcr,
      punchInTime: formatTime(match?.checkInAt),
      punchOutTime: formatTime(match?.checkOutAt)
    };
  });
}

// GET /manager/dcrs — all team DCRs (newest first)
managerRouter.get("/dcrs", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode });
  const codes = team.map(e => e.employeeCode);
  const dcrs = await DcrModel.find({
    tenantSlug: mgr.tenantSlug,
    employeeCode: { $in: codes }
  }).sort({ createdAt: -1 }).limit(100).populate("doctorId");
  const serialized = dcrs.map(serializeDocument);
  const withNames = await enrichWithEmployeeNames(mgr.tenantSlug, serialized, ["employeeCode", "managerApprovedBy"]);
  res.json({ data: await attachPunchTimes(mgr.tenantSlug, codes, withNames) });
}));

// DELETE /manager/dcrs/:id -- manager equivalent of the field DCR delete.
// Scoped to this manager's own team. Same safety rule: SUBMITTED/REJECTED
// only -- an already-approved DCR is blocked. Same CampaignVisitModel
// revert + approvalDcr mirror cleanup as the field endpoint.
managerRouter.delete("/dcrs/:id", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const dcr = await DcrModel.findById(req.params.id);
  if (!dcr || dcr.tenantSlug !== mgr.tenantSlug) throw new HttpError(404, "DCR not found");
  const inTeam = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, employeeCode: dcr.employeeCode });
  if (!inTeam) throw new HttpError(403, "This DCR does not belong to your team");
  if (dcr.status !== "SUBMITTED" && dcr.status !== "REJECTED") {
    throw new HttpError(400, `This DCR is already ${dcr.status.replace(/_/g, " ").toLowerCase()} and can't be deleted.`);
  }
  const dcrId = String(dcr._id);
  await DcrModel.deleteOne({ _id: dcr._id });
  try {
    await CampaignVisitModel.updateMany({ tenantSlug: mgr.tenantSlug, dcrId }, { $set: { status: "Planned" }, $unset: { dcrId: "" } });
  } catch (err) {
    console.error("Failed to revert campaign visit on DCR delete:", err);
  }
  try {
    const ApprovalDcrModel = getMasterModel("approvalDcr");
    await ApprovalDcrModel.deleteMany({ tenantSlug: mgr.tenantSlug, sfName: inTeam.name, activityDate: dcr.visitDate });
  } catch (err) {
    console.error("Failed to remove mirrored approvalDcr row on DCR delete:", err);
  }
  await audit("MANAGER_DCR_DELETED", "Dcr", dcrId, { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode, employeeCode: dcr.employeeCode, priorStatus: dcr.status });
  res.json({ data: { deleted: true, id: dcrId } });
}));

// POST /manager/dcrs/:id/approve
managerRouter.post("/dcrs/:id/approve", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const dcr = await DcrModel.findById(req.params.id);
  if (!dcr || dcr.tenantSlug !== mgr.tenantSlug) throw new HttpError(404, "DCR not found");
  dcr.status = "MANAGER_APPROVED";
  dcr.managerApprovedBy = mgr.employeeCode;
  dcr.managerApprovedAt = new Date();
  await dcr.save();
  await audit("MANAGER_DCR_APPROVED", "Dcr", String(dcr._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode });
  // Round 59 -- trail (who/when), admin approval row updated, notifications (field user + admin portal)
  await afterManagerDecision({ tenantSlug: mgr.tenantSlug, kind: "DCR", rec: dcr, action: "Approved", actor: managerActor(mgr) });
  res.json({ data: serializeDocument((await DcrModel.findById(dcr._id)) ?? dcr) });
}));

// POST /manager/dcrs/:id/reject
managerRouter.post("/dcrs/:id/reject", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const dcr = await DcrModel.findById(req.params.id);
  if (!dcr || dcr.tenantSlug !== mgr.tenantSlug) throw new HttpError(404, "DCR not found");
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
  dcr.status = "REJECTED";
  if (reason) dcr.notes = (dcr.notes ? dcr.notes + "\n[Rejected]: " : "[Rejected]: ") + reason;
  await dcr.save();
  await audit("MANAGER_DCR_REJECTED", "Dcr", String(dcr._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode });
  await afterManagerDecision({ tenantSlug: mgr.tenantSlug, kind: "DCR", rec: dcr, action: "Rejected", actor: managerActor(mgr), remarks: reason ?? "" });
  res.json({ data: serializeDocument((await DcrModel.findById(dcr._id)) ?? dcr) });
}));

// ══════════════════════════════════════════════════════════════════════
// New "Leave Apply" tab — Manager-side review. The MR's leave request
// (POST /field/leave-applications) lands here as PENDING; the manager sees
// the reason and number of days and can approve or reject, which notifies
// the MR back via notifyFieldRepByCode (same pattern as DCR approve/reject
// above).
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/leave-applications", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode });
  const codes = team.map(e => e.employeeCode);
  const rows = await LeaveApplicationModel.find({
    tenantSlug: mgr.tenantSlug,
    employeeCode: { $in: codes }
  }).sort({ createdAt: -1 }).limit(200).lean();
  const serialized = rows.map(serializeDocument);
  res.json({ data: await enrichWithEmployeeNames(mgr.tenantSlug, serialized, ["employeeCode", "approvedBy"]) });
}));

// Round 60 -- per-person leave list + history for the manager's team (everyone below the manager; approve/reject stays with the direct manager only).
// Each leave carries the shared decision label ("Approved by Admin", "Approved by Manager (Name)", "Rejected by ...", "Leave cancelled by Admin"), its date,
// remarks/reason and the append-only history. ?employeeCode=X narrows to one person (404 when that person is not in this manager's team).
managerRouter.get("/team-leave", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = (await getAllDescendants(mgr.tenantSlug, mgr.employeeCode)) as any[];
  const only = typeof req.query.employeeCode === "string" ? req.query.employeeCode.trim() : "";
  const members = only ? team.filter((e) => e.employeeCode === only) : team;
  if (only && !members.length) throw new HttpError(404, "That employee is not in your team");
  const rows = (await LeaveApplicationModel.find({ tenantSlug: mgr.tenantSlug, employeeCode: { $in: members.map((e) => e.employeeCode) } }).sort({ fromDate: -1, createdAt: -1 }).limit(2000).lean()) as any[];
  const data = members.map((e) => {
    const leaves = rows.filter((r) => r.employeeCode === e.employeeCode).map((r) => ({ ...serializeDocument(r), ...decisionView(r) }));
    const n = (s: string) => leaves.filter((l: any) => l.status === s).length;
    return {
      employeeCode: e.employeeCode, name: e.name, designation: e.designation, territory: e.territory, isDirectReport: e.reportingManager === mgr.employeeCode,
      counts: { pending: n("PENDING"), approved: n("APPROVED"), rejected: n("REJECTED"), cancelled: n("CANCELLED") },
      approvedDays: leaves.filter((l: any) => l.status === "APPROVED").reduce((s: number, l: any) => s + (Number(l.days) || 0), 0),
      leaves
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ data });
}));

managerRouter.post("/leave-applications/:id/approve", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const leave = await LeaveApplicationModel.findById(req.params.id);
  if (!leave || leave.tenantSlug !== mgr.tenantSlug) throw new HttpError(404, "Leave request not found");
  const team = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, employeeCode: leave.employeeCode });
  if (!team) throw new HttpError(403, "This leave request does not belong to your team");
  if (leave.status !== "PENDING") throw new HttpError(400, `This request is already ${leave.status.toLowerCase()}`);
  leave.status = "APPROVED";
  leave.approvedBy = mgr.employeeCode;
  leave.approvedAt = new Date();
  await leave.save();
  await audit("MANAGER_LEAVE_APPROVED", "LeaveApplication", String(leave._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode });
  // Round 59 -- trail + admin approval row + the Leave Cancellation (After Approval) row + notifications (field user, admin portal)
  await afterManagerDecision({ tenantSlug: mgr.tenantSlug, kind: "LEAVE", rec: leave, action: "Approved", actor: managerActor(mgr) });
  res.json({ data: serializeDocument((await LeaveApplicationModel.findById(leave._id)) ?? leave) });
}));

managerRouter.post("/leave-applications/:id/reject", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const leave = await LeaveApplicationModel.findById(req.params.id);
  if (!leave || leave.tenantSlug !== mgr.tenantSlug) throw new HttpError(404, "Leave request not found");
  const team = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, employeeCode: leave.employeeCode });
  if (!team) throw new HttpError(403, "This leave request does not belong to your team");
  if (leave.status !== "PENDING") throw new HttpError(400, `This request is already ${leave.status.toLowerCase()}`);
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
  leave.status = "REJECTED";
  leave.approvedBy = mgr.employeeCode;
  leave.approvedAt = new Date();
  leave.rejectReason = reason ?? null;
  await leave.save();
  await audit("MANAGER_LEAVE_REJECTED", "LeaveApplication", String(leave._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode });
  await afterManagerDecision({ tenantSlug: mgr.tenantSlug, kind: "LEAVE", rec: leave, action: "Rejected", actor: managerActor(mgr), remarks: reason ?? "" });
  res.json({ data: serializeDocument((await LeaveApplicationModel.findById(leave._id)) ?? leave) });
}));

// DELETE /manager/leave-applications/:id -- manager equivalent of the field
// delete. Scoped to this manager's own team. Same safety rule as field:
// PENDING/REJECTED only -- APPROVED is blocked, pointing at the existing
// Leave Cancellation (After Approval) admin flow instead of bypassing it
// with a raw delete. No balance restoration applies here either, for the
// same reason as the field endpoint: nothing in this codebase decrements a
// leave balance from applications.
managerRouter.delete("/leave-applications/:id", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const leave = await LeaveApplicationModel.findById(req.params.id);
  if (!leave || leave.tenantSlug !== mgr.tenantSlug) throw new HttpError(404, "Leave request not found");
  const inTeam = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, employeeCode: leave.employeeCode });
  if (!inTeam) throw new HttpError(403, "This leave request does not belong to your team");
  if (leave.status === "APPROVED" || leave.status === "CANCELLED") {
    throw new HttpError(400, leave.status === "CANCELLED" ? "A cancelled leave is kept for the record and cannot be deleted." : "This leave is already approved -- cancel it via Leave Cancellation (After Approval) instead of deleting it here.");
  }
  await LeaveApplicationModel.deleteOne({ _id: leave._id });
  try {
    const ApprovalLeaveModel = getMasterModel("approvalLeave");
    await ApprovalLeaveModel.deleteMany({ tenantSlug: mgr.tenantSlug, fieldForceName: inTeam.name, fromDate: leave.fromDate.toISOString().slice(0, 10) });
  } catch (err) {
    console.error("Failed to remove mirrored approvalLeave row on leave delete:", err);
  }
  await audit("MANAGER_LEAVE_DELETED", "LeaveApplication", String(leave._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode, employeeCode: leave.employeeCode, priorStatus: leave.status });
  res.json({ data: { deleted: true, id: String(leave._id) } });
}));

// GET /manager/leave-entitlement -- Item 3 (post-launch robustness round):
// the Manager Portal had a Leave Requests (approvals) tab but nothing
// showing the team's actual leave entitlement/balance, even though admin's
// real Leave Entitlement - Entry screen already sets real per-employee
// CL/PL/SL/LOP data (the same leaveEntitlementEntry collection the field
// rep's own balance cards read). Team-scoped real read from that same
// collection, matched by employee name the same way the field endpoint
// does, so a manager sees exactly what their team members see of their
// own balances.
managerRouter.get("/leave-entitlement", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode }).select("employeeCode name designation territory");
  const namesByLower = new Map(team.map((e: any) => [String(e.name).trim().toLowerCase(), e]));
  const Model = getMasterModel("leaveEntitlementEntry");
  const rows = (await Model.find({ tenantSlug: mgr.tenantSlug }).sort({ year: -1 }).lean()) as unknown as Record<string, unknown>[];
  const teamRows = rows.filter((r) => namesByLower.has(String(r.fieldForceName ?? "").trim().toLowerCase()));
  res.json({ data: teamRows.map((r) => ({ id: String(r._id), ...r })) });
}));

// GET /manager/dashboard
managerRouter.get("/dashboard", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const team = await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode });
  const codes = team.map(e => e.employeeCode);
  const [totalDcrs, pendingApproval, approvedToday] = await Promise.all([
    DcrModel.countDocuments({ tenantSlug: mgr.tenantSlug, employeeCode: { $in: codes }, visitDate: { $gte: today } }),
    DcrModel.countDocuments({ tenantSlug: mgr.tenantSlug, employeeCode: { $in: codes }, status: "SUBMITTED" }),
    DcrModel.countDocuments({ tenantSlug: mgr.tenantSlug, employeeCode: { $in: codes }, status: "MANAGER_APPROVED", managerApprovedAt: { $gte: today } })
  ]);
  res.json({ data: { manager: serializeDocument(mgr), team: team.map(serializeDocument), stats: { totalDcrs, pendingApproval, approvedToday, teamSize: team.length } } });
}));

function currentUtcMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.1 — Tour Plan: Cross-Manager Assignment & Void/Reassign
// ══════════════════════════════════════════════════════════════════════

// GET /manager/tour-plans — TPs for this manager's own assigned MRs only
managerRouter.get("/tour-plans", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const tps = await TourPlanModel.find({ tenantSlug: mgr.tenantSlug, assignedManager: mgr.employeeCode }).sort({ createdAt: -1 });
  res.json({ data: await enrichTourPlansWithNames(mgr.tenantSlug, tps) });
}));

// DELETE /manager/tour-plans/:tpId — Item B (post-launch robustness round):
// manager equivalent of the field-rep delete above. Scoped to Tour Plans
// this manager is the assignedManager for (their own chain), so a manager
// can't delete another manager's team's TP. Also removes the mirrored
// "approvalTp" master row -- same split-collection cleanup as the field
// delete handler.
managerRouter.delete("/tour-plans/:tpId", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const tp = await TourPlanModel.findOneAndDelete({ tenantSlug: mgr.tenantSlug, tpId: req.params.tpId, assignedManager: mgr.employeeCode });
  if (!tp) throw new HttpError(404, "Tour Plan not found");
  try {
    const ApprovalTpModel = getMasterModel("approvalTp");
    await ApprovalTpModel.deleteMany({ tenantSlug: mgr.tenantSlug, tpId: tp.tpId });
  } catch (err) {
    console.error("Failed to remove mirrored approvalTp row on Tour Plan delete:", err);
  }
  await audit("MANAGER_TOUR_PLAN_DELETED", "TourPlan", tp.tpId, { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode, employeeCode: (tp as any).employeeCode });
  await notifyFieldRepByCode(mgr.tenantSlug, (tp as any).employeeCode, "Tour Plan removed by Manager", `Your Tour Plan ${tp.tpId} for ${(tp as any).month} was deleted by your manager.`).catch(() => {});
  res.json({ data: { deleted: true, tpId: tp.tpId } });
}));

// GET /manager/tour-plans/cross-team — ALL TPs across the tenant, for
// cross-manager visibility (PRD: "New 'Cross-Team TPs' tab — shows TPs from
// all MRs across the tenant, not just own team.")
managerRouter.get("/tour-plans/cross-team", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const tps = await TourPlanModel.find({ tenantSlug: mgr.tenantSlug }).sort({ createdAt: -1 }).limit(500);
  res.json({ data: await enrichTourPlansWithNames(mgr.tenantSlug, tps) });
}));

// PATCH /manager/tour-plans/:tpId/approve — only the assignedManager may approve
managerRouter.patch("/tour-plans/:tpId/approve", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const tp = await TourPlanModel.findOne({ tenantSlug: mgr.tenantSlug, tpId: req.params.tpId });
  if (!tp) throw new HttpError(404, "Tour Plan not found");
  if (tp.assignedManager !== mgr.employeeCode) throw new HttpError(403, "Only the assigned manager can approve this Tour Plan");
  if (tp.status === "VOIDED") throw new HttpError(409, "This Tour Plan has been voided and can no longer be approved");
  tp.status = "APPROVED";
  tp.approvedBy = mgr.employeeCode;
  tp.approvedAt = new Date();
  await tp.save();
  await audit("MANAGER_TOUR_PLAN_APPROVED", "TourPlan", String(tp._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode, tpId: tp.tpId });
  await afterManagerDecision({ tenantSlug: mgr.tenantSlug, kind: "TP", rec: tp, action: "Approved", actor: managerActor(mgr) });
  res.json({ data: serializeDocument((await TourPlanModel.findById(tp._id)) ?? tp) });
}));

// PATCH /manager/tour-plans/:tpId/reject
managerRouter.patch("/tour-plans/:tpId/reject", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
  const tp = await TourPlanModel.findOne({ tenantSlug: mgr.tenantSlug, tpId: req.params.tpId });
  if (!tp) throw new HttpError(404, "Tour Plan not found");
  if (tp.assignedManager !== mgr.employeeCode) throw new HttpError(403, "Only the assigned manager can reject this Tour Plan");
  if (tp.status === "VOIDED") throw new HttpError(409, "This Tour Plan has been voided and can no longer be rejected");
  tp.status = "REJECTED";
  tp.rejectReason = reason;
  await tp.save();
  await audit("MANAGER_TOUR_PLAN_REJECTED", "TourPlan", String(tp._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode, tpId: tp.tpId });
  await afterManagerDecision({ tenantSlug: mgr.tenantSlug, kind: "TP", rec: tp, action: "Rejected", actor: managerActor(mgr), remarks: reason ?? "" });
  res.json({ data: serializeDocument((await TourPlanModel.findById(tp._id)) ?? tp) });
}));

// PATCH /manager/tour-plans/:tpId/void — ANY manager in the tenant may void
// any TP (PRD "Exact Solution" for the role-check bug: "if user.role is ABM
// or RBM, allow void on ANY TP within same tenantSlug"). Void never deletes
// — the record is preserved with voidedBy/voidReason/voidedAt for audit.
managerRouter.patch("/tour-plans/:tpId/void", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { reason } = z.object({ reason: z.string().min(1, "A void reason is required") }).parse(req.body);
  const tp = await TourPlanModel.findOne({ tenantSlug: mgr.tenantSlug, tpId: req.params.tpId });
  if (!tp) throw new HttpError(404, "Tour Plan not found");
  if (tp.status === "VOIDED") throw new HttpError(409, "This Tour Plan is already voided");

  tp.status = "VOIDED";
  tp.voidedBy = mgr.employeeCode;
  tp.voidedAt = new Date();
  tp.voidReason = reason;
  await tp.save();

  await audit("MANAGER_TOUR_PLAN_VOIDED", "TourPlan", String(tp._id), { tenantSlug: mgr.tenantSlug, voidedBy: mgr.employeeCode, tpId: tp.tpId, reason });

  // Item 1 — the field rep whose Tour Plan this is must also know it was
  // voided, not just the primary manager.
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    tp.employeeCode,
    `Tour Plan ${tp.tpId} voided`,
    `${mgr.name} (${mgr.employeeCode}) voided your Tour Plan for ${tp.month}. Reason: ${reason}`
  );

  // Notify the ORIGINAL (primary) manager, if it wasn't them who voided it.
  if (tp.primaryManager && tp.primaryManager !== mgr.employeeCode) {
    const primaryMgrEmployee = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, employeeCode: tp.primaryManager });
    await notifyManager({
      tenantSlug: mgr.tenantSlug,
      managerEmployeeCode: tp.primaryManager,
      managerEmail: primaryMgrEmployee?.email,
      managerName: primaryMgrEmployee?.name,
      title: `Tour Plan ${tp.tpId} voided`,
      message: `${mgr.name} (${mgr.employeeCode}) voided ${tp.employeeName ?? tp.employeeCode}'s Tour Plan ${tp.tpId} for ${tp.month}. Reason: ${reason}`
    });
    tp.managerNotifiedAt = new Date();
    await tp.save();
  }

  res.json({ data: serializeDocument(tp) });
}));

// Walks the parentTpId (backward) and reassignedToTpId (forward) links from
// a given TP to collect every tpId that belongs to the SAME reassignment
// lineage — a single linked list, since each TP can only ever be reassigned
// once (VOIDED is terminal). Used to tell "this TP was already reassigned
// through this exact chain before" apart from "this MR has a genuinely
// separate, unrelated Tour Plan" (see reassign guard below).
async function buildTourPlanLineage(tenantSlug: string, root: InstanceType<typeof TourPlanModel>) {
  const ids = new Set<string>([root.tpId]);

  let cursor: InstanceType<typeof TourPlanModel> | null = root;
  while (cursor?.parentTpId && !ids.has(cursor.parentTpId)) {
    ids.add(cursor.parentTpId);
    cursor = await TourPlanModel.findOne({ tenantSlug, tpId: cursor.parentTpId });
  }

  cursor = root;
  while (cursor?.reassignedToTpId && !ids.has(cursor.reassignedToTpId)) {
    ids.add(cursor.reassignedToTpId);
    cursor = await TourPlanModel.findOne({ tenantSlug, tpId: cursor.reassignedToTpId });
  }

  return ids;
}

// POST /manager/tour-plans/:tpId/reassign — voids the original (if not
// already voided) and creates a brand-new TP for the same MR under the
// calling manager, linked back via parentTpId. Returns the new tpId.
managerRouter.post("/tour-plans/:tpId/reassign", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { reason, targetManager } = z.object({
    reason: z.string().min(1, "A void reason is required"),
    // Request E, item 1 — reassign previously always recreated the Tour
    // Plan under the CALLING manager (the button literally said "Void &
    // Reassign to me"), so typing e.g. "reassign to the abm-002 manager"
    // into the reason box did nothing — the plan stayed with whoever
    // clicked it. targetManager is now required and is resolved below to
    // the actual manager the Tour Plan gets handed to.
    targetManager: z.string().min(1, "Select which manager to reassign this Tour Plan to")
  }).parse(req.body);
  const original = await TourPlanModel.findOne({ tenantSlug: mgr.tenantSlug, tpId: req.params.tpId });
  if (!original) throw new HttpError(404, "Tour Plan not found");

  // Resolve targetManager (employee code OR full name, either works) to a
  // real, active manager in this tenant. Code match first (exact,
  // case-insensitive), then falls back to an exact case-insensitive name
  // match — mirrors how the frontend's manager picker submits either value.
  const targetCode = targetManager.trim().toUpperCase();
  let targetMgrEmployee = await EmployeeModel.findOne({
    tenantSlug: mgr.tenantSlug,
    employeeCode: targetCode,
    role: { $in: MANAGER_ROLES },
    status: "ACTIVE"
  });
  if (!targetMgrEmployee) {
    const escaped = targetManager.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    targetMgrEmployee = await EmployeeModel.findOne({
      tenantSlug: mgr.tenantSlug,
      name: new RegExp(`^${escaped}$`, "i"),
      role: { $in: MANAGER_ROLES },
      status: "ACTIVE"
    });
  }
  if (!targetMgrEmployee) {
    throw new HttpError(404, `No active manager found matching "${targetManager}" — enter an exact manager code (e.g. ABM-002) or full name.`);
  }

  // PRD "Exact Solution" — "parentTpId chain becomes circular after Manager
  // B reassigns same MR+month already has a non-VOIDED TP" — this must only
  // catch a genuinely SEPARATE, unrelated Tour Plan thread for this MR this
  // month, not the TP being reassigned itself (or any earlier/later link in
  // its own chain). A plain per-employee-per-month lookup without lineage
  // awareness blocked EVERY reassign whenever an MR simply had more than one
  // Tour Plan on record for the month — fixed by only flagging a conflict
  // when the other active TP falls outside this TP's own lineage.
  // "Active" here must match the definition the submit-time guard in
  // field.routes.ts uses (DRAFT/SUBMITTED/APPROVED) — REJECTED and VOIDED
  // are both terminal/inactive, so neither should ever block a reassign.
  const lineage = await buildTourPlanLineage(mgr.tenantSlug, original);
  const conflicting = await TourPlanModel.findOne({
    tenantSlug: mgr.tenantSlug,
    employeeCode: original.employeeCode,
    month: original.month,
    status: { $in: ["DRAFT", "SUBMITTED", "APPROVED"] },
    tpId: { $nin: Array.from(lineage) }
  });
  if (conflicting) {
    throw new HttpError(
      409,
      `${original.employeeName ?? original.employeeCode} already has a separate active Tour Plan (${conflicting.tpId}) for ${original.month} — void that one first, or reassign it instead.`
    );
  }

  if (original.status !== "VOIDED") {
    original.status = "VOIDED";
    original.voidedBy = mgr.employeeCode;
    original.voidedAt = new Date();
    original.voidReason = reason;
  }

  const created = await createTourPlanWithRetry(mgr.tenantSlug, original.employeeCode, original.month, (tpId) =>
    TourPlanModel.create({
      tenantSlug: mgr.tenantSlug,
      tpId,
      employeeCode: original.employeeCode,
      employeeName: original.employeeName,
      primaryManager: original.primaryManager,
      assignedManager: targetMgrEmployee.employeeCode,
      month: original.month,
      locations: original.locations,
      status: "SUBMITTED",
      parentTpId: original.tpId,
      gstBranchCode: original.gstBranchCode,
      gstBranchName: original.gstBranchName
    })
  );

  original.reassignedToTpId = created.tpId;
  await original.save();

  await audit("MANAGER_TOUR_PLAN_REASSIGNED", "TourPlan", String(created._id), {
    tenantSlug: mgr.tenantSlug, byManager: mgr.employeeCode, toManager: targetMgrEmployee.employeeCode, fromTpId: original.tpId, toTpId: created.tpId, reason
  });

  // Item 1 — the field rep must know their Tour Plan was reassigned.
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    original.employeeCode,
    `Tour Plan reassigned`,
    `${mgr.name} (${mgr.employeeCode}) reassigned your Tour Plan for ${original.month} to ${targetMgrEmployee.name} (${targetMgrEmployee.employeeCode}) — new plan ${created.tpId}. Reason: ${reason}`
  );

  // Request E, item 1 — the RECEIVING manager must actually be told, since
  // this Tour Plan now lives in their "My Team's Tour Plans" queue (which
  // filters strictly on assignedManager) with full Approve/Reject/Void/
  // Reassign actions available to them.
  if (targetMgrEmployee.employeeCode !== mgr.employeeCode) {
    await notifyManager({
      tenantSlug: mgr.tenantSlug,
      managerEmployeeCode: targetMgrEmployee.employeeCode,
      managerEmail: targetMgrEmployee.email,
      managerName: targetMgrEmployee.name,
      title: `Tour Plan reassigned to you`,
      message: `${mgr.name} (${mgr.employeeCode}) reassigned ${original.employeeName ?? original.employeeCode}'s Tour Plan for ${original.month} to you (${created.tpId}). Reason: ${reason}`
    });
  }

  if (original.primaryManager && original.primaryManager !== mgr.employeeCode) {
    const primaryMgrEmployee = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, employeeCode: original.primaryManager });
    await notifyManager({
      tenantSlug: mgr.tenantSlug,
      managerEmployeeCode: original.primaryManager,
      managerEmail: primaryMgrEmployee?.email,
      managerName: primaryMgrEmployee?.name,
      title: `Tour Plan ${original.tpId} voided & reassigned`,
      message: `${mgr.name} (${mgr.employeeCode}) reassigned ${original.employeeName ?? original.employeeCode} to a new Tour Plan ${created.tpId} for ${original.month}. Reason: ${reason}`
    });
    original.managerNotifiedAt = new Date();
    await original.save();
  }

  const [enrichedOriginal, enrichedCreated] = await enrichTourPlansWithNames(mgr.tenantSlug, [original, created]);
  res.status(201).json({ data: { original: enrichedOriginal, created: enrichedCreated } });
}));

// ══════════════════════════════════════════════════════════════════════
// Expense Claims — GST Branch → claims linkage (Section 12.5 follow-up).
// A claim is routed to whichever manager the Tour Plan it references is
// currently assigned to, so reassigning a Tour Plan also carries its claims
// to the new manager's queue.
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/expense-claims", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const claims = await ExpenseClaimModel.find({ tenantSlug: mgr.tenantSlug, assignedManager: mgr.employeeCode }).sort({ createdAt: -1 });
  const serialized = claims.map(serializeDocument);
  res.json({ data: await enrichWithEmployeeNames(mgr.tenantSlug, serialized, ["assignedManager"]) });
}));

managerRouter.get("/expense-claims/cross-team", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const claims = await ExpenseClaimModel.find({ tenantSlug: mgr.tenantSlug }).sort({ createdAt: -1 });
  const serialized = claims.map(serializeDocument);
  res.json({ data: await enrichWithEmployeeNames(mgr.tenantSlug, serialized, ["assignedManager"]) });
}));

managerRouter.patch("/expense-claims/:claimId/approve", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const claim = await ExpenseClaimModel.findOne({ tenantSlug: mgr.tenantSlug, claimId: req.params.claimId });
  if (!claim) throw new HttpError(404, "Expense claim not found");
  if (claim.assignedManager !== mgr.employeeCode) throw new HttpError(403, "Only the assigned manager can approve this claim");
  if (claim.status !== "SUBMITTED") throw new HttpError(400, `Claim is already ${claim.status}`);

  claim.status = "APPROVED";
  claim.approvedBy = mgr.employeeCode;
  claim.approvedAt = new Date();
  await claim.save();

  await audit("MANAGER_EXPENSE_CLAIM_APPROVED", "ExpenseClaim", String(claim._id), { tenantSlug: mgr.tenantSlug, byManager: mgr.employeeCode, claimId: claim.claimId });
  await markExpenseApprovalRow(mgr.tenantSlug, claim.employeeName || claim.employeeCode, claim.month, "Approved");
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    claim.employeeCode,
    `Expense claim ${claim.claimId} approved`,
    `${mgr.name} (${mgr.employeeCode}) approved your expense claim ${claim.claimId}.`
  );
  res.json({ data: serializeDocument(claim) });
}));

// Coordinator follow-up round -- reversal counterpart to
// mirrorExpenseApprovalRow (field.routes.ts), duplicated here since
// manager.routes.ts has its own delete endpoint and no shared module
// between the two routers for this helper.
async function reverseExpenseApprovalRow(tenantSlug: string, employeeName: string, month: string, amountRs: number) {
  try {
    const [year, monthNum] = month.split("-");
    const monthName = new Date(Date.UTC(Number(year), Number(monthNum) - 1, 1)).toLocaleString("en-US", { month: "long" });
    const Model = getMasterModel("expenseApprovalActive");
    const existing = await Model.findOne({ tenantSlug, fieldForceName: employeeName, month: monthName, year });
    if (existing) {
      const currentClaimed = Number((existing as any).claimedAmount) || 0;
      await Model.updateOne({ _id: existing._id }, { $set: { claimedAmount: Math.max(0, currentClaimed - amountRs) } });
    }
  } catch (err) {
    console.error("[reverseExpenseApprovalRow] failed:", err);
  }
}

// Coordinator follow-up round (Item 2) -- the expenseApprovalActive mirror
// was only ever touched at submit time (additive) and at delete time
// (reversal, Round 28). Approve/reject never kept it in sync at all: an
// approved claim's real manager-approval date never showed up, and a
// REJECTED claim kept inflating the month's claimedAmount total forever
// (the same money double-counted as "claimed" even though the claim was
// turned down). This keeps it in sync on both:
//   - approve: stamps a real mgrApprovalDate and marks status "Approved".
//   - reject: reverses the claim's amount out of claimedAmount (same
//     reversal the delete endpoint uses) and marks status "Rejected".
// Honest limitation: this mirror aggregates ALL of an employee's claims
// for a month into one row with a single "status" column, so if an
// employee has two claims the same month and only one is actioned, this
// overwrites that one shared status/date rather than tracking per-claim
// state (the mirror's own schema has no per-claim granularity to do
// otherwise) -- the claimedAmount reversal on reject is exact either way
// since it's a straight numeric subtraction, independent of how many
// claims share the row.
async function markExpenseApprovalRow(tenantSlug: string, employeeName: string, month: string, status: "Approved" | "Rejected") {
  try {
    const [year, monthNum] = month.split("-");
    const monthName = new Date(Date.UTC(Number(year), Number(monthNum) - 1, 1)).toLocaleString("en-US", { month: "long" });
    const Model = getMasterModel("expenseApprovalActive");
    const existing = await Model.findOne({ tenantSlug, fieldForceName: employeeName, month: monthName, year });
    if (existing) {
      const dateField = status === "Approved" ? "mgrApprovalDate" : "adminApprovalDate";
      await Model.updateOne({ _id: existing._id }, { $set: { status, [dateField]: new Date().toISOString().slice(0, 10) } });
    }
  } catch (err) {
    console.error("[markExpenseApprovalRow] failed:", err);
  }
}

// DELETE /manager/expense-claims/:claimId -- manager equivalent of the
// field delete. Scoped to claims assigned to this manager. Same safety
// rule: APPROVED (settled) claims are blocked; SUBMITTED/REJECTED can be
// deleted, reversing the amount out of the expenseApprovalActive mirror.
managerRouter.delete("/expense-claims/:claimId", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const claim = await ExpenseClaimModel.findOne({ tenantSlug: mgr.tenantSlug, claimId: req.params.claimId, assignedManager: mgr.employeeCode });
  if (!claim) throw new HttpError(404, "Expense claim not found");
  if (claim.status === "APPROVED") {
    throw new HttpError(400, "This claim is already approved and settled — it can't be deleted.");
  }
  await ExpenseClaimModel.deleteOne({ _id: claim._id });
  await reverseExpenseApprovalRow(mgr.tenantSlug, claim.employeeName || claim.employeeCode, claim.month, claim.amountRs);
  await audit("MANAGER_EXPENSE_CLAIM_DELETED", "ExpenseClaim", claim.claimId, { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode, employeeCode: claim.employeeCode, amountRs: claim.amountRs, priorStatus: claim.status });
  res.json({ data: { deleted: true, claimId: claim.claimId } });
}));

managerRouter.patch("/expense-claims/:claimId/reject", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const { reason } = z.object({ reason: z.string().min(1, "A rejection reason is required") }).parse(req.body);
  const claim = await ExpenseClaimModel.findOne({ tenantSlug: mgr.tenantSlug, claimId: req.params.claimId });
  if (!claim) throw new HttpError(404, "Expense claim not found");
  if (claim.assignedManager !== mgr.employeeCode) throw new HttpError(403, "Only the assigned manager can reject this claim");
  if (claim.status !== "SUBMITTED") throw new HttpError(400, `Claim is already ${claim.status}`);

  claim.status = "REJECTED";
  claim.rejectedBy = mgr.employeeCode;
  claim.rejectReason = reason;
  claim.rejectedAt = new Date();
  await claim.save();

  await audit("MANAGER_EXPENSE_CLAIM_REJECTED", "ExpenseClaim", String(claim._id), { tenantSlug: mgr.tenantSlug, byManager: mgr.employeeCode, claimId: claim.claimId, reason });
  await reverseExpenseApprovalRow(mgr.tenantSlug, claim.employeeName || claim.employeeCode, claim.month, claim.amountRs);
  await markExpenseApprovalRow(mgr.tenantSlug, claim.employeeName || claim.employeeCode, claim.month, "Rejected");
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    claim.employeeCode,
    `Expense claim ${claim.claimId} rejected`,
    `${mgr.name} (${mgr.employeeCode}) rejected your expense claim ${claim.claimId}. Reason: ${reason}`
  );
  res.json({ data: serializeDocument(claim) });
}));

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.2 — Visit Coverage grid: rows = doctors, columns = MRs
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/visit-coverage", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : currentUtcMonth();
  const team = await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" }).sort({ name: 1 });
  const codes = team.map((e) => e.employeeCode);

  const doctors = await DoctorModel.find({ tenantSlug: mgr.tenantSlug, mappedEmployeeCode: { $in: codes }, status: "ACTIVE" }).sort({ name: 1 });

  const counts = await DcrModel.aggregate([
    { $match: { tenantSlug: mgr.tenantSlug, employeeCode: { $in: codes }, month, status: { $ne: "REJECTED" } } },
    { $group: { _id: { doctorId: "$doctorId", employeeCode: "$employeeCode" }, visitCount: { $sum: 1 } } }
  ]);
  const cellMap = new Map(counts.map((c) => [`${c._id.doctorId}:${c._id.employeeCode}`, c.visitCount]));

  const rows = doctors.map((doctor) => ({
    doctorId: String(doctor._id),
    doctorName: doctor.name,
    mappedEmployeeCode: doctor.mappedEmployeeCode,
    mappedEmployeeName: doctor.mappedEmployeeName,
    cells: codes.map((code) => ({
      employeeCode: code,
      visitCount: cellMap.get(`${String(doctor._id)}:${code}`) ?? 0
    }))
  }));

  res.json({ data: { month, mrs: team.map((e) => ({ employeeCode: e.employeeCode, name: e.name })), rows } });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 2 — Attendance & Compliance Analytics
// Topic 4 — Chronic Defaulter Detection (team-scoped)
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/analytics/compliance", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;

  const team = await EmployeeModel.find(
    { tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" },
    { employeeCode: 1, name: 1, joinDate: 1, role: 1 }
  ).lean();

  const rows = await computeComplianceRows(mgr.tenantSlug, team, { month });
  const roleByCode = new Map(team.map(e => [e.employeeCode, e.role]));
  const enriched = rows.map(r => ({ ...r, role: roleByCode.get(r.employeeCode) }));

  res.json({
    data: enriched,
    month: month ?? "current",
    summary: {
      submittedToday: enriched.filter(r => r.submittedToday).length,
      pendingDCR: enriched.filter(r => r.pendingDCR).length,
      missedYesterday: enriched.filter(r => r.missedYesterday).length,
      chronicDefaulters: enriched.filter(r => r.chronicDefaulter).length,
      avgCompliancePercent: enriched.length ? Math.round(enriched.reduce((s, r) => s + r.compliancePercent, 0) / enriched.length) : 100
    }
  });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 3 — Salary Integration Engine (team-scoped)
// Workflow: Employee → No DCR → HR Notification → Employee Explanation →
// Manager Approval → Payroll Released.
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/analytics/payroll", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const now = new Date();
  const month = typeof req.query.month === "string" && req.query.month
    ? req.query.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const team = await EmployeeModel.find(
    { tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" },
    { employeeCode: 1, name: 1, joinDate: 1, role: 1 }
  ).lean();

  const records = await syncPayrollStatuses(mgr.tenantSlug, team, month);
  const nameByCode = new Map(team.map(e => [e.employeeCode, e.name]));
  const roleByCode = new Map(team.map(e => [e.employeeCode, e.role]));

  const data: Array<Record<string, unknown>> = records.map(r => {
    const serialized: Record<string, unknown> = serializeDocument(r);
    serialized.employeeName = nameByCode.get(r.employeeCode);
    serialized.role = roleByCode.get(r.employeeCode);
    return serialized;
  });

  res.json({
    data, month,
    summary: {
      onHold: data.filter(r => r.status === "HOLD").length,
      pendingApproval: data.filter(r => r.status === "EXPLANATION_SUBMITTED").length,
      released: data.filter(r => r.status === "RELEASED").length
    }
  });
}));

managerRouter.patch("/analytics/payroll/:id/approve", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const record = await PayrollStatusModel.findOne({
    tenantSlug: mgr.tenantSlug, _id: req.params.id, employeeCode: { $in: (
      await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode }, { employeeCode: 1 }).lean()
    ).map(e => e.employeeCode) }
  });
  if (!record) throw new HttpError(404, "Payroll status record not found for your team");

  record.status = "RELEASED";
  record.managerApprovedBy = mgr.employeeCode;
  record.managerApprovedByName = mgr.name;
  record.managerApprovedAt = new Date();
  record.releasedAt = new Date();
  await record.save();

  await audit("MANAGER_PAYROLL_APPROVED", "PayrollStatus", String(record._id), { tenantSlug: mgr.tenantSlug, employeeCode: record.employeeCode, month: record.month, approvedBy: mgr.employeeCode });
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    record.employeeCode,
    `Payroll released for ${record.month}`,
    `${mgr.name} (${mgr.employeeCode}) approved and released your payroll hold for ${record.month}.`
  );
  res.json({ data: serializeDocument(record) });
}));

const payrollRejectSchema = z.object({ reason: z.string().min(1, "A reason is required so the employee knows what to address") });

managerRouter.patch("/analytics/payroll/:id/reject", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const body = payrollRejectSchema.parse(req.body);
  const teamCodes = (await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode }, { employeeCode: 1 }).lean()).map(e => e.employeeCode);
  const record = await PayrollStatusModel.findOne({ tenantSlug: mgr.tenantSlug, _id: req.params.id, employeeCode: { $in: teamCodes } });
  if (!record) throw new HttpError(404, "Payroll status record not found for your team");

  record.status = "HOLD";
  record.holdReason = `Manager sent back: ${body.reason}`;
  record.employeeExplanation = null;
  record.explanationSubmittedAt = null;
  await record.save();

  await audit("MANAGER_PAYROLL_REJECTED", "PayrollStatus", String(record._id), { tenantSlug: mgr.tenantSlug, employeeCode: record.employeeCode, month: record.month, reason: body.reason });
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    record.employeeCode,
    `Payroll sent back for ${record.month}`,
    `${mgr.name} (${mgr.employeeCode}) sent your payroll for ${record.month} back on hold. Reason: ${body.reason}`
  );
  res.json({ data: serializeDocument(record) });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 5 — Representative vs Manager Analysis
// Topic 6 — Joint Field Work Analysis (team-scoped: this manager's own
// doctors-visited vs joint-visit support level, per rep)
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/analytics/rep-manager", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const now = new Date();
  const month = typeof req.query.month === "string" && req.query.month
    ? req.query.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const team = await EmployeeModel.find(
    { tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" },
    { employeeCode: 1, name: 1, reportingManager: 1 }
  ).lean();

  const reps = await computeRepAnalysisRows(mgr.tenantSlug, team, month);
  const teamJointVisits = reps.reduce((s, r) => s + r.jointVisits, 0);
  const teamVisits = reps.reduce((s, r) => s + r.totalVisits, 0);

  res.json({
    data: reps, month,
    teamSummary: {
      teamSize: reps.length,
      totalJointCalls: teamJointVisits,
      avgJointCallsPerRep: reps.length ? Math.round((teamJointVisits / reps.length) * 10) / 10 : 0,
      jointCallPercent: teamVisits > 0 ? Math.round((teamJointVisits / teamVisits) * 100) : 0
    }
  });
}));

// ══════════════════════════════════════════════════════════════════════
// Phase 1 — "Call Manager" reference build: Campaign visibility for the
// Manager portal. Team-scoped the same way GET /manager/team already is
// (reportingManager === this manager's own employeeCode) — real
// CampaignVisitModel rows, not the admin-visibility mirror, so status/
// source stay live if a later phase updates them (e.g. Completed once a
// DCR is logged against one).
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/campaign-visits", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find(
    { tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" },
    { employeeCode: 1 }
  ).lean();
  const teamCodes = team.map((e: any) => e.employeeCode);
  if (teamCodes.length === 0) {
    res.json({ data: [] });
    return;
  }
  const filter: Record<string, unknown> = { tenantSlug: mgr.tenantSlug, employeeCode: { $in: teamCodes } };
  if (typeof req.query.date === "string" && req.query.date.trim()) filter.visitDate = req.query.date.trim();
  const rows = await CampaignVisitModel.find(filter).sort({ visitDate: -1, createdAt: -1 }).limit(500);
  res.json({ data: rows.map(serializeDocument) });
}));

// ══════════════════════════════════════════════════════════════════════
// Phase 3 — Deviation approval queue. Scoped to this manager's own team
// exactly like every other approval screen above (reportingManager match).
// ══════════════════════════════════════════════════════════════════════
managerRouter.get("/deviation-visits", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find(
    { tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" },
    { employeeCode: 1 }
  ).lean();
  const teamCodes = team.map((e: any) => e.employeeCode);
  if (teamCodes.length === 0) {
    res.json({ data: [] });
    return;
  }
  const status = typeof req.query.status === "string" && req.query.status.trim() ? req.query.status.trim() : "Pending Approval";
  const rows = await CampaignVisitModel.find({
    tenantSlug: mgr.tenantSlug, employeeCode: { $in: teamCodes }, source: "deviation", status
  }).sort({ createdAt: -1 }).limit(500);
  res.json({ data: rows.map(serializeDocument) });
}));

managerRouter.post("/deviation-visits/:id/approve", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const visit = await CampaignVisitModel.findById(req.params.id);
  if (!visit || visit.tenantSlug !== mgr.tenantSlug || visit.source !== "deviation") throw new HttpError(404, "Deviation visit not found");
  const employee = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, employeeCode: visit.employeeCode });
  if (!employee || employee.reportingManager !== mgr.employeeCode) throw new HttpError(403, "Not in your team");
  visit.status = "Planned";
  visit.approvedBy = mgr.employeeCode;
  visit.approvedAt = new Date();
  await visit.save();
  await audit("MANAGER_DEVIATION_APPROVED", "CampaignVisit", String(visit._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode });
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    visit.employeeCode,
    "Deviation visit approved",
    `${mgr.name} (${mgr.employeeCode}) approved your off-plan visit to ${visit.doctorName || visit.chemistName}.`
  );
  res.json({ data: serializeDocument(visit) });
}));

managerRouter.post("/deviation-visits/:id/reject", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const visit = await CampaignVisitModel.findById(req.params.id);
  if (!visit || visit.tenantSlug !== mgr.tenantSlug || visit.source !== "deviation") throw new HttpError(404, "Deviation visit not found");
  const employee = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, employeeCode: visit.employeeCode });
  if (!employee || employee.reportingManager !== mgr.employeeCode) throw new HttpError(403, "Not in your team");
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
  visit.status = "Rejected";
  visit.rejectedBy = mgr.employeeCode;
  visit.rejectedAt = new Date();
  if (reason) visit.rejectReason = reason;
  await visit.save();
  await audit("MANAGER_DEVIATION_REJECTED", "CampaignVisit", String(visit._id), { tenantSlug: mgr.tenantSlug, managerCode: mgr.employeeCode });
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    visit.employeeCode,
    "Deviation visit rejected",
    `${mgr.name} (${mgr.employeeCode}) rejected your off-plan visit to ${visit.doctorName || visit.chemistName}.${reason ? ` Reason: ${reason}` : ""}`
  );
  res.json({ data: serializeDocument(visit) });
}));

// ══════════════════════════════════════════════════════════════════════
// Phase 6 — real Team Checkout/Attendance status, replacing the Manager
// Portal's unwired ModulePlaceholder for Attendance (confirmed: that
// screen had no real data source at all). Reuses Phase 2's exact
// AttendanceModel and "day still open from before" logic — no new
// schema, same checkInAt/checkOutAt fields, scoped to this manager's team
// the same way every other manager screen already is.
// ══════════════════════════════════════════════════════════════════════
function dateOnlyUTCManager(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

managerRouter.get("/team-checkout-status", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find(
    { tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" },
    { employeeCode: 1, name: 1 }
  ).sort({ name: 1 }).lean();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = await Promise.all(
    team.map(async (emp: any) => {
      const [todayAttendance, openAttendance] = await Promise.all([
        AttendanceModel.findOne({ tenantSlug: mgr.tenantSlug, employeeCode: emp.employeeCode, attendanceDate: today }),
        AttendanceModel.findOne({
          tenantSlug: mgr.tenantSlug, employeeCode: emp.employeeCode,
          checkInAt: { $ne: null }, checkOutAt: null
        }).sort({ attendanceDate: -1 })
      ]);
      const hasOpenPriorDay = Boolean(openAttendance && openAttendance.attendanceDate.getTime() < today.getTime());
      return {
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        checkedInToday: Boolean(todayAttendance?.checkInAt),
        checkedOutToday: Boolean(todayAttendance?.checkOutAt),
        checkInAt: todayAttendance?.checkInAt ?? null,
        checkOutAt: todayAttendance?.checkOutAt ?? null,
        hasOpenPriorDay,
        openPriorDay: hasOpenPriorDay ? dateOnlyUTCManager(openAttendance!.attendanceDate) : null
      };
    })
  );

  res.json({ data: results });
}));

// ══════════════════════════════════════════════════════════════════════
// Phase 6 — team Chemist Call visibility, the same read/detail pattern
// GET /manager/dcrs already gives for doctor DCRs. Reuses Phase 5's real
// ChemistCallModel as-is — no new schema.
// ══════════════════════════════════════════════════════════════════════
// GET /manager/targets -- targets of the manager's direct team (Target Upload), totals per person for the chosen monthKey (default: all uploaded months).
managerRouter.get("/targets", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = (await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" }, { employeeCode: 1, name: 1 }).lean()) as any[];
  const filter: Record<string, unknown> = { tenantSlug: mgr.tenantSlug, employeeCode: { $in: team.map((e) => e.employeeCode) } };
  if (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)) filter.monthKey = req.query.month;
  const rows = team.length ? ((await getMasterModel("targetMaster").find(filter).lean()) as any[]) : [];
  const people = team.map((e) => { const mine = rows.filter((r) => r.employeeCode === e.employeeCode); return { employeeCode: e.employeeCode, name: e.name, lines: mine.length, targetUnit: mine.reduce((a, r) => a + (Number(r.targetUnit) || 0), 0), targetValue: mine.reduce((a, r) => a + (Number(r.targetValue) || 0), 0) }; });
  res.json({ data: { people, totalUnit: people.reduce((a, p) => a + p.targetUnit, 0), totalValue: people.reduce((a, p) => a + p.targetValue, 0) } });
}));

// GET /manager/chemists -- the chemists (Chemist Master / Chemists Upload Tool) mapped to this manager's direct team, with how many calls each has had.
managerRouter.get("/chemists", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = (await EmployeeModel.find({ tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" }, { employeeCode: 1, name: 1 }).lean()) as any[];
  const codes = team.map((e) => e.employeeCode);
  const chemists = codes.length ? ((await DealerModel.find({ tenantSlug: mgr.tenantSlug, employeeCode: { $in: codes }, status: "ACTIVE" }).sort({ dealerName: 1 })) as any[]) : [];
  const calls = chemists.length ? ((await ChemistCallModel.find({ tenantSlug: mgr.tenantSlug, employeeCode: { $in: codes } }, { chemistId: 1 }).lean()) as any[]) : [];
  const perChemist = new Map<string, number>();
  for (const c of calls) perChemist.set(String(c.chemistId), (perChemist.get(String(c.chemistId)) || 0) + 1);
  res.json({ data: { mrs: team.map((e) => ({ employeeCode: e.employeeCode, name: e.name })), rows: chemists.map((c) => ({ chemistId: String(c._id), chemistName: c.dealerName, territory: c.patchName, category: c.category, chemistClass: c.chemistClass, mappedEmployeeCode: c.employeeCode, mappedEmployeeName: c.employeeName, callCount: perChemist.get(String(c._id)) || 0 })) } });
}));

managerRouter.get("/chemist-calls", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const team = await EmployeeModel.find(
    { tenantSlug: mgr.tenantSlug, reportingManager: mgr.employeeCode, status: "ACTIVE" },
    { employeeCode: 1 }
  ).lean();
  const teamCodes = team.map((e: any) => e.employeeCode);
  if (teamCodes.length === 0) {
    res.json({ data: [] });
    return;
  }
  const calls = await ChemistCallModel.find({ tenantSlug: mgr.tenantSlug, employeeCode: { $in: teamCodes } })
    .sort({ visitDateOnly: -1, createdAt: -1 })
    .limit(200);
  res.json({ data: calls.map(serializeDocument) });
}));

managerRouter.get("/chemist-calls/:id", asyncHandler(async (req, res) => {
  const mgr = await getManagerProfile(req.auth!.sub);
  const call = await ChemistCallModel.findById(req.params.id);
  if (!call || call.tenantSlug !== mgr.tenantSlug) throw new HttpError(404, "Chemist Call not found");
  const employee = await EmployeeModel.findOne({ tenantSlug: mgr.tenantSlug, employeeCode: call.employeeCode });
  if (!employee || employee.reportingManager !== mgr.employeeCode) throw new HttpError(403, "Not in your team");
  res.json({ data: serializeDocument(call) });
}));
