import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { requireAuth, requireFieldForce } from "../http/auth.js";
import { AttendanceModel } from "../models/attendance.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { UserModel } from "../models/user.model.js";
import { ProductModel } from "../models/product.model.js";
import { CompanyBranchModel } from "../models/company-branch.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { audit } from "../utils/audit.js";
import { notifyManager } from "../utils/notify.js";
import { serializeDocument } from "../utils/serialize.js";
import { createTourPlanWithRetry } from "../utils/tour-plan-id.js";
import { createExpenseClaimWithRetry } from "../utils/expense-claim-id.js";
import { enrichTourPlansWithNames } from "../utils/enrich-tour-plans.js";
import { enrichWithEmployeeNames } from "../utils/enrich-employee-names.js";
import { syncPayrollStatuses } from "../utils/payroll.js";
import { PayrollStatusModel } from "../models/payroll-status.model.js";
import { DoctorVisitExceptionModel, DOCTOR_EXCEPTION_REASONS } from "../models/doctor-visit-exception.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";

// PRD 12.3B — fixed gift/input item-type list for the compliance-tracked
// picker (Pen, Calendar, Notepad, Literature, ...). Kept as a constant so
// the frontend dropdown and backend validation never drift apart.
export const GIFT_ITEM_TYPES = ["Pen", "Calendar", "Notepad", "Literature", "Diary", "Mug", "Visiting Card Holder", "Other"] as const;

// New "Leave Apply" tab — fixed dropdown of leave reasons shown on the
// FieldRepo Leave Apply form. Kept as a constant (mirrors GIFT_ITEM_TYPES
// above) so the frontend dropdown and backend validation never drift.
// "Other" always shows a free-text box on the frontend for anything not
// covered by the fixed list.
export const LEAVE_REASONS = [
  "Sick Leave",
  "Casual Leave",
  "Personal Work",
  "Family Emergency",
  "Medical Appointment",
  "Wedding / Function",
  "Travel",
  "Other"
] as const;

// PRD 12.3A/12.3B — samplesGiven/inputsGiven upgraded to structured rows.
// productCode is now required (Section 12.3A "Exact Solution": "Dropdown
// MUST call /company/products with the MR's subdivision filter — no
// free-text entry allowed for product codes"). itemType/valueRs enable the
// MCI gift-value compliance alert (Section 12.3B).
const dcrSchema = z.object({
  doctorId:         z.string().optional(),
  productsDetailed: z.array(z.string()).default([]),
  notes:            z.string().optional(),
  callSession:      z.enum(["MORNING", "AFTERNOON", "EVENING"]).default("MORNING"),
  callTime:         z.string().optional(),
  samplesGiven: z.array(z.object({
    productName:  z.string(),
    productCode:  z.string().optional(),
    qty:          z.number().min(0),
    batchNumber:  z.string().optional(),
    priority:     z.enum(["HIGH", "MEDIUM", "LOW"]).optional()
  })).default([]),
  inputsGiven: z.array(z.object({
    inputName: z.string(),
    itemType:  z.string().optional(),
    qty:       z.number().min(0),
    valueRs:   z.number().min(0).optional()
  })).default([]),
  jointWork: z.object({
    accompanyingManager:  z.string().optional(),
    jointWorkType:        z.enum(["FIELD_WORK", "ON_JOB_TRAINING", "PERFORMANCE_REVIEW"]).optional(),
    managerObservations:  z.string().optional()
  }).optional(),
  overrideOverVisitWarning: z.boolean().optional(), // MR clicked "Confirm" on the 4th-visit modal

  // ── Zivira_Project_Basic.docx Topic 1 — Visit Information / Product
  // Promotion / Doctor Feedback (all optional — DCR still saves without
  // them, same soft-capture philosophy as everything else on this form) ──
  checkInTime:      z.string().optional(),
  checkOutTime:      z.string().optional(),
  gpsLocation: z.object({
    latitude:  z.number().optional(),
    longitude: z.number().optional(),
    label:     z.string().optional()
  }).optional(),
  hospitalClinic:    z.string().optional(),
  visitDurationMinutes: z.number().min(0).optional(),
  promotionalMaterialsShared: z.array(z.string()).default([]),
  visualAidUsed:      z.boolean().optional(),
  prescriptionInterest: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]).optional(),
  productFeedback:    z.string().optional(),
  competitorMentioned: z.string().optional(),
  followUpRequired:   z.boolean().optional(),
  followUpDate:        z.string().optional()
});

function currentUtcMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const fieldRouter = Router();
fieldRouter.use(requireAuth, requireFieldForce);

async function getFieldProfile(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user?.tenantSlug) throw new HttpError(404, "Field user not found");
  const employee = await EmployeeModel.findOne({ tenantSlug: user.tenantSlug, employeeCode: user.username.toUpperCase() });
  if (!employee) {
    const fallback = await EmployeeModel.findOne({ tenantSlug: user.tenantSlug, role: "MR" });
    if (!fallback) throw new HttpError(404, "Employee profile not found");
    return fallback;
  }
  return employee;
}

// Item 3 — "if any changes occurs in the field repo... it must be send an
// notification for the respected reporting portal." Every field-force
// submission below (DCR, Tour Plan, Expense Claim, Doctor Exception) calls
// this so the submitting MR's manager sees it via GET /manager/notices.
// Best-effort — a notification failure must never fail the MR's submit.
async function notifyReportingManager(tenantSlug: string, employee: { employeeCode: string; name?: string | null; reportingManager?: string | null }, title: string, message: string) {
  if (!employee.reportingManager) return;
  try {
    const mgr = await EmployeeModel.findOne({ tenantSlug, employeeCode: employee.reportingManager }).lean();
    await notifyManager({
      tenantSlug,
      managerEmployeeCode: employee.reportingManager,
      managerEmail: mgr?.email,
      managerName: mgr?.name,
      title,
      message
    });
  } catch (err) {
    console.error("[Notify] Failed to notify reporting manager:", err);
  }
}

fieldRouter.get("/dashboard", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [doctors, completedDcrs, attendance, recentDcrs] = await Promise.all([
    DoctorModel.find({ tenantSlug, mappedEmployeeCode: employee.employeeCode, status: "ACTIVE" }).sort({ category: 1, name: 1 }),
    DcrModel.countDocuments({ tenantSlug, employeeCode: employee.employeeCode, visitDate: { $gte: today } }),
    AttendanceModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, attendanceDate: { $gte: today } }),
    DcrModel.find({ tenantSlug, employeeCode: employee.employeeCode }).sort({ createdAt: -1 }).limit(5)
  ]);
  res.json({ data: {
    profile: serializeDocument(employee),
    today: { plannedVisits: doctors.length, completedDcrs, attendanceMarked: Boolean(attendance) },
    doctors: doctors.map(serializeDocument),
    recentDcrs: recentDcrs.map(serializeDocument)
  }});
}));

// GET /field/notices — Item 4 (updated): the MR's notification feed must
// ONLY ever surface things that came from their own reporting Manager's
// actions (DCR/Tour Plan/Expense Claim/Leave approve-reject etc, via
// notifyFieldRep() in utils/notify.ts) — never Company Admin broadcast
// notices (audience "ALL", or "MR" with no target, posted from the Company
// Admin portal's Post Notice screen). notifyFieldRep() always creates its
// Notice with postedBy:"system" AND targetEmployeeCode set to the specific
// MR, so filtering on exactly that combination cleanly separates
// "came from my manager" from "posted by admin" without needing a new
// field on the Notice model. `since` still supports polling.
fieldRouter.get("/notices", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const { NoticeModel } = await import("../models/notice.model.js");
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  const filter: Record<string, unknown> = {
    tenantSlug,
    postedBy: "system",
    audience: "MR",
    targetEmployeeCode: employee.employeeCode
  };
  if (since && !Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
  const notices = await NoticeModel.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json({ data: notices.map(serializeDocument) });
}));

// Request D, item 4 — the "Accompanying Manager" field on a DCR's Joint
// Work section was free text; if more than one manager has ever had this
// MR's Tour Plans assigned to them (their current reportingManager, plus
// anyone a Tour Plan of theirs was reassigned to/from — see manager
// reassign, Request C item 1), all of them should be selectable from a
// dropdown instead of typed by hand. Read-only, additive — doesn't touch
// Tour Plan or DCR data itself.
fieldRouter.get("/managers", asyncHandler(async (req, res) => {
  const employee = await getFieldProfile(req.auth!.sub);
  const tenantSlug = req.auth!.tenantSlug!;

  const codes = new Set<string>();
  if (employee.reportingManager) codes.add(employee.reportingManager);
  const tourPlans = await TourPlanModel.find({ tenantSlug, employeeCode: employee.employeeCode })
    .select("assignedManager primaryManager")
    .lean();
  for (const tp of tourPlans) {
    if (tp.assignedManager) codes.add(tp.assignedManager);
    if (tp.primaryManager) codes.add(tp.primaryManager);
  }

  const managers = codes.size
    ? await EmployeeModel.find({ tenantSlug, employeeCode: { $in: Array.from(codes) } }).select("employeeCode name designation")
    : [];
  res.json({ data: managers.map(m => ({ employeeCode: m.employeeCode, name: m.name, designation: m.designation })) });
}));

fieldRouter.get("/doctors", asyncHandler(async (req, res) => {
  const employee = await getFieldProfile(req.auth!.sub);
  const doctors = await DoctorModel.find({ tenantSlug: req.auth!.tenantSlug, mappedEmployeeCode: employee.employeeCode, status: "ACTIVE" }).sort({ category: 1, name: 1 });
  res.json({ data: doctors.map(serializeDocument) });
}));

// Item — "Doctor DCR Report" tab needs this MR's FULL visit history so a
// doctor visited a while ago still shows up grouped under their card. The
// old .limit(30) (originally sized for the "recent activity" use case) was
// silently truncating the report for anyone with more than 30 total DCRs.
// An explicit ?limit= is still honoured for callers that only want recent
// rows; the report screen calls this with no limit.
fieldRouter.get("/dcrs", asyncHandler(async (req, res) => {
  const employee = await getFieldProfile(req.auth!.sub);
  const requestedLimit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 1000) : 500;
  const dcrs = await DcrModel.find({ tenantSlug: req.auth!.tenantSlug, employeeCode: employee.employeeCode }).sort({ visitDate: -1, createdAt: -1 }).limit(limit).populate("doctorId");
  res.json({ data: dcrs.map(serializeDocument) });
}));

fieldRouter.post("/dcrs", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = dcrSchema.parse(req.body);
  const month = currentUtcMonth();

  // ── PRD 12.2 — daily-uniqueness guard (app-layer; rejected visits excluded) ──
  if (body.doctorId) {
    const now = new Date();
    const visitDateOnly = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const sameDayVisit = await DcrModel.findOne({
      tenantSlug, employeeCode: employee.employeeCode, doctorId: body.doctorId,
      visitDateOnly, status: { $ne: "REJECTED" }
    });
    if (sameDayVisit) {
      throw new HttpError(409, "This doctor has already been visited today — one DCR per doctor per day.");
    }
  }

  // ── PRD 12.2 — over-visit soft warning (BEFORE saving, in POST /dcrs) ──
  // "DCR still saves — this is a soft warning, not a hard block." The MR can
  // override (overrideOverVisitWarning=true from the confirm modal); the
  // override itself is logged via overVisitFlag/overVisitCount for the
  // manager's DCR review table (amber highlight, Section 12.2).
  let overVisitFlag = false;
  let overVisitCount: number | null = null;
  if (body.doctorId) {
    const visitCount = await DcrModel.countDocuments({
      tenantSlug, employeeCode: employee.employeeCode, doctorId: body.doctorId,
      month, status: { $ne: "REJECTED" }
    });
    if (visitCount >= 3) {
      overVisitFlag = true;
      overVisitCount = visitCount + 1;
    }
  }

  const dcr = await DcrModel.create({
    tenantSlug,
    employeeCode: employee.employeeCode,
    doctorId: body.doctorId,
    productsDetailed: body.productsDetailed,
    notes: body.notes,
    callSession: body.callSession,
    callTime: body.callTime,
    samplesGiven: body.samplesGiven,
    inputsGiven: body.inputsGiven,
    jointWork: body.jointWork,
    checkInTime: body.checkInTime,
    checkOutTime: body.checkOutTime,
    gpsLocation: body.gpsLocation,
    hospitalClinic: body.hospitalClinic,
    visitDurationMinutes: body.visitDurationMinutes,
    promotionalMaterialsShared: body.promotionalMaterialsShared,
    visualAidUsed: body.visualAidUsed,
    prescriptionInterest: body.prescriptionInterest,
    productFeedback: body.productFeedback,
    competitorMentioned: body.competitorMentioned,
    followUpRequired: body.followUpRequired,
    followUpDate: body.followUpDate ? new Date(body.followUpDate) : undefined,
    visitDate: new Date(),
    month,
    overVisitFlag,
    overVisitCount,
    status: "SUBMITTED",
    adminVisibleAt: new Date()
  });
  await audit("FIELD_DCR_SUBMITTED", "Dcr", String(dcr._id), {
    tenantSlug, employeeCode: employee.employeeCode,
    overVisitFlag, overrideAcknowledged: body.overrideOverVisitWarning ?? false
  });
  await notifyReportingManager(
    tenantSlug,
    employee,
    "New DCR submitted",
    `${employee.name} (${employee.employeeCode}) submitted a new Daily Call Report.`
  );
  res.status(201).json({ data: serializeDocument(dcr), overVisitFlag, overVisitCount });
}));

// ── PRD 12.2 — Visit Summary: counts per doctor for this MR this month ──
fieldRouter.get("/visit-summary", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : currentUtcMonth();

  const counts = await DcrModel.aggregate([
    { $match: { tenantSlug, employeeCode: employee.employeeCode, month, status: { $ne: "REJECTED" } } },
    { $group: { _id: "$doctorId", visitCount: { $sum: 1 }, lastVisitDate: { $max: "$visitDate" } } }
  ]);
  const countsByDoctor = new Map(counts.map((c) => [String(c._id), c]));

  const doctors = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: employee.employeeCode, status: "ACTIVE" }).sort({ name: 1 });
  const data = doctors.map((doctor) => {
    const match = countsByDoctor.get(String(doctor._id));
    const visitCount = match?.visitCount ?? 0;
    return {
      doctorId: String(doctor._id),
      doctorName: doctor.name,
      specialty: doctor.specialty,
      visitCount,
      lastVisitDate: match?.lastVisitDate ?? null,
      overVisitFlag: visitCount >= 3,
      badge: visitCount === 0 ? "GREEN" : visitCount <= 2 ? "YELLOW" : "RED"
    };
  });
  res.json({ data, month });
}));

// ── PRD 12.2 — Unvisited Doctors: assigned to this MR, 0 visits this month ──
fieldRouter.get("/unvisited-doctors", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : currentUtcMonth();

  // PRD "Exact Solution": DoctorModel.find MUST include mappedEmployeeCode —
  // scope is always this MR's own territory, never the whole tenant.
  const myDoctors = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: employee.employeeCode, status: "ACTIVE" });
  const visitedIds = await DcrModel.distinct("doctorId", { tenantSlug, employeeCode: employee.employeeCode, month, status: { $ne: "REJECTED" } });
  const visitedIdSet = new Set(visitedIds.map((id) => String(id)));
  const unvisited = myDoctors.filter((d) => !visitedIdSet.has(String(d._id)));

  // Zivira_Project_Basic.docx Topic 8 — surface any exception already
  // logged this month so the UI doesn't prompt for a reason twice.
  const exceptions = await DoctorVisitExceptionModel.find({
    tenantSlug, employeeCode: employee.employeeCode, month,
    doctorId: { $in: unvisited.map((d) => d._id) }
  }).lean();
  const exceptionByDoctorId = new Map(exceptions.map((e) => [String(e.doctorId), e]));

  const data = unvisited.map((d) => {
    const serialized = serializeDocument(d) as Record<string, unknown>;
    const exception = exceptionByDoctorId.get(String(d._id));
    serialized.exceptionReason = exception?.reason ?? null;
    serialized.exceptionNotes = exception?.notes ?? null;
    return serialized;
  });

  res.json({ data, month });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 8 — Doctor Exception Management
// ══════════════════════════════════════════════════════════════════════
fieldRouter.get("/exception-reasons", asyncHandler(async (_req, res) => {
  res.json({ data: DOCTOR_EXCEPTION_REASONS });
}));

const doctorExceptionSchema = z.object({
  doctorId: z.string(),
  month: z.string().optional(),
  reason: z.enum(DOCTOR_EXCEPTION_REASONS),
  notes: z.string().optional()
});

fieldRouter.post("/doctor-exceptions", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = doctorExceptionSchema.parse(req.body);
  const month = body.month ?? currentUtcMonth();

  const doctor = await DoctorModel.findOne({ tenantSlug, _id: body.doctorId, mappedEmployeeCode: employee.employeeCode });
  if (!doctor) throw new HttpError(404, "Doctor not found in your territory");

  const record = await DoctorVisitExceptionModel.findOneAndUpdate(
    { tenantSlug, doctorId: body.doctorId, employeeCode: employee.employeeCode, month },
    { tenantSlug, doctorId: body.doctorId, employeeCode: employee.employeeCode, month, reason: body.reason, notes: body.notes ?? null },
    { upsert: true, new: true }
  );

  await audit("FIELD_DOCTOR_EXCEPTION_LOGGED", "DoctorVisitException", String(record._id), { tenantSlug, employeeCode: employee.employeeCode, doctorId: body.doctorId, month, reason: body.reason });
  await notifyReportingManager(
    tenantSlug,
    employee,
    "Doctor visit exception logged",
    `${employee.name} (${employee.employeeCode}) logged a visit exception for a doctor: ${body.reason}.`
  );
  res.status(201).json({ data: serializeDocument(record) });
}));

fieldRouter.get("/doctor-exceptions", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : currentUtcMonth();
  const exceptions = await DoctorVisitExceptionModel.find({ tenantSlug, employeeCode: employee.employeeCode, month }).sort({ createdAt: -1 });
  res.json({ data: exceptions.map(serializeDocument), month });
}));

// ── PRD 12.3A — product picker for the samples-distributed form (no free text) ──
fieldRouter.get("/products", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const products = await ProductModel.find({ tenantSlug, status: "ACTIVE" }).sort({ productName: 1, name: 1 }).limit(500);
  res.json({ data: products.map(serializeDocument) });
}));

// ── PRD 12.3B — gift/input item-type picker ──
fieldRouter.get("/gift-items", asyncHandler(async (_req, res) => {
  res.json({ data: GIFT_ITEM_TYPES });
}));

// ── PRD 12.5 — branch/GST list + lookup, needed on the Tour Plan form ──
fieldRouter.get("/branches", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const branches = await CompanyBranchModel.find({ tenantSlug, status: "ACTIVE" }).sort({ isHeadquarters: -1, branchName: 1 });
  res.json({ data: branches.map(serializeDocument) });
}));

fieldRouter.get("/branches/lookup", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const gst = typeof req.query.gst === "string" ? req.query.gst.toUpperCase().trim() : "";
  if (!gst) throw new HttpError(400, "gst query parameter is required");
  const branch = await CompanyBranchModel.findOne({ tenantSlug, gstNumber: gst });
  if (!branch) throw new HttpError(404, "No branch registered with this GST number");
  res.json({ data: serializeDocument(branch) });
}));

// ── PRD 12.1 — Tour Plan (MR side: submit + view own) ──
const tourPlanLocationSchema = z.object({
  date: z.string(),
  area: z.string(),
  town: z.string(),
  purpose: z.string().optional().default("")
});

const tourPlanSubmitSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be 'YYYY-MM'"),
  locations: z.array(tourPlanLocationSchema).min(1, "At least one location is required"),
  gstBranchCode: z.string().optional()
});

fieldRouter.get("/tour-plans", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const tps = await TourPlanModel.find({ tenantSlug, employeeCode: employee.employeeCode }).sort({ createdAt: -1 });
  res.json({ data: await enrichTourPlansWithNames(tenantSlug, tps) });
}));

fieldRouter.post("/tour-plans", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = tourPlanSubmitSchema.parse(req.body);

  if (!employee.reportingManager) {
    throw new HttpError(400, "You have no reporting manager assigned — contact your admin before submitting a Tour Plan.");
  }

  // Root cause of the manager-portal "already has an active Tour Plan" false
  // positives: nothing stopped an MR from submitting a second, wholly
  // unrelated Tour Plan for a month that already has one live. Block that
  // here so at most one non-VOIDED, non-REJECTED TP ever exists per MR per
  // month — reassignment/void is the only way to replace it after that.
  const existingActive = await TourPlanModel.findOne({
    tenantSlug,
    employeeCode: employee.employeeCode,
    month: body.month,
    status: { $in: ["DRAFT", "SUBMITTED", "APPROVED"] }
  });
  if (existingActive) {
    throw new HttpError(
      409,
      `You already have an active Tour Plan (${existingActive.tpId}) for ${body.month}. Add these locations to it instead, or ask your manager to void/reassign it first.`,
      { existingTpId: existingActive.tpId }
    );
  }

  let gstBranchName: string | undefined;
  if (body.gstBranchCode) {
    const branch = await CompanyBranchModel.findOne({ tenantSlug, gstNumber: body.gstBranchCode.toUpperCase().trim() });
    if (branch) gstBranchName = branch.branchName;
  }

  const created = await createTourPlanWithRetry(tenantSlug, employee.employeeCode, body.month, (tpId) =>
    TourPlanModel.create({
      tenantSlug,
      tpId,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      primaryManager: employee.reportingManager,
      assignedManager: employee.reportingManager,
      month: body.month,
      locations: body.locations,
      status: "SUBMITTED",
      gstBranchCode: body.gstBranchCode,
      gstBranchName
    })
  );

  await audit("FIELD_TOUR_PLAN_SUBMITTED", "TourPlan", String(created._id), { tenantSlug, employeeCode: employee.employeeCode, tpId: created.tpId });
  await notifyReportingManager(
    tenantSlug,
    employee,
    `New Tour Plan ${created.tpId} submitted`,
    `${employee.name} (${employee.employeeCode}) submitted a new Tour Plan for ${created.month}.`
  );
  const [enriched] = await enrichTourPlansWithNames(tenantSlug, [created]);
  res.status(201).json({ data: enriched });
}));

// PATCH /field/tour-plans/:tpId/locations — the escape hatch for the
// one-active-TP-per-month guard above: once an MR already has a live Tour
// Plan for the month, POST /tour-plans correctly refuses to create a second
// one, but until now there was no way to add more planned locations to the
// existing one either — the MR was stuck with a dead-end error and no next
// action short of asking their manager to void/reassign. This lets the
// owning MR append locations to their own Tour Plan directly.
const addLocationsSchema = z.object({
  locations: z.array(tourPlanLocationSchema).min(1, "At least one location is required")
});

fieldRouter.patch("/tour-plans/:tpId/locations", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = addLocationsSchema.parse(req.body);

  const tp = await TourPlanModel.findOne({ tenantSlug, tpId: req.params.tpId, employeeCode: employee.employeeCode });
  if (!tp) throw new HttpError(404, "Tour Plan not found");
  if (tp.status === "VOIDED" || tp.status === "REJECTED") {
    throw new HttpError(400, `Tour Plan ${tp.tpId} is ${tp.status.toLowerCase()} — submit a new Tour Plan instead of adding to this one.`);
  }

  tp.locations.push(...body.locations);
  // Adding new locations changes what was reviewed — if a manager had
  // already approved this plan, send it back to SUBMITTED so the new
  // locations actually get looked at instead of silently riding along on
  // an old approval.
  if (tp.status === "APPROVED") {
    tp.status = "SUBMITTED";
    tp.approvedBy = undefined;
    tp.approvedAt = undefined;
  }
  await tp.save();

  await audit("FIELD_TOUR_PLAN_LOCATIONS_ADDED", "TourPlan", String(tp._id), {
    tenantSlug, employeeCode: employee.employeeCode, tpId: tp.tpId, addedCount: body.locations.length
  });
  const [enriched] = await enrichTourPlansWithNames(tenantSlug, [tp]);
  res.json({ data: enriched });
}));

// ── Expense Claims — the GST Branch a Tour Plan carries is what a claim
// inherits (Section 12.5 follow-up: "how should [the GST branch] redirect to
// the admin/manager to claim their expenses — create a linkage for this").
// A claim can only be filed against one of the MR's own Tour Plans, and it
// always carries that TP's gstBranchCode/gstBranchName forward so Admin can
// report claims by branch.
const expenseClaimSubmitSchema = z.object({
  tpId: z.string().min(1, "Select the Tour Plan this expense belongs to"),
  category: z.enum(["Travel", "Lodging", "Food", "Local Conveyance", "Other"]),
  expenseDate: z.string().min(1, "Expense date is required"),
  amountRs: z.number().min(0.01, "Amount must be greater than 0"),
  description: z.string().optional()
});

fieldRouter.get("/expense-claims", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const claims = await ExpenseClaimModel.find({ tenantSlug, employeeCode: employee.employeeCode }).sort({ createdAt: -1 });
  const serialized = claims.map(serializeDocument);
  res.json({ data: await enrichWithEmployeeNames(tenantSlug, serialized, ["assignedManager"]) });
}));

fieldRouter.post("/expense-claims", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = expenseClaimSubmitSchema.parse(req.body);

  const tp = await TourPlanModel.findOne({ tenantSlug, tpId: body.tpId, employeeCode: employee.employeeCode });
  if (!tp) throw new HttpError(404, "Tour Plan not found — expenses can only be claimed against your own Tour Plans.");
  if (tp.status === "VOIDED" || tp.status === "REJECTED") {
    throw new HttpError(400, `Tour Plan ${tp.tpId} is ${tp.status.toLowerCase()} and can no longer receive expense claims.`);
  }
  if (!employee.reportingManager && !tp.assignedManager) {
    throw new HttpError(400, "No manager assigned to route this claim to — contact your admin.");
  }

  const created = await createExpenseClaimWithRetry(tenantSlug, employee.employeeCode, tp.month, (claimId) =>
    ExpenseClaimModel.create({
      tenantSlug,
      claimId,
      employeeCode: employee.employeeCode,
      employeeName: employee.name,
      assignedManager: tp.assignedManager || employee.reportingManager,
      tpId: tp.tpId,
      month: tp.month,
      gstBranchCode: tp.gstBranchCode,
      gstBranchName: tp.gstBranchName,
      category: body.category,
      expenseDate: body.expenseDate,
      amountRs: body.amountRs,
      description: body.description,
      status: "SUBMITTED"
    })
  );

  await audit("FIELD_EXPENSE_CLAIM_SUBMITTED", "ExpenseClaim", String(created._id), {
    tenantSlug, employeeCode: employee.employeeCode, claimId: created.claimId, tpId: tp.tpId, amountRs: body.amountRs
  });
  await notifyReportingManager(
    tenantSlug,
    employee,
    `New expense claim ${created.claimId} submitted`,
    `${employee.name} (${employee.employeeCode}) submitted an expense claim for ₹${body.amountRs} (${body.category}).`
  );
  res.status(201).json({ data: serializeDocument(created) });
}));

fieldRouter.post("/attendance/check-in", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const attendance = await AttendanceModel.findOneAndUpdate(
    { tenantSlug, employeeCode: employee.employeeCode, attendanceDate: today },
    { tenantSlug, employeeCode: employee.employeeCode, attendanceDate: today, status: "PRESENT", checkInAt: new Date() },
    { upsert: true, new: true }
  );
  await audit("FIELD_ATTENDANCE_CHECK_IN", "Attendance", String(attendance._id), { tenantSlug, employeeCode: employee.employeeCode });
  res.status(201).json({ data: serializeDocument(attendance) });
}));

fieldRouter.post("/attendance/check-out", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const attendance = await AttendanceModel.findOneAndUpdate(
    { tenantSlug, employeeCode: employee.employeeCode, attendanceDate: today },
    { checkOutAt: new Date() },
    { new: true }
  );
  res.status(200).json({ data: attendance ? serializeDocument(attendance) : null });
}));

// ══════════════════════════════════════════════════════════════════════
// New "Leave Apply" tab (FieldRepo) — MR submits a leave request with a
// reason (fixed dropdown + free-text "Other") and number of days. It goes
// straight to PENDING and notifies the MR's reporting Manager (same
// notifyReportingManager() every other field-force submission below
// already uses), who approves/rejects it from the Manager portal's new
// "Leave Requests" screen (manager.routes.ts). Reuses the existing
// LeaveApplicationModel (previously only wired to the HR/ESS portal) —
// no schema changes needed.
// ══════════════════════════════════════════════════════════════════════
fieldRouter.get("/leave-reasons", asyncHandler(async (_req, res) => {
  res.json({ data: LEAVE_REASONS });
}));

fieldRouter.get("/leave-applications", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const rows = await LeaveApplicationModel.find({ tenantSlug, employeeCode: employee.employeeCode }).sort({ createdAt: -1 }).limit(100);
  res.json({ data: rows.map(serializeDocument) });
}));

const leaveApplySchema = z.object({
  reason: z.string().min(1, "Please choose a reason"),
  customReason: z.string().optional(), // free text when reason === "Other"
  days: z.number().min(0.5, "Enter at least half a day").max(60, "Leave requests over 60 days must be raised with HR directly"),
  fromDate: z.string().optional() // "YYYY-MM-DD", defaults to today
});

fieldRouter.post("/leave-applications", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = leaveApplySchema.parse(req.body);

  const leaveType = body.reason === "Other" && body.customReason?.trim() ? body.customReason.trim() : body.reason;

  const from = body.fromDate ? new Date(`${body.fromDate}T00:00:00.000Z`) : new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + Math.ceil(body.days) - 1);

  const row = await LeaveApplicationModel.create({
    tenantSlug,
    employeeCode: employee.employeeCode,
    leaveType,
    fromDate: from,
    toDate: to,
    days: body.days,
    reason: leaveType,
    isLWP: false,
    status: "PENDING"
  });

  await audit("FIELD_LEAVE_APPLIED", "LeaveApplication", String(row._id), { tenantSlug, employeeCode: employee.employeeCode, days: body.days, reason: leaveType });

  // "it should be send an notification like leave submitted for manager
  // approval" — same reporting-manager notifier every other field-force
  // submission on this page already uses.
  await notifyReportingManager(
    tenantSlug,
    employee,
    "New leave request submitted",
    `${employee.name} (${employee.employeeCode}) applied for ${body.days} day(s) leave — ${leaveType}. Awaiting your approval.`
  );

  res.status(201).json({ data: serializeDocument(row) });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 3 — Salary Integration Engine (self view)
// Workflow: Employee → No DCR → HR Notification → Employee Explanation →
// Manager Approval → Payroll Released.
// ══════════════════════════════════════════════════════════════════════
fieldRouter.get("/payroll-status", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const now = new Date();
  const month = typeof req.query.month === "string" && req.query.month
    ? req.query.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const [record] = await syncPayrollStatuses(tenantSlug, [{ employeeCode: employee.employeeCode, name: employee.name, joinDate: employee.joinDate }], month);
  res.json({ data: record ? serializeDocument(record) : null, month });
}));

const payrollExplanationSchema = z.object({ explanation: z.string().min(5, "Please explain why DCRs were missed (min 5 characters)") });

fieldRouter.patch("/payroll-status/:id/explanation", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = payrollExplanationSchema.parse(req.body);

  const record = await PayrollStatusModel.findOne({ tenantSlug, _id: req.params.id, employeeCode: employee.employeeCode });
  if (!record) throw new HttpError(404, "Payroll status record not found");
  if (record.status !== "HOLD") throw new HttpError(400, `This record is ${record.status.toLowerCase().replace("_", " ")} — nothing to explain right now.`);

  record.employeeExplanation = body.explanation;
  record.explanationSubmittedAt = new Date();
  record.status = "EXPLANATION_SUBMITTED";
  await record.save();

  await audit("FIELD_PAYROLL_EXPLANATION_SUBMITTED", "PayrollStatus", String(record._id), { tenantSlug, employeeCode: employee.employeeCode, month: record.month });
  res.json({ data: serializeDocument(record) });
}));
