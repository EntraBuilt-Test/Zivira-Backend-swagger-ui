import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { requireAuth, requireCompanyAdmin } from "../http/auth.js";
import { mastersRouter } from "./masters.routes.js";
import { uploadsRouter } from "./uploads.routes.js";
import { mailRouter } from "./mail.routes.js";
import { mastersActionsRouter } from "./masters-actions.routes.js";
import { quizRouter } from "./quiz.routes.js";
import { dashboardsRouter } from "./dashboard.routes.js";
import { MASTERS } from "../masters/registry.js";
import { getMasterModel } from "../models/master-record.model.js";
import { HttpError } from "../http/errors.js";
import { AttendanceModel } from "../models/attendance.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { ProductModel } from "../models/product.model.js";
import { audit } from "../utils/audit.js";
import { AuditLogModel } from "../models/audit-log.model.js";
import { serializeDocument } from "../utils/serialize.js";
import { notifyEmployeeEmail, notifyFieldRep, notifyManager, notifyOnboardingCredentials, notifyPersonalOnboardingLink } from "../utils/notify.js";
import { StockistModel } from "../models/stockist.model.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { FieldForceModel } from "../models/fieldforce.model.js";
import { ProductCategoryModel } from "../models/product-category.model.js";
import { ProductBrandModel } from "../models/product-brand.model.js";
import { ProductCatalogModel } from "../models/product-catalog.model.js";
import { DoctorCategoryModel } from "../models/doctor-category.model.js";
import { DoctorSpecialityModel } from "../models/doctor-speciality.model.js";
import { DoctorQualificationModel } from "../models/doctor-qualification.model.js";
import { ProductGroupModel } from "../models/product-group.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { HolidayModel } from "../models/holiday.model.js";
import { SfcModel } from "../models/sfc.model.js";
import { ExpenseModel } from "../models/expense.model.js";
import { HospitalModel } from "../models/hospital.model.js";
import { UnlistedDoctorModel } from "../models/unlisted-doctor.model.js";
import { CompanyBranchModel } from "../models/company-branch.model.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { enrichTourPlansWithNames } from "../utils/enrich-tour-plans.js";
import { enrichWithEmployeeNames } from "../utils/enrich-employee-names.js";
import { computeComplianceRows } from "../utils/compliance.js";
import { syncPayrollStatuses } from "../utils/payroll.js";
import { PayrollStatusModel } from "../models/payroll-status.model.js";
import { SalaryStructureModel } from "../models/salary-structure.model.js";
import { PayrollRunModel } from "../models/payroll-run.model.js";
import { OnboardingModel } from "../models/onboarding.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { LoanModel } from "../models/loan.model.js";
import { ArrearModel } from "../models/arrear.model.js";
import { StatutoryRuleModel } from "../models/statutory-rule.model.js";
import { CompOffModel } from "../models/comp-off.model.js";
import { UserModel } from "../models/user.model.js";
import bcrypt from "bcryptjs";
import { computeRepAnalysisRows, computeManagerJointWorkRows } from "../utils/rep-manager-analysis.js";
import { DoctorVisitExceptionModel } from "../models/doctor-visit-exception.model.js";
import { computeProductExposureRows } from "../utils/product-analytics.js";
import { SampleAllocationModel } from "../models/sample-allocation.model.js";
import { createSampleAllocationWithRetry } from "../utils/sample-allocation-id.js";
import { computeSampleDistribution } from "../utils/sample-distribution.js";
import { computeKpiEngine } from "../utils/kpi-engine.js";
import { computeAlerts } from "../utils/alerts-engine.js";
import { CompanyConfigModel, DEFAULT_CONFIG, getConfigValue } from "../models/company-config.model.js";

// Case-insensitive exact match, so "division" filters agree regardless of how a value
// was originally cased (Excel import vs. manual entry through the Add form).
function exactCaseInsensitive(value: string) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

// Shared page/limit parsing for routes that back large collections (e.g. the ~20k-row
// doctor/customer import) so the client never has to pull the whole collection at once.
function parsePagination(req: { query: Record<string, unknown> }, opts: { defaultLimit: number; maxLimit: number }) {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? opts.defaultLimit), 10) || opts.defaultLimit;
  const limit = Math.min(Math.max(1, rawLimit), opts.maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}


const employeeSchema = z.object({
  name: z.string().min(2),
  employeeCode: z.string().min(2),
  designation: z.string().min(2),
  division: z.string().min(2),
  reportingManager: z.string().optional(),
  territory: z.string().min(2),
  role: z.enum(["NBH", "BH", "RBM", "ZBM", "ABM", "SR_MR", "MR", "OTHER"]),
  drivingLicense: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  // These two were missing from the schema entirely — zod's .parse()
  // silently strips any key not declared here, so the Add Employee form
  // was sending email + joinDate on every create, and the backend was
  // quietly throwing both away before they ever reached MongoDB. That's
  // why Employment Details always showed "—" for Joining Date and
  // Official Email regardless of what HR typed in.
  email: z.string().email().optional().nullable(),
  joinDate: z.string().optional().nullable(),
  // Item 2 — separate personal/gmail address HR captures on the Add New
  // Employee form. Declared here (not just on the model) for the same
  // reason as the email/joinDate fix above: an undeclared key gets
  // silently stripped by zod's .parse() before it reaches Mongo.
  personalEmail: z.string().email().optional().nullable()
});

const doctorSchema = z.object({
  doctorCode: z.string().optional(),
  name: z.string().min(2),
  specialty: z.string().min(2),
  category: z.enum(["A", "B", "C"]).default("C"),
  state: z.string().min(2),
  city: z.string().min(2),
  territory: z.string().min(2),
  mappedEmployeeCode: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  // New request item 1 — same bug shape as the earlier employee
  // email/joinDate/personalEmail fix: these two were never declared here,
  // so zod's .parse() silently stripped them from every POST /doctors
  // call even though the Add Listed Doctor form collects both — which is
  // why "Qualification" and "Mobile" showed "-" for doctors added through
  // this form, not just for older seed rows.
  qualification: z.string().optional().nullable(),
  phone: z.string().optional().nullable()
});

const productSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  category: z.string().min(2),
  division: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

export const companyRouter = Router();

companyRouter.use(requireAuth, requireCompanyAdmin);
// mastersActionsRouter and uploadsRouter declare specific routes like
// /mail-auto-rules and /admin-settings/:kind; they must be mounted BEFORE
// mastersRouter, whose generic GET/POST "/:key" would otherwise swallow
// those requests first (Express matches routers in mount order) and throw
// a false "Unknown master: mail-auto-rules" from requireConfig().
companyRouter.use("/masters", mastersActionsRouter);
companyRouter.use("/masters", uploadsRouter);
companyRouter.use("/masters", mastersRouter);
companyRouter.use("/mail", mailRouter);
companyRouter.use("/quiz", quizRouter);
companyRouter.use("/dashboards", dashboardsRouter);

companyRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [employeeCount, doctorCount, activeProductCount, dcrSubmittedToday, attendanceMarkedToday, recentDoctors, recentEmployees] =
      await Promise.all([
        EmployeeModel.countDocuments({ tenantSlug, status: "ACTIVE" }),
        DoctorModel.countDocuments({ tenantSlug, status: "ACTIVE" }),
        ProductModel.countDocuments({ tenantSlug, status: "ACTIVE" }),
        DcrModel.countDocuments({ tenantSlug, visitDate: { $gte: today }, status: { $in: ["SUBMITTED", "MANAGER_APPROVED", "APPROVED"] } }),
        AttendanceModel.countDocuments({ tenantSlug, attendanceDate: { $gte: today } }),
        DoctorModel.find({ tenantSlug }).sort({ createdAt: -1 }).limit(5),
        EmployeeModel.find({ tenantSlug }).sort({ createdAt: -1 }).limit(5)
      ]);

    res.json({
      data: {
        metrics: { employeeCount, doctorCount, activeProductCount, dcrSubmittedToday, attendanceMarkedToday },
        recentDoctors: recentDoctors.map(serializeDocument),
        recentEmployees: recentEmployees.map(serializeDocument)
      }
    });
  })
);

companyRouter.get(
  "/employees",
  asyncHandler(async (req, res) => {
    const query: Record<string, unknown> = { tenantSlug: req.auth!.tenantSlug };
    if (typeof req.query.division === "string" && req.query.division.trim()) {
      query.division = exactCaseInsensitive(req.query.division.trim());
    }
    const employees = await EmployeeModel.find(query).sort({ createdAt: -1 });
    res.json({ data: employees.map(serializeDocument) });
  })
);

companyRouter.post(
  "/employees",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = employeeSchema.parse(req.body);
    const employee = await EmployeeModel.create({ ...body, tenantSlug });
    await audit("EMPLOYEE_CREATED", "Employee", String(employee._id), { tenantSlug, employeeCode: employee.employeeCode });
    res.status(201).json({ data: serializeDocument(employee) });
  })
);

// Request C, item 4 — there was previously no way to correct a single
// employee field (e.g. territory) after creation without a full reseed.
// Additive, partial-update route; only the fields present in the body are
// changed, everything else on the employee record is left exactly as-is.
companyRouter.patch(
  "/employees/:employeeCode",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = employeeSchema.partial().parse(req.body);
    const employee = await EmployeeModel.findOneAndUpdate(
      { tenantSlug, employeeCode: req.params.employeeCode },
      { $set: body },
      { new: true }
    );
    if (!employee) throw new HttpError(404, "Employee not found");
    await audit("EMPLOYEE_UPDATED", "Employee", String(employee._id), { tenantSlug, employeeCode: employee.employeeCode });
    res.json({ data: serializeDocument(employee) });
  })
);

companyRouter.get(
  "/doctors",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 100, maxLimit: 500 });
    const [doctors, total] = await Promise.all([
      DoctorModel.find({ tenantSlug }).sort({ createdAt: -1, doctorCode: 1 }).skip(skip).limit(limit),
      DoctorModel.countDocuments({ tenantSlug })
    ]);
    res.json({
      data: doctors.map(serializeDocument),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  })
);

// Distinct, paginated clinic names sourced from the doctor collection (Excel Customer
// sheet's "Clinic name" column) — backs the Hospital screen without fetching all ~20k
// doctor documents just to dedupe one field.
companyRouter.get(
  "/doctors/clinics",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 100, maxLimit: 500 });
    const values = await DoctorModel.distinct("clinicName", { tenantSlug });
    const names = [...new Set(
      values
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim())
    )].sort((a, b) => a.localeCompare(b));
    const total = names.length;
    res.json({
      data: names.slice(skip, skip + limit),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  })
);

// Doctors whose dob or anniversaryDate falls in the given month (1-12), for the Doctor
// Celebrations report. Filtered server-side so this doesn't require fetching the whole
// ~20k-row doctor collection just to find one month's birthdays/anniversaries.
companyRouter.get(
  "/doctors/celebrations",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const month = parseInt(String(req.query.month ?? ""), 10);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new HttpError(400, "month query param (1-12) is required");
    }
    const doctors = await DoctorModel.find({
      tenantSlug,
      $expr: {
        $or: [
          { $eq: [{ $month: "$dob" }, month] },
          { $eq: [{ $month: "$anniversaryDate" }, month] }
        ]
      }
    }).sort({ name: 1 });
    res.json({ data: doctors.map(serializeDocument) });
  })
);

companyRouter.post(
  "/doctors",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = doctorSchema.parse(req.body);
    const doctor = await DoctorModel.create({ ...body, tenantSlug });
    await audit("DOCTOR_CREATED", "Doctor", String(doctor._id), { tenantSlug, category: doctor.category });
    res.status(201).json({ data: serializeDocument(doctor) });
  })
);

// New request item 1 — there was no update route for an existing doctor
// at all, so the Listed Doctor Master's Edit screen only ever updated its
// own local React state ("Mock update for now") and threw the change away
// on refresh. This is what actually lets a fix — filling in a missing
// Doctor Code / Qualification / Mobile — persist to MongoDB.
companyRouter.patch(
  "/doctors/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = doctorSchema.partial().parse(req.body);
    const doctor = await DoctorModel.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: body },
      { new: true }
    );
    if (!doctor) throw new HttpError(404, "Doctor not found");
    await audit("DOCTOR_UPDATED", "Doctor", String(doctor._id), { tenantSlug, doctorCode: doctor.doctorCode });
    res.json({ data: serializeDocument(doctor) });
  })
);

companyRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const query: Record<string, unknown> = { tenantSlug: req.auth!.tenantSlug };
    if (typeof req.query.subDivision === "string" && req.query.subDivision.trim()) {
      query.subDivision = req.query.subDivision.trim();
    }
    if (typeof req.query.division === "string" && req.query.division.trim()) {
      query.division = req.query.division.trim();
    }
    const products = await ProductModel.find(query).sort({ createdAt: -1 });
    res.json({ data: products.map(serializeDocument) });
  })
);

companyRouter.post(
  "/products",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = productSchema.parse(req.body);
    const product = await ProductModel.create({ ...body, tenantSlug });
    await audit("PRODUCT_CREATED", "Product", String(product._id), { tenantSlug, code: product.code });
    res.status(201).json({ data: serializeDocument(product) });
  })
);

// GET /company/dcrs — admin sees DCRs only after 24h delay
companyRouter.get(
  "/dcrs",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) {
      query.employeeCode = req.query.employeeCode.trim().toUpperCase();
    }
    if (typeof req.query.callSession === "string" && req.query.callSession.trim()) {
      query.callSession = req.query.callSession.trim().toUpperCase();
    }

    const dcrs = await DcrModel.find(query).sort({ createdAt: -1 }).limit(200).populate("doctorId");
    const serialized = dcrs.map(serializeDocument);
    res.json({ data: await enrichWithEmployeeNames(tenantSlug, serialized, ["employeeCode", "managerApprovedBy"]) });
  })
);

companyRouter.get(
  "/dcrs/:id",
  asyncHandler(async (req, res) => {
    const dcr = await DcrModel.findOne({ _id: req.params.id, tenantSlug: req.auth!.tenantSlug }).populate("doctorId");
    if (!dcr) throw new Error("DCR not found");
    const [enriched] = await enrichWithEmployeeNames(req.auth!.tenantSlug!, [serializeDocument(dcr)], ["employeeCode", "managerApprovedBy"]);
    res.json({ data: enriched });
  })
);

// POST /company/dcrs/:id/approve — admin final approval
companyRouter.post(
  "/dcrs/:id/approve",
  asyncHandler(async (req, res) => {
    const dcr = await DcrModel.findOne({ _id: req.params.id, tenantSlug: req.auth!.tenantSlug });
    if (!dcr) throw new Error("DCR not found");
    dcr.status = "APPROVED";
    await dcr.save();
    res.json({ data: serializeDocument(dcr) });
  })
);

const dcrWorkTypeSchema = z.object({
  workType: z.enum(["Field Work", "Holiday", "Weekly Off", "Transit", "Meeting"])
});

// PATCH /company/dcrs/:id/work-type — kept for backward compatibility with
// any caller that only wants to change Work Type.
companyRouter.patch(
  "/dcrs/:id/work-type",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = dcrWorkTypeSchema.parse(req.body);
    const dcr = await DcrModel.findOne({ _id: req.params.id, tenantSlug });
    if (!dcr) throw new HttpError(404, "DCR not found");

    const previousWorkType = dcr.workType;
    dcr.workType = body.workType;
    await dcr.save();
    await audit("ADMIN_DCR_EDITED", "Dcr", String(dcr._id), { tenantSlug, employeeCode: dcr.employeeCode, previousWorkType, workType: body.workType });

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: dcr.employeeCode }).lean();
    const manager = employee?.reportingManager
      ? await EmployeeModel.findOne({ tenantSlug, employeeCode: employee.reportingManager }).lean()
      : null;

    await notifyFieldRep({
      tenantSlug,
      employeeCode: dcr.employeeCode,
      employeeEmail: employee?.email,
      employeeName: employee?.name,
      title: "DCR edited by Admin",
      message: `Your DCR dated ${dcr.visitDate.toDateString()} was updated by Admin to Work Type: ${body.workType}.`
    });

    if (manager) {
      await notifyManager({
        tenantSlug,
        managerEmployeeCode: manager.employeeCode,
        managerEmail: manager.email,
        managerName: manager.name,
        title: "DCR edited by Admin",
        message: `${employee?.name ?? dcr.employeeCode}'s DCR dated ${dcr.visitDate.toDateString()} was updated by Admin to Work Type: ${body.workType}.`
      });
    }

    res.json({ data: serializeDocument(dcr) });
  })
);

// PATCH /company/dcrs/:id — "Update/Delete > DCR Edit" full-row edit. The
// Admin DCR Edit screen's Edit button opens every editable field on the
// row (not just Work Type) — visit date, hospital/clinic, work type,
// notes, check-in/out time and follow-up — and saves them all against the
// REAL Dcr document that the field-force MR's own history and the
// manager's review queue both read from, so the change is immediately
// visible in both portals. Notifies both the MR and their manager with a
// summary of what changed.
const dcrFullEditSchema = z.object({
  workType: z.enum(["Field Work", "Holiday", "Weekly Off", "Transit", "Meeting"]).optional(),
  visitDate: z.string().optional(),
  hospitalClinic: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  checkInTime: z.string().nullable().optional(),
  checkOutTime: z.string().nullable().optional(),
  followUpRequired: z.boolean().optional(),
  followUpDate: z.string().nullable().optional(),
  prescriptionInterest: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]).nullable().optional()
});

companyRouter.patch(
  "/dcrs/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = dcrFullEditSchema.parse(req.body);
    const dcr = await DcrModel.findOne({ _id: req.params.id, tenantSlug });
    if (!dcr) throw new HttpError(404, "DCR not found");

    const changes: string[] = [];
    if (body.workType !== undefined && body.workType !== dcr.workType) {
      changes.push(`Work Type: ${dcr.workType} → ${body.workType}`);
      dcr.workType = body.workType;
    }
    if (body.visitDate !== undefined) {
      const parsed = new Date(body.visitDate);
      if (!isNaN(parsed.getTime()) && parsed.getTime() !== dcr.visitDate.getTime()) {
        changes.push(`Visit Date: ${dcr.visitDate.toDateString()} → ${parsed.toDateString()}`);
        dcr.visitDate = parsed;
      }
    }
    if (body.hospitalClinic !== undefined && body.hospitalClinic !== dcr.hospitalClinic) {
      changes.push(`Hospital/Clinic updated`);
      dcr.hospitalClinic = body.hospitalClinic;
    }
    if (body.notes !== undefined && body.notes !== dcr.notes) {
      changes.push(`Notes updated`);
      dcr.notes = body.notes ?? undefined;
    }
    if (body.checkInTime !== undefined && body.checkInTime !== dcr.checkInTime) {
      changes.push(`Check-In Time: ${dcr.checkInTime ?? "-"} → ${body.checkInTime ?? "-"}`);
      dcr.checkInTime = body.checkInTime;
    }
    if (body.checkOutTime !== undefined && body.checkOutTime !== dcr.checkOutTime) {
      changes.push(`Check-Out Time: ${dcr.checkOutTime ?? "-"} → ${body.checkOutTime ?? "-"}`);
      dcr.checkOutTime = body.checkOutTime;
    }
    if (body.followUpRequired !== undefined && body.followUpRequired !== dcr.followUpRequired) {
      changes.push(`Follow-Up Required: ${body.followUpRequired ? "Yes" : "No"}`);
      dcr.followUpRequired = body.followUpRequired;
    }
    if (body.followUpDate !== undefined) {
      const parsed = body.followUpDate ? new Date(body.followUpDate) : null;
      dcr.followUpDate = parsed;
      changes.push(`Follow-Up Date updated`);
    }
    if (body.prescriptionInterest !== undefined && body.prescriptionInterest !== dcr.prescriptionInterest) {
      changes.push(`Prescription Interest: ${body.prescriptionInterest ?? "-"}`);
      dcr.prescriptionInterest = body.prescriptionInterest;
    }

    await dcr.save();
    await audit("ADMIN_DCR_EDITED", "Dcr", String(dcr._id), { tenantSlug, employeeCode: dcr.employeeCode, changes });

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: dcr.employeeCode }).lean();
    const manager = employee?.reportingManager
      ? await EmployeeModel.findOne({ tenantSlug, employeeCode: employee.reportingManager }).lean()
      : null;
    const summary = changes.length ? changes.join("; ") : "minor details updated";

    await notifyFieldRep({
      tenantSlug,
      employeeCode: dcr.employeeCode,
      employeeEmail: employee?.email,
      employeeName: employee?.name,
      title: "DCR edited by Admin",
      message: `Your DCR dated ${dcr.visitDate.toDateString()} was updated by Admin. ${summary}.`
    });

    if (manager) {
      await notifyManager({
        tenantSlug,
        managerEmployeeCode: manager.employeeCode,
        managerEmail: manager.email,
        managerName: manager.name,
        title: "DCR edited by Admin",
        message: `${employee?.name ?? dcr.employeeCode}'s DCR dated ${dcr.visitDate.toDateString()} was updated by Admin. ${summary}.`
      });
    }

    res.json({ data: serializeDocument(dcr) });
  })
);


companyRouter.get(
  "/manager-activity",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const managers = await EmployeeModel.find({ tenantSlug, role: { $in: ["ABM", "RBM", "ZBM", "NBH"] } }).sort({ name: 1 });

    const rows = await Promise.all(managers.map(async (manager) => {
      const team = await EmployeeModel.find({ tenantSlug, reportingManager: manager.employeeCode });
      const codes = team.map((employee) => employee.employeeCode);
      const [approved, rejected, pending] = await Promise.all([
        DcrModel.countDocuments({ tenantSlug, employeeCode: { $in: codes }, status: { $in: ["MANAGER_APPROVED", "APPROVED"] } }),
        DcrModel.countDocuments({ tenantSlug, employeeCode: { $in: codes }, status: "REJECTED" }),
        DcrModel.countDocuments({ tenantSlug, employeeCode: { $in: codes }, status: "SUBMITTED" })
      ]);

      return {
        manager: serializeDocument(manager),
        approved,
        rejected,
        autoApproved: 0,
        pending,
        autoApproveRate: 0,
        flagged: false
      };
    }));

    res.json({ data: rows });
  })
);
// ─── Stockist Routes ───────────────────────────────────────────────

const stockistValidation = z.object({
  name: z.string().min(2),
  erpCode: z.string().optional(),
  state: z.string().min(2),
  hqName: z.string().min(2),
  address: z.string().min(2),
  phone: z.string().optional(),
  fieldForceName: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

companyRouter.get("/stockists", asyncHandler(async (req, res) => {
  const stockists = await StockistModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ state: 1 });
  res.json({ data: stockists.map(serializeDocument) });
}));

companyRouter.post("/stockists", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = stockistValidation.parse(req.body);
  const stockist = await StockistModel.create({ ...body, tenantSlug });
  await audit("STOCKIST_CREATED", "Stockist", String(stockist._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(stockist) });
}));

companyRouter.post("/stockists/bulk", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const rows = z.array(stockistValidation).parse(req.body.rows);
  let inserted = 0, updated = 0;
  for (const row of rows) {
    const key = row.erpCode
      ? { tenantSlug, erpCode: row.erpCode }
      : { tenantSlug, name: row.name, hqName: row.hqName };
    const result = await StockistModel.updateOne(key, { ...row, tenantSlug }, { upsert: true });
    if (result.upsertedCount) inserted++; else updated++;
  }
  res.json({ data: { inserted, updated, total: rows.length } });
}));
/**
 * TASK 2 — ADD THIS BLOCK to the bottom of company.routes.ts
 * (before the final closing of the file, after the /dcrs/:id/approve route)
 *
 * Paste everything between the ===BEGIN=== and ===END=== markers.
 */

// ===BEGIN===

// GET /company/field-force-status — live status of all field employees for today
companyRouter.get(
  "/field-force-status",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const employees = await EmployeeModel.find({
      tenantSlug,
      status: "ACTIVE",
      role: { $in: ["MR", "SR_MR", "ABM", "RBM", "ZBM", "NBH", "BH"] }
    }).sort({ name: 1 });

    const rows = await Promise.all(
      employees.map(async (emp) => {
        const [dcr, attendance] = await Promise.all([
          DcrModel.findOne({
            tenantSlug,
            employeeCode: emp.employeeCode,
            visitDate: { $gte: today }
          })
            .sort({ createdAt: -1 })
            .lean(),
          AttendanceModel.findOne({
            tenantSlug,
            employeeCode: emp.employeeCode,
            attendanceDate: { $gte: today }
          })
            .sort({ createdAt: -1 })
            .lean()
        ]);

        // Count calls made today
        const callsToday = await DcrModel.countDocuments({
          tenantSlug,
          employeeCode: emp.employeeCode,
          visitDate: { $gte: today }
        });

        const dcrStatus = dcr
          ? (dcr.status as string)
          : "NOT_SUBMITTED";

        const attendanceStatus = attendance
          ? (attendance.status as string)
          : "ABSENT";

        return {
          employeeCode: emp.employeeCode,
          name: emp.name,
          territory: emp.territory,
          role: emp.role,
          dcrStatus,
          attendanceStatus,
          callsToday,
          lastSeenAt: dcr?.updatedAt ?? null
        };
      })
    );

    res.json({ data: rows });
  })
);

// GET /company/notices — list notices for this tenant
companyRouter.get(
  "/notices",
  asyncHandler(async (req, res) => {
    const { NoticeModel } = await import("../models/notice.model.js");
    const notices = await NoticeModel.find({ tenantSlug: req.auth!.tenantSlug })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ data: notices.map(serializeDocument) });
  })
);

// POST /company/notices — post a new notice
companyRouter.post(
  "/notices",
  asyncHandler(async (req, res) => {
    const { NoticeModel } = await import("../models/notice.model.js");
    const noticeSchema = z.object({
      title: z.string().min(3).max(200),
      message: z.string().min(5),
      audience: z.enum(["ALL", "MR", "MANAGER", "ADMIN"]).default("ALL"),
      priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL")
    });
    const tenantSlug = req.auth!.tenantSlug!;
    const body = noticeSchema.parse(req.body);
    const postedBy = req.auth!.sub; // user id
    const notice = await NoticeModel.create({ ...body, tenantSlug, postedBy });
    await audit("NOTICE_CREATED", "Notice", String(notice._id), { tenantSlug });
    res.status(201).json({ data: serializeDocument(notice) });
  })
);

// GET /company/activity — recent create/update/deactivate events across every
// master and module, so the Admin bell can show real, near-real-time
// notifications ("for all the changes and adding datas the real time
// notification should be came for the admin tabs") instead of only the
// three hardcoded demo alerts it used to always mix in. Every masters.routes
// write already calls audit(...), so this reads that same log rather than
// standing up a second notification pipeline. `since` lets the client poll
// for only what's new since its last check.
const ACTION_LABELS: Record<string, string> = {
  CREATED: "added",
  UPDATED: "updated",
  DEACTIVATED: "deactivated",
  REACTIVATED: "reactivated"
};

// masters.routes.ts logs actions as MASTER_${key.toUpperCase()}_CREATED,
// which collapses camelCase (e.g. "doctorMaster" -> "DOCTORMASTER"). Since
// that's lossy, look the real title up by comparing uppercased keys instead
// of trying to reverse the casing.
const MASTER_TITLE_BY_UPPER_KEY: Record<string, string> = Object.fromEntries(
  MASTERS.map((m) => [m.key.toUpperCase(), m.title])
);

function humanizeAuditEntry(entry: { action: string; entityType: string; createdAt: Date }) {
  const match = entry.action.match(/^MASTER_(.+)_(CREATED|UPDATED|DEACTIVATED|REACTIVATED)$/);
  const verb = match ? ACTION_LABELS[match[2]] ?? match[2].toLowerCase() : entry.action.toLowerCase();
  const masterKeyUpper = match ? match[1] : entry.entityType.toUpperCase();
  const title = MASTER_TITLE_BY_UPPER_KEY[masterKeyUpper]
    ?? masterKeyUpper.replace(/_/g, " ").replace(/\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
  return {
    title: `${title} ${verb}`,
    message: match ? `A ${title.toLowerCase()} record was ${verb}.` : entry.action,
    type: match?.[2] === "CREATED" ? "success" : match?.[2] === "DEACTIVATED" ? "warning" : "info",
    time: entry.createdAt
  };
}

companyRouter.get(
  "/activity",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
    const filter: Record<string, unknown> = { "metadata.tenantSlug": tenantSlug };
    if (since && !Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
    const entries = await AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    const data = entries.map((e: any) => ({
      id: String(e._id),
      ...humanizeAuditEntry(e)
    }));
    res.json({ data });
  })
);

// ===END===

// ─── Sub-Division Routes ──────────────────────────────────────────

const subdivisionSchema = z.object({
  division: z.string().min(1),
  subdivisionName: z.string().min(1).optional().nullable(),
  productwiseCount: z.number().int().min(0).default(0),
  fieldforcewiseCount: z.number().int().min(0).default(0)
});

const subdivisionUpdateSchema = subdivisionSchema.partial();

companyRouter.get("/subdivisions", asyncHandler(async (req, res) => {
  const subdivisions = await SubdivisionModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ createdAt: -1 });
  res.json({ data: subdivisions.map(serializeDocument) });
}));

companyRouter.post("/subdivisions", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = subdivisionSchema.parse(req.body);
  const subdivision = await SubdivisionModel.create({ ...body, tenantSlug });
  await audit("SUBDIVISION_CREATED", "Subdivision", String(subdivision._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(subdivision) });
}));

companyRouter.put("/subdivisions/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = subdivisionUpdateSchema.parse(req.body);
  const subdivision = await SubdivisionModel.findOneAndUpdate(
    { _id: req.params.id, tenantSlug },
    body,
    { new: true }
  );
  if (!subdivision) throw new HttpError(404, "Sub-Division not found");
  await audit("SUBDIVISION_UPDATED", "Subdivision", String(subdivision._id), { tenantSlug });
  res.json({ data: serializeDocument(subdivision) });
}));

companyRouter.post("/subdivisions/:id/deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const subdivision = await SubdivisionModel.findOneAndUpdate(
    { _id: req.params.id, tenantSlug },
    { status: "INACTIVE" },
    { new: true }
  );
  if (!subdivision) throw new HttpError(404, "Sub-Division not found");
  await audit("SUBDIVISION_DEACTIVATED", "Subdivision", String(subdivision._id), { tenantSlug });
  res.json({ data: serializeDocument(subdivision) });
}));

// ─── Sub-Division Field Force (read-only) ─────────────────────────

companyRouter.get("/fieldforce", asyncHandler(async (req, res) => {
  const query: Record<string, unknown> = { tenantSlug: req.auth!.tenantSlug };
  if (typeof req.query.subDivision === "string" && req.query.subDivision.trim()) {
    query.subDivision = req.query.subDivision.trim();
  }
  const fieldForce = await FieldForceModel.find(query).sort({ createdAt: 1 });
  res.json({ data: fieldForce.map(serializeDocument) });
}));

// ─── Product Category ──────────────────────────────────────────────

const productCategorySchema = z.object({
  shortName: z.string().trim().optional().nullable(),
  categoryName: z.string().min(1),
  sortOrder: z.number().int().optional().nullable()
});

const productCategoryUpdateSchema = productCategorySchema.partial();

companyRouter.get("/product-categories", asyncHandler(async (req, res) => {
  const categories = await ProductCategoryModel.find({ tenantSlug: req.auth!.tenantSlug })
    .sort({ sortOrder: 1, createdAt: 1 });
  res.json({ data: categories.map(serializeDocument) });
}));

companyRouter.post("/product-categories", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productCategorySchema.parse(req.body);
  const category = await ProductCategoryModel.create({ ...body, tenantSlug });
  await audit("PRODUCT_CATEGORY_CREATED", "ProductCategory", String(category._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(category) });
}));

companyRouter.put("/product-categories/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productCategoryUpdateSchema.parse(req.body);
  const category = await ProductCategoryModel.findOneAndUpdate(
    { _id: req.params.id, tenantSlug },
    body,
    { new: true }
  );
  if (!category) throw new HttpError(404, "Product Category not found");
  await audit("PRODUCT_CATEGORY_UPDATED", "ProductCategory", String(category._id), { tenantSlug });
  res.json({ data: serializeDocument(category) });
}));

companyRouter.post("/product-categories/:id/deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const category = await ProductCategoryModel.findOneAndUpdate(
    { _id: req.params.id, tenantSlug },
    { status: "INACTIVE" },
    { new: true }
  );
  if (!category) throw new HttpError(404, "Product Category not found");
  await audit("PRODUCT_CATEGORY_DEACTIVATED", "ProductCategory", String(category._id), { tenantSlug });
  res.json({ data: serializeDocument(category) });
}));

companyRouter.post("/product-categories/:id/reactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const category = await ProductCategoryModel.findOneAndUpdate(
    { _id: req.params.id, tenantSlug },
    { status: "ACTIVE" },
    { new: true }
  );
  if (!category) throw new HttpError(404, "Product Category not found");
  await audit("PRODUCT_CATEGORY_REACTIVATED", "ProductCategory", String(category._id), { tenantSlug });
  res.json({ data: serializeDocument(category) });
}));

// ─── Product Brand ──────────────────────────────────────────────────

const productBrandSchema = z.object({
  shortName: z.string().trim().optional().nullable(),
  brandName: z.string().min(1),
  sortOrder: z.number().int().optional().nullable()
});
const productBrandUpdateSchema = productBrandSchema.partial();

companyRouter.get("/product-brands", asyncHandler(async (req, res) => {
  const brands = await ProductBrandModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ sortOrder: 1, createdAt: 1 });
  res.json({ data: brands.map(serializeDocument) });
}));

companyRouter.post("/product-brands", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productBrandSchema.parse(req.body);
  const brand = await ProductBrandModel.create({ ...body, tenantSlug });
  await audit("PRODUCT_BRAND_CREATED", "ProductBrand", String(brand._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(brand) });
}));

companyRouter.put("/product-brands/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productBrandUpdateSchema.parse(req.body);
  const brand = await ProductBrandModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
  if (!brand) throw new HttpError(404, "Product Brand not found");
  await audit("PRODUCT_BRAND_UPDATED", "ProductBrand", String(brand._id), { tenantSlug });
  res.json({ data: serializeDocument(brand) });
}));

companyRouter.post("/product-brands/:id/deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const brand = await ProductBrandModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "INACTIVE" }, { new: true });
  if (!brand) throw new HttpError(404, "Product Brand not found");
  await audit("PRODUCT_BRAND_DEACTIVATED", "ProductBrand", String(brand._id), { tenantSlug });
  res.json({ data: serializeDocument(brand) });
}));

companyRouter.post("/product-brands/:id/reactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const brand = await ProductBrandModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "ACTIVE" }, { new: true });
  if (!brand) throw new HttpError(404, "Product Brand not found");
  await audit("PRODUCT_BRAND_REACTIVATED", "ProductBrand", String(brand._id), { tenantSlug });
  res.json({ data: serializeDocument(brand) });
}));

// ─── Product Catalog (Product Detail master list) ───────────────────

const productCatalogSchema = z.object({
  productCode: z.string().trim().optional().nullable(),
  productName: z.string().min(1),
  description: z.string().trim().optional().nullable(),
  saleUnit: z.string().trim().optional().nullable(),
  sortOrder: z.number().int().optional().nullable()
});
const productCatalogUpdateSchema = productCatalogSchema.partial();

companyRouter.get("/product-catalog", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const query: Record<string, unknown> = { tenantSlug };
  if (typeof req.query.division === "string" && req.query.division.trim()) {
    // ProductCatalogModel has no division field of its own — it's derived via the brand's division.
    const brands = await ProductBrandModel.find({ tenantSlug, division: exactCaseInsensitive(req.query.division.trim()) }, { brandName: 1 });
    query.brandName = { $in: brands.map((b) => b.brandName) };
  }
  const products = await ProductCatalogModel.find(query).sort({ sortOrder: 1, createdAt: 1 });
  res.json({ data: products.map(serializeDocument) });
}));

companyRouter.post("/product-catalog", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productCatalogSchema.parse(req.body);
  const product = await ProductCatalogModel.create({ ...body, tenantSlug });
  await audit("PRODUCT_CATALOG_CREATED", "ProductCatalog", String(product._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(product) });
}));

companyRouter.put("/product-catalog/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = productCatalogUpdateSchema.parse(req.body);
  const product = await ProductCatalogModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
  if (!product) throw new HttpError(404, "Product not found");
  await audit("PRODUCT_CATALOG_UPDATED", "ProductCatalog", String(product._id), { tenantSlug });
  res.json({ data: serializeDocument(product) });
}));

companyRouter.post("/product-catalog/:id/deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const product = await ProductCatalogModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "INACTIVE" }, { new: true });
  if (!product) throw new HttpError(404, "Product not found");
  await audit("PRODUCT_CATALOG_DEACTIVATED", "ProductCatalog", String(product._id), { tenantSlug });
  res.json({ data: serializeDocument(product) });
}));

companyRouter.post("/product-catalog/:id/reactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const product = await ProductCatalogModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "ACTIVE" }, { new: true });
  if (!product) throw new HttpError(404, "Product not found");
  await audit("PRODUCT_CATALOG_REACTIVATED", "ProductCatalog", String(product._id), { tenantSlug });
  res.json({ data: serializeDocument(product) });
}));

// ─── Doctor Category ──────────────────────────────────────────────────

const doctorCategorySchema = z.object({
  shortName: z.string().trim().optional().nullable(),
  categoryName: z.string().min(1),
  noOfVisit: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional().nullable()
});
const doctorCategoryUpdateSchema = doctorCategorySchema.partial();

companyRouter.get("/doctor-categories", asyncHandler(async (req, res) => {
  const rows = await DoctorCategoryModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ sortOrder: 1, createdAt: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

companyRouter.post("/doctor-categories", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = doctorCategorySchema.parse(req.body);
  const row = await DoctorCategoryModel.create({ ...body, tenantSlug });
  await audit("DOCTOR_CATEGORY_CREATED", "DoctorCategory", String(row._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(row) });
}));

companyRouter.put("/doctor-categories/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = doctorCategoryUpdateSchema.parse(req.body);
  const row = await DoctorCategoryModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
  if (!row) throw new HttpError(404, "Doctor Category not found");
  await audit("DOCTOR_CATEGORY_UPDATED", "DoctorCategory", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

companyRouter.post("/doctor-categories/:id/deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const row = await DoctorCategoryModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "INACTIVE" }, { new: true });
  if (!row) throw new HttpError(404, "Doctor Category not found");
  await audit("DOCTOR_CATEGORY_DEACTIVATED", "DoctorCategory", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

companyRouter.post("/doctor-categories/:id/reactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const row = await DoctorCategoryModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "ACTIVE" }, { new: true });
  if (!row) throw new HttpError(404, "Doctor Category not found");
  await audit("DOCTOR_CATEGORY_REACTIVATED", "DoctorCategory", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

// ─── Doctor Speciality ────────────────────────────────────────────────

const doctorSpecialitySchema = z.object({
  shortName: z.string().trim().optional().nullable(),
  specialityName: z.string().min(1),
  noOfSlides: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional().nullable()
});
const doctorSpecialityUpdateSchema = doctorSpecialitySchema.partial();

companyRouter.get("/doctor-specialities", asyncHandler(async (req, res) => {
  const rows = await DoctorSpecialityModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ sortOrder: 1, createdAt: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

companyRouter.post("/doctor-specialities", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = doctorSpecialitySchema.parse(req.body);
  const row = await DoctorSpecialityModel.create({ ...body, tenantSlug });
  await audit("DOCTOR_SPECIALITY_CREATED", "DoctorSpeciality", String(row._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(row) });
}));

companyRouter.put("/doctor-specialities/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = doctorSpecialityUpdateSchema.parse(req.body);
  const row = await DoctorSpecialityModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
  if (!row) throw new HttpError(404, "Doctor Speciality not found");
  await audit("DOCTOR_SPECIALITY_UPDATED", "DoctorSpeciality", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

companyRouter.post("/doctor-specialities/:id/deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const row = await DoctorSpecialityModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "INACTIVE" }, { new: true });
  if (!row) throw new HttpError(404, "Doctor Speciality not found");
  await audit("DOCTOR_SPECIALITY_DEACTIVATED", "DoctorSpeciality", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

companyRouter.post("/doctor-specialities/:id/reactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const row = await DoctorSpecialityModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "ACTIVE" }, { new: true });
  if (!row) throw new HttpError(404, "Doctor Speciality not found");
  await audit("DOCTOR_SPECIALITY_REACTIVATED", "DoctorSpeciality", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

// ─── Doctor Qualification ─────────────────────────────────────────────

const doctorQualificationSchema = z.object({
  qualificationName: z.string().min(1),
  sortOrder: z.number().int().optional().nullable()
});
const doctorQualificationUpdateSchema = doctorQualificationSchema.partial();

companyRouter.get("/doctor-qualifications", asyncHandler(async (req, res) => {
  const rows = await DoctorQualificationModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ sortOrder: 1, createdAt: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

companyRouter.post("/doctor-qualifications", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = doctorQualificationSchema.parse(req.body);
  const row = await DoctorQualificationModel.create({ ...body, tenantSlug });
  await audit("DOCTOR_QUALIFICATION_CREATED", "DoctorQualification", String(row._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(row) });
}));

companyRouter.put("/doctor-qualifications/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = doctorQualificationUpdateSchema.parse(req.body);
  const row = await DoctorQualificationModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
  if (!row) throw new HttpError(404, "Doctor Qualification not found");
  await audit("DOCTOR_QUALIFICATION_UPDATED", "DoctorQualification", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

companyRouter.post("/doctor-qualifications/:id/deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const row = await DoctorQualificationModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "INACTIVE" }, { new: true });
  if (!row) throw new HttpError(404, "Doctor Qualification not found");
  await audit("DOCTOR_QUALIFICATION_DEACTIVATED", "DoctorQualification", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

companyRouter.post("/doctor-qualifications/:id/reactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const row = await DoctorQualificationModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { status: "ACTIVE" }, { new: true });
  if (!row) throw new HttpError(404, "Doctor Qualification not found");
  await audit("DOCTOR_QUALIFICATION_REACTIVATED", "DoctorQualification", String(row._id), { tenantSlug });
  res.json({ data: serializeDocument(row) });
}));

// ─── Product Groups (read-only, imported from Excel) ────────────────────────

companyRouter.get("/product-groups", asyncHandler(async (req, res) => {
  const rows = await ProductGroupModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ moleculeName: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

// ─── Chemist / Dealers — most rows were bulk-imported from Excel (read-only
// sourceSNo values), but the Add Chemist screen also needs to create new
// ones from the admin UI, so a real POST/PUT pair lives alongside the import.

const dealerValidation = z.object({
  sourceSNo: z.union([z.string(), z.number()]).optional(),
  dealerName: z.string().min(1),
  employeeName: z.string().optional(),
  employeeCode: z.string().optional(),
  patchName: z.string().optional(),
  contactPersonName: z.string().optional(),
  dealerPhone: z.string().optional(),
  dealerEmail: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  location: z.string().optional(),
  pincode: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

companyRouter.get("/dealers", asyncHandler(async (req, res) => {
  const rows = await DealerModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ sourceSNo: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

companyRouter.post("/dealers", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = dealerValidation.parse(req.body);
  const sourceSNo = body.sourceSNo !== undefined ? Number(body.sourceSNo) : undefined;
  if (sourceSNo !== undefined) {
    const dupe = await DealerModel.findOne({ tenantSlug, sourceSNo });
    if (dupe) throw new HttpError(409, "A chemist with this code already exists");
  }
  const dealer = await DealerModel.create({ ...body, sourceSNo, tenantSlug });
  await audit("DEALER_CREATED", "Dealer", String(dealer._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(dealer) });
}));

companyRouter.put("/dealers/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = dealerValidation.partial().parse(req.body);
  const update: Record<string, unknown> = { ...body };
  if (body.sourceSNo !== undefined) update.sourceSNo = Number(body.sourceSNo);
  const dealer = await DealerModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, update, { new: true });
  if (!dealer) throw new HttpError(404, "Chemist not found");
  await audit("DEALER_UPDATED", "Dealer", String(dealer._id), { tenantSlug });
  res.json({ data: serializeDocument(dealer) });
}));

// ─── Holidays (read-only, imported from Excel) ───────────────────────────────

companyRouter.get("/holidays", asyncHandler(async (req, res) => {
  const rows = await HolidayModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ sourceSNo: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

// ─── SFC (read-only, imported from Excel) ────────────────────────────────────

companyRouter.get("/sfc", asyncHandler(async (req, res) => {
  const rows = await SfcModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ sourceSNo: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

// ─── Expense (read-only, imported from Excel) — backs SFC Updation, Allowance
// Fixation, and Fixed/Variable Expense Parameter, each rendering a different
// subset of the same records ───────────────────────────────────────────────

companyRouter.get("/expenses", asyncHandler(async (req, res) => {
  const rows = await ExpenseModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ role: 1 });
  res.json({ data: rows.map(serializeDocument) });
}));

// ─── Hospitals ─────────────────────────────────────────────────────────────

const hospitalValidation = z.object({
  hospitalCode: z.string().min(1),
  hospitalName: z.string().min(1),
  // The Admin UI's Add Hospital form offers Multi-Specialty/Super-Specialty/
  // General Clinic — the original Private/Government/Trust/Other list is
  // kept too so already-seeded rows using it still validate on edit.
  type: z.enum(["Multi-Specialty", "Super-Specialty", "General Clinic", "Private", "Government", "Trust", "Other"]).default("Multi-Specialty"),
  city: z.string().optional(),
  medicalRepresentative: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

companyRouter.get("/hospitals", asyncHandler(async (req, res) => {
  const hospitals = await HospitalModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ createdAt: -1 });
  res.json({ data: hospitals.map(serializeDocument) });
}));

companyRouter.post("/hospitals", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = hospitalValidation.parse(req.body);
  const hospital = await HospitalModel.create({ ...body, tenantSlug });
  await audit("HOSPITAL_CREATED", "Hospital", String(hospital._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(hospital) });
}));

companyRouter.put("/hospitals/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = hospitalValidation.partial().parse(req.body);
  const hospital = await HospitalModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
  if (!hospital) throw new HttpError(404, "Hospital not found");
  await audit("HOSPITAL_UPDATED", "Hospital", String(hospital._id), { tenantSlug });
  res.json({ data: serializeDocument(hospital) });
}));

// ─── Unlisted Doctors ──────────────────────────────────────────────────────

const unlistedDoctorValidation = z.object({
  tempCode: z.string().min(1),
  name: z.string().min(1),
  specialty: z.string().optional(),
  city: z.string().optional(),
  mr: z.string().optional(),
  clinicName: z.string().optional(),
  address: z.string().optional(),
  area: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  patch: z.string().optional(),
  hq: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().optional(),
  visitFrequency: z.string().optional(),
  potential: z.string().optional(),
  remarks: z.string().optional(),
  approvedBy: z.string().optional(),
  dob: z.string().optional(),
  anniversaryDate: z.string().optional(),
  status: z.enum(["Pending", "Approved", "Rejected"]).default("Pending")
});

companyRouter.get("/unlisted-doctors", asyncHandler(async (req, res) => {
  const docs = await UnlistedDoctorModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ createdAt: -1 });
  res.json({ data: docs.map(serializeDocument) });
}));

companyRouter.post("/unlisted-doctors", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = unlistedDoctorValidation.parse(req.body);
  const doc = await UnlistedDoctorModel.create({ ...body, tenantSlug });
  await audit("UNLISTED_DOCTOR_CREATED", "UnlistedDoctor", String(doc._id), { tenantSlug });
  res.status(201).json({ data: serializeDocument(doc) });
}));

companyRouter.put("/unlisted-doctors/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = unlistedDoctorValidation.partial().parse(req.body);
  const doc = await UnlistedDoctorModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
  if (!doc) throw new HttpError(404, "Unlisted Doctor not found");
  await audit("UNLISTED_DOCTOR_UPDATED", "UnlistedDoctor", String(doc._id), { tenantSlug, status: doc.status });
  res.json({ data: serializeDocument(doc) });
}));

// ─── Territory Doctor Connections ─────────────────────────────────────────

companyRouter.get("/territory/doctor-counts", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  // Group by territory (patch) to get doctor counts.
  // We need to also include HQ information, which we could look up or just infer from employees.
  const agg = await DoctorModel.aggregate([
    { $match: { tenantSlug } },
    { $group: {
      _id: "$territory",
      totalDoctors: { $sum: 1 },
      activeDoctors: {
        $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] }
      },
      mrCode: { $first: "$mappedEmployeeCode" }
    }}
  ]);

  // Lookup HQ for MRs
  const counts = await Promise.all(agg.map(async (doc) => {
    let hq = "Unknown";
    let division = "Zivira";
    if (doc.mrCode) {
      const emp = await EmployeeModel.findOne({ tenantSlug, employeeCode: doc.mrCode });
      if (emp) {
        hq = emp.territory || "Unknown";
        division = emp.division || "Zivira";
      }
    }
    return {
      patch: doc._id || "Unassigned",
      hq,
      division,
      totalDoctors: doc.totalDoctors,
      activeDoctors: doc.activeDoctors
    };
  }));

  res.json({ data: counts });
}));

companyRouter.post("/territory/bulk-deactivate", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const patchSchema = z.object({ patch: z.string().min(1) });
  const { patch } = patchSchema.parse(req.body);

  const result = await DoctorModel.updateMany(
    { tenantSlug, territory: patch },
    { $set: { status: "INACTIVE" } }
  );

  await audit("TERRITORY_BULK_DEACTIVATED", "Territory", patch, { tenantSlug, modifiedCount: result.modifiedCount });
  res.json({ data: { success: true, modifiedCount: result.modifiedCount } });
}));

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.5 — GST Multi-Branch Location — Admin "Branches & GST" tab
// ══════════════════════════════════════════════════════════════════════

const companyBranchValidation = z.object({
  branchName: z.string().min(2),
  gstNumber: z.string().min(15, "GST number must be 15 characters").max(15),
  address: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().min(4),
  isHeadquarters: z.boolean().optional().default(false),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

companyRouter.get("/branches", asyncHandler(async (req, res) => {
  const branches = await CompanyBranchModel.find({ tenantSlug: req.auth!.tenantSlug }).sort({ isHeadquarters: -1, branchName: 1 });
  res.json({ data: branches.map(serializeDocument) });
}));

companyRouter.post("/branches", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = companyBranchValidation.parse(req.body);
  const gstNumber = body.gstNumber.toUpperCase().trim();

  const dupe = await CompanyBranchModel.findOne({ tenantSlug, gstNumber });
  if (dupe) throw new HttpError(409, `This GST number is already registered to ${dupe.branchName}`);

  if (body.isHeadquarters) {
    await CompanyBranchModel.updateMany({ tenantSlug }, { $set: { isHeadquarters: false } });
  }

  const branch = await CompanyBranchModel.create({ ...body, gstNumber, tenantSlug });
  await audit("COMPANY_BRANCH_CREATED", "CompanyBranch", String(branch._id), { tenantSlug, branchName: branch.branchName });
  res.status(201).json({ data: serializeDocument(branch) });
}));

companyRouter.patch("/branches/:id", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = companyBranchValidation.partial().parse(req.body);
  const update: Record<string, unknown> = { ...body };
  if (body.gstNumber) {
    const gstNumber = body.gstNumber.toUpperCase().trim();
    const dupe = await CompanyBranchModel.findOne({ tenantSlug, gstNumber, _id: { $ne: req.params.id } });
    if (dupe) throw new HttpError(409, `This GST number is already registered to ${dupe.branchName}`);
    update.gstNumber = gstNumber;
  }
  if (body.isHeadquarters) {
    await CompanyBranchModel.updateMany({ tenantSlug, _id: { $ne: req.params.id } }, { $set: { isHeadquarters: false } });
  }
  const branch = await CompanyBranchModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, update, { new: true });
  if (!branch) throw new HttpError(404, "Branch not found");
  await audit("COMPANY_BRANCH_UPDATED", "CompanyBranch", String(branch._id), { tenantSlug });
  res.json({ data: serializeDocument(branch) });
}));

// GET /company/branches/lookup?gst=29AAACZ3085J1ZP — returns the branch
// matching that GST number, or 404 if it's not one of Zivira's own branches
// (e.g. a distributor's GST appearing on their statement — PRD "Exact
// Solution": skip auto-fill and leave branch as manual selection).
companyRouter.get("/branches/lookup", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const gst = typeof req.query.gst === "string" ? req.query.gst.toUpperCase().trim() : "";
  if (!gst) throw new HttpError(400, "gst query parameter is required");
  const branch = await CompanyBranchModel.findOne({ tenantSlug, gstNumber: gst });
  if (!branch) throw new HttpError(404, "No branch registered with this GST number");
  res.json({ data: serializeDocument(branch) });
}));

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.1 — Tour Plan — Admin read-only view across all managers
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/tour-plans", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const query: Record<string, unknown> = { tenantSlug };
  if (typeof req.query.month === "string" && req.query.month) query.month = req.query.month;
  if (typeof req.query.status === "string" && req.query.status) query.status = req.query.status;
  if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) {
    query.employeeCode = req.query.employeeCode.trim().toUpperCase();
  }
  const tps = await TourPlanModel.find(query).sort({ createdAt: -1 }).limit(1000);
  res.json({ data: await enrichTourPlansWithNames(tenantSlug, tps) });
}));

// DELETE /company/tour-plans/:tpId — "Update/Delete > TP Delete", matching
// sanpharma.info's own TP Delete screen. Deletes the REAL TourPlan
// document — the exact same collection the field-force MR's own Tour Plan
// screen and the manager's approval queue both read from (TourPlanModel,
// filtered by employeeCode / assignedManager respectively) — so the
// deletion is immediately visible as gone in both portals, with no
// separate mirror to keep in sync. Also notifies both the MR and their
// assigned manager, same in-app + email channel every other real
// field-force event already uses.
companyRouter.delete("/tour-plans/:tpId", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const tp = await TourPlanModel.findOne({ tenantSlug, tpId: req.params.tpId });
  if (!tp) throw new HttpError(404, "Tour Plan not found");

  await TourPlanModel.deleteOne({ _id: tp._id });
  await audit("ADMIN_TP_DELETED", "TourPlan", String(tp._id), { tenantSlug, tpId: tp.tpId, employeeCode: tp.employeeCode });

  const [employee, manager] = await Promise.all([
    EmployeeModel.findOne({ tenantSlug, employeeCode: tp.employeeCode }).lean(),
    EmployeeModel.findOne({ tenantSlug, employeeCode: tp.assignedManager }).lean()
  ]);

  await notifyFieldRep({
    tenantSlug,
    employeeCode: tp.employeeCode,
    employeeEmail: employee?.email,
    employeeName: employee?.name,
    title: "Tour Plan deleted by Admin",
    message: `Your Tour Plan ${tp.tpId} for ${tp.month} was deleted by Admin.`
  });

  if (tp.assignedManager) {
    await notifyManager({
      tenantSlug,
      managerEmployeeCode: tp.assignedManager,
      managerEmail: manager?.email,
      managerName: manager?.name,
      title: "Tour Plan deleted by Admin",
      message: `${employee?.name ?? tp.employeeCode}'s Tour Plan ${tp.tpId} for ${tp.month} was deleted by Admin.`
    });
  }

  res.json({ data: { deleted: true, tpId: tp.tpId } });
}));

// ══════════════════════════════════════════════════════════════════════
// Expense Claims — Admin-wide view + branch/GST report (Section 12.5
// follow-up: GST Branch → claims linkage). Filterable by month/status/branch.
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/expense-claims", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const query: Record<string, unknown> = { tenantSlug };
  if (typeof req.query.month === "string" && req.query.month) query.month = req.query.month;
  if (typeof req.query.status === "string" && req.query.status) query.status = req.query.status;
  if (typeof req.query.gstBranchCode === "string" && req.query.gstBranchCode) query.gstBranchCode = req.query.gstBranchCode;
  const claims = await ExpenseClaimModel.find(query).sort({ createdAt: -1 }).limit(1000);
  const serialized = claims.map(serializeDocument);
  res.json({ data: await enrichWithEmployeeNames(tenantSlug, serialized, ["assignedManager"]) });
}));

companyRouter.get("/expense-claims/branch-summary", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;

  const match: Record<string, unknown> = { tenantSlug };
  if (month) match.month = month;

  const rows = await ExpenseClaimModel.aggregate([
    { $match: match },
    { $group: {
      _id: { gstBranchCode: "$gstBranchCode", gstBranchName: "$gstBranchName" },
      totalClaims: { $sum: 1 },
      totalAmountRs: { $sum: "$amountRs" },
      approvedAmountRs: { $sum: { $cond: [{ $eq: ["$status", "APPROVED"] }, "$amountRs", 0] } },
      pendingAmountRs: { $sum: { $cond: [{ $eq: ["$status", "SUBMITTED"] }, "$amountRs", 0] } },
      rejectedAmountRs: { $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, "$amountRs", 0] } }
    } },
    { $project: {
      _id: 0,
      gstBranchCode: "$_id.gstBranchCode",
      gstBranchName: "$_id.gstBranchName",
      totalClaims: 1, totalAmountRs: 1, approvedAmountRs: 1, pendingAmountRs: 1, rejectedAmountRs: 1
    } },
    { $sort: { totalAmountRs: -1 } }
  ]);
  res.json({ data: rows, month: month ?? "all" });
}));

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.2 — Visit Summary (admin-wide, filterable by MR)
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/visit-summary", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;
  const employeeCode = typeof req.query.employeeCode === "string" ? req.query.employeeCode : undefined;

  const match: Record<string, unknown> = { tenantSlug, status: { $ne: "REJECTED" } };
  if (month) match.month = month;
  if (employeeCode) match.employeeCode = employeeCode;

  const rows = await DcrModel.aggregate([
    { $match: match },
    { $group: { _id: "$doctorId", visitCount: { $sum: 1 }, lastVisitDate: { $max: "$visitDate" } } },
    { $lookup: { from: "doctors", localField: "_id", foreignField: "_id", as: "doctor" } },
    { $unwind: { path: "$doctor", preserveNullAndEmptyArrays: true } },
    { $project: {
      doctorId: "$_id", _id: 0,
      doctorName: "$doctor.name",
      mappedEmployeeCode: "$doctor.mappedEmployeeCode",
      visitCount: 1, lastVisitDate: 1,
      overVisitFlag: { $gte: ["$visitCount", 3] }
    } },
    { $sort: { doctorName: 1 } }
  ]);
  res.json({ data: rows, month: month ?? "all" });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 2 — Attendance & Compliance Analytics
// Topic 4 — Chronic Defaulter Detection (tenant-wide)
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/analytics/compliance", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;

  const employees = await EmployeeModel.find(
    { tenantSlug, status: "ACTIVE" },
    { employeeCode: 1, name: 1, joinDate: 1, role: 1, reportingManager: 1 }
  ).lean();

  const rows = await computeComplianceRows(tenantSlug, employees, { month });
  const roleByCode = new Map(employees.map(e => [e.employeeCode, e.role]));
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
// Zivira_Project_Basic.docx Topic 3 — Salary Integration Engine (tenant-wide)
// Workflow: Employee → No DCR → HR Notification → Employee Explanation →
// Manager Approval → Payroll Released. Admin can also force-release
// (e.g. after resolving something outside the app).
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/analytics/payroll", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const month = typeof req.query.month === "string" && req.query.month
    ? req.query.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const employees = await EmployeeModel.find(
    { tenantSlug, status: "ACTIVE" },
    { employeeCode: 1, name: 1, joinDate: 1, role: 1 }
  ).lean();

  const records = await syncPayrollStatuses(tenantSlug, employees, month);
  const nameByCode = new Map(employees.map(e => [e.employeeCode, e.name]));
  const roleByCode = new Map(employees.map(e => [e.employeeCode, e.role]));

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

companyRouter.patch("/analytics/payroll/:id/release", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const record = await PayrollStatusModel.findOne({ tenantSlug, _id: req.params.id });
  if (!record) throw new HttpError(404, "Payroll status record not found");

  record.status = "RELEASED";
  record.managerApprovedBy = "ADMIN_OVERRIDE";
  record.managerApprovedByName = "Admin (override)";
  record.managerApprovedAt = new Date();
  record.releasedAt = new Date();
  await record.save();

  await audit("COMPANY_PAYROLL_RELEASED", "PayrollStatus", String(record._id), { tenantSlug, employeeCode: record.employeeCode, month: record.month });
  const releasedEmp = await EmployeeModel.findOne({ tenantSlug, employeeCode: record.employeeCode }).lean();
  await notifyFieldRep({
    tenantSlug,
    employeeCode: record.employeeCode,
    employeeEmail: releasedEmp?.email,
    employeeName: releasedEmp?.name,
    title: `Payroll released for ${record.month}`,
    message: `Admin released your payroll hold for ${record.month}.`
  });
  res.json({ data: serializeDocument(record) });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 5 — Representative vs Manager Analysis
// Topic 6 — Joint Field Work Analysis (tenant-wide)
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/analytics/rep-manager", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const month = typeof req.query.month === "string" && req.query.month
    ? req.query.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const employees = await EmployeeModel.find(
    { tenantSlug, status: "ACTIVE", role: { $in: ["MR", "SR_MR"] } },
    { employeeCode: 1, name: 1, reportingManager: 1 }
  ).lean();

  const managers = await EmployeeModel.find(
    { tenantSlug, status: "ACTIVE", role: { $in: ["ABM", "RBM", "ZBM", "NBH", "BH"] } },
    { employeeCode: 1, name: 1 }
  ).lean();
  const managerNameByCode = new Map(managers.map(m => [m.employeeCode, m.name]));

  const reps = await computeRepAnalysisRows(tenantSlug, employees, month);
  const repsEnriched = reps.map(r => ({ ...r, reportingManagerName: r.reportingManager ? managerNameByCode.get(r.reportingManager) : undefined }));
  const managerRows = computeManagerJointWorkRows(reps, managerNameByCode);

  res.json({ data: repsEnriched, managers: managerRows, month });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 9 — Product Exposure Analytics
// Topic 10 — Product-wise Performance Dashboard
// Topic 12 — Sample vs Doctor Input Analysis (prescription-interest ROI proxy)
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/analytics/product-exposure", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;
  const rows = await computeProductExposureRows(tenantSlug, month);
  res.json({ data: rows, month: month ?? "all" });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 11 — Sample Distribution Analytics
// ══════════════════════════════════════════════════════════════════════
const sampleAllocationSchema = z.object({
  employeeCode: z.string().min(1),
  productCode: z.string().min(1),
  productName: z.string().min(1),
  batchNumber: z.string().optional(),
  qtyIssued: z.number().min(1),
  month: z.string().optional(),
  notes: z.string().optional()
});

companyRouter.post("/sample-allocations", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const body = sampleAllocationSchema.parse(req.body);
  const now = new Date();
  const month = body.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode.toUpperCase() });
  if (!employee) throw new HttpError(404, "Employee not found");

  const allocation = await createSampleAllocationWithRetry(tenantSlug, body.employeeCode.toUpperCase(), month, (allocationId) =>
    SampleAllocationModel.create({
      tenantSlug, allocationId, employeeCode: body.employeeCode.toUpperCase(),
      productCode: body.productCode, productName: body.productName, batchNumber: body.batchNumber ?? null,
      qtyIssued: body.qtyIssued, month, notes: body.notes ?? null
    })
  );

  await audit("COMPANY_SAMPLE_ALLOCATION_ISSUED", "SampleAllocation", String(allocation._id), { tenantSlug, employeeCode: body.employeeCode, productCode: body.productCode, qtyIssued: body.qtyIssued, month });
  res.status(201).json({ data: serializeDocument(allocation) });
}));

companyRouter.get("/sample-allocations", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;
  const query: Record<string, unknown> = { tenantSlug };
  if (month) query.month = month;
  const allocations = await SampleAllocationModel.find(query).sort({ createdAt: -1 }).limit(200);
  res.json({ data: await enrichWithEmployeeNames(tenantSlug, allocations.map(serializeDocument), ["employeeCode"]) });
}));

companyRouter.get("/analytics/sample-distribution", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;
  const report = await computeSampleDistribution(tenantSlug, month);
  res.json({ ...report, month: month ?? "all" });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 14 — KPI Engine
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/analytics/kpi", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const month = typeof req.query.month === "string" && req.query.month
    ? req.query.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const employees = await EmployeeModel.find(
    { tenantSlug, status: "ACTIVE" },
    { employeeCode: 1, name: 1, reportingManager: 1, joinDate: 1 }
  ).lean();

  const { repKpis, managerKpis } = await computeKpiEngine(tenantSlug, employees, month);
  res.json({ reps: repKpis, managers: managerKpis, month });
}));

// ══════════════════════════════════════════════════════════════════════
// Zivira_Project_Basic.docx Topic 15 — Alert & Notification Engine
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/analytics/alerts", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const month = typeof req.query.month === "string" && req.query.month
    ? req.query.month
    : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const alerts = await computeAlerts(tenantSlug, month);
  res.json({
    data: alerts, month,
    summary: {
      high: alerts.filter(a => a.severity === "HIGH").length,
      medium: alerts.filter(a => a.severity === "MEDIUM").length,
      low: alerts.filter(a => a.severity === "LOW").length
    }
  });
}));

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.3A — Drug Summary (samples given, per product, per doctor)
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/drug-summary", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;
  const doctorId = typeof req.query.doctorId === "string" ? req.query.doctorId : undefined;

  const match: Record<string, unknown> = { tenantSlug, status: { $ne: "REJECTED" } };
  if (month) match.month = month;
  if (doctorId) match.doctorId = new mongoose.Types.ObjectId(doctorId);

  const rows = await DcrModel.aggregate([
    { $match: match },
    { $unwind: { path: "$samplesGiven", preserveNullAndEmptyArrays: true } },
    { $match: { samplesGiven: { $ne: null } } },
    { $group: {
      _id: { doctorId: "$doctorId", productCode: "$samplesGiven.productCode", productName: "$samplesGiven.productName" },
      totalQty: { $sum: "$samplesGiven.qty" },
      visitCount: { $sum: 1 }
    } },
    { $project: { _id: 0, doctorId: "$_id.doctorId", productCode: "$_id.productCode", productName: "$_id.productName", totalQty: 1, visitCount: 1 } },
    { $sort: { totalQty: -1 } }
  ]);
  res.json({ data: rows, month: month ?? "all" });
}));

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.3B — Gift Summary (inputs given, per item type, per doctor)
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/gift-summary", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;
  const doctorId = typeof req.query.doctorId === "string" ? req.query.doctorId : undefined;

  const match: Record<string, unknown> = { tenantSlug, status: { $ne: "REJECTED" } };
  if (month) match.month = month;
  if (doctorId) match.doctorId = new mongoose.Types.ObjectId(doctorId);

  const thresholdRaw = await getConfigValue(tenantSlug, "GIFT_VALUE_THRESHOLD_RS");
  const threshold = typeof thresholdRaw === "number" ? thresholdRaw : Number(DEFAULT_CONFIG.GIFT_VALUE_THRESHOLD_RS);

  const rows = await DcrModel.aggregate([
    { $match: match },
    { $unwind: { path: "$inputsGiven", preserveNullAndEmptyArrays: true } },
    { $match: { inputsGiven: { $ne: null } } },
    { $group: {
      _id: { doctorId: "$doctorId", itemType: "$inputsGiven.itemType" },
      totalQty: { $sum: "$inputsGiven.qty" },
      totalValue: { $sum: { $ifNull: ["$inputsGiven.valueRs", 0] } }
    } },
    { $project: { _id: 0, doctorId: "$_id.doctorId", itemType: "$_id.itemType", totalQty: 1, totalValue: 1, overThreshold: { $gt: ["$totalValue", threshold] } } },
    { $sort: { totalValue: -1 } }
  ]);
  res.json({ data: rows, month: month ?? "all", thresholdRs: threshold });
}));

// ══════════════════════════════════════════════════════════════════════
// PRD Section 12.3 — Admin MIS "Doctor Coverage" sub-tab: Doctor Name, Total
// Visits, Total Samples (units), Total Gifts (units), Last Visit Date,
// Assigned MR — everything in one row per doctor, ready for CSV export.
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/doctor-coverage", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const month = typeof req.query.month === "string" && req.query.month ? req.query.month : undefined;
  const match: Record<string, unknown> = { tenantSlug, status: { $ne: "REJECTED" } };
  if (month) match.month = month;

  const [visitRows, sampleRows, giftRows, doctors, allTimeLastVisitRows, latestExceptions] = await Promise.all([
    DcrModel.aggregate([
      { $match: match },
      { $group: { _id: "$doctorId", visitCount: { $sum: 1 }, lastVisitDate: { $max: "$visitDate" } } }
    ]),
    DcrModel.aggregate([
      { $match: match },
      { $unwind: { path: "$samplesGiven", preserveNullAndEmptyArrays: true } },
      { $match: { samplesGiven: { $ne: null } } },
      { $group: { _id: "$doctorId", totalSamples: { $sum: "$samplesGiven.qty" } } }
    ]),
    DcrModel.aggregate([
      { $match: match },
      { $unwind: { path: "$inputsGiven", preserveNullAndEmptyArrays: true } },
      { $match: { inputsGiven: { $ne: null } } },
      { $group: { _id: "$doctorId", totalGifts: { $sum: "$inputsGiven.qty" }, totalGiftValue: { $sum: { $ifNull: ["$inputsGiven.valueRs", 0] } } } }
    ]),
    DoctorModel.find({ tenantSlug, status: "ACTIVE" }).lean(),
    // Zivira_Project_Basic.docx Topic 7 — Territory Coverage Analytics needs
    // the doctor's TRUE last visit across all time, not scoped to the
    // ?month filter above (which only powers the existing sample/gift MIS).
    DcrModel.aggregate([
      { $match: { tenantSlug, status: { $ne: "REJECTED" } } },
      { $group: { _id: "$doctorId", lastVisitDate: { $max: "$visitDate" } } }
    ]),
    // Topic 8 — most recent logged exception per doctor, so an unvisited
    // doctor with a documented reason doesn't read as unexplained neglect.
    DoctorVisitExceptionModel.aggregate([
      { $match: { tenantSlug } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$doctorId", reason: { $first: "$reason" }, notes: { $first: "$notes" }, month: { $first: "$month" } } }
    ])
  ]);

  const visitMap = new Map(visitRows.map((r) => [String(r._id), r]));
  const sampleMap = new Map(sampleRows.map((r) => [String(r._id), r.totalSamples]));
  const giftMap = new Map(giftRows.map((r) => [String(r._id), r]));
  const allTimeLastVisitMap = new Map(allTimeLastVisitRows.map((r) => [String(r._id), r.lastVisitDate as Date]));
  const exceptionMap = new Map(latestExceptions.map((e) => [String(e._id), e]));
  const thresholdRaw = await getConfigValue(tenantSlug, "GIFT_VALUE_THRESHOLD_RS");
  const threshold = typeof thresholdRaw === "number" ? thresholdRaw : Number(DEFAULT_CONFIG.GIFT_VALUE_THRESHOLD_RS);
  const now = Date.now();

  const data = doctors.map((doctor) => {
    const id = String(doctor._id);
    const visit = visitMap.get(id);
    const gift = giftMap.get(id);
    const lastVisitEver = allTimeLastVisitMap.get(id) ?? null;
    const daysSinceLastVisit = lastVisitEver ? Math.floor((now - new Date(lastVisitEver).getTime()) / 86400000) : null;
    const alertBucket =
      daysSinceLastVisit === null ? "NEVER_VISITED" :
      daysSinceLastVisit >= 180 ? "180" :
      daysSinceLastVisit >= 90 ? "90" :
      daysSinceLastVisit >= 60 ? "60" :
      daysSinceLastVisit >= 30 ? "30" : null;
    const exception = exceptionMap.get(id);
    return {
      doctorId: id,
      doctorName: doctor.name,
      specialty: doctor.specialty,
      assignedMR: doctor.mappedEmployeeCode ?? null,
      assignedMRName: doctor.mappedEmployeeName ?? null,
      totalVisits: visit?.visitCount ?? 0,
      lastVisitDate: visit?.lastVisitDate ?? null,
      totalSamples: sampleMap.get(id) ?? 0,
      totalGifts: gift?.totalGifts ?? 0,
      totalGiftValueRs: gift?.totalGiftValue ?? 0,
      overGiftThreshold: (gift?.totalGiftValue ?? 0) > threshold,
      // Topic 7 — Territory Coverage Analytics
      lastVisitDateEver: lastVisitEver,
      daysSinceLastVisit,
      alertBucket,
      // Topic 8 — Doctor Exception Management
      exceptionReason: exception?.reason ?? null,
      exceptionNotes: exception?.notes ?? null,
      exceptionMonth: exception?.month ?? null
    };
  });

  res.json({ data, month: month ?? "all", thresholdRs: threshold });
}));

// ══════════════════════════════════════════════════════════════════════
// Platform settings — GIFT_VALUE_THRESHOLD_RS (PRD 12.3B "Exact Solution":
// "Store GIFT_VALUE_THRESHOLD_RS in CompanyConfig model, default 500. Admin
// can edit in Platform Settings.")
// ══════════════════════════════════════════════════════════════════════
companyRouter.get("/config", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const rows = await CompanyConfigModel.find({ tenantSlug }).lean();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({ data: { ...DEFAULT_CONFIG, ...byKey } });
}));

companyRouter.patch("/config/:key", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const { value } = z.object({ value: z.union([z.number(), z.string(), z.boolean()]) }).parse(req.body);
  const row = await CompanyConfigModel.findOneAndUpdate(
    { tenantSlug, key: req.params.key },
    { tenantSlug, key: req.params.key, value, updatedBy: req.auth!.sub },
    { upsert: true, new: true }
  );
  await audit("COMPANY_CONFIG_UPDATED", "CompanyConfig", String(row._id), { tenantSlug, key: req.params.key, value });
  res.json({ data: serializeDocument(row) });
}));

// ══════════════════════════════════════════════════════════════════════
// HR/Payroll Client Requirement (1A/1B) — Phase 1: Salary Structure +
// Payroll Run engine. Reuses the existing /employees, /attendance and
// /holidays data. Saturday/OT policy and rounding beyond nearest-rupee
// are not specified in the client documents, so Phase 1 intentionally
// keeps those simple and documented rather than inventing rules.
// ══════════════════════════════════════════════════════════════════════

const salaryStructureSchema = z.object({
  employeeCode: z.string().min(1),
  ctc: z.number().positive(),
  basicPercent: z.number().min(0).max(100).default(50),
  hraPercent: z.number().min(0).max(100).default(20),
  allowancePercent: z.number().min(0).max(100).default(30),
  effectiveFrom: z.coerce.date(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});

companyRouter.get(
  "/salary-structures",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) {
      query.employeeCode = req.query.employeeCode.trim();
    }
    const rows = await SalaryStructureModel.find(query).sort({ employeeCode: 1, effectiveFrom: -1 });
    res.json({ data: rows.map(serializeDocument) });
  })
);

companyRouter.post(
  "/salary-structures",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = salaryStructureSchema.parse(req.body);
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode }).lean();
    if (!employee) throw new HttpError(404, `Employee ${body.employeeCode} not found`);
    const row = await SalaryStructureModel.create({ ...body, tenantSlug });
    await audit("SALARY_STRUCTURE_CREATED", "SalaryStructure", String(row._id), { tenantSlug, employeeCode: row.employeeCode });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Payroll Rules Engine (Phase 2 "Advanced Statutory Calculations" + OT
// policy) — restores the old mock UI's editable PF/Professional-Tax
// screen with real, connected data. One ACTIVE StatutoryRule doc per
// tenant; GET returns it (creating tenant defaults on first access), PUT
// deactivates the old row and inserts a new ACTIVE one so past payroll
// runs keep whatever numbers were baked in at generation time.
// ══════════════════════════════════════════════════════════════════════
async function getActiveStatutoryRule(tenantSlug: string) {
  let rule = await StatutoryRuleModel.findOne({ tenantSlug, status: "ACTIVE" }).sort({ createdAt: -1 });
  if (!rule) {
    rule = await StatutoryRuleModel.create({ tenantSlug });
  }
  return rule;
}

companyRouter.get(
  "/payroll/rules",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const rule = await getActiveStatutoryRule(tenantSlug);
    res.json({ data: serializeDocument(rule) });
  })
);

const professionalTaxSlabInput = z.object({
  minGross: z.number().min(0),
  maxGross: z.number().min(0).nullable(),
  amount: z.number().min(0)
});

const statutoryRuleSchema = z.object({
  pfEnabled: z.boolean().default(true),
  pfEmployeeRate: z.number().min(0).max(100).default(12),
  pfEmployerRate: z.number().min(0).max(100).default(12),
  pfWageCeiling: z.number().min(0).default(15000),
  ptEnabled: z.boolean().default(true),
  ptSlabs: z.array(professionalTaxSlabInput).default([]),
  esiEnabled: z.boolean().default(false),
  esiEmployeeRate: z.number().min(0).max(100).default(0.75),
  esiEmployerRate: z.number().min(0).max(100).default(3.25),
  esiWageCeiling: z.number().min(0).default(21000),
  otEnabled: z.boolean().default(true),
  standardShiftHours: z.number().min(1).max(24).default(9),
  otRatePerHour: z.number().min(0).default(0)
});

companyRouter.put(
  "/payroll/rules",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = statutoryRuleSchema.parse(req.body);

    await StatutoryRuleModel.updateMany({ tenantSlug, status: "ACTIVE" }, { status: "INACTIVE" });
    const row = await StatutoryRuleModel.create({
      ...body,
      tenantSlug,
      status: "ACTIVE",
      updatedBy: req.auth!.sub ?? null
    });
    await audit("PAYROLL_RULES_UPDATED", "StatutoryRule", String(row._id), { tenantSlug });
    res.json({ data: serializeDocument(row) });
  })
);

// PF is computed on min(basic, wage ceiling) — the standard EPFO rule.
// Professional Tax looks up the slab whose [minGross, maxGross] range
// contains grossEarnings (maxGross === null means "no upper bound").
// ESI (when enabled) only applies to employees whose gross is at/below
// the ESI wage ceiling — above it they are simply not ESI-eligible.
function computeStatutoryDeductions(rule: any, basic: number, grossEarnings: number) {
  const pfEmployee = rule.pfEnabled ? Math.round((Math.min(basic, rule.pfWageCeiling) * rule.pfEmployeeRate) / 100) : 0;
  const pfEmployer = rule.pfEnabled ? Math.round((Math.min(basic, rule.pfWageCeiling) * rule.pfEmployerRate) / 100) : 0;

  let professionalTax = 0;
  if (rule.ptEnabled) {
    const slab = (rule.ptSlabs as any[]).find(
      (s) => grossEarnings >= s.minGross && (s.maxGross === null || s.maxGross === undefined || grossEarnings <= s.maxGross)
    );
    professionalTax = slab ? slab.amount : 0;
  }

  let esiEmployee = 0;
  let esiEmployer = 0;
  if (rule.esiEnabled && grossEarnings <= rule.esiWageCeiling) {
    esiEmployee = Math.round((grossEarnings * rule.esiEmployeeRate) / 100);
    esiEmployer = Math.round((grossEarnings * rule.esiEmployerRate) / 100);
  }

  return { pfEmployee, pfEmployer, professionalTax, esiEmployee, esiEmployer };
}

// OT (Phase 2 item) — sums, across every PRESENT day in the month, worked
// hours beyond the rule's standardShiftHours, using the real
// checkInAt/checkOutAt punch times captured on the Attendance Register.
// Days missing either punch time contribute 0 OT hours (nothing to derive
// them from — not fabricated). Paid at otRatePerHour if HR set one,
// otherwise derived as 2x the employee's basic hourly rate (a common
// statutory OT multiplier) so the field is never silently zero once hours
// exist.
async function computeOvertimeForMonth(
  tenantSlug: string,
  employeeCode: string,
  month: string,
  rule: any,
  basic: number,
  workingDays: number
): Promise<{ otHours: number; otAmount: number }> {
  if (!rule.otEnabled) return { otHours: 0, otAmount: 0 };

  const [year, mon] = month.split("-").map((v: string) => parseInt(v, 10));
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));

  const rows = await AttendanceModel.find({
    tenantSlug,
    employeeCode,
    attendanceDate: { $gte: start, $lt: end },
    status: "PRESENT",
    checkInAt: { $ne: null },
    checkOutAt: { $ne: null }
  }).lean();

  let otHours = 0;
  for (const r of rows) {
    if (!r.checkInAt || !r.checkOutAt) continue;
    const hoursWorked = (new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / 3600000;
    if (hoursWorked > rule.standardShiftHours) {
      otHours += hoursWorked - rule.standardShiftHours;
    }
  }
  otHours = Math.round(otHours * 100) / 100;
  if (otHours <= 0) return { otHours: 0, otAmount: 0 };

  const hourlyRate = rule.otRatePerHour > 0
    ? rule.otRatePerHour
    : (basic / (workingDays * rule.standardShiftHours)) * 2;
  const otAmount = Math.round(otHours * hourlyRate);
  return { otHours, otAmount };
}

// ══════════════════════════════════════════════════════════════════════
// Comp-Off (Phase 2 MVP item) — HR grants a credit; employee spends it via
// ESS leave/apply with isCompOff=true (ess.routes.ts). List here is the
// same grant ledger used by both the HR screen and the Reports export.
// ══════════════════════════════════════════════════════════════════════
companyRouter.get(
  "/comp-offs",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) {
      query.employeeCode = req.query.employeeCode.trim();
    }
    const rows = await CompOffModel.find(query).sort({ createdAt: -1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1 }).lean();
    const nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));
    const data = rows.map((r) => ({ ...serializeDocument(r), employeeName: nameByCode.get(r.employeeCode) ?? null }));
    res.json({ data });
  })
);

const compOffGrantSchema = z.object({
  employeeCode: z.string().min(1),
  earnedDate: z.coerce.date(),
  reason: z.string().min(1),
  expiresOn: z.coerce.date().optional()
});

companyRouter.post(
  "/comp-offs",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = compOffGrantSchema.parse(req.body);
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode }).lean();
    if (!employee) throw new HttpError(404, `Employee ${body.employeeCode} not found`);

    const row = await CompOffModel.create({
      tenantSlug,
      employeeCode: body.employeeCode,
      earnedDate: body.earnedDate,
      reason: body.reason,
      expiresOn: body.expiresOn ?? null,
      status: "AVAILABLE",
      grantedBy: req.auth!.sub ?? null
    });
    await audit("COMP_OFF_GRANTED", "CompOff", String(row._id), { tenantSlug, employeeCode: body.employeeCode });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

// Working days for a "YYYY-MM" month = days in month minus Sundays minus
// state holidays recorded for the employee's state in the Holiday master
// (weekendHoliday / otherHolidayDate). Deliberately simple; documented as
// a stated Phase 1 simplification since Saturday/OT rules are unspecified.
async function computeWorkingDays(tenantSlug: string, month: string, state: string | null | undefined): Promise<number> {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  let sundays = 0;
  const holidayDates = new Set<number>();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, mon - 1, d));
    if (date.getUTCDay() === 0) sundays++;
  }

  if (state) {
    const holidays = await HolidayModel.find({ tenantSlug, stateName: state, status: "ACTIVE" }).lean();
    for (const h of holidays) {
      if (h.otherHolidayDate) {
        const hd = new Date(h.otherHolidayDate);
        if (hd.getUTCFullYear() === year && hd.getUTCMonth() + 1 === mon) {
          holidayDates.add(hd.getUTCDate());
        }
      }
    }
  }

  return Math.max(1, daysInMonth - sundays - holidayDates.size);
}

async function computeLwpDays(tenantSlug: string, employeeCode: string, month: string): Promise<number> {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  // Phase 1 simplification (unspecified in the docs): ABSENT is unpaid
  // (LWP), LEAVE is treated as paid leave and does not reduce pay.
  return AttendanceModel.countDocuments({
    tenantSlug,
    employeeCode,
    attendanceDate: { $gte: start, $lt: end },
    status: "ABSENT"
  });
}

async function sumApprovedLwpLeaveDaysInMonth(tenantSlug: string, employeeCode: string, month: string): Promise<number> {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  const rows = await LeaveApplicationModel.find({
    tenantSlug,
    employeeCode,
    status: "APPROVED",
    isLWP: true,
    fromDate: { $lt: end },
    toDate: { $gte: start }
  }).lean();
  // Each application's `days` already covers its own from/to span; a leave
  // spanning two months would double count here, but Phase 1 leave requests
  // are expected to stay within one payroll month (documented simplification).
  return rows.reduce((sum, r) => sum + (r.days ?? 0), 0);
}

companyRouter.post(
  "/payroll/runs",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.body);

    const employees = await EmployeeModel.find({ tenantSlug, status: "ACTIVE" }).lean();
    const created: unknown[] = [];
    const skipped: string[] = [];

    for (const employee of employees) {
      const existing = await PayrollRunModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, month }).lean();
      if (existing) { skipped.push(employee.employeeCode); continue; }

      const structure = await SalaryStructureModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, status: "ACTIVE" })
        .sort({ effectiveFrom: -1 })
        .lean();
      if (!structure) { skipped.push(employee.employeeCode); continue; }

      const basic = Math.round((structure.ctc * structure.basicPercent) / 100);
      const hra = Math.round((structure.ctc * structure.hraPercent) / 100);
      const allowance = Math.round((structure.ctc * structure.allowancePercent) / 100);
      const grossEarnings = basic + hra + allowance;

      const workingDays = await computeWorkingDays(tenantSlug, month, employee.state);
      const lwpDaysFromAttendance = await computeLwpDays(tenantSlug, employee.employeeCode, month);

      // Zivira_HR_Client_Requirement_1A.docx §25 "Leave -> Attendance -> LWP
      // if applicable -> Payroll": HR-approved leave applications marked
      // isLWP also count as unpaid days, on top of plain ABSENT attendance.
      const leaveLwpDays = await sumApprovedLwpLeaveDaysInMonth(tenantSlug, employee.employeeCode, month);
      const lwpDays = lwpDaysFromAttendance + leaveLwpDays;
      const lwpDeduction = Math.round((grossEarnings / workingDays) * lwpDays);

      // Phase 1 MVP items: Loan (EMI deduction) and Arrears (one-off
      // adjustment), both picked up automatically at generation time.
      const loan = await LoanModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, status: "ACTIVE" }).sort({ createdAt: 1 });
      const loanDeduction = loan ? Math.min(loan.emiAmount, loan.remainingBalance) : 0;

      const pendingArrears = await ArrearModel.find({ tenantSlug, employeeCode: employee.employeeCode, month, status: "PENDING" });
      const arrears = pendingArrears.reduce((sum, a) => sum + a.amount, 0);

      // Phase 2 "Advanced Statutory Calculations" (PF/PT/ESI) and "OT" —
      // computed from whichever StatutoryRule is ACTIVE for the tenant
      // right now, baked into this row so it never silently changes later.
      const rule = await getActiveStatutoryRule(tenantSlug);
      const { pfEmployee, pfEmployer, professionalTax, esiEmployee, esiEmployer } = computeStatutoryDeductions(rule, basic, grossEarnings);
      const { otHours, otAmount } = await computeOvertimeForMonth(tenantSlug, employee.employeeCode, month, rule, basic, workingDays);

      const netPay = grossEarnings - lwpDeduction - loanDeduction + arrears - pfEmployee - professionalTax - esiEmployee + otAmount;

      const row = await PayrollRunModel.create({
        tenantSlug,
        employeeCode: employee.employeeCode,
        month,
        basic,
        hra,
        allowance,
        grossEarnings,
        workingDays,
        lwpDays,
        lwpDeduction,
        loanDeduction,
        loanId: loan ? loan._id : null,
        arrears,
        pfEmployee,
        pfEmployer,
        professionalTax,
        esiEmployee,
        esiEmployer,
        otHours,
        otAmount,
        netPay,
        status: "DRAFT"
      });

      if (loan) {
        loan.remainingBalance = Math.max(0, loan.remainingBalance - loanDeduction);
        if (loan.remainingBalance === 0) loan.status = "CLOSED";
        await loan.save();
      }
      if (pendingArrears.length) {
        await ArrearModel.updateMany({ _id: { $in: pendingArrears.map((a) => a._id) } }, { status: "APPLIED" });
      }

      created.push(serializeDocument(row));
    }

    await audit("PAYROLL_RUN_GENERATED", "PayrollRun", undefined, { tenantSlug, month, createdCount: created.length, skippedCount: skipped.length });
    res.status(201).json({ data: created, skipped, month });
  })
);

companyRouter.get(
  "/payroll/runs",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.month === "string" && req.query.month.trim()) {
      query.month = req.query.month.trim();
    }
    const rows = await PayrollRunModel.find(query).sort({ employeeCode: 1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1, designation: 1 }).lean();
    const nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));
    const data = rows.map((r) => ({ ...serializeDocument(r), employeeName: nameByCode.get(r.employeeCode) ?? null }));
    res.json({ data });
  })
);

// HR-editable "visibility" fields on a DRAFT payroll row — Incentive (Phase 1
// MVP item) and Basic Tax Visibility (a manually-entered figure; automated
// slab-based tax calculation is explicitly Phase 2 per the doc). Recomputes
// netPay from all components so the two never drift apart.
companyRouter.patch(
  "/payroll/runs/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await PayrollRunModel.findOne({ _id: req.params.id, tenantSlug });
    if (!row) throw new HttpError(404, "Payroll run record not found");
    if (row.status === "LOCKED") throw new HttpError(400, "Locked payroll runs cannot be modified");

    const body = z.object({
      incentive: z.number().min(0).optional(),
      incentiveNote: z.string().optional(),
      estimatedTax: z.number().min(0).optional()
    }).parse(req.body);

    if (body.incentive !== undefined) row.incentive = body.incentive;
    if (body.incentiveNote !== undefined) row.incentiveNote = body.incentiveNote;
    if (body.estimatedTax !== undefined) row.estimatedTax = body.estimatedTax;

    row.netPay = row.grossEarnings - row.lwpDeduction - row.loanDeduction + row.arrears + row.incentive - row.estimatedTax
      - row.pfEmployee - row.professionalTax - row.esiEmployee + row.otAmount;
    await row.save();
    await audit("PAYROLL_RUN_UPDATED", "PayrollRun", String(row._id), { tenantSlug, employeeCode: row.employeeCode, month: row.month });
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.patch(
  "/payroll/runs/:id/approve",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await PayrollRunModel.findOne({ _id: req.params.id, tenantSlug });
    if (!row) throw new HttpError(404, "Payroll run record not found");
    if (row.status === "LOCKED") throw new HttpError(400, "Locked payroll runs cannot be modified");

    row.status = "HR_APPROVED";
    row.approvedBy = req.auth!.sub ?? null;
    row.approvedAt = new Date();
    await row.save();
    await audit("PAYROLL_RUN_APPROVED", "PayrollRun", String(row._id), { tenantSlug, employeeCode: row.employeeCode, month: row.month });
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.patch(
  "/payroll/runs/:id/lock",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await PayrollRunModel.findOne({ _id: req.params.id, tenantSlug });
    if (!row) throw new HttpError(404, "Payroll run record not found");
    if (row.status !== "HR_APPROVED") throw new HttpError(400, "Only HR-approved payroll runs can be locked");

    row.status = "LOCKED";
    await row.save();
    await audit("PAYROLL_RUN_LOCKED", "PayrollRun", String(row._id), { tenantSlug, employeeCode: row.employeeCode, month: row.month });
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.get(
  "/payroll/runs/:id/payslip",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await PayrollRunModel.findOne({ _id: req.params.id, tenantSlug }).lean();
    if (!row) throw new HttpError(404, "Payroll run record not found");
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: row.employeeCode }).lean();
    res.json({
      data: {
        ...serializeDocument(row),
        employeeName: employee?.name ?? null,
        designation: employee?.designation ?? null,
        division: employee?.division ?? null
      }
    });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Zivira_Master_Tab_Client_Change_3B.docx §2:37 — Monthly / Quarterly /
// Half-Yearly / Total Target, and Achievement % (Net Sales ÷ Target × 100).
// The doc explicitly says a quarter is just its three constituent months
// summed ("April + May + June should constitute one quarter") and that
// "you don't necessarily need separate tables" for each period — so this
// is a single aggregation endpoint over the existing monthly rows rather
// than new Quarterly/Half-Yearly schema/tables. Caller passes whichever
// set of months it wants summed (1 month = Monthly, 3 = Quarterly, 6 =
// Half-Yearly, all = Total).
// ══════════════════════════════════════════════════════════════════════
companyRouter.get(
  "/analytics/sales-achievement",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const months = typeof req.query.months === "string"
      ? req.query.months.split(",").map((m) => m.trim()).filter(Boolean)
      : [];
    if (months.length === 0) {
      throw new HttpError(400, "months query param is required (comma-separated, e.g. ?months=April 2026,May 2026,June 2026)");
    }

    const filter: Record<string, unknown> = { tenantSlug, month: { $in: months } };
    for (const key of ["division", "zone", "region", "hq", "product"]) {
      const value = req.query[key];
      if (typeof value === "string" && value.trim()) filter[key] = value.trim();
    }

    const TargetModel = getMasterModel("targetMaster");
    const PrimaryModel = getMasterModel("primarySales");
    const SecondaryModel = getMasterModel("secondarySales");

    const [targetRows, primaryRows, secondaryRows] = await Promise.all([
      TargetModel.find(filter).lean(),
      PrimaryModel.find(filter).lean(),
      SecondaryModel.find(filter).lean()
    ]);

    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const targetUnit = targetRows.reduce((sum, r) => sum + num(r.targetUnit), 0);
    const targetValue = targetRows.reduce((sum, r) => sum + num(r.targetValue), 0);
    const netSaleUnit = primaryRows.reduce((sum, r) => sum + num(r.netSaleUnit), 0)
      + secondaryRows.reduce((sum, r) => sum + num(r.netSaleUnit), 0);
    const netSaleValue = primaryRows.reduce((sum, r) => sum + num(r.netSaleValue), 0)
      + secondaryRows.reduce((sum, r) => sum + num(r.netSaleValue), 0);
    const achievementPercent = targetValue > 0 ? Math.round((netSaleValue / targetValue) * 10000) / 100 : null;

    res.json({
      data: {
        months,
        targetUnit,
        targetValue,
        netSaleUnit,
        netSaleValue,
        achievementPercent,
        aboveOrBelowTarget: achievementPercent === null ? null : Math.round((netSaleValue - targetValue) * 100) / 100
      }
    });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Zivira_HR_Client_Requirement_1B.docx "complete employee journey" —
// Onboarding. HR side: generate -> trigger mail -> verify documents.
// (Employee side — login, create password, fill the 8-step form — lives
// under /api/ess/onboarding in ess.routes.ts.)
// ══════════════════════════════════════════════════════════════════════

async function nextOnboardingId(tenantSlug: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await OnboardingModel.countDocuments({ tenantSlug });
  return `ONB${year}${String(count + 1).padStart(5, "0")}`;
}

companyRouter.get(
  "/onboarding",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const rows = await OnboardingModel.find({ tenantSlug }).sort({ createdAt: -1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1, designation: 1, email: 1 }).lean();
    const byCode = new Map(employees.map((e) => [e.employeeCode, e]));
    const data = rows.map((r) => ({ ...serializeDocument(r), employeeName: byCode.get(r.employeeCode)?.name ?? null }));
    res.json({ data });
  })
);

companyRouter.get(
  "/onboarding/:employeeCode",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode });
    if (!row) throw new HttpError(404, "Onboarding record not found — generate it first");
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.post(
  "/onboarding/:employeeCode/generate",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode }).lean();
    if (!employee) throw new HttpError(404, "Employee not found");

    const existing = await OnboardingModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode });
    if (existing) throw new HttpError(409, "Onboarding already generated for this employee");

    const onboardingId = await nextOnboardingId(tenantSlug);
    const row = await OnboardingModel.create({ tenantSlug, employeeCode: req.params.employeeCode, onboardingId, status: "INITIATED" });
    await audit("ONBOARDING_GENERATED", "Onboarding", String(row._id), { tenantSlug, employeeCode: req.params.employeeCode });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

// Item 2 — "once we click the trigger onboarding on the hr portal it must
// send an email for the respected gmail, the hr add while creating the add
// new employee." Creates (or resets) the employee's EMPLOYEE-portal login
// with a temp password and emails those credentials to the employee's own
// email on file (Employee Master's `email` field — set by HR on the "Add
// New Employee" screen). The credentials are still returned in the response
// too (unchanged), so HR still sees them on screen as a fallback if the
// employee's email is missing or the send fails — see
// notifyOnboardingCredentials() in utils/notify.ts for the Gmail SMTP send.
companyRouter.post(
  "/onboarding/:employeeCode/trigger-mail",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode }).lean();
    if (!employee) throw new HttpError(404, "Employee not found");

    const onboarding = await OnboardingModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode });
    if (!onboarding) throw new HttpError(404, "Generate onboarding first");

    const tempPassword = Math.random().toString(36).slice(2, 10).toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const username = req.params.employeeCode.toLowerCase();

    await UserModel.updateOne(
      { username },
      {
        username,
        passwordHash,
        displayName: employee.name,
        role: "EMPLOYEE",
        portal: "EMPLOYEE",
        tenantSlug,
        employeeCode: req.params.employeeCode,
        mustChangePassword: true,
        active: true
      },
      { upsert: true }
    );

    onboarding.status = "EMAIL_SENT";
    await onboarding.save();
    await audit("ONBOARDING_MAIL_TRIGGERED", "Onboarding", String(onboarding._id), { tenantSlug, employeeCode: req.params.employeeCode });

    await notifyOnboardingCredentials({
      toEmail: employee.email,
      toName: employee.name,
      username,
      tempPassword
    });

    // New request item 2 — additionally send the login link + employee
    // code + temp password straight to the employee's personal email, if
    // HR captured one. Independent of (and does not affect) the official
    // -email send above.
    await notifyPersonalOnboardingLink({
      toEmail: (employee as { personalEmail?: string | null }).personalEmail,
      toName: employee.name,
      employeeCode: req.params.employeeCode,
      tempPassword
    });

    const personalEmail = (employee as { personalEmail?: string | null }).personalEmail;
    res.json({
      data: serializeDocument(onboarding),
      credentials: { username, tempPassword },
      emailSent: Boolean(employee.email),
      personalEmailSent: Boolean(personalEmail),
      note: employee.email
        ? `An email with these credentials was sent to ${employee.email}.`
        : "This employee has no email on file — share these credentials with them directly.",
      personalEmailNote: personalEmail
        ? `The Zivira HR portal link and credentials were also sent to ${personalEmail}.`
        : "This employee has no personal email on file — the personal-email copy was not sent."
    });
  })
);

companyRouter.patch(
  "/onboarding/:employeeCode/documents/:docName/verify",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode });
    if (!row) throw new HttpError(404, "Onboarding record not found");
    const doc = row.documents.find((d: any) => d.name === req.params.docName);
    if (!doc) throw new HttpError(404, "Document not found");
    doc.status = "VERIFIED";
    doc.rejectReason = null;
    await row.save();
    await audit("ONBOARDING_DOCUMENT_VERIFIED", "Onboarding", String(row._id), { tenantSlug, employeeCode: req.params.employeeCode, document: req.params.docName });
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode }).lean();
    await notifyEmployeeEmail({
      toEmail: employee?.email,
      toName: employee?.name,
      subject: `${req.params.docName} approved`,
      message: `Your ${req.params.docName} document has been verified and approved by HR.`
    });
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.patch(
  "/onboarding/:employeeCode/documents/:docName/reject",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode });
    if (!row) throw new HttpError(404, "Onboarding record not found");
    const doc = row.documents.find((d: any) => d.name === req.params.docName);
    if (!doc) throw new HttpError(404, "Document not found");
    doc.status = "REJECTED";
    doc.rejectReason = reason;
    await row.save();
    await audit("ONBOARDING_DOCUMENT_REJECTED", "Onboarding", String(row._id), { tenantSlug, employeeCode: req.params.employeeCode, document: req.params.docName, reason });
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode }).lean();
    await notifyEmployeeEmail({
      toEmail: employee?.email,
      toName: employee?.name,
      subject: `${req.params.docName} rejected`,
      message: `Your ${req.params.docName} document was rejected by HR.\n\nReason: ${reason}\n\nPlease re-upload a corrected copy.`
    });
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.patch(
  "/onboarding/:employeeCode/complete",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await OnboardingModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode });
    if (!row) throw new HttpError(404, "Onboarding record not found");
    if (row.status !== "SUBMITTED") throw new HttpError(400, "Employee has not submitted onboarding yet");
    row.status = "COMPLETED";
    row.completedAt = new Date();
    await row.save();
    await audit("ONBOARDING_COMPLETED", "Onboarding", String(row._id), { tenantSlug, employeeCode: req.params.employeeCode });
    res.json({ data: serializeDocument(row) });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Attendance Import (Phase 1 MVP item) — bulk upsert instead of one row at
// a time, so HR can paste/import an Excel-derived attendance sheet.
// ══════════════════════════════════════════════════════════════════════
const attendanceImportRowSchema = z.object({
  employeeCode: z.string().min(1),
  attendanceDate: z.coerce.date(),
  status: z.enum(["PRESENT", "ABSENT", "LEAVE"]),
  // Punch In / Punch Out — manual entry or bulk Excel/CSV import in Phase 1
  // (no biometric device integration; that's explicitly Phase 2 per
  // Zivira_HR_Client_Requirement_1A.docx §32's Phase 2 list). Optional so a
  // plain status-only row (the original Phase 1 shape) still works.
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional()
});

companyRouter.post(
  "/attendance/import",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const { rows } = z.object({ rows: z.array(attendanceImportRowSchema).min(1) }).parse(req.body);

    let imported = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await AttendanceModel.updateOne(
          { tenantSlug, employeeCode: row.employeeCode, attendanceDate: row.attendanceDate },
          {
            tenantSlug,
            employeeCode: row.employeeCode,
            attendanceDate: row.attendanceDate,
            status: row.status,
            ...(row.checkInAt ? { checkInAt: row.checkInAt } : {}),
            ...(row.checkOutAt ? { checkOutAt: row.checkOutAt } : {})
          },
          { upsert: true }
        );
        imported++;
      } catch (err) {
        errors.push({ row: i + 1, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    await audit("ATTENDANCE_IMPORTED", "Attendance", undefined, { tenantSlug, importedCount: imported, errorCount: errors.length });
    res.status(201).json({ data: { imported, errors } });
  })
);

companyRouter.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) {
      query.employeeCode = req.query.employeeCode.trim();
    }
    if (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)) {
      const [year, mon] = req.query.month.split("-").map((v) => parseInt(v, 10));
      query.attendanceDate = { $gte: new Date(Date.UTC(year, mon - 1, 1)), $lt: new Date(Date.UTC(year, mon, 1)) };
    }
    const rows = await AttendanceModel.find(query).sort({ attendanceDate: -1 }).limit(2000).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Leave (Phase 1 MVP item) — HR side: list + approve/reject. Employee side
// (apply) lives under /api/ess/leave in ess.routes.ts.
// ══════════════════════════════════════════════════════════════════════
companyRouter.get(
  "/leave",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.status === "string" && req.query.status.trim()) query.status = req.query.status.trim();
    const rows = await LeaveApplicationModel.find(query).sort({ createdAt: -1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1 }).lean();
    const nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));
    const data = rows.map((r) => ({ ...serializeDocument(r), employeeName: nameByCode.get(r.employeeCode) ?? null }));
    res.json({ data });
  })
);

companyRouter.patch(
  "/leave/:id/approve",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await LeaveApplicationModel.findOne({ _id: req.params.id, tenantSlug });
    if (!row) throw new HttpError(404, "Leave application not found");
    row.status = "APPROVED";
    row.approvedBy = req.auth!.sub ?? null;
    row.approvedAt = new Date();
    await row.save();
    await audit("LEAVE_APPROVED", "LeaveApplication", String(row._id), { tenantSlug, employeeCode: row.employeeCode });
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.patch(
  "/leave/:id/reject",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const row = await LeaveApplicationModel.findOne({ _id: req.params.id, tenantSlug });
    if (!row) throw new HttpError(404, "Leave application not found");
    row.status = "REJECTED";
    row.rejectReason = reason ?? null;
    await row.save();
    // If this application spent a Comp-Off credit, give it back on rejection.
    if (row.isCompOff && row.compOffId) {
      await CompOffModel.updateOne({ _id: row.compOffId, tenantSlug }, { status: "AVAILABLE", usedInLeaveId: null });
    }
    await audit("LEAVE_REJECTED", "LeaveApplication", String(row._id), { tenantSlug, employeeCode: row.employeeCode });
    res.json({ data: serializeDocument(row) });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Loan and Arrears (Phase 1 MVP items) — HR creates them; Payroll Run
// generation picks them up automatically (see POST /payroll/runs above).
// ══════════════════════════════════════════════════════════════════════
companyRouter.get(
  "/loans",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) query.employeeCode = req.query.employeeCode.trim();
    const rows = await LoanModel.find(query).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

companyRouter.post(
  "/loans",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = z.object({
      employeeCode: z.string().min(1),
      principal: z.number().positive(),
      emiAmount: z.number().positive(),
      reason: z.string().optional(),
      startMonth: z.string().regex(/^\d{4}-\d{2}$/)
    }).parse(req.body);
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode }).lean();
    if (!employee) throw new HttpError(404, `Employee ${body.employeeCode} not found`);
    const row = await LoanModel.create({ ...body, tenantSlug, remainingBalance: body.principal, status: "ACTIVE" });
    await audit("LOAN_CREATED", "Loan", String(row._id), { tenantSlug, employeeCode: row.employeeCode });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

companyRouter.get(
  "/arrears",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const query: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) query.employeeCode = req.query.employeeCode.trim();
    const rows = await ArrearModel.find(query).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

companyRouter.post(
  "/arrears",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = z.object({
      employeeCode: z.string().min(1),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      amount: z.number(),
      reason: z.string().optional()
    }).parse(req.body);
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode }).lean();
    if (!employee) throw new HttpError(404, `Employee ${body.employeeCode} not found`);
    const row = await ArrearModel.create({ ...body, tenantSlug, status: "PENDING" });
    await audit("ARREAR_CREATED", "Arrear", String(row._id), { tenantSlug, employeeCode: row.employeeCode, month: row.month });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Admin/HR Dashboard (Phase 1 MVP item) — real counts replacing the HR
// portal's previously-hardcoded dashboard numbers.
// ══════════════════════════════════════════════════════════════════════
companyRouter.get(
  "/hr-dashboard",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const [totalEmployees, newJoiners, onboardingRows, todayAttendance, pendingLeave, payrollRows] = await Promise.all([
      EmployeeModel.countDocuments({ tenantSlug, status: "ACTIVE" }),
      EmployeeModel.countDocuments({ tenantSlug, joinDate: { $gte: monthStart } }),
      OnboardingModel.find({ tenantSlug }, { status: 1 }).lean(),
      AttendanceModel.find({ tenantSlug, attendanceDate: { $gte: todayStart } }, { status: 1 }).lean(),
      LeaveApplicationModel.countDocuments({ tenantSlug, status: "PENDING" }),
      PayrollRunModel.find({ tenantSlug, month: currentMonth }, { status: 1 }).lean()
    ]);

    const pendingOnboarding = onboardingRows.filter((o) => o.status !== "COMPLETED").length;
    const completedOnboarding = onboardingRows.filter((o) => o.status === "COMPLETED").length;
    const presentToday = todayAttendance.filter((a) => a.status === "PRESENT").length;
    const absentOrLeaveToday = todayAttendance.filter((a) => a.status !== "PRESENT").length;

    res.json({
      data: {
        totalEmployees,
        newJoiners,
        pendingOnboarding,
        completedOnboarding,
        presentToday,
        absentOrLeaveToday,
        pendingLeaveApprovals: pendingLeave,
        payrollMonth: currentMonth,
        payrollRowsGenerated: payrollRows.length,
        payrollLocked: payrollRows.length > 0 && payrollRows.every((r) => r.status === "LOCKED")
      }
    });
  })
);

// ══════════════════════════════════════════════════════════════════════
// Reports (Phase 1 MVP item) — payroll summary for a month, plus a CSV
// export in whatever format Accounts can consume (doc §23: "the application
// should initially be able to export payroll data in the exact format
// Accounts expects" — CSV is a safe, universally-importable starting point).
// ══════════════════════════════════════════════════════════════════════
companyRouter.get(
  "/reports/payroll-summary",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "month query param (YYYY-MM) is required");

    const rows = await PayrollRunModel.find({ tenantSlug, month }).lean();
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const sum = (key: string) => rows.reduce((s, r) => s + num((r as any)[key]), 0);

    res.json({
      data: {
        month,
        headcount: rows.length,
        grossEarnings: sum("grossEarnings"),
        netPay: sum("netPay"),
        lwpDeduction: sum("lwpDeduction"),
        loanDeduction: sum("loanDeduction"),
        incentive: sum("incentive"),
        arrears: sum("arrears"),
        estimatedTax: sum("estimatedTax"),
        pfEmployee: sum("pfEmployee"),
        pfEmployer: sum("pfEmployer"),
        professionalTax: sum("professionalTax"),
        esiEmployee: sum("esiEmployee"),
        esiEmployer: sum("esiEmployer"),
        otHours: sum("otHours"),
        otAmount: sum("otAmount"),
        draft: rows.filter((r) => r.status === "DRAFT").length,
        hrApproved: rows.filter((r) => r.status === "HR_APPROVED").length,
        locked: rows.filter((r) => r.status === "LOCKED").length
      }
    });
  })
);

companyRouter.get(
  "/reports/payroll-export",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "month query param (YYYY-MM) is required");

    const rows = await PayrollRunModel.find({ tenantSlug, month }).sort({ employeeCode: 1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1, designation: 1 }).lean();
    const nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));
    const designationByCode = new Map(employees.map((e) => [e.employeeCode, e.designation]));

    const header = [
      "Employee Code", "Name", "Designation", "Month", "Basic", "HRA", "Allowance", "Gross Earnings",
      "LWP Days", "LWP Deduction", "Loan Deduction", "Incentive", "Arrears", "Estimated Tax",
      "PF Employee", "PF Employer", "Professional Tax", "ESI Employee", "ESI Employer", "OT Hours", "OT Amount",
      "Net Pay", "Status"
    ];
    const csvRows = rows.map((r) => [
      r.employeeCode, nameByCode.get(r.employeeCode) ?? "", designationByCode.get(r.employeeCode) ?? "", r.month,
      r.basic, r.hra, r.allowance, r.grossEarnings, r.lwpDays, r.lwpDeduction, r.loanDeduction, r.incentive, r.arrears, r.estimatedTax,
      r.pfEmployee, r.pfEmployer, r.professionalTax, r.esiEmployee, r.esiEmployer, r.otHours, r.otAmount,
      r.netPay, r.status
    ]);
    const csv = [header, ...csvRows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-${month}.csv"`);
    res.send(csv);
  })
);

// Phase 2 "Advanced Reports" — statutory (PF/PT/ESI) compliance report,
// the figure Accounts/compliance filings need per month, plus its CSV
// export in the same header style as payroll-export above.
companyRouter.get(
  "/reports/statutory-summary",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "month query param (YYYY-MM) is required");

    const rows = await PayrollRunModel.find({ tenantSlug, month }).sort({ employeeCode: 1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1 }).lean();
    const nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));

    const data = rows.map((r) => ({
      employeeCode: r.employeeCode,
      employeeName: nameByCode.get(r.employeeCode) ?? null,
      basic: r.basic,
      pfEmployee: r.pfEmployee,
      pfEmployer: r.pfEmployer,
      professionalTax: r.professionalTax,
      esiEmployee: r.esiEmployee,
      esiEmployer: r.esiEmployer
    }));

    const totals = data.reduce(
      (acc, r) => ({
        pfEmployee: acc.pfEmployee + r.pfEmployee,
        pfEmployer: acc.pfEmployer + r.pfEmployer,
        professionalTax: acc.professionalTax + r.professionalTax,
        esiEmployee: acc.esiEmployee + r.esiEmployee,
        esiEmployer: acc.esiEmployer + r.esiEmployer
      }),
      { pfEmployee: 0, pfEmployer: 0, professionalTax: 0, esiEmployee: 0, esiEmployer: 0 }
    );

    res.json({ data: { month, rows: data, totals } });
  })
);

// Phase 2 "OT" report — hours and amount paid per employee for the month.
companyRouter.get(
  "/reports/ot-summary",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "month query param (YYYY-MM) is required");

    const rows = await PayrollRunModel.find({ tenantSlug, month, otHours: { $gt: 0 } }).sort({ otHours: -1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1 }).lean();
    const nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));

    const data = rows.map((r) => ({
      employeeCode: r.employeeCode,
      employeeName: nameByCode.get(r.employeeCode) ?? null,
      otHours: r.otHours,
      otAmount: r.otAmount
    }));
    const totalHours = data.reduce((s, r) => s + r.otHours, 0);
    const totalAmount = data.reduce((s, r) => s + r.otAmount, 0);

    res.json({ data: { month, rows: data, totalHours, totalAmount } });
  })
);

// Phase 2 "Comp-Off" report — grant/spend ledger across the whole tenant
// (not month-scoped, since a credit can be earned in one month and spent
// in another).
companyRouter.get(
  "/reports/comp-off-summary",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const rows = await CompOffModel.find({ tenantSlug }).sort({ createdAt: -1 }).lean();
    const employees = await EmployeeModel.find({ tenantSlug }, { employeeCode: 1, name: 1 }).lean();
    const nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));

    const data = rows.map((r) => ({ ...serializeDocument(r), employeeName: nameByCode.get(r.employeeCode) ?? null }));
    res.json({
      data: {
        rows: data,
        available: rows.filter((r) => r.status === "AVAILABLE").length,
        used: rows.filter((r) => r.status === "USED").length,
        expired: rows.filter((r) => r.status === "EXPIRED").length
      }
    });
  })
);

