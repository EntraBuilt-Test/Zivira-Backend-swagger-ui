import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { requireAuth, requireEmployee } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { EmployeeModel } from "../models/employee.model.js";
import { OnboardingModel } from "../models/onboarding.model.js";
import { AttendanceModel } from "../models/attendance.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { LeaveTypeModel } from "../models/leave-type.model.js";
import { LoanModel } from "../models/loan.model.js";
import { PayrollRunModel } from "../models/payroll-run.model.js";
import { CompOffModel } from "../models/comp-off.model.js";
import { audit } from "../utils/audit.js";
import { serializeDocument } from "../utils/serialize.js";

// Employee Self-Service (ESS) — Zivira_HR_Client_Requirement_1B.docx
// "complete employee journey": EMPLOYEE LOGIN -> CREATE PASSWORD ->
// FILL ONBOARDING (8 steps) -> SUBMIT ONBOARDING, plus the day-to-day
// ESS screens (own Attendance, Leave, Payslip, Loans) from 1A §31's
// RBAC table ("Employee: Profile, Attendance, Leave, Payslip, Tax,
// Loans, Documents — own records only").
//
// Every route here is gated by requireEmployee, which puts tenantSlug
// AND employeeCode on req.auth — every query below filters by BOTH, so
// one employee can never read or write another employee's data.
export const essRouter = Router();

essRouter.use(requireAuth, requireEmployee);

// ── Profile ─────────────────────────────────────────────────────────
essRouter.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!employee) throw new HttpError(404, "Employee record not found");
    const onboarding = await OnboardingModel.findOne({ tenantSlug, employeeCode }).lean();
    res.json({
      data: {
        ...serializeDocument(employee),
        onboardingStatus: onboarding?.status ?? "NOT_STARTED"
      }
    });
  })
);

// ── Onboarding (doc: FILL ONBOARDING 8 steps -> SUBMIT / SAVE & EXIT) ─
essRouter.get(
  "/onboarding",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode });
    if (!row) throw new HttpError(404, "Onboarding has not been initiated by HR yet");
    res.json({ data: serializeDocument(row) });
  })
);

const onboardingSaveSchema = z.object({
  personal: z.record(z.any()).optional(),
  address: z.record(z.any()).optional(),
  education: z.array(z.record(z.any())).optional(),
  experience: z.array(z.record(z.any())).optional(),
  bank: z.record(z.any()).optional(),
  statutory: z.record(z.any()).optional()
});

// "SAVE & EXIT" — partial save, does not require every field, moves
// status forward but never past IN_PROGRESS.
essRouter.put(
  "/onboarding",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const body = onboardingSaveSchema.parse(req.body);
    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode });
    if (!row) throw new HttpError(404, "Onboarding has not been initiated by HR yet");
    if (row.status === "SUBMITTED" || row.status === "COMPLETED") {
      throw new HttpError(400, "Onboarding has already been submitted and can no longer be edited");
    }

    if (body.personal !== undefined) row.personal = body.personal;
    if (body.address !== undefined) row.address = body.address;
    if (body.education !== undefined) row.education = body.education;
    if (body.experience !== undefined) row.experience = body.experience;
    if (body.bank !== undefined) row.bank = body.bank;
    if (body.statutory !== undefined) row.statutory = body.statutory;
    if (row.status === "EMAIL_SENT" || row.status === "PASSWORD_CREATED" || row.status === "INITIATED" || row.status === "NOT_STARTED") {
      row.status = "IN_PROGRESS";
    }

    await row.save();
    await audit("ONBOARDING_SAVED", "Onboarding", String(row._id), { tenantSlug, employeeCode });
    res.json({ data: serializeDocument(row) });
  })
);

// Employee uploads a document — the actual bytes come in as a base64
// data: URL (fileData), capped at 3MB so review docs must be reasonably
// sized. HR's document-verification screen can then open/preview exactly
// what was submitted instead of only seeing a filename.
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024; // 3MB

const documentUploadSchema = z.object({
  fileName: z.string().min(1),
  fileData: z.string().min(1).startsWith("data:", "fileData must be a data: URL"),
  fileType: z.string().optional(),
  fileSize: z.number().int().positive().optional()
});

essRouter.post(
  "/onboarding/documents/:docName",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const body = documentUploadSchema.parse(req.body);

    // Re-derive the byte size from the base64 payload itself rather than
    // trusting the client-reported fileSize — the 3MB limit has to hold
    // even if the browser lied or the field was omitted.
    const base64Part = body.fileData.split(",")[1] ?? "";
    const approxBytes = Math.floor((base64Part.length * 3) / 4);
    if (approxBytes > MAX_DOCUMENT_BYTES) {
      throw new HttpError(400, "File is larger than the 3MB limit. Please upload a smaller file.");
    }

    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode });
    if (!row) throw new HttpError(404, "Onboarding has not been initiated by HR yet");
    const doc = row.documents.find((d: any) => d.name === req.params.docName);
    if (!doc) throw new HttpError(404, "Document not found");
    doc.fileName = body.fileName;
    doc.fileData = body.fileData;
    doc.fileType = body.fileType ?? null;
    doc.fileSize = approxBytes;
    doc.status = "UPLOADED";
    doc.rejectReason = null;
    await row.save();
    await audit("ONBOARDING_DOCUMENT_UPLOADED", "Onboarding", String(row._id), { tenantSlug, employeeCode, document: req.params.docName });
    res.json({ data: serializeDocument(row) });
  })
);

// New request item 3 — "after uploading it the driving license must be
// automatically fill the details in the HR portal and the field repo
// portal under the driving license name." The employee's browser OCRs
// the uploaded Driving License photo (free, on-device — Tesseract.js,
// no API key) right after upload and, if it finds a plausible license
// number, calls this route to write it straight onto the SAME
// EmployeeModel.drivingLicense field the HR portal's "Driving License"
// field and FieldRepo already read — so both portals pick it up
// immediately with no separate sync step. The employee can see and
// correct the auto-filled value afterwards (HR's Employee Profile is
// read-only for this field today, same as before this change — nothing
// about who can EDIT it was altered, only that it can now be set
// automatically instead of only by HR typing it on Add Employee).
const drivingLicenseSchema = z.object({ drivingLicense: z.string().min(1).max(40) });

essRouter.patch(
  "/profile/driving-license",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const body = drivingLicenseSchema.parse(req.body);
    const employee = await EmployeeModel.findOneAndUpdate(
      { tenantSlug, employeeCode },
      { $set: { drivingLicense: body.drivingLicense.trim() } },
      { new: true }
    );
    if (!employee) throw new HttpError(404, "Employee record not found");
    await audit("EMPLOYEE_DRIVING_LICENSE_AUTOFILLED", "Employee", String(employee._id), { tenantSlug, employeeCode });
    res.json({ data: serializeDocument(employee) });
  })
);

// SUBMIT ONBOARDING — doc's final review-and-submit step. Requires
// personal/address/bank to be filled and every document at least
// UPLOADED (VERIFIED comes later from HR's review step).
essRouter.post(
  "/onboarding/submit",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode });
    if (!row) throw new HttpError(404, "Onboarding has not been initiated by HR yet");
    if (row.status === "SUBMITTED" || row.status === "COMPLETED") {
      throw new HttpError(400, "Onboarding has already been submitted");
    }
    if (!row.personal || !row.address || !row.bank) {
      throw new HttpError(400, "Personal Info, Address, and Bank Details sections are required before submitting");
    }
    // A REJECTED document must be re-uploaded (not just left as-is) before
    // the employee can submit — otherwise a rejected file would silently
    // sail through since it's technically no longer "PENDING".
    const missingDocs = row.documents
      .filter((d: any) => d.status === "PENDING" || d.status === "REJECTED")
      .map((d: any) => d.name);
    if (missingDocs.length > 0) {
      throw new HttpError(400, `Please upload the following documents before submitting: ${missingDocs.join(", ")}`);
    }

    row.status = "SUBMITTED";
    row.submittedAt = new Date();
    await row.save();
    await audit("ONBOARDING_SUBMITTED", "Onboarding", String(row._id), { tenantSlug, employeeCode });
    res.json({ data: serializeDocument(row) });
  })
);

// ── Attendance (own records only) ──────────────────────────────────
essRouter.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const query: Record<string, unknown> = { tenantSlug, employeeCode };
    if (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)) {
      const [year, mon] = req.query.month.split("-").map((v) => parseInt(v, 10));
      query.attendanceDate = { $gte: new Date(Date.UTC(year, mon - 1, 1)), $lt: new Date(Date.UTC(year, mon, 1)) };
    }
    const rows = await AttendanceModel.find(query).sort({ attendanceDate: -1 }).limit(400).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

// Self-service punch in / punch out — Zivira_HR_Client_Requirement_1A.docx
// §9 Attendance Module says attendance must be capturable by the employee
// and flow straight into the same AttendanceModel rows HR's Attendance
// Register reads, rather than being a separate, disconnected record. One
// row per calendar day (the model's existing unique tenantSlug +
// employeeCode + attendanceDate index enforces that), upserted here.
const punchSchema = z.object({ action: z.enum(["IN", "OUT"]) });

essRouter.post(
  "/attendance/punch",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const { action } = punchSchema.parse(req.body);
    const now = new Date();
    const attendanceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let row = await AttendanceModel.findOne({ tenantSlug, employeeCode, attendanceDate });

    if (action === "IN") {
      if (row?.checkInAt) throw new HttpError(400, "You have already punched in today");
      if (!row) {
        row = new AttendanceModel({ tenantSlug, employeeCode, attendanceDate, status: "PRESENT", checkInAt: now });
      } else {
        row.checkInAt = now;
        row.status = "PRESENT";
      }
    } else {
      if (!row?.checkInAt) throw new HttpError(400, "Please punch in before punching out");
      if (row.checkOutAt) throw new HttpError(400, "You have already punched out today");
      row.checkOutAt = now;
    }

    await row.save();
    await audit("ATTENDANCE_PUNCH", "Attendance", String(row._id), { tenantSlug, employeeCode, action });
    res.json({ data: serializeDocument(row) });
  })
);

// ── Leave (own records: view + apply) ──────────────────────────────
essRouter.get(
  "/leave",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const rows = await LeaveApplicationModel.find({ tenantSlug, employeeCode }).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

essRouter.get(
  "/leave/types",
  asyncHandler(async (req, res) => {
    const { tenantSlug } = req.auth!;
    const rows = await LeaveTypeModel.find({ tenantSlug, status: "ACTIVE" }).sort({ leaveTypeDesc: 1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

// ── Comp-Off (Phase 2 item, own balance only) ──────────────────────
essRouter.get(
  "/comp-offs",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const rows = await CompOffModel.find({ tenantSlug, employeeCode }).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

const leaveApplySchema = z.object({
  leaveType: z.string().min(1),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  reason: z.string().optional(),
  // Phase 2 "Comp-Off" item: when set, this application spends the given
  // AVAILABLE CompOff credit (see comp-off.model.ts) instead of drawing
  // from a leave-type balance.
  compOffId: z.string().optional()
});

essRouter.post(
  "/leave",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const body = leaveApplySchema.parse(req.body);
    if (body.toDate < body.fromDate) throw new HttpError(400, "To Date cannot be before From Date");

    const days = Math.round((body.toDate.getTime() - body.fromDate.getTime()) / 86400000) + 1;
    // "Loss of Pay" / "LWP" leave types flow into the payroll LWP
    // deduction (see company.routes.ts POST /payroll/runs); every other
    // leave type is treated as paid.
    const isLWP = /loss of pay|lwp/i.test(body.leaveType);

    let compOff = null;
    if (body.compOffId) {
      compOff = await CompOffModel.findOne({ _id: body.compOffId, tenantSlug, employeeCode, status: "AVAILABLE" });
      if (!compOff) throw new HttpError(400, "This Comp-Off credit is not available to spend");
    }

    const row = await LeaveApplicationModel.create({
      tenantSlug,
      employeeCode,
      leaveType: body.leaveType,
      fromDate: body.fromDate,
      toDate: body.toDate,
      days,
      reason: body.reason ?? null,
      isLWP: compOff ? false : isLWP, // spending a Comp-Off credit is always paid time off
      isCompOff: !!compOff,
      compOffId: compOff ? compOff._id : null,
      status: "PENDING"
    });

    if (compOff) {
      compOff.status = "USED";
      compOff.usedInLeaveId = row._id;
      await compOff.save();
    }

    await audit("LEAVE_APPLIED", "LeaveApplication", String(row._id), { tenantSlug, employeeCode });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

// ── Payslips (own Payroll Run rows — Basic Tax Visibility included) ─
essRouter.get(
  "/payslips",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    // An employee should only see a payslip once HR has moved past DRAFT —
    // DRAFT rows are still subject to change during HR's review.
    const rows = await PayrollRunModel.find({ tenantSlug, employeeCode, status: { $in: ["HR_APPROVED", "LOCKED"] } })
      .sort({ month: -1 })
      .lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

essRouter.get(
  "/payslips/:id",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const row = await PayrollRunModel.findOne({ _id: req.params.id, tenantSlug, employeeCode, status: { $in: ["HR_APPROVED", "LOCKED"] } }).lean();
    if (!row) throw new HttpError(404, "Payslip not found");
    res.json({ data: serializeDocument(row) });
  })
);

// ── Loans (own records only) ───────────────────────────────────────
essRouter.get(
  "/loans",
  asyncHandler(async (req, res) => {
    const { tenantSlug, employeeCode } = req.auth!;
    const rows = await LoanModel.find({ tenantSlug, employeeCode }).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);
