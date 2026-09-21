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
import { serializeDocument } from "../utils/serialize.js";
import { createTourPlanWithRetry } from "../utils/tour-plan-id.js";
import { notifyManager, notifyFieldRep } from "../utils/notify.js";
import { enrichTourPlansWithNames } from "../utils/enrich-tour-plans.js";
import { enrichWithEmployeeNames } from "../utils/enrich-employee-names.js";
import { computeComplianceRows } from "../utils/compliance.js";
import { syncPayrollStatuses } from "../utils/payroll.js";
import { PayrollStatusModel } from "../models/payroll-status.model.js";
import { computeRepAnalysisRows } from "../utils/rep-manager-analysis.js";

export const managerRouter = Router();
managerRouter.use(requireAuth);

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
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    dcr.employeeCode,
    "Your DCR was approved",
    `${mgr.name} (${mgr.employeeCode}) approved your Daily Call Report.`
  );
  res.json({ data: serializeDocument(dcr) });
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
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    dcr.employeeCode,
    "Your DCR was rejected",
    `${mgr.name} (${mgr.employeeCode}) rejected your Daily Call Report.${reason ? ` Reason: ${reason}` : ""}`
  );
  res.json({ data: serializeDocument(dcr) });
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
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    leave.employeeCode,
    "Your leave request was approved",
    `${mgr.name} (${mgr.employeeCode}) approved your ${leave.days} day(s) leave request (${leave.leaveType}).`
  );
  res.json({ data: serializeDocument(leave) });
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
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    leave.employeeCode,
    "Your leave request was rejected",
    `${mgr.name} (${mgr.employeeCode}) rejected your ${leave.days} day(s) leave request (${leave.leaveType}).${reason ? ` Reason: ${reason}` : ""}`
  );
  res.json({ data: serializeDocument(leave) });
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
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    tp.employeeCode,
    `Tour Plan ${tp.tpId} approved`,
    `${mgr.name} (${mgr.employeeCode}) approved your Tour Plan for ${tp.month}.`
  );
  res.json({ data: serializeDocument(tp) });
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
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    tp.employeeCode,
    `Tour Plan ${tp.tpId} rejected`,
    `${mgr.name} (${mgr.employeeCode}) rejected your Tour Plan for ${tp.month}.${reason ? ` Reason: ${reason}` : ""}`
  );
  res.json({ data: serializeDocument(tp) });
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
  await notifyFieldRepByCode(
    mgr.tenantSlug,
    claim.employeeCode,
    `Expense claim ${claim.claimId} approved`,
    `${mgr.name} (${mgr.employeeCode}) approved your expense claim ${claim.claimId}.`
  );
  res.json({ data: serializeDocument(claim) });
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
