import { Router } from "express";
import mongoose from "mongoose";
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
import { TaskModel } from "../models/task.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { QuizAttemptModel } from "../models/quiz-attempt.model.js";
import { NoticeModel } from "../models/notice.model.js";
import { computeCoverageAnalysis2 } from "../utils/coverage-analysis.js";
import { CampaignVisitModel } from "../models/campaign-visit.model.js";

// PRD 12.3B — fixed gift/input item-type list for the compliance-tracked
// picker (Pen, Calendar, Notepad, Literature, ...). Kept as a constant so
// the frontend dropdown and backend validation never drift apart.
export const GIFT_ITEM_TYPES = ["Pen", "Calendar", "Notepad", "Literature", "Diary", "Mug", "Visiting Card Holder", "Other"] as const;

// ── Admin "Activities > Approvals" mirror ──────────────────────────────
// The admin portal's Approvals screens (TP/DCR/Leave) and the Expense
// Approval report each read from their own generic masters collection
// (src/masters/registry.ts, getMasterModel), completely separate from the
// real TourPlan/Dcr/LeaveApplication/ExpenseClaim collections these field
// endpoints write to. Without this, a real MR submission never showed up
// for the admin to approve at all. These helpers create/update the
// matching masters row right after the real submission succeeds, so the
// admin's Approvals tabs reflect real field-force activity. Failures here
// are logged but never fail the field-force request itself — the real
// submission (Tour Plan / DCR / Leave / Expense Claim) already succeeded
// and must not be rolled back over a mirroring problem.
async function mirrorApprovalRow(masterKey: string, tenantSlug: string, doc: Record<string, unknown>) {
  try {
    const Model = getMasterModel(masterKey);
    await Model.create({ tenantSlug, approvalStatus: "Pending", ...doc });
  } catch (err) {
    console.error(`[mirrorApprovalRow] failed to mirror into ${masterKey}:`, err);
  }
}

async function mirrorExpenseApprovalRow(tenantSlug: string, employeeName: string, month: string, amountRs: number) {
  try {
    const [year, monthNum] = month.split("-");
    const monthName = new Date(Date.UTC(Number(year), Number(monthNum) - 1, 1)).toLocaleString("en-US", { month: "long" });
    const Model = getMasterModel("expenseApprovalActive");
    const existing = await Model.findOne({ tenantSlug, fieldForceName: employeeName, month: monthName, year });
    if (existing) {
      const currentClaimed = Number((existing as any).claimedAmount) || 0;
      await Model.updateOne(
        { _id: existing._id },
        { $set: { claimedAmount: currentClaimed + amountRs, status: "Pending", submissionDate: new Date().toISOString().slice(0, 10) } }
      );
    } else {
      await Model.create({
        tenantSlug,
        fieldForceName: employeeName,
        month: monthName,
        year,
        status: "Pending",
        submissionDate: new Date().toISOString().slice(0, 10),
        claimedAmount: amountRs
      });
    }
  } catch (err) {
    console.error("[mirrorExpenseApprovalRow] failed:", err);
  }
}

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

function dateOnlyUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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
  const visitDateOnly = dateOnlyUTC(new Date());

  // ── PRD 12.2 — daily-uniqueness guard (app-layer; rejected visits excluded) ──
  if (body.doctorId) {
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
  // Phase 2 (checkout gating) — a submitted DCR for a doctor closes out that
  // doctor's planned campaign visit for today, if one exists (Phase 1's
  // CampaignVisitModel). Best-effort: never fails the DCR submit itself.
  if (body.doctorId) {
    try {
      await CampaignVisitModel.updateMany(
        { tenantSlug, employeeCode: employee.employeeCode, doctorId: body.doctorId, visitDate: visitDateOnly, status: "Planned" },
        { status: "Completed", dcrId: String(dcr._id) }
      );
    } catch (err) {
      console.error("[Field] Failed to close out campaign visit on DCR submit:", err);
    }
  }
  await mirrorApprovalRow("approvalDcr", tenantSlug, {
    sfName: employee.name,
    activityDate: dcr.visitDate,
    workType: body.hospitalClinic ? "Field Work" : "Admin Work",
    hospitalClinic: body.hospitalClinic ?? "",
    remarks: body.notes ?? ""
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
  await mirrorApprovalRow("approvalTp", tenantSlug, {
    sfName: employee.name,
    tpId: created.tpId,
    month: created.month,
    targetLocations: body.locations.map((l) => `${l.town} (${l.area})`).filter(Boolean).join(", "),
    managerName: employee.reportingManager ?? ""
  });
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
  await mirrorExpenseApprovalRow(tenantSlug, employee.name, tp.month, body.amountRs);
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

// Phase 2 — DCR day-checkout gating. Rather than assuming "today", this
// closes out whatever attendance day is currently OPEN (checkInAt set,
// checkOutAt still null) for this employee — that is either today's row,
// or a stranded prior day the rep never checked out of (see the "day still
// open from before" login-time check exposed via GET /checkout-status
// below). Checkout is blocked with a 409 while that day still has
// outstanding planned campaign visits (Phase 1's CampaignVisitModel,
// status "Planned") — the concrete, real definition of "the day's work is
// complete" used here, per the reference Call Manager app's Checkout gate.
fieldRouter.post("/attendance/check-out", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const openAttendance = await AttendanceModel.findOne({
    tenantSlug, employeeCode: employee.employeeCode,
    checkInAt: { $ne: null }, checkOutAt: null
  }).sort({ attendanceDate: -1 });
  if (!openAttendance) {
    // Nothing to check out of (never checked in) — same no-op-with-no-record
    // behaviour as before, the frontend already handles this case.
    res.status(200).json({ data: null });
    return;
  }
  const openDate = dateOnlyUTC(openAttendance.attendanceDate);
  const outstanding = await CampaignVisitModel.find({
    tenantSlug, employeeCode: employee.employeeCode, visitDate: openDate, status: "Planned"
  }).select("doctorName");
  if (outstanding.length > 0) {
    const names = outstanding.map((v) => v.doctorName).filter(Boolean).slice(0, 5).join(", ");
    const suffix = outstanding.length > 5 ? ", ..." : "";
    throw new HttpError(
      409,
      `You still have ${outstanding.length} planned campaign visit${outstanding.length === 1 ? "" : "s"} pending for ${openDate}${names ? ` (${names}${suffix})` : ""}. Submit a DCR for each planned doctor before checking out.`
    );
  }
  const attendance = await AttendanceModel.findOneAndUpdate(
    { _id: openAttendance._id },
    { checkOutAt: new Date() },
    { new: true }
  );
  await audit("FIELD_ATTENDANCE_CHECK_OUT", "Attendance", String(attendance!._id), { tenantSlug, employeeCode: employee.employeeCode, visitDate: openDate });
  res.status(200).json({ data: attendance ? serializeDocument(attendance) : null });
}));

// Phase 2 — "day still open from before" check. The field-rep frontend
// calls this on app load / after login; if it comes back blocked, the
// person is forced to a blocking Checkout Required screen (see
// components/checkout-guard.tsx) before they can use the rest of the app,
// mirroring how attendance/checkin systems typically hard-block until the
// outstanding item is resolved.
fieldRouter.get("/checkout-status", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const openAttendance = await AttendanceModel.findOne({
    tenantSlug, employeeCode: employee.employeeCode,
    checkInAt: { $ne: null }, checkOutAt: null
  }).sort({ attendanceDate: -1 });
  if (!openAttendance || openAttendance.attendanceDate.getTime() >= today.getTime()) {
    // No open attendance row, or the only open one is today's — today's own
    // checkout is gated at checkout time above, not at login time.
    res.json({ data: { blocked: false } });
    return;
  }
  const openDate = dateOnlyUTC(openAttendance.attendanceDate);
  const outstanding = await CampaignVisitModel.find({
    tenantSlug, employeeCode: employee.employeeCode, visitDate: openDate, status: "Planned"
  }).select("doctorName");
  res.json({
    data: {
      blocked: true,
      openDate,
      checkInAt: openAttendance.checkInAt,
      outstandingCount: outstanding.length,
      outstandingVisits: outstanding.map((v) => ({ id: String(v._id), doctorName: v.doctorName }))
    }
  });
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
  await mirrorApprovalRow("approvalLeave", tenantSlug, {
    fieldForceName: employee.name,
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
    leaveDays: body.days,
    leaveType,
    reasonForLeave: leaveType,
    division: "Zivira Labs Pvt Ltd"
  });

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


// ══════════════════════════════════════════════════════════════════════
// Round 18 — Field Rep Reports hub: read-only "my own data" views over
// admin-managed Activities/Options masters + Task Management. Reuses the
// exact same generic-masters collections (getMasterModel) and real
// TaskModel the admin side already writes to — no new schemas, and no
// data is exposed here beyond what this one employee already owns.
// ══════════════════════════════════════════════════════════════════════

// A handful of these admin-side generic masters (Leave Entitlement - Entry,
// Activity - Status) have no employeeCode foreign key at all — their
// "Employee Code" column is COMPUTED from a fieldForceName lookup at
// display time, never stored on the row itself (see registry.ts). Per the
// coordinator's guidance, the sensible minimal read here is the same
// fieldForceName-vs-real-name match the admin's Chemist Release/Lock fix
// already established (case/whitespace-insensitive — Round 17 already
// corrected the underlying employee names that used to make this an exact
// mismatch for some employees).
function nameMatchesEmployee(name: unknown, employee: { name: string }) {
  if (typeof name !== "string") return false;
  return name.trim().toLowerCase() === employee.name.trim().toLowerCase();
}

function omitFileData(row: Record<string, unknown>) {
  const { _id, fileData, ...rest } = row;
  return { id: String(_id), ...rest };
}

// GET /field/slides — Slide Upload - E-Detailing materials the admin has
// uploaded, filterable by Division / Sub Division / Brand — the fields
// this master actually stores (it has no separate Speciality/Therapy
// fields to filter by; see registry.ts's slideUploadEDetailing entry).
// Tenant-wide broadcast content, not per-employee, so every field rep in
// the tenant sees the same list — matches how the admin's own upload/view
// flow works. fileData is left out of the list response (can be large
// base64); GET .../download below serves the actual file.
fieldRouter.get("/slides", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const Model = getMasterModel("slideUploadEDetailing");
  const filter: Record<string, unknown> = { tenantSlug };
  if (typeof req.query.division === "string" && req.query.division) filter.division = req.query.division;
  if (typeof req.query.subDivision === "string" && req.query.subDivision) filter.subDivision = req.query.subDivision;
  if (typeof req.query.brand === "string" && req.query.brand) filter.brand = req.query.brand;
  const rows = (await Model.find(filter).sort({ uploadedOn: -1 }).lean()) as unknown as Record<string, unknown>[];
  res.json({ data: rows.map(omitFileData) });
}));

// GET /field/slides/:id/download — hands back the actual uploaded slide
// file, the exact base64-stored blob the admin's own Slide Upload panel
// writes (see uploads.routes.ts's FILE_STORING_UPLOAD_KEYS). That admin
// download route is gated to COMPANY_ADMIN only (companyRouter.use(...,
// requireCompanyAdmin)), so this reads the same collection under
// requireFieldForce instead rather than trying to reuse that route
// directly across portals.
fieldRouter.get("/slides/:id/download", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const Model = getMasterModel("slideUploadEDetailing");
  const row = (await Model.findOne({ _id: req.params.id, tenantSlug }).lean()) as Record<string, unknown> | null;
  if (!row || !row.fileData) throw new HttpError(404, "Slide file not found");
  const buffer = Buffer.from(row.fileData as string, "base64");
  res.setHeader("Content-Type", (row.mimeType as string) || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(String(row.fileName ?? "slide"))}"`);
  res.send(buffer);
}));

// GET /field/manuals / GET /field/manuals/:id/download — same pattern for
// User Manual Upload documents (also FILE_STORING_UPLOAD_KEYS, also
// tenant-wide broadcast content). This is the same real collection Round
// 17 cleaned the fake "Subject 1"/"File Name 1" seeded rows out of, so a
// field rep only ever sees genuinely uploaded manuals here.
fieldRouter.get("/manuals", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const Model = getMasterModel("userManualUpload");
  const rows = (await Model.find({ tenantSlug }).sort({ uploadedOn: -1 }).lean()) as unknown as Record<string, unknown>[];
  res.json({ data: rows.map(omitFileData) });
}));

fieldRouter.get("/manuals/:id/download", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const Model = getMasterModel("userManualUpload");
  const row = (await Model.findOne({ _id: req.params.id, tenantSlug }).lean()) as Record<string, unknown> | null;
  if (!row || !row.fileData) throw new HttpError(404, "Manual file not found");
  const buffer = Buffer.from(row.fileData as string, "base64");
  res.setHeader("Content-Type", (row.mimeType as string) || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(String(row.fileName ?? "manual"))}"`);
  res.send(buffer);
}));

// GET /field/leave-entitlement — CL/PL/SL/LOP eligibility + balance from
// the admin's Leave Entitlement - Entry generic master, matched by real
// name (see nameMatchesEmployee above). Extends the existing /field/leave
// screen (which already shows leave-applications history) with the
// balance half of "My Leave", rather than a whole separate screen.
fieldRouter.get("/leave-entitlement", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const Model = getMasterModel("leaveEntitlementEntry");
  const rows = (await Model.find({ tenantSlug }).sort({ year: -1 }).lean()) as unknown as Record<string, unknown>[];
  const mine = rows.filter((r) => nameMatchesEmployee(r.fieldForceName, employee));
  res.json({ data: mine.map((r) => ({ id: String(r._id), ...r })) });
}));

// GET /field/activity-status — same fieldForceName-match read against the
// admin's Activity - Status generic master (also has no employee foreign
// key stored on the row).
fieldRouter.get("/activity-status", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const Model = getMasterModel("activityStatus");
  const rows = (await Model.find({ tenantSlug }).sort({ createdAt: -1 }).lean()) as unknown as Record<string, unknown>[];
  const mine = rows.filter((r) => nameMatchesEmployee(r.fieldForceName, employee));
  res.json({ data: mine.map((r) => ({ id: String(r._id), ...r })) });
}));

// GET /field/tasks — real Task Management assignments. Unlike the two
// generic masters above, TaskModel already has a real
// assignedToEmployeeCode foreign key (see task.model.ts), so this is a
// clean per-employee query with no name-matching needed.
fieldRouter.get("/tasks", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const rows = await TaskModel.find({ tenantSlug, assignedToEmployeeCode: employee.employeeCode }).sort({ createdAt: -1 });
  res.json({ data: rows.map(serializeDocument) });
}));

// PATCH /field/tasks/:id/status — minimal self-service transition: a field
// rep may acknowledge a New task (-> Pending) or mark it done (->
// Completed). Every other status in TaskModel's 7-state enum
// (Closed/ReOpen/Hold/Cancel) is a manager/admin lifecycle decision, not
// exposed here — deliberately the smaller subset the coordinator asked
// for rather than handing the assignee the full enum.
const taskStatusSchema = z.object({ status: z.enum(["Pending", "Completed"]) });
fieldRouter.patch("/tasks/:id/status", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = taskStatusSchema.parse(req.body);
  const task = await TaskModel.findOne({ _id: req.params.id, tenantSlug, assignedToEmployeeCode: employee.employeeCode });
  if (!task) throw new HttpError(404, "Task not found");
  if (task.status === "Closed" || task.status === "Cancel") {
    throw new HttpError(400, `This task is already ${task.status.toLowerCase()} and can no longer be updated.`);
  }
  task.status = body.status;
  await task.save();
  await audit("FIELD_TASK_STATUS_UPDATED", "Task", String(task._id), { tenantSlug, employeeCode: employee.employeeCode, status: body.status });
  res.json({ data: serializeDocument(task) });
}));

// ═══════════════════════════════════════════════════════════════════════
// Round 19 — Reports hub additions: Quiz-taking, Camp/Market Survey entry,
// Notice read-tracking, and "My Coverage" (field-scoped Coverage Analysis).
// ═══════════════════════════════════════════════════════════════════════

// ── Item 1: Quiz-taking ─────────────────────────────────────────────────
// QuizModel has no employee/role targeting field at all (checked the full
// schema) — every quiz is meant to be visible to every field rep, so this
// simply lists all active quizzes rather than inventing a targeting scheme
// the admin side doesn't support yet. Mirrors the admin's shapeQuiz()
// helper (quiz.routes.ts) — never sends correctOptionIndex or
// uploadedFileData to the client taking the quiz.
function shapeQuizForAttempt(quiz: Record<string, unknown>) {
  // Round 20 fix — this previously spread `...rest` (which carries the
  // Mongo `_id` ObjectId field) without ever setting a plain `id` string,
  // so the frontend's activeQuiz.id was always undefined. The take-quiz
  // screen then posted to `/field/quizzes/undefined/attempts`, which
  // Mongoose rejected with "Cast to ObjectId failed for value 'undefined'".
  // GET /field/quizzes (the list route below) already built its own `id`
  // field manually and never had this bug — only the single-quiz detail
  // route did.
  const { _id, uploadedFileData: _uploadedFileData, questions, ...rest } = quiz as any;
  const qs = Array.isArray(questions) ? questions : [];
  return {
    ...rest,
    id: String(_id),
    questions: qs.map((q: any) => ({ questionText: q.questionText, options: q.options, points: q.points }))
  };
}

fieldRouter.get("/quizzes", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const quizzes = await QuizModel.find({ tenantSlug, isActive: true }).sort({ createdAt: -1 }).lean();
  const attempts = await QuizAttemptModel.find({ tenantSlug, employeeCode: employee.employeeCode }).lean();
  const attemptsByQuiz = new Map<string, typeof attempts>();
  for (const a of attempts) {
    const list = attemptsByQuiz.get(a.quizId) || [];
    list.push(a);
    attemptsByQuiz.set(a.quizId, list);
  }
  const data = quizzes
    // Round 20 — the admin's Quiz Authoring screen lets an admin save a
    // quiz shell (title/category/etc.) before ever adding questions to it
    // (QuizModel.questions defaults to [], and the admin's own create/edit
    // routes never require at least one) — a normal in-progress authoring
    // state, not a data bug. Showing one of these here produced exactly
    // the broken take-screen the coordinator flagged (a quiz with no
    // questions and only a dead "Submit Quiz" button), so quizzes with
    // zero questions are filtered out of the field-facing list entirely —
    // they simply aren't ready for a rep to take yet.
    .filter((q) => Array.isArray(q.questions) && q.questions.length > 0)
    .map((q) => {
      const qId = String(q._id);
      const mine = (attemptsByQuiz.get(qId) || []).slice().sort((a, b) => (b.submittedAt?.getTime?.() ?? 0) - (a.submittedAt?.getTime?.() ?? 0));
      const best = mine.reduce((max, a) => (a.score > (max?.score ?? -1) ? a : max), mine[0] as (typeof mine)[number] | undefined);
      return {
        id: qId,
        title: q.title,
        description: q.description,
        category: q.category,
        questionCount: q.questions.length,
        totalPossible: q.questions.reduce((s: number, qq: any) => s + (qq.points ?? 0), 0),
        attemptCount: mine.length,
        bestScore: best ? best.score : null,
        lastAttemptAt: mine[0]?.submittedAt ?? null
      };
    });
  res.json({ data });
}));

fieldRouter.get("/quizzes/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  // Round 20 follow-up — a second report of the exact same "Cast to
  // ObjectId failed for value 'undefined'" error (on a DIFFERENT quiz that
  // does have real questions) means something can still hand this route a
  // non-ObjectId string, most likely a stale frontend/backend deploy still
  // running pre-fix code somewhere in the pipeline. Validating the id
  // shape here means this route can never again leak that raw Mongoose
  // CastError to the UI, regardless of what a stale client sends — a
  // malformed id now gets a clean, honest 400 instead of a scary 500.
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, "Invalid quiz reference — please go back to My Quizzes and open it again.");
  }
  const quiz = await QuizModel.findOne({ _id: req.params.id, tenantSlug, isActive: true }).lean();
  if (!quiz) throw new HttpError(404, "Quiz not found");
  // Round 20 — defense in depth alongside the list-route filter above: even
  // if a quiz with zero questions is somehow opened directly, fail with a
  // clear message here rather than rendering a take-screen with nothing to
  // answer and a submit button that can only error.
  if (!Array.isArray((quiz as any).questions) || (quiz as any).questions.length === 0) {
    throw new HttpError(400, "This quiz has no questions yet — check back once Admin has added some.");
  }
  res.json({ data: shapeQuizForAttempt(quiz as unknown as Record<string, unknown>) });
}));

const quizAttemptSchema = z.object({
  answers: z.array(z.object({ questionIndex: z.number().int().min(0), selectedOptionIndex: z.number().int().min(0) }))
});
fieldRouter.post("/quizzes/:id/attempts", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = quizAttemptSchema.parse(req.body);
  // Round 20 follow-up — same defense as GET /quizzes/:id above: never let
  // a malformed/undefined id reach Mongoose as a raw CastError.
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, "Invalid quiz reference — please go back to My Quizzes and open it again.");
  }
  const quiz = await QuizModel.findOne({ _id: req.params.id, tenantSlug, isActive: true });
  if (!quiz) throw new HttpError(404, "Quiz not found");
  const questions = quiz.questions as unknown as Array<{ options: string[]; correctOptionIndex: number; points: number }>;
  if (!questions.length) throw new HttpError(400, "This quiz has no questions yet.");
  const totalPossible = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);
  // Server-side scoring only — never trust a client-supplied score, and
  // unlike the admin's own /company/quiz/:id/attempts route, employeeCode
  // is forced from the authenticated field profile, never read from the
  // request body, so one MR can never submit an attempt as another.
  let score = 0;
  for (const answer of body.answers) {
    const question = questions[answer.questionIndex];
    if (!question) continue;
    if (answer.selectedOptionIndex === question.correctOptionIndex) score += question.points ?? 0;
  }
  const attempt = await QuizAttemptModel.create({
    tenantSlug,
    quizId: String(quiz._id),
    employeeCode: employee.employeeCode,
    answers: body.answers,
    score,
    totalPossible,
    submittedAt: new Date()
  });
  await audit("FIELD_QUIZ_ATTEMPT_SUBMITTED", "quizAttempt", String(attempt._id), { tenantSlug, quizId: String(quiz._id), employeeCode: employee.employeeCode, score, totalPossible });
  res.status(201).json({ data: serializeDocument(attempt) });
}));

// GET /field/quiz-attempts — this employee's full attempt history across
// every quiz, joined with each quiz's title, for the score-history view.
fieldRouter.get("/quiz-attempts", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const attempts = await QuizAttemptModel.find({ tenantSlug, employeeCode: employee.employeeCode }).sort({ submittedAt: -1 }).lean();
  const quizIds = [...new Set(attempts.map((a) => a.quizId))];
  const quizzes = await QuizModel.find({ tenantSlug, _id: { $in: quizIds } }).lean();
  const titleByQuizId = new Map(quizzes.map((q) => [String(q._id), q.title]));
  res.json({
    data: attempts.map((a) => ({
      id: String(a._id),
      quizId: a.quizId,
      quizTitle: titleByQuizId.get(a.quizId) || "(deleted quiz)",
      score: a.score,
      totalPossible: a.totalPossible,
      submittedAt: a.submittedAt
    }))
  });
}));

// ── Item 2: Camp entry + Market Survey entry ────────────────────────────
// Both are the admin's own generic masters (src/masters/registry.ts),
// with no employeeCode foreign key stored on the row — same shape as
// leaveEntitlementEntry/activityStatus above, so history reads use the
// same nameMatchesEmployee() match against organizer/employee. Submission
// forces organizer/employee to the caller's own real name server-side so
// one MR can never author an entry as someone else.
//
// campEntry maps cleanly to a field-rep self-submission (doctor/products
// fields reuse the existing /field/doctors and /field/products lookups).
// marketSurveyEntry's hq/patch/chemist fields reference master collections
// (territoryHqMaster/patchNameMaster/dealers) with no existing field-portal
// list endpoint of their own; rather than building three new single-use
// picker endpoints this round, those three fields are accepted as free
// text on submission (a competitor survey's HQ/patch/chemist context is
// informational, not a real FK the rest of the system joins against).
function nextCampCode(existingCodes: string[]) {
  let max = 0;
  for (const code of existingCodes) {
    const m = /^CMP-(\d+)$/.exec(String(code || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `CMP-${String(max + 1).padStart(4, "0")}`;
}

fieldRouter.get("/camps", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const Model = getMasterModel("campEntry");
  const rows = (await Model.find({ tenantSlug }).sort({ createdAt: -1 }).lean()) as unknown as Record<string, unknown>[];
  const mine = rows.filter((r) => nameMatchesEmployee(r.organizer, employee));
  res.json({ data: mine.map((r) => ({ id: String((r as any)._id), ...r })) });
}));

const campEntrySchema = z.object({
  campName: z.string().min(1),
  campDate: z.string().min(1),
  hospital: z.string().optional().default(""),
  doctor: z.string().optional().default(""),
  noOfPatients: z.coerce.number().int().min(0).optional().default(0),
  productsDisplayed: z.string().optional().default(""),
  remarks: z.string().optional().default("")
});
fieldRouter.post("/camps", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = campEntrySchema.parse(req.body);
  const Model = getMasterModel("campEntry");
  const existing = (await Model.find({ tenantSlug }).select({ campCode: 1 }).lean()) as unknown as Array<{ campCode?: string }>;
  const campCode = nextCampCode(existing.map((r) => r.campCode || ""));
  const row = await Model.create({
    tenantSlug,
    campCode,
    campName: body.campName,
    campDate: body.campDate,
    hospital: body.hospital,
    doctor: body.doctor,
    organizer: employee.name,
    noOfPatients: body.noOfPatients,
    productsDisplayed: body.productsDisplayed,
    remarks: body.remarks,
    status: "Active"
  });
  await audit("FIELD_CAMP_ENTRY_CREATED", "campEntry", String(row._id), { tenantSlug, employeeCode: employee.employeeCode, campCode });
  res.status(201).json({ data: { id: String(row._id), ...row.toObject() } });
}));

fieldRouter.get("/market-surveys", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const Model = getMasterModel("marketSurveyEntry");
  const rows = (await Model.find({ tenantSlug }).sort({ createdAt: -1 }).lean()) as unknown as Record<string, unknown>[];
  const mine = rows.filter((r) => nameMatchesEmployee(r.employee, employee));
  res.json({ data: mine.map((r) => ({ id: String((r as any)._id), ...r })) });
}));

const marketSurveySchema = z.object({
  surveyDate: z.string().min(1),
  hq: z.string().optional().default(""),
  patch: z.string().optional().default(""),
  chemist: z.string().optional().default(""),
  competitorCompany: z.string().optional().default(""),
  competitorBrand: z.string().min(1),
  competitorProduct: z.string().optional().default(""),
  competitorMrp: z.coerce.number().min(0).optional().default(0),
  availability: z.enum(["Available", "Out of Stock", "Short Supply"]).optional().default("Available"),
  feedback: z.string().optional().default(""),
  remarks: z.string().optional().default("")
});
fieldRouter.post("/market-surveys", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = marketSurveySchema.parse(req.body);
  const Model = getMasterModel("marketSurveyEntry");
  const row = await Model.create({
    tenantSlug,
    surveyDate: body.surveyDate,
    employee: employee.name,
    hq: body.hq,
    patch: body.patch,
    chemist: body.chemist,
    competitorCompany: body.competitorCompany,
    competitorBrand: body.competitorBrand,
    competitorProduct: body.competitorProduct,
    competitorMrp: body.competitorMrp,
    availability: body.availability,
    feedback: body.feedback,
    remarks: body.remarks
  });
  await audit("FIELD_MARKET_SURVEY_CREATED", "marketSurveyEntry", String(row._id), { tenantSlug, employeeCode: employee.employeeCode });
  res.status(201).json({ data: { id: String(row._id), ...row.toObject() } });
}));

// ── Item 3: Notification visibility (unread count + mark-as-read) ──────
// readBy already existed on NoticeModel but was never written to for
// field-rep reads. Filter matches the exact same "from my manager" set
// GET /field/notices already uses (postedBy:"system", audience:"MR",
// targetEmployeeCode:mine) so the unread badge and the notices list stay
// consistent with each other.
fieldRouter.get("/notices/unread-count", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const count = await NoticeModel.countDocuments({
    tenantSlug,
    postedBy: "system",
    audience: "MR",
    targetEmployeeCode: employee.employeeCode,
    readBy: { $ne: employee.employeeCode }
  });
  res.json({ data: { count } });
}));

fieldRouter.post("/notices/mark-read", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  await NoticeModel.updateMany(
    { tenantSlug, postedBy: "system", audience: "MR", targetEmployeeCode: employee.employeeCode },
    { $addToSet: { readBy: employee.employeeCode } }
  );
  res.json({ data: { ok: true } });
}));

// ── Item 4: "My Coverage" — field-scoped Coverage Analysis 2 ───────────
// Reuses the exact same aggregation the admin's Coverage Analysis 2 report
// runs (computeCoverageAnalysis2, extracted from masters-actions.routes.ts
// this round into src/utils/coverage-analysis.ts) — employeeCode is forced
// to the caller's own resolved employee code, never read from the query
// string, so a field rep can only ever see their own coverage.
fieldRouter.get("/coverage", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const month = Number(req.query.month) || new Date().getUTCMonth() + 1;
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const rows = await computeCoverageAnalysis2(tenantSlug, { month, year, employeeCode: employee.employeeCode });
  res.json({ data: rows[0] ?? null, month, year });
}));

// ═══════════════════════════════════════════════════════════════════════
// Phase 1 — "Call Manager" reference build: Campaign Planning & Execution.
// See src/models/campaign-visit.model.ts for the schema rationale (a real
// dedicated model, not a generic master, so the later Deviation phase has
// a clean employeeCode/doctorId FK relationship to build on via the same
// `source` field this round already adds but does not yet expose a UI
// for).
// ═══════════════════════════════════════════════════════════════════════

// GET /field/campaigns — the admin-authored Campaign catalog
// (campaignMaster generic master). No employee/territory targeting exists
// on it yet (same "untargeted = show everyone" precedent as Quiz — Round
// 19 item 1), so every active campaign is shown to every field rep.
fieldRouter.get("/campaigns", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const Model = getMasterModel("campaignMaster");
  const rows = (await Model.find({ tenantSlug, status: "Active" }).sort({ startDate: -1 }).lean()) as unknown as Record<string, unknown>[];
  res.json({ data: rows.map((r) => ({ id: String((r as any)._id), ...r })) });
}));

// GET /field/campaign-visits — this employee's own planned (or, later,
// deviation) campaign visits. `date=YYYY-MM-DD` scopes to one day (used by
// Campaign Execution's "Today's Campaign" — the same rows Campaign
// Planning just wrote); omitted, it returns the employee's full plan
// history, newest first (used by the Campaign Planning tab's own list).
fieldRouter.get("/campaign-visits", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const filter: Record<string, unknown> = { tenantSlug, employeeCode: employee.employeeCode };
  if (typeof req.query.date === "string" && req.query.date.trim()) filter.visitDate = req.query.date.trim();
  const rows = await CampaignVisitModel.find(filter).sort({ visitDate: -1, createdAt: -1 });
  res.json({ data: rows.map(serializeDocument) });
}));

const campaignVisitSchema = z.object({
  campaignId: z.string().min(1),
  doctorId: z.string().min(1),
  visitDate: z.string().min(1),
  notes: z.string().optional().default("")
});

// POST /field/campaign-visits — Campaign Planning's submit action. Doctor
// must be one of THIS employee's own mapped/active doctors (same real
// coverage list GET /field/doctors already serves) — never trusted from
// the client beyond the id, so an MR can't plan a visit to a doctor
// outside their own territory. Campaign must be a real, active
// campaignMaster row. Always created with source: "planned" — the later
// Deviation phase is the only thing that will ever create a "deviation"
// row here.
fieldRouter.post("/campaign-visits", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  const body = campaignVisitSchema.parse(req.body);

  const CampaignModel = getMasterModel("campaignMaster");
  const campaign = await CampaignModel.findOne({ _id: body.campaignId, tenantSlug, status: "Active" }).lean();
  if (!campaign) throw new HttpError(404, "Campaign not found");

  const doctor = await DoctorModel.findOne({ _id: body.doctorId, tenantSlug, mappedEmployeeCode: employee.employeeCode, status: "ACTIVE" });
  if (!doctor) throw new HttpError(404, "Doctor not found in your coverage");

  const row = await CampaignVisitModel.create({
    tenantSlug,
    campaignId: body.campaignId,
    campaignName: (campaign as any).campaignName,
    employeeCode: employee.employeeCode,
    employeeName: employee.name,
    doctorId: body.doctorId,
    doctorName: doctor.name,
    visitDate: body.visitDate,
    source: "planned",
    status: "Planned",
    notes: body.notes
  });

  // Admin visibility mirror — same write-through pattern already used for
  // Camp/Market Survey (mirrorApprovalRow) — real source of truth stays
  // CampaignVisitModel; this is purely so GenericMasterTable gives the
  // admin a real, filterable view under Daily MR Work.
  try {
    const MirrorModel = getMasterModel("campaignVisitEntry");
    await MirrorModel.create({
      tenantSlug,
      fieldForceName: employee.name,
      campaignName: (campaign as any).campaignName,
      doctorName: doctor.name,
      visitDate: body.visitDate,
      source: "planned",
      status: "Planned"
    });
  } catch (err) {
    console.error("[campaign-visits] failed to mirror into campaignVisitEntry:", err);
  }

  await audit("FIELD_CAMPAIGN_VISIT_PLANNED", "CampaignVisit", String(row._id), { tenantSlug, employeeCode: employee.employeeCode, campaignId: body.campaignId, doctorId: body.doctorId, visitDate: body.visitDate });
  res.status(201).json({ data: serializeDocument(row) });
}));

// Phase 2 — lets the rep close out a planned campaign visit as "Cancelled"
// (with a reason) instead of a DCR, e.g. when resolving a stranded prior
// day's checkout block for a doctor they genuinely could not see. Reuses
// the "Cancelled" status Phase 1's schema already reserved for this — no
// new deviation UI or workflow introduced.
const campaignVisitResolveSchema = z.object({
  status: z.enum(["Completed", "Cancelled"]),
  notes: z.string().optional()
});

fieldRouter.post("/campaign-visits/:id/resolve", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const employee = await getFieldProfile(req.auth!.sub);
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, "Invalid campaign visit reference.");
  }
  const body = campaignVisitResolveSchema.parse(req.body);
  const visit = await CampaignVisitModel.findOne({ _id: req.params.id, tenantSlug, employeeCode: employee.employeeCode });
  if (!visit) throw new HttpError(404, "Campaign visit not found");
  visit.status = body.status;
  if (body.notes) visit.notes = body.notes;
  await visit.save();
  await audit("FIELD_CAMPAIGN_VISIT_RESOLVED", "CampaignVisit", String(visit._id), { tenantSlug, employeeCode: employee.employeeCode, status: body.status });
  res.json({ data: serializeDocument(visit) });
}));
