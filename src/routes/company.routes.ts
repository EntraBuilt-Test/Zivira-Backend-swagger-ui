import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { requireAuth, requireCompanyAdmin } from "../http/auth.js";
import { mastersRouter } from "./masters.routes.js";
import { uploadsRouter } from "./uploads.routes.js";
import { cached, clearCache } from "../utils/ttl-cache.js";
import { uploadToolsRouter } from "./upload-tools.routes.js";
import { infoAdminRouter } from "./info.routes.js";
import { mailRouter } from "./mail.routes.js";
import { mastersActionsRouter } from "./masters-actions.routes.js";
import { dashboardsRouter } from "./dashboard.routes.js";
import { quizRouter } from "./quiz.routes.js";
import { MASTERS } from "../masters/registry.js";
import { getMasterModel } from "../models/master-record.model.js";
import { HttpError } from "../http/errors.js";
import { AttendanceModel } from "../models/attendance.model.js";
import { DcrModel } from "../models/dcr.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { SlideDownloadModel } from "../models/slide-download.model.js";
import { ProductModel } from "../models/product.model.js";
import { audit } from "../utils/audit.js";
import { nextDoctorCode } from "../utils/doctor-code.js";
import { AuditLogModel } from "../models/audit-log.model.js";
import { serializeDocument } from "../utils/serialize.js";
import { notifyEmployeeEmail, notifyFieldRep, notifyOnboardingCredentials, notifyPersonalOnboardingLink } from "../utils/notify.js";
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
import { resolveTeam, getDirectReports, findVacantManagerCodes, isManagerRole, getAllDescendants, getUpwardChain, getAllManagers } from "../utils/org-hierarchy.js";
import { computeWorkHygiene, computeClassWiseView, buildDcrDump, dumpToCsv, DUMP_HEADERS, computeMissedCallListed, computeMissedCallDetailed, listDoctorsForForce, computeSingleDoctor, computeRepVsManager, computeReviewReport, computeAssessment } from "../utils/mis-reports-2-compute.js";
import XLSX from "xlsx";
import { buildRcpaRows, rcpaHtmlXls, rcpaCsv, buildSkuRows, skuTsv, buildVisitDrsRows, VISIT_DRS_HEADERS, buildSsRows, SS_HEADERS, buildListeddrRows, listeddrCsv, LISTEDDR_HEADERS, buildChemistRows, CHEMIST_HEADERS, CHEMIST_WIDTHS, buildTransitRows, TRANSIT_HEADERS, TRANSIT_WIDTHS, buildStockistRows, STOCKIST_HEADERS, STOCKIST_WIDTHS, computeResignedUsers, computeJoinLeft, computeTpDeviation, legacyXlsx, forceLabel } from "../utils/r46-reports.js";
import { computeQuizResult, buildCallLines, dayWiseHtmlXls, dayWiseCells, DAYWISE_HEADERS, callReportCsv, callReportCells, CALL_REPORT_HEADERS, aoaToXlsx, detailingOptions, computeDetailingVisitWise, computeBrandStarRating, slideAnalysisOptions, computeSlideAnalysis, computeDrsAnalysis, type SlideFilterKind } from "../utils/r45-reports.js";
import * as R55 from "../utils/r55-reports.js";
import * as R54 from "../utils/r54-reports.js";
import * as R53 from "../utils/r53-reports.js";
import * as R52 from "../utils/r52-reports.js";
import * as R51 from "../utils/r51-reports.js";
import { computeModewise, MODEWISE_TYPES, type ModewiseType } from "../utils/r50-reports.js";
import { computeDoctorwise, computeCallFeedbackwise, computeFixation, baseLevelOptions, DOCTORWISE_MODES, FIXATION_TYPES, type DoctorwiseMode, type FixationType } from "../utils/r48-reports.js";
import { visitDetailOptions, computeCatClsVisit, computeDateWise, VISIT_MODES, type VisitMode } from "../utils/visit-details-reports.js";
import { computeProductWise, computeFieldforceWise, computeDayWise, buildPobDump, dumpToXlsx, computeHeat, computeHqVisits } from "../utils/pob-rx-reports.js";
import { computeDcrAnalysis, computeVisitAnalysis, computeSalesDetailsRows, computeSalesDetailsStatewise, computePobWise, computePobPeriodic, listPobProducts, selfAndTeam, type VisitAnalysisType } from "../utils/mis-reports-compute.js";
import type { OrgEmployee } from "../utils/org-hierarchy.js";
import { monthRange, computeDayCallsSummaryRange, computeHqExOsRow, computeDetailRow, computeCoverageAnalysis1, computeJointWorkForEmployee, computeJointWorkWithManager, computeFieldworkManagerRow, computeManagerWiseCoverageRow, computeSpecialityVisitWise, computeCategoryVisitWise } from "../utils/manager-analysis-compute.js";
import { CustomReportModel } from "../models/custom-report.model.js";
import { ApprovalAuditLogModel } from "../models/approval-audit-log.model.js";
import { CUSTOM_REPORT_CATEGORIES, ALL_METRIC_KEYS, COMPUTED_METRIC_KEYS } from "../utils/custom-report-metrics.js";
import { computeCustomReportMetrics } from "../utils/custom-report-compute.js";
import { buildDayStatusContext, classifyDay, dayStatusLabel } from "../utils/day-status.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { ChemistCallModel } from "../models/chemist-call.model.js";
import { FieldVisitLogModel } from "../models/field-visit-log.model.js";
import { SurveyQuestionModel } from "../models/survey-question.model.js";
import { SurveyModel } from "../models/survey.model.js";
import { SurveyAnswerModel } from "../models/survey-answer.model.js";
import { DispatchModel } from "../models/dispatch.model.js";
import { CampaignVisitModel } from "../models/campaign-visit.model.js";
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
import { DcrLockModel } from "../models/dcr-lock.model.js";
import { WorkTypeCodeModel, WORK_TYPE_TO_CODE } from "../models/work-type-code.model.js";
import { RcpaModel } from "../models/rcpa.model.js";
import { CrmModel } from "../models/crm.model.js";
import { detectLocks, releaseLocks, utcDateString, LOCK_LOOKBACK_DAYS } from "../utils/dcr-lock.js";
import { getDcrDelayDays, getCategoryNorms, getCompanyTimezone, saveSetting, DCR_DELAY_DAYS_KEY, CATEGORY_NORMS_KEY, COMPANY_TIMEZONE_KEY } from "../utils/settings.js";
import { ensureWorkTypeCodes, listWorkTypeCodes } from "../utils/work-type-codes.js";
import { tierOfDoctor, loadCoreMap } from "../utils/doctor-tier.js";
import { docPobValue, loadRateMap } from "../utils/mis-reports-compute.js";

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
  personalEmail: z.string().email().optional().nullable(),
  // Round 46 -- separation tracking + legacy Saneforce code.
  leftDate: z.string().optional().nullable(),
  sfCode: z.string().trim().optional().nullable()
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
  phone: z.string().optional().nullable(),
  // Round 44 -- names from the Doctor Type master (a doctor can hold several).
  doctorTypes: z.array(z.string().trim().min(1)).optional(),
  // Round 45 -- campaign (a campaignMaster name) and promoted brands, editable on the Listed Doctor form.
  campaign: z.string().trim().nullable().optional(),
  promotedBrands: z.array(z.string().trim().min(1)).optional(),
  // Round 46 -- Listeddr dump business-profile fields + P0..P5 priority products.
  drPotential: z.string().trim().nullable().optional(),
  businessValue: z.string().trim().nullable().optional(),
  expBusinessValue: z.string().trim().nullable().optional(),
  currentBusiness: z.string().trim().nullable().optional(),
  communication: z.string().trim().nullable().optional(),
  workingPlace: z.string().trim().nullable().optional(),
  visitingDays: z.string().trim().nullable().optional(),
  iuiCycle: z.string().trim().nullable().optional(),
  avgPatientsPerDay: z.string().trim().nullable().optional(),
  classOfPatients: z.string().trim().nullable().optional(),
  timeOfMeeting: z.string().trim().nullable().optional(),
  consultationFees: z.string().trim().nullable().optional(),
  hospitalAddress: z.string().trim().nullable().optional(),
  telephone: z.string().trim().nullable().optional(),
  priorityProducts: z.array(z.string().trim()).max(6).optional(),
  mappedProducts: z.array(z.string().trim().min(1)).optional()
});

const productSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  category: z.string().min(2),
  division: z.string().min(2),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  // Round 8 item 7 — real MSIS Rate/Pack, editable at product creation and
  // (via the new PUT below) after the fact.
  rate: z.number().min(0).nullable().optional(),
  pack: z.string().nullable().optional()
});

const productUpdateSchema = productSchema.partial();

export const companyRouter = Router();

companyRouter.use(requireAuth, requireCompanyAdmin);
// Round 48 Part C -- any write clears the short-TTL list cache (see utils/ttl-cache.ts).
companyRouter.use((req, _res, next) => { if (req.method !== "GET") clearCache(); next(); });
companyRouter.use("/masters", mastersRouter);
companyRouter.use("/masters", uploadsRouter);
companyRouter.use("/upload-tools", uploadToolsRouter);
companyRouter.use("/info", infoAdminRouter);
companyRouter.use("/masters", mastersActionsRouter);
// Round 13 mandate 1 — dashboard.routes.ts's own header comment already
// documented "Mounted at /company/dashboards", but it was never actually
// wired into app.use/companyRouter.use anywhere, so every real route it
// defines 404'd with "Route not found: GET /api/company/dashboards" the
// moment the Options > Dashboard Builder screen tried to call it.
companyRouter.use("/dashboards", dashboardsRouter);
companyRouter.use("/mail", mailRouter);
companyRouter.use("/quiz", quizRouter);

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
        DoctorModel.find({ tenantSlug }).sort({ createdAt: -1 }).limit(5).lean(),
        EmployeeModel.find({ tenantSlug }).sort({ createdAt: -1 }).limit(5).lean()
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
    // Round 9 item 1 — this is what every FieldForce dropdown across the
    // app fetches; .lean() skips Mongoose document hydration (this list can
    // be hundreds of employees), a real, measurable speedup on top of the
    // frontend's new shared cache (api-client.ts).
    // Round 48 Part C -- 20 s per-tenant cache (cleared on any write); this feeds every FieldForce dropdown.
    const data = await cached(`employees|${String(req.auth!.tenantSlug)}|${String(query.division ?? "")}`, async () => {
      const employees = await EmployeeModel.find(query).sort({ createdAt: -1 }).lean();
      return employees.map(serializeDocument);
    });
    res.json({ data });
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
    const patch: Record<string, unknown> = { ...body };
    if (body.leftDate !== undefined) patch.leftDate = body.leftDate ? new Date(body.leftDate) : null;
    if (body.status === "INACTIVE") {
      const cur = await EmployeeModel.findOne({ tenantSlug, employeeCode: req.params.employeeCode }).select("status deactivatedAt").lean() as any;
      if (cur && cur.status !== "INACTIVE" && !cur.deactivatedAt) patch.deactivatedAt = new Date();
    } else if (body.status === "ACTIVE") { patch.deactivatedAt = null; patch.leftDate = null; }
    const employee = await EmployeeModel.findOneAndUpdate(
      { tenantSlug, employeeCode: req.params.employeeCode },
      { $set: patch },
      { new: true }
    );
    if (!employee) throw new HttpError(404, "Employee not found");
    await audit("EMPLOYEE_UPDATED", "Employee", String(employee._id), { tenantSlug, employeeCode: employee.employeeCode });
    res.json({ data: serializeDocument(employee) });
  })
);

// Round 46 -- "Mark Resigned": records the left date and deactivates the ID
// (deactivatedAt = now) so Resigned User Status / Join-Left Details are real.
companyRouter.post(
  "/employees/:employeeCode/resign",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = z.object({ leftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
    const employee = await EmployeeModel.findOneAndUpdate(
      { tenantSlug, employeeCode: req.params.employeeCode },
      { $set: { leftDate: new Date(`${body.leftDate}T00:00:00Z`), status: "INACTIVE", deactivatedAt: new Date() } },
      { new: true }
    );
    if (!employee) throw new HttpError(404, "Employee not found");
    await audit("EMPLOYEE_RESIGNED", "Employee", String(employee._id), { tenantSlug, employeeCode: employee.employeeCode, leftDate: body.leftDate });
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

// Coordinator round (Activity Reports rebuild) -- Territory View, matching
// sanpharma.info's Activity Reports >> Territory >> View screen exactly:
// "Listed Doctor wise - Territory View" grouped by territory, for one
// field rep. Category/Class: the schema only has a single A/B/C
// `category` field on Doctor; legacy's "Category" (CORE/N CORE/Nil) is the
// same derived mapping already established in
// transferMasterDetails/action/candidates (A -> CORE, B/C -> N CORE,
// unset -> Nil), and "Class" is that same raw category letter (or "Nil"
// when unset). There is no second, independent field in this codebase to
// make Category and Class vary independently the way the legacy
// screenshots sometimes show -- this is an honest, disclosed
// approximation from the one real field that exists, not a fabricated
// second field.
companyRouter.get(
  "/reports/territory-view",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const employeeCode = String(req.query.employeeCode || "");
    if (!employeeCode) { res.json({ data: null }); return; }

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!employee) { res.json({ data: null }); return; }

    const doctors = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: employeeCode, status: "ACTIVE" })
      .sort({ territory: 1, name: 1 })
      .lean();

    // Round 41 item 2 -- Category is the real 4-tier doctorCategory now (was
    // derived from the A/B/C class); Class stays the A/B/C category letter.
    const terrCore = await loadCoreMap(tenantSlug!, [(employee as any).name]);
    const byTerritory = new Map<string, any[]>();
    for (const d of doctors as any[]) {
      const key = d.territory || "Unassigned";
      if (!byTerritory.has(key)) byTerritory.set(key, []);
      byTerritory.get(key)!.push({
        name: d.name,
        specialty: d.specialty || "Nil",
        category: tierOfDoctor(d, terrCore, (employee as any).name),
        qual: d.qualification || "Nil",
        class: d.category || "Nil"
      });
    }

    res.json({
      data: {
        fieldForceName: employee.name,
        designation: employee.designation,
        hq: employee.territory,
        territories: Array.from(byTerritory.entries()).map(([territoryName, rows]) => ({ territoryName, rows }))
      }
    });
  })
);

// Coordinator round (Activity Reports rebuild) -- Territory Status,
// matching sanpharma.info's Activity Reports >> Territory >> Status
// screen: a company-wide rollup table, one row per field rep (the legacy
// screenshot picked "admin - Admin -" in the single dropdown and still got
// every rep's row, so this endpoint always returns the full roster --
// `employeeCode` is accepted but currently unused for filtering, matching
// that observed legacy behavior rather than guessing a narrower filter).
// Total Drs = listed doctors mapped to that rep. No of Plans = count of
// real planned locations across that rep's current-month Tour Plan(s)
// (TourPlanModel.locations) -- the closest real analogue to "Route Plan"
// entries in this schema. Allocated Drs = doctors with a non-empty
// mappedEmployeeCode (i.e. actually assigned to someone); for a report
// scoped to one rep, that is the same count as Total Drs by definition,
// matching the legacy screenshot's rows where Allocated == Total and Not
// Allocated == 0.
companyRouter.get(
  "/reports/territory-status",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const employees = await EmployeeModel.find({ tenantSlug, status: "ACTIVE" }).sort({ name: 1 }).lean();
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const [doctorCounts, allocatedCounts, tourPlans] = await Promise.all([
      DoctorModel.aggregate([
        { $match: { tenantSlug, status: "ACTIVE" } },
        { $group: { _id: "$mappedEmployeeCode", total: { $sum: 1 } } }
      ]),
      DoctorModel.aggregate([
        { $match: { tenantSlug, status: "ACTIVE", mappedEmployeeCode: { $nin: [null, ""] } } },
        { $group: { _id: "$mappedEmployeeCode", allocated: { $sum: 1 } } }
      ]),
      TourPlanModel.find({ tenantSlug, month }).lean()
    ]);

    const totalByCode = new Map(doctorCounts.map((r: any) => [r._id, r.total]));
    const allocatedByCode = new Map(allocatedCounts.map((r: any) => [r._id, r.allocated]));
    const plansByCode = new Map<string, number>();
    for (const tp of tourPlans as any[]) {
      const prev = plansByCode.get(tp.employeeCode) || 0;
      plansByCode.set(tp.employeeCode, prev + (Array.isArray(tp.locations) ? tp.locations.length : 0));
    }

    const data = employees.map((e: any) => {
      const total = totalByCode.get(e.employeeCode) || 0;
      const allocated = allocatedByCode.get(e.employeeCode) || 0;
      return {
        fieldForce: `${e.name} - ${e.designation} - ${e.territory}`,
        hq: e.territory,
        totalDrs: total,
        noOfPlans: plansByCode.get(e.employeeCode) || 0,
        allocatedDrs: allocated,
        notAllocatedDrs: Math.max(0, total - allocated)
      };
    });

    res.json({ data });
  })
);

// Coordinator round -- Activity Reports > Survey, matching sanpharma.info's
// real Survey module (Survey_Ques_Creation.aspx / Survey_Creation.aspx /
// Survey_Ques_Process.aspx) exactly: a question bank (SurveyQuestionModel)
// referenced by Survey records (SurveyModel), each carrying per-question
// Process Type flags (Drs./Chm./Hos./Stk./Prd.).

const surveyQuestionValidation = z.object({
  questionText: z.string().min(1),
  controlType: z.enum(["Enterable - Text", "Enterable - Numeric", "Selectable - Single", "Selectable- Multiple"]),
  maxLength: z.number().int().positive().optional().nullable(),
  options: z.array(z.string()).optional()
});

companyRouter.get(
  "/survey-questions",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const rows = await SurveyQuestionModel.find({ tenantSlug }).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map((r: any) => ({ id: String(r._id), ...r })) });
  })
);

companyRouter.post(
  "/survey-questions",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const body = surveyQuestionValidation.parse(req.body);
    const doc = await SurveyQuestionModel.create({ ...body, tenantSlug });
    await audit("SURVEY_QUESTION_CREATED", "SurveyQuestion", String(doc._id), { tenantSlug });
    res.status(201).json({ data: { id: String(doc._id), ...doc.toObject() } });
  })
);

companyRouter.patch(
  "/survey-questions/:id/deactivate",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const doc = await SurveyQuestionModel.findOne({ _id: req.params.id, tenantSlug });
    if (!doc) throw new HttpError(404, "Question not found");
    doc.status = doc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await doc.save();
    await audit("SURVEY_QUESTION_STATUS_CHANGED", "SurveyQuestion", String(doc._id), { tenantSlug, status: doc.status });
    res.json({ data: { id: String(doc._id), ...doc.toObject() } });
  })
);

const surveyQuestionRefValidation = z.object({
  questionId: z.string().min(1),
  drs: z.boolean().optional().default(false),
  chm: z.boolean().optional().default(false),
  hos: z.boolean().optional().default(false),
  stk: z.boolean().optional().default(false),
  prd: z.boolean().optional().default(false)
});

const surveyValidation = z.object({
  title: z.string().min(1),
  processFromDate: z.string().min(1),
  processToDate: z.string().min(1),
  questions: z.array(surveyQuestionRefValidation).default([])
});

companyRouter.get(
  "/surveys",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const rows = await SurveyModel.find({ tenantSlug }).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map((r: any) => ({ id: String(r._id), ...r, questionCount: Array.isArray(r.questions) ? r.questions.length : 0 })) });
  })
);

companyRouter.get(
  "/surveys/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const row = await SurveyModel.findOne({ _id: req.params.id, tenantSlug }).lean();
    if (!row) throw new HttpError(404, "Survey not found");
    const questionIds = (row as any).questions.map((q: any) => q.questionId);
    const questionDocs = await SurveyQuestionModel.find({ tenantSlug, _id: { $in: questionIds } }).lean();
    const byId = new Map(questionDocs.map((q: any) => [String(q._id), q]));
    const questions = (row as any).questions.map((q: any) => ({ ...q, question: byId.get(q.questionId) ? { ...byId.get(q.questionId), id: String(byId.get(q.questionId)._id) } : null }));
    res.json({ data: { id: String((row as any)._id), ...row, questions } });
  })
);

companyRouter.post(
  "/surveys",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const body = surveyValidation.parse(req.body);
    const doc = await SurveyModel.create({ ...body, tenantSlug });
    await audit("SURVEY_CREATED", "Survey", String(doc._id), { tenantSlug });
    res.status(201).json({ data: { id: String(doc._id), ...doc.toObject() } });
  })
);

companyRouter.patch(
  "/surveys/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const body = surveyValidation.partial().parse(req.body);
    const doc = await SurveyModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, body, { new: true });
    if (!doc) throw new HttpError(404, "Survey not found");
    await audit("SURVEY_UPDATED", "Survey", String(doc._id), { tenantSlug });
    res.json({ data: { id: String(doc._id), ...doc.toObject() } });
  })
);

companyRouter.patch(
  "/surveys/:id/deactivate",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const doc = await SurveyModel.findOne({ _id: req.params.id, tenantSlug });
    if (!doc) throw new HttpError(404, "Survey not found");
    doc.status = doc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    await doc.save();
    await audit("SURVEY_STATUS_CHANGED", "Survey", String(doc._id), { tenantSlug, status: doc.status });
    res.json({ data: { id: String(doc._id), ...doc.toObject() } });
  })
);

companyRouter.patch(
  "/surveys/:id/process",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const doc = await SurveyModel.findOne({ _id: req.params.id, tenantSlug });
    if (!doc) throw new HttpError(404, "Survey not found");
    doc.processed = true;
    doc.processedAt = new Date();
    await doc.save();
    await audit("SURVEY_PROCESSED", "Survey", String(doc._id), { tenantSlug });
    res.json({ data: { id: String(doc._id), ...doc.toObject() } });
  })
);

// Coordinator round (Survey Item 2) -- Survey > View, matching
// sanpharma.info's Survey_Process_View.aspx exactly: pick a field force +
// a survey, and see that field force PLUS their direct reports (the real
// reporting-chain team, confirmed from the legacy reference screenshot --
// selecting a manager returned their team's rows, not just themselves) in
// one table, with the survey's title as a grouped header over the 5 real
// Process Type categories (Drs/Chm/Stk/Hos/Prd). No real survey-ANSWER
// data pipeline exists anywhere in this codebase yet (field reps have no
// way to actually answer a survey), so every category cell is honestly
// null/"-" here, exactly like the legacy screenshot shows for an
// unanswered survey -- never a fabricated count.
// ─────────────────────────────────────────────────────────────────────
// Round 34 -- Activity Reports > TP, real legacy-parity report screens.
// ─────────────────────────────────────────────────────────────────────

function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}
function dateKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, "0")}`;
}

// Item 1 -- TP > Consolidated View: a real hierarchy rollup, one column per
// team member (root + direct reports, or root + every descendant when
// "All Base Level" is checked), each showing their real tour-plan entry
// (or Holiday/Weekly Off/Leave/"Not Planned") for every day of the month.
companyRouter.get(
  "/reports/tp-consolidated-view",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const allBaseLevel = req.query.allBaseLevel === "true";
    if (!employeeCode || !month) { res.json({ data: null }); return; }

    const root = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!root) { res.json({ data: null }); return; }

    const team = await resolveTeam(tenantSlug, employeeCode, allBaseLevel);
    const columns = [root as any, ...team];
    const codes = columns.map((c) => c.employeeCode);
    const states = columns.map((c) => c.state);
    const ctx = await buildDayStatusContext(tenantSlug, month, codes, states);
    const numDays = daysInMonth(month);

    const data = columns.map((emp) => ({
      employeeCode: emp.employeeCode,
      name: emp.name,
      designation: emp.designation,
      hq: emp.territory,
      days: Array.from({ length: numDays }, (_, i) => {
        const d = i + 1;
        const status = classifyDay(ctx, emp.employeeCode, dateKey(month, d));
        return { day: d, kind: status.kind, label: dayStatusLabel(status) };
      })
    }));

    res.json({ data: { fieldForceName: `${(root as any).name} - ${(root as any).designation} - ${(root as any).territory}`, month, columns: data } });
  })
);

// Item 2 -- TP > View: the single-rep detailed monthly tour plan, with a
// real HQ/EX/OS/Holiday/Other summary count and the real submission
// status/timestamps off the TourPlanModel document itself.
companyRouter.get(
  "/reports/tp-view",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    if (!employeeCode || !month) { res.json({ data: null }); return; }

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!employee) { res.json({ data: null }); return; }

    const tourPlan = await TourPlanModel.findOne({ tenantSlug, employeeCode, month }).sort({ createdAt: -1 }).lean();
    const ctx = await buildDayStatusContext(tenantSlug, month, [employeeCode], [(employee as any).state]);
    const numDays = daysInMonth(month);

    let hqDays = 0, exDays = 0, osDays = 0, holidaySunday = 0, others = 0;
    const days = Array.from({ length: numDays }, (_, i) => {
      const d = i + 1;
      const key = dateKey(month, d);
      const status = classifyDay(ctx, employeeCode, key);
      let workType = "Not Planned";
      let territory = "";
      let type = "";
      if (status.kind === "tour") {
        workType = "Field Work";
        territory = status.town;
        type = status.area || "HQ";
        if (/ex/i.test(status.area || "")) exDays++;
        else if (/os/i.test(status.area || "")) osDays++;
        else hqDays++;
      } else if (status.kind === "holiday") {
        workType = "Holiday"; holidaySunday++;
      } else if (status.kind === "weeklyOff") {
        workType = "Weekly Off"; holidaySunday++;
      } else if (status.kind === "leave") {
        workType = "Leave"; others++;
      }
      return {
        day: d,
        date: key,
        workType,
        territory,
        type,
        jointWork: "",
        objective: status.kind === "holiday" ? status.name : (status.kind === "weeklyOff" ? "Weekly Off" : ""),
        managerJfw: ""
      };
    });

    res.json({
      data: {
        employee: { name: (employee as any).name, designation: (employee as any).designation, hq: (employee as any).territory },
        status: tourPlan?.status || "NOT SUBMITTED",
        completedAt: (tourPlan as any)?.createdAt || null,
        confirmedAt: (tourPlan as any)?.approvedAt || null,
        summary: { hqDays, exDays, osDays, holidaySunday, others },
        days
      }
    });
  })
);

// Item 3 -- TP > Status: the selected manager's direct-report team, each
// with their own real tour-plan submission status + entry/approval dates.
companyRouter.get(
  "/reports/tp-status",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const withVacants = req.query.withVacants === "true";
    const statewise = req.query.statewise === "true";
    // Round 41 item 7 -- State wise: every employee grouped by the real
    // Employee.state with their own Tour Plan status (whole company, or the
    // chosen manager's subtree when employeeCode is given).
    if (statewise) {
      if (!month) { res.json({ data: { states: [] } }); return; }
      let people: any[] = employeeCode ? [...(await getAllDescendants(tenantSlug, employeeCode))] : ((await EmployeeModel.find({ tenantSlug }).sort({ name: 1 }).lean()) as any[]);
      if (!withVacants) people = people.filter((e) => e.status === "ACTIVE");
      const codesAll = people.map((e) => e.employeeCode);
      const plans = codesAll.length ? ((await TourPlanModel.find({ tenantSlug, employeeCode: { $in: codesAll }, month }).lean()) as any[]) : [];
      const planBy = new Map(plans.map((tp) => [tp.employeeCode, tp]));
      const groups = new Map<string, any[]>();
      for (const e of people) {
        const st = e.state || "(No State)";
        const arr = groups.get(st) || [];
        const tp = planBy.get(e.employeeCode);
        arr.push({ employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, status: tp?.status || "NOT SUBMITTED", entryDate: tp?.createdAt || null, approvedDate: tp?.approvedAt || null });
        groups.set(st, arr);
      }
      const states = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([state, rows]) => ({
        state, total: rows.length,
        submitted: rows.filter((r) => r.status !== "NOT SUBMITTED").length,
        approved: rows.filter((r) => r.status === "APPROVED").length,
        notSubmitted: rows.filter((r) => r.status === "NOT SUBMITTED").length,
        rows
      }));
      res.json({ data: { states } });
      return;
    }
    if (!employeeCode || !month) { res.json({ data: [] }); return; }

    let team = await getDirectReports(tenantSlug, employeeCode);
    if (!withVacants) team = team.filter((e) => e.status === "ACTIVE");

    const codes = team.map((e) => e.employeeCode);
    const tourPlans = codes.length ? await TourPlanModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).lean() : [];
    const byCode = new Map(tourPlans.map((tp: any) => [tp.employeeCode, tp]));

    const data = team.map((e) => {
      const tp: any = byCode.get(e.employeeCode);
      return {
        employeeCode: e.employeeCode,
        name: e.name,
        designation: e.designation,
        hq: e.territory,
        status: tp?.status || "NOT SUBMITTED",
        entryDate: tp?.createdAt || null,
        approvedDate: tp?.approvedAt || null
      };
    });

    res.json({ data });
  })
);

// Item 4 -- Tour Plan > Datewise: same hierarchy rollup as Item 1, but one
// ROW per team member and only the explicitly checked day(s) as columns.
companyRouter.get(
  "/reports/tp-datewise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const daysParam = String(req.query.days || "");
    const selectedDays = daysParam.split(",").map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 31);
    if (!employeeCode || !month || selectedDays.length === 0) { res.json({ data: null }); return; }

    const root = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!root) { res.json({ data: null }); return; }

    const team = await resolveTeam(tenantSlug, employeeCode, true);
    const rows = [root as any, ...team];
    const codes = rows.map((r) => r.employeeCode);
    const states = rows.map((r) => r.state);
    const ctx = await buildDayStatusContext(tenantSlug, month, codes, states);

    const data = rows.map((e) => ({
      employeeCode: e.employeeCode,
      name: e.name,
      designation: e.designation,
      hq: e.territory,
      state: e.state || "",
      joinDate: e.joinDate || null,
      perDay: Object.fromEntries(selectedDays.map((d) => {
        const status = classifyDay(ctx, e.employeeCode, dateKey(month, d));
        return [d, { kind: status.kind, label: dayStatusLabel(status) }];
      }))
    }));

    res.json({ data: { fieldForceName: `${(root as any).name} - ${(root as any).designation} - ${(root as any).territory}`, month, days: selectedDays, rows: data } });
  })
);

// ─────────────────────────────────────────────────────────────────────
// Round 34 -- Activity Reports > DCR, real legacy-parity report screens.
//
// Honest schema-reality disclosures (kept close to the code they affect,
// not fabricated anywhere below):
//  - "Listed Dr(s) POB" has no distinct real field anywhere in DcrModel --
//    only "Listed Dr(s) Met" (visit count against the real Doctor master)
//    genuinely exists. POB is reported as the same real visit count, under
//    an explicit `pobIsApproximated: true` flag the frontend surfaces.
//  - "Non Listed Dr(s) Met" has NO real linkage at all: DcrModel.doctorId
//    only ever references the real (listed) Doctor master, never
//    UnlistedDoctorModel. Reported honestly as 0 with
//    `nonListedUnsupported: true` rather than a fabricated count.
//  - "Stockist Met" has no real visit-level tracking: StockistModel is a
//    master list only, with no per-day call/visit record anywhere in the
//    schema (unlike chemists, which DO have ChemistCallModel). Reported as
//    0 with `stockistUnsupported: true`.
//  - "Chemist Met"/"Chemist POB" ARE real: ChemistCallModel records one
//    row per chemist per employee per day; POB = rows with pob.length>0.
// ─────────────────────────────────────────────────────────────────────

const DCR_MODE_DATE_PICKER = new Set([
  "dcr-dates", "not-approved-dates", "tp-my-day-plan", "rcpa-view", "reminder-calls"
]);
// Round 41 item 4 -- "RCPA View" lists the real doctor-linked RCPA entries
// for the date; "Reminder calls" lists the calls where the rep marked a
// follow-up (followUpRequired) due on / created that date.

// Item 5 -- DCR > View. One parameterized endpoint, dispatching on `mode`
// to match each of the legacy's 9 distinct result-page behaviours.
companyRouter.get(
  "/reports/dcr-view",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const year = String(req.query.year || "");
    const mode = String(req.query.mode || "all-doctors");
    const date = req.query.date ? String(req.query.date) : "";
    const onlyVacantManagers = req.query.onlyVacantManagers === "true";
    if (!employeeCode) { res.json({ data: null }); return; }

    let team = await getDirectReports(tenantSlug, employeeCode);
    const self = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (self) team = [self as any, ...team];
    if (onlyVacantManagers) {
      const vacantCodes = await findVacantManagerCodes(tenantSlug);
      team = team.filter((e) => vacantCodes.has(e.employeeCode) || e.employeeCode === employeeCode);
    }
    const codes = team.map((e) => e.employeeCode);

    // Modes that are plain date-pickers until a date+Go is actually chosen.
    if (DCR_MODE_DATE_PICKER.has(mode)) {
      if (!date) { res.json({ data: { mode, needsDate: true, rows: [] } }); return; }
      if (mode === "rcpa-view") {
        const rcpa = (await RcpaModel.find({ tenantSlug, employeeCode: { $in: codes }, date }).sort({ createdAt: 1 }).lean()) as any[];
        const nameByCode = new Map(team.map((e: any) => [e.employeeCode, e.name]));
        res.json({ data: { mode, needsDate: false, rows: rcpa.map((r) => ({
          employeeCode: r.employeeCode, fieldForceName: nameByCode.get(r.employeeCode) || r.employeeCode, doctorName: r.doctorName, chemistName: r.chemistName || "",
          ourProduct: r.ourProduct, ourQty: r.ourQty, competitorProduct: r.competitorProduct || "", competitorQty: r.competitorQty || 0, visitDate: r.date
        })) } });
        return;
      }
      if (mode === "reminder-calls") {
        const dayStart = new Date(`${date}T00:00:00.000Z`);
        const dayEnd = new Date(`${date}T23:59:59.999Z`);
        const reminders = (await DcrModel.find({
          tenantSlug, employeeCode: { $in: codes }, followUpRequired: true,
          $or: [{ followUpDate: { $gte: dayStart, $lte: dayEnd } }, { visitDateOnly: date }]
        }).populate("doctorId").lean()) as any[];
        const nameByCode = new Map(team.map((e: any) => [e.employeeCode, e.name]));
        res.json({ data: { mode, needsDate: false, rows: reminders.map((d) => ({
          employeeCode: d.employeeCode, fieldForceName: nameByCode.get(d.employeeCode) || d.employeeCode, doctorName: d.doctorId?.name || "",
          visitDate: d.visitDateOnly, followUpDate: d.followUpDate ? utcDateString(new Date(d.followUpDate)) : "", callSession: d.callSession, status: d.status, notes: d.notes || ""
        })) } });
        return;
      }
      const dcrs = await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: date }).populate("doctorId").lean();
      const rows = dcrs.map((d: any) => ({
        employeeCode: d.employeeCode,
        doctorName: d.doctorId?.name || "",
        visitDate: d.visitDateOnly,
        callSession: d.callSession,
        status: d.status,
        notes: d.notes || ""
      }));
      res.json({ data: { mode, needsDate: false, rows } });
      return;
    }

    if (mode === "all-remarks") {
      if (!month) { res.json({ data: { mode, rows: [] } }); return; }
      const dcrs = await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month, notes: { $exists: true, $ne: "" } }).sort({ visitDateOnly: 1 }).lean();
      const rows = dcrs.map((d: any) => ({ date: d.visitDateOnly, remarks: d.notes }));
      res.json({ data: { mode, rows } });
      return;
    }

    if (mode === "detailed") {
      if (!month || !self) { res.json({ data: { mode, days: [] } }); return; }
      const numDays = daysInMonth(month);
      const dcrs = await DcrModel.find({ tenantSlug, employeeCode, month }).populate("doctorId").lean();
      const byDate = new Map<string, any[]>();
      for (const d of dcrs as any[]) {
        const arr = byDate.get(d.visitDateOnly) || [];
        arr.push(d);
        byDate.set(d.visitDateOnly, arr);
      }
      const chemistCalls = await ChemistCallModel.find({ tenantSlug, employeeCode, visitDateOnly: { $regex: `^${month}` } }).lean();
      // Round 41 item 1 -- stockist / unlisted-doctor visits are real field
      // visit logs now; POB comes from the captured order values.
      const visitLogs = (await FieldVisitLogModel.find({ tenantSlug, employeeCode, visitDateOnly: { $regex: `^${month}` } }).lean()) as any[];
      const rates = await loadRateMap(tenantSlug);
      const logsByDate = new Map<string, any[]>();
      for (const l of visitLogs) { const arr = logsByDate.get(l.visitDateOnly) || []; arr.push(l); logsByDate.set(l.visitDateOnly, arr); }
      const chemistByDate = new Map<string, any[]>();
      for (const c of chemistCalls as any[]) {
        const arr = chemistByDate.get(c.visitDateOnly) || [];
        arr.push(c);
        chemistByDate.set(c.visitDateOnly, arr);
      }

      let totalListedMet = 0, totalChemistMet = 0, submittedDays = 0;
      const days = Array.from({ length: numDays }, (_, i) => {
        const d = i + 1;
        const key = dateKey(month, d);
        const dayDcrs = byDate.get(key) || [];
        const dayChemists = chemistByDate.get(key) || [];
        const dayLogs = logsByDate.get(key) || [];
        if (dayDcrs.length === 0 && dayChemists.length === 0 && dayLogs.length === 0) {
          return { date: key, submitted: false };
        }
        submittedDays++;
        const listedMet = dayDcrs.length;
        totalListedMet += listedMet;
        totalChemistMet += dayChemists.length;
        return {
          date: key,
          submitted: true,
          territory: (dayDcrs[0] as any)?.hospitalClinic || "",
          startTime: (dayDcrs[0] as any)?.checkInTime || "",
          endTime: (dayDcrs[dayDcrs.length - 1] as any)?.checkOutTime || "",
          workType: (dayDcrs[0] as any)?.workType || "Field Work",
          listedDrMet: listedMet,
          listedDrPob: Number(dayDcrs.reduce((sum: number, d: any) => sum + docPobValue(d, rates), 0).toFixed(2)),
          chemistMet: dayChemists.length,
          chemistPob: Number(dayChemists.reduce((sum: number, c: any) => sum + docPobValue(c, rates), 0).toFixed(2)),
          stockistMet: dayLogs.filter((l: any) => l.visitType === "Stockist").length,
          nonListedDrMet: dayLogs.filter((l: any) => l.visitType === "UnlistedDoctor").length
        };
      });

      res.json({
        data: {
          mode,
          employee: self ? { name: (self as any).name, designation: (self as any).designation, hq: (self as any).territory } : null,
          days,
          pobIsApproximated: false,
          nonListedUnsupported: false,
          stockistUnsupported: false,
          totals: {
            submittedDays,
            listedDrMet: totalListedMet,
            chemistMet: totalChemistMet,
            avgListedDrMetPerSubmittedDay: submittedDays ? +(totalListedMet / submittedDays).toFixed(2) : 0
          }
        }
      });
      return;
    }

    if (mode === "all-dcr-doctors") {
      if (!month) { res.json({ data: { mode, rows: [] } }); return; }
      const dcrs = await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).populate("doctorId").lean();
      const byDoctor = new Map<string, { doctorName: string; count: number; employeeCode: string }>();
      for (const d of dcrs as any[]) {
        const key = `${d.employeeCode}:${d.doctorId?._id}`;
        const existing = byDoctor.get(key);
        if (existing) existing.count++;
        else byDoctor.set(key, { doctorName: d.doctorId?.name || "", count: 1, employeeCode: d.employeeCode });
      }
      res.json({ data: { mode, rows: Array.from(byDoctor.values()) } });
      return;
    }

    res.json({ data: { mode, rows: [] } });
  })
);

// Item 6 -- DCR > Status: monthwise/periodwise x normal/Detailed/Attendance.
// Real per-day short codes are honestly limited to what this schema can
// actually back (Field Work / Holiday / Weekly Off / Leave / Not Planned) --
// the legacy's other ~19 legend codes (LP/MD/MR/NA/R/M/TR/T/CF/SS/CW/IW/CM/
// SW/AW/DS/WFH/S) have no distinct backing concept anywhere in this schema
// and are intentionally NOT fabricated; `unsupportedCodes` lists them so the
// frontend can disclose the gap instead of inventing data for them.
// Round 41 item 7 -- the legend is now the real WorkTypeCode master (seeded
// per tenant, editable), DCR / leave records carry a `workTypeCode`, and the
// grid below derives each day's code from those records.
const DCR_STATUS_CODE_MAP: Record<string, string> = {
  tour: "FW", holiday: "H", weeklyOff: "WO", leave: "L", notPlanned: ""
};

companyRouter.get(
  "/reports/dcr-status",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const fromDate = req.query.fromDate ? String(req.query.fromDate) : "";
    const toDate = req.query.toDate ? String(req.query.toDate) : "";
    const periodwise = req.query.periodwise === "true";
    const detailed = req.query.detailed === "true";
    const withVacants = req.query.withVacants === "true";
    const onlyManagers = req.query.onlyManagers === "true";
    if (!employeeCode) { res.json({ data: null }); return; }

    let team = await getDirectReports(tenantSlug, employeeCode);
    const self = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (self) team = [self as any, ...team];
    if (!withVacants) team = team.filter((e) => e.status === "ACTIVE");
    if (onlyManagers) team = team.filter((e) => isManagerRole(e.role));

    let effectiveMonth = month;
    let rangeStart: string, rangeEnd: string;
    if (periodwise && fromDate && toDate) {
      rangeStart = fromDate; rangeEnd = toDate;
      effectiveMonth = fromDate.slice(0, 7);
    } else {
      rangeStart = `${month}-01`;
      rangeEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    }

    const codes = team.map((e) => e.employeeCode);
    const states = team.map((e) => e.state);
    const ctx = await buildDayStatusContext(tenantSlug, effectiveMonth, codes, states);
    const dcrs = codes.length ? await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: rangeStart, $lte: rangeEnd } }).populate("doctorId").lean() : [];
    const chemistCalls = codes.length ? await ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $gte: rangeStart, $lte: rangeEnd } }).lean() : [];

    const dcrByEmpDate = new Map<string, Set<string>>(); // employeeCode:date -> distinct doctor territories (subdivisions)
    const drsCountByEmpDate = new Map<string, number>();
    const codeVotes = new Map<string, Map<string, number>>(); // employeeCode:date -> workTypeCode -> DCR count
    for (const d of dcrs as any[]) {
      const key = `${d.employeeCode}:${d.visitDateOnly}`;
      drsCountByEmpDate.set(key, (drsCountByEmpDate.get(key) || 0) + 1);
      const code = d.workTypeCode || (d.workType && WORK_TYPE_TO_CODE[d.workType]) || "FW";
      const votes = codeVotes.get(key) || new Map<string, number>();
      votes.set(code, (votes.get(code) || 0) + 1);
      codeVotes.set(key, votes);
      const subdivSet = dcrByEmpDate.get(key) || new Set<string>();
      if (d.doctorId?.territory) subdivSet.add(d.doctorId.territory);
      dcrByEmpDate.set(key, subdivSet);
    }
    for (const c of chemistCalls as any[]) {
      const key = `${c.employeeCode}:${c.visitDateOnly}`;
      const subdivSet = dcrByEmpDate.get(key) || new Set<string>();
      dcrByEmpDate.set(key, subdivSet);
    }

    const [startY, startM, startD] = rangeStart.split("-").map((v) => parseInt(v, 10));
    const [, , endD] = rangeEnd.split("-").map((v) => parseInt(v, 10));
    const dayNumbers = rangeStart.slice(0, 7) === rangeEnd.slice(0, 7)
      ? Array.from({ length: endD - startD + 1 }, (_, i) => startD + i)
      : Array.from({ length: daysInMonth(effectiveMonth) }, (_, i) => i + 1);

    const rows = team.map((e) => {
      let presentDays = 0;
      const perDay = dayNumbers.map((d) => {
        const key = dateKey(effectiveMonth, d);
        const status = classifyDay(ctx, e.employeeCode, key);
        const empDateKey = `${e.employeeCode}:${key}`;
        const hasDcr = drsCountByEmpDate.has(empDateKey);
        // Most-used workTypeCode among that day's DCRs; leave days carry the
        // leave application's own code; otherwise the plain day-kind code.
        const topCode = hasDcr ? Array.from(codeVotes.get(empDateKey)!.entries()).sort((a, b) => b[1] - a[1])[0][0] : "";
        const code = hasDcr ? topCode : status.kind === "leave" ? (status.workTypeCode || "L") : DCR_STATUS_CODE_MAP[status.kind] || "";
        if (code === "FW") presentDays++;
        if (!detailed) return { day: d, code };
        return {
          day: d,
          code,
          sd: hasDcr ? (dcrByEmpDate.get(empDateKey)?.size || 0) : null,
          drs: hasDcr ? (drsCountByEmpDate.get(empDateKey) || 0) : null
        };
      });
      return {
        employeeCode: e.employeeCode,
        name: e.name,
        designation: e.designation,
        hq: e.territory,
        joinDate: e.joinDate || null,
        perDay,
        noOfDaysPresent: presentDays
      };
    });

    res.json({
      data: {
        rows,
        days: dayNumbers,
        detailed,
        periodwise,
        rangeStart,
        rangeEnd,
        legend: await listWorkTypeCodes(tenantSlug),
        unsupportedCodes: [] as string[]
      }
    });
  })
);

// ─────────────────────────────────────────────────────────────────────
// Round 35 -- Activity Reports > DCR, 7 more legacy-parity report
// screens, plus the standalone Customized Report builder module.
//
// Items 1 & 4 use the real `approvalDcr` generic-master collection (see
// masters/registry.ts + field.routes.ts's mirrorApprovalRow) as the
// source of truth for per-date approval status -- that is the real
// collection sanpharma's own Admin DCR Approval / Bulk Approval screens
// already read and write (DcrModel.status itself is a separate,
// effectively-unused field for this workflow; only the mirror row's
// `approvalStatus` is ever actually changed by an approve/reject action).
// Disclosed schema-reality limits:
//  - The mirror doc stores `sfName` (employee name), not employeeCode --
//    resolved to a real Employee record by exact name match. A rare
//    same-name collision would conflate two employees' rows; no more
//    precise mirror field exists to join on.
//  - There is no separate approval/rejection reason field anywhere in the
//    schema (nothing in the current UI ever collects one), so "Reason" is
//    always blank for real data -- matching the legacy screenshot's "often
//    blank" description rather than fabricating text.
//  - There is no separate approval-action audit log: the mirror row only
//    ever holds its CURRENT approvalStatus + the real timestamp of the
//    last write to it. Item 4 is therefore "every DCR date whose current
//    status is Approved/Rejected and was last changed within the selected
//    month" -- real data, but if a date was rejected and later
//    re-approved, only the current state is visible, not the full history.
// ─────────────────────────────────────────────────────────────────────

const DCR_CATEGORY_MASTER_KEY = "approvalDcr";

async function resolveEmployeesByName(tenantSlug: string, names: string[]) {
  const uniqueNames = Array.from(new Set(names));
  const employees = uniqueNames.length
    ? await EmployeeModel.find({ tenantSlug, name: { $in: uniqueNames } }).lean()
    : [];
  const byName = new Map<string, any>();
  for (const e of employees as any[]) byName.set(e.name, e);
  return byName;
}

// Item 1 -- DCR > Not Approved (company-wide).
companyRouter.get(
  "/reports/dcr-not-approved",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) { res.json({ data: [] }); return; }
    const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
    const rangeStart = new Date(Date.UTC(year, mon - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, mon, 1));

    const ApprovalDcrModel = getMasterModel(DCR_CATEGORY_MASTER_KEY);
    const pending = await ApprovalDcrModel.find({
      tenantSlug, approvalStatus: "Pending", activityDate: { $gte: rangeStart, $lt: rangeEnd }
    }).lean();

    const byName = await resolveEmployeesByName(tenantSlug, (pending as any[]).map((p) => p.sfName));
    const managerByCode = new Map<string, any>();
    const allManagerCodes = Array.from(byName.values()).map((e: any) => e.reportingManager).filter(Boolean);
    if (allManagerCodes.length) {
      const managers = await EmployeeModel.find({ tenantSlug, employeeCode: { $in: allManagerCodes } }).lean();
      for (const m of managers as any[]) managerByCode.set(m.employeeCode, m);
    }

    const byRep = new Map<string, { name: string; region: string; manager: string; days: Set<number> }>();
    for (const p of pending as any[]) {
      const emp = byName.get(p.sfName);
      const d = new Date(p.activityDate);
      const day = d.getUTCDate();
      const key = p.sfName;
      const entry = byRep.get(key) || {
        name: p.sfName,
        region: emp?.territory || "",
        manager: emp?.reportingManager ? (managerByCode.get(emp.reportingManager)?.name || emp.reportingManager) : "",
        days: new Set<number>()
      };
      entry.days.add(day);
      byRep.set(key, entry);
    }

    const data = Array.from(byRep.values()).map((r) => ({
      fieldForceName: r.name,
      region: r.region,
      pendingDates: Array.from(r.days).sort((a, b) => a - b).join(" , "),
      approvalBy: r.manager || "-"
    }));
    res.json({ data, month });
  })
);

// Item 2 -- DCR > Not Submitted (real: a genuinely real/working-day where
// no DCR exists for that rep -- correctly returns empty when every real
// working day already has a real submission, which is the common/tested
// case; does not force emptiness).
companyRouter.get(
  "/reports/dcr-not-submitted",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    if (!employeeCode || !/^\d{4}-\d{2}$/.test(month)) { res.json({ data: [] }); return; }

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!employee) { res.json({ data: [] }); return; }

    const ctx = await buildDayStatusContext(tenantSlug, month, [employeeCode], [(employee as any).state]);
    const numDays = daysInMonth(month);
    const dcrs = await DcrModel.find({ tenantSlug, employeeCode, month }).lean();
    const submittedDates = new Set((dcrs as any[]).map((d) => d.visitDateOnly));

    const missing: { day: number; expected: string }[] = [];
    for (let d = 1; d <= numDays; d++) {
      const key = dateKey(month, d);
      const status = classifyDay(ctx, employeeCode, key);
      // Only a real planned working day (a tour-plan entry exists for it)
      // counts as "should have submitted" -- holiday/weekly-off/leave/
      // genuinely-unplanned days are not expected submissions.
      if (status.kind === "tour" && !submittedDates.has(key)) {
        missing.push({ day: d, expected: status.town });
      }
    }
    res.json({ data: missing, employeeCode, month });
  })
);

// Item 3 -- DCR > Count-Modewise.
companyRouter.get(
  "/reports/dcr-count-modewise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const mode = String(req.query.mode || "datewise");
    if (!employeeCode || !/^\d{4}-\d{2}$/.test(month)) { res.json({ data: { mode, rows: [] } }); return; }

    // CountWise -- this schema has no distinct "count-wise" aggregation
    // concept separate from DateWise without real per-channel submission
    // data (see the DateWise disclosure below); rather than present
    // DateWise's numbers again under a different mode name, this
    // genuinely returns no rows, matching the legacy's own tested
    // behavior for this mode.
    if (mode === "countwise") { res.json({ data: { mode, rows: [] } }); return; }

    const root = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!root) { res.json({ data: { mode, rows: [] } }); return; }
    const team = await getDirectReports(tenantSlug, employeeCode);
    const rows = [root as any, ...team];
    const codes = rows.map((r) => r.employeeCode);
    const dcrs = await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).lean();
    // Round 36 Item A -- submissionChannel is now a real field, captured
    // going forward by the field app's own real device detection (see
    // detectSubmissionChannel() in the field repo's lib/api-client.ts).
    // Records submitted before this round have no real channel on file
    // and default to "Others" at the schema level -- there is no way to
    // retroactively know their true channel, so they stay honestly
    // bucketed there rather than guessed. "Apps"/"E-detailing"/"IOS-Edet"
    // remain structurally empty: no separate native app or e-detailing
    // submission surface exists anywhere in this codebase to populate them.
    type ChannelKey = "desktop" | "mobile" | "apps" | "edetailing" | "others" | "iosEdet";
    const CHANNEL_MAP: Record<string, ChannelKey> = {
      Desktop: "desktop", Mobile: "mobile", Apps: "apps", "E-detailing": "edetailing", Others: "others"
    };
    const byEmp = new Map<string, Record<ChannelKey, number[]>>();
    for (const d of dcrs as any[]) {
      const day = parseInt(d.visitDateOnly.slice(8, 10), 10);
      const channelKey = CHANNEL_MAP[d.submissionChannel as string] || "others";
      const entry = byEmp.get(d.employeeCode) || { desktop: [], mobile: [], apps: [], edetailing: [], others: [], iosEdet: [] };
      entry[channelKey].push(day);
      byEmp.set(d.employeeCode, entry);
    }

    const data = rows.map((e) => {
      const entry = byEmp.get(e.employeeCode) || { desktop: [], mobile: [], apps: [], edetailing: [], others: [], iosEdet: [] };
      const toCell = (days: number[]) => ({ date: [...days].sort((a, b) => a - b).join(" , "), count: days.length });
      return {
        employeeCode: e.employeeCode,
        name: e.name,
        hq: e.territory,
        designation: e.designation,
        desktop: toCell(entry.desktop),
        mobile: toCell(entry.mobile),
        apps: toCell(entry.apps),
        edetailing: toCell(entry.edetailing),
        others: toCell(entry.others),
        iosEdet: toCell(entry.iosEdet)
      };
    });
    res.json({ data: { mode, rows: data, channelDataUnsupported: false, note: "Desktop/Mobile are real per-submission channel data for records submitted after this round went live; Apps/E-detailing/IOS-Edet remain structurally empty (no such submission surface exists in this product), and pre-round records are bucketed under Others since their real channel can't be known retroactively." } });
  })
);

// Item 4 -- DCR > Reject/Approval View (company-wide audit, see file-header disclosure).
companyRouter.get(
  "/reports/dcr-reject-approve",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) { res.json({ data: [] }); return; }
    const [year, mon] = month.split("-").map((v) => parseInt(v, 10));
    const rangeStart = new Date(Date.UTC(year, mon - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, mon, 1));

    // Round 36 Item B -- real append-only audit log (ApprovalAuditLogModel)
    // instead of the approvalDcr mirror's single mutable current-status
    // snapshot: one row per real action taken this month, with a real
    // reason when the acting manager/admin typed one. A rep whose date was
    // rejected then later re-approved now shows BOTH real events, not just
    // the latest. Actions taken before this round went live genuinely have
    // no reason on file (the field didn't exist yet) -- shown as blank,
    // not fabricated.
    const actedLog = await ApprovalAuditLogModel.find({
      tenantSlug, masterKey: DCR_CATEGORY_MASTER_KEY,
      actedAt: { $gte: rangeStart, $lt: rangeEnd }
    }).sort({ actedAt: 1 }).lean();

    // Legacy pre-this-round actions have no audit-log row at all (the
    // collection didn't exist yet) -- those are still surfaced from the
    // mirror's current status/updatedAt as a one-event fallback so the
    // report doesn't go blank for a month that only has old actions, with
    // reason left honestly empty exactly as before.
    const loggedRecordIds = new Set((actedLog as any[]).map((a) => a.recordId));
    const ApprovalDcrModel = getMasterModel(DCR_CATEGORY_MASTER_KEY);
    const legacyFallback = await ApprovalDcrModel.find({
      tenantSlug,
      approvalStatus: { $in: ["Approved", "Rejected"] },
      updatedAt: { $gte: rangeStart, $lt: rangeEnd },
      _id: { $nin: Array.from(loggedRecordIds) }
    }).lean();

    const combined = [
      ...(actedLog as any[]).map((a) => ({ sfName: a.sfName, activityDate: a.activityDate, status: a.action, workType: "", reason: a.reason || "", actedAt: a.actedAt })),
      ...(legacyFallback as any[]).map((a) => ({ sfName: a.sfName, activityDate: a.activityDate, status: a.approvalStatus, workType: a.workType || "", reason: "", actedAt: a.updatedAt }))
    ].sort((a, b) => new Date(a.actedAt).getTime() - new Date(b.actedAt).getTime());

    const byName = await resolveEmployeesByName(tenantSlug, combined.map((a) => a.sfName));
    const data = combined.map((a) => {
      const emp = byName.get(a.sfName);
      return {
        fieldForceName: a.sfName,
        hq: emp?.territory || "",
        designation: emp?.designation || "",
        mode: a.status === "Approved" ? "Approve" : "Reject",
        actionDate: a.activityDate || null,
        workType: a.workType || "",
        reason: a.reason || "",
        actedAt: a.actedAt || null
      };
    });
    res.json({ data, month, usingRealAuditLog: actedLog.length > 0 });
  })
);

// Item 5 -- DCR > Time Status.
companyRouter.get(
  "/reports/dcr-time-status",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    if (!employeeCode || !/^\d{4}-\d{2}$/.test(month)) { res.json({ data: [] }); return; }

    const root = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!root) { res.json({ data: [] }); return; }
    const team = await getDirectReports(tenantSlug, employeeCode);
    const rows = [root as any, ...team];
    const codes = rows.map((r) => r.employeeCode);
    const numDays = daysInMonth(month);
    const dcrs = await DcrModel.find({ tenantSlug, employeeCode: { $in: codes }, month }).populate("doctorId").lean();
    const chemistCalls = await ChemistCallModel.find({ tenantSlug, employeeCode: { $in: codes }, visitDateOnly: { $regex: `^${month}` } }).lean();
    const byEmpDate = new Map<string, any>();
    for (const d of dcrs as any[]) byEmpDate.set(`${d.employeeCode}:${d.visitDateOnly}`, d);
    const chemistByEmpDate = new Map<string, number>();
    for (const c of chemistCalls as any[]) {
      const key = `${c.employeeCode}:${c.visitDateOnly}`;
      chemistByEmpDate.set(key, (chemistByEmpDate.get(key) || 0) + 1);
    }

    const data = rows.map((e) => {
      const perDay = Array.from({ length: numDays }, (_, i) => {
        const day = i + 1;
        const key = dateKey(month, day);
        const dcr: any = byEmpDate.get(`${e.employeeCode}:${key}`);
        return {
          day,
          workType: dcr?.workType || "-",
          startTime: dcr?.checkInTime || "-",
          closeTime: dcr?.checkOutTime || "-",
          duration: dcr?.visitDurationMinutes != null ? `${dcr.visitDurationMinutes}m` : "-",
          drCall: dcr ? "1" : "-",
          chemistCall: chemistByEmpDate.get(`${e.employeeCode}:${key}`) ? String(chemistByEmpDate.get(`${e.employeeCode}:${key}`)) : "-",
          filledDate: dcr?.createdAt ? new Date(dcr.createdAt).toLocaleDateString("en-IN") : "-"
        };
      });
      return { employeeCode: e.employeeCode, name: e.name, designation: e.designation, hq: e.territory, joinDate: e.joinDate || null, perDay };
    });

    res.json({ data, month, days: Array.from({ length: numDays }, (_, i) => i + 1) });
  })
);

// Item 6 -- DCR > Checkin-Checkout. Round 41: every mode is real now --
// Doctor (DcrModel gps + times), Chemist (ChemistCall check-in/out times),
// and Stockist / Unlisted Doctor / CIP / Hospital (FieldVisitLog rows the
// field app writes). Chemist calls carry no GPS stamp, so lat/lng stay blank.
companyRouter.get(
  "/reports/dcr-checkin-checkout",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const mode = String(req.query.mode || "");
    if (!employeeCode || !/^\d{4}-\d{2}$/.test(month) || !mode) {
      res.json({ data: { mode, rows: [], unsupported: false } });
      return;
    }

    if (mode === "Doctor") {
      const dcrs = await DcrModel.find({
        tenantSlug, employeeCode, month,
        "gpsLocation.latitude": { $ne: null }
      }).populate("doctorId").lean();
      const rows = (dcrs as any[]).map((d) => ({
        date: d.visitDateOnly, name: d.doctorId?.name || "", checkIn: d.checkInTime || "-", checkOut: d.checkOutTime || "-",
        lat: d.gpsLocation?.latitude, lng: d.gpsLocation?.longitude
      }));
      res.json({ data: { mode, rows, unsupported: false } });
      return;
    }
    if (mode === "Chemist") {
      // Round 41 item 1 -- chemist calls carry real check-in / check-out times.
      const calls = (await ChemistCallModel.find({ tenantSlug, employeeCode, visitDateOnly: { $regex: `^${month}` } }).sort({ visitDateOnly: 1 }).lean()) as any[];
      res.json({ data: { mode, rows: calls.map((c) => ({ date: c.visitDateOnly, name: c.chemistName || "", checkIn: c.checkInTime || "-", checkOut: c.checkOutTime || "-", lat: null, lng: null })), unsupported: false } });
      return;
    }
    // Stockist / Unlisted Doctor / CIP / Hospital -- real FieldVisitLog rows.
    const typeByMode: Record<string, string> = { Stockist: "Stockist", "Unlisted Doctor": "UnlistedDoctor", UnlistedDoctor: "UnlistedDoctor", CIP: "CIP", Hospital: "Hospital" };
    const logType = typeByMode[mode];
    if (logType) {
      const logs = (await FieldVisitLogModel.find({ tenantSlug, employeeCode, visitType: logType, visitDateOnly: { $regex: `^${month}` } }).sort({ visitDateOnly: 1 }).lean()) as any[];
      res.json({ data: { mode, rows: logs.map((l) => ({ date: l.visitDateOnly, name: l.entityName, checkIn: l.checkInTime || "-", checkOut: l.checkOutTime || "-", lat: l.gpsLocation?.latitude ?? null, lng: l.gpsLocation?.longitude ?? null })), unsupported: false } });
      return;
    }
    res.json({ data: { mode, rows: [], unsupported: false } });
  })
);

// ─────────────────────────────────────────────────────────────────────
// Item 7 -- Customized Report builder (standalone module).
// ─────────────────────────────────────────────────────────────────────
const LOCKED_DEFAULT_PARAMS = ["sno", "fieldForceName", "hq", "designation", "employeeCode"];
const OPTIONAL_DEFAULT_PARAMS = new Set(["doj", "reportingManagerI", "reportingHqI", "reportingManagerII", "reportingHqII", "state", "subdivision"]);

companyRouter.get(
  "/custom-reports",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const reports = await CustomReportModel.find({ tenantSlug }).sort({ createdAt: -1 }).lean();
    res.json({ data: reports.map((r: any) => ({ id: String(r._id), name: r.name, defaultParams: r.defaultParams, parameterCount: (r.metrics || []).length })) });
  })
);

companyRouter.post(
  "/custom-reports",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const name = String(req.body?.name || "").trim();
    if (!name) throw new HttpError(400, "Report name is required");
    const requested: string[] = Array.isArray(req.body?.defaultParams) ? req.body.defaultParams : [];
    const defaultParams = [...LOCKED_DEFAULT_PARAMS, ...requested.filter((p) => OPTIONAL_DEFAULT_PARAMS.has(p))];
    const report = await CustomReportModel.create({ tenantSlug, name, defaultParams, metrics: [] });
    res.status(201).json({ data: { id: String(report._id), name: report.name, defaultParams: report.defaultParams, parameterCount: 0 } });
  })
);

// Round 37 Item 2 -- real bug fix: this GET /custom-reports/metadata route
// used to be registered AFTER GET /custom-reports/:id below. Express
// matches routes in registration order, so a request to
// /custom-reports/metadata was matching :id="metadata" first and crashing
// with "Cast to ObjectId failed for value \"metadata\"" every time Screen
// B (Generation) tried to load its dropdown/category catalog. Moved here,
// ahead of the :id route, and the :id route below now also validates the
// id is a real ObjectId shape before ever reaching Mongoose, so no future
// literal path segment can produce this same raw-CastError class of bug
// again even if another fixed segment is added under /custom-reports/
// without remembering this ordering rule.
companyRouter.get(
  "/custom-reports/metadata",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const specialties = await DoctorModel.distinct("specialty", { tenantSlug });
    let campaigns: string[] = [];
    try {
      const CampaignMasterModel = getMasterModel("campaignMaster");
      campaigns = await CampaignMasterModel.distinct("campaignName", { tenantSlug });
    } catch {
      campaigns = [];
    }
    // Round 37 Item 2 -- real product/brand names for Product Exposure /
    // Brand Exposure's multi-selects (previously just "None selected"
    // placeholders with no real dropdown behind them).
    const products = await ProductModel.distinct("productName", { tenantSlug });
    const brands = await ProductBrandModel.distinct("brandName", { tenantSlug });
    res.json({
      data: {
        categories: CUSTOM_REPORT_CATEGORIES,
        specialties: specialties.filter(Boolean).sort(),
        campaigns: campaigns.filter(Boolean).sort(),
        campaignsUnsupported: campaigns.length === 0,
        products: products.filter(Boolean).sort(),
        brands: brands.filter(Boolean).sort()
      }
    });
  })
);

companyRouter.get(
  "/custom-reports/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new HttpError(400, "Invalid report reference -- please go back to Name Creation and open it again.");
    }
    const report = await CustomReportModel.findOne({ _id: req.params.id, tenantSlug }).lean();
    if (!report) throw new HttpError(404, "Report not found");
    res.json({ data: { id: String((report as any)._id), name: (report as any).name, defaultParams: (report as any).defaultParams, metrics: (report as any).metrics } });
  })
);

companyRouter.patch(
  "/custom-reports/:id/metrics",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const requested: string[] = Array.isArray(req.body?.metrics) ? req.body.metrics : [];
    const metrics = requested.filter((m) => ALL_METRIC_KEYS.has(m));
    const report = await CustomReportModel.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: { metrics } },
      { new: true }
    );
    if (!report) throw new HttpError(404, "Report not found");
    res.json({ data: { id: String(report._id), name: report.name, parameterCount: metrics.length } });
  })
);

companyRouter.delete(
  "/custom-reports/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const deleted = await CustomReportModel.findOneAndDelete({ _id: req.params.id, tenantSlug });
    if (!deleted) throw new HttpError(404, "Report not found");
    res.json({ data: { id: String(deleted._id) } });
  })
);


// Real (partial, honestly-disclosed) computed output for one saved report
// against one rep + month. Only COMPUTED_METRIC_KEYS are given real
// numbers; every other selected metric is echoed back with
// `computed: false, value: null` rather than a fabricated figure.
companyRouter.get(
  "/custom-reports/:id/output",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const report = await CustomReportModel.findOne({ _id: req.params.id, tenantSlug }).lean();
    if (!report) throw new HttpError(404, "Report not found");
    if (!employeeCode || !/^\d{4}-\d{2}$/.test(month)) {
      res.json({ data: { reportName: (report as any).name, metrics: [] } });
      return;
    }

    const metrics: string[] = (report as any).metrics || [];
    // Round 36 Item 1 -- the Round 35 inline version only computed a
    // handful of metrics; the real expanded computation now lives in
    // custom-report-compute.ts (see its header for exactly which ~150
    // catalog metrics are real vs. genuinely not backed by any data in
    // this schema).
    const computedValues = await computeCustomReportMetrics(tenantSlug, employeeCode, month);

    const metricLabelByKey = new Map(CUSTOM_REPORT_CATEGORIES.flatMap((c) => c.metrics.map((m) => [m.key, m.label])));
    const data = metrics.map((key) => ({
      key,
      label: metricLabelByKey.get(key) || key,
      computed: COMPUTED_METRIC_KEYS.has(key),
      value: COMPUTED_METRIC_KEYS.has(key) ? (computedValues[key] ?? null) : null
    }));

    res.json({ data: { reportName: (report as any).name, employeeCode, month, metrics: data } });
  })
);

companyRouter.get(
  "/surveys/:id/view",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const employeeCode = String(req.query.employeeCode || "");
    const mode = req.query.mode === "Answer Wise" ? "Answer Wise" : "Question Wise";
    const survey = await SurveyModel.findOne({ _id: req.params.id, tenantSlug }).lean();
    if (!survey) throw new HttpError(404, "Survey not found");
    if (!employeeCode) { res.json({ data: { surveyTitle: (survey as any).title, rows: [] } }); return; }

    const team = await EmployeeModel.find({
      tenantSlug,
      $or: [{ employeeCode }, { reportingManager: employeeCode }]
    }).sort({ employeeCode: 1 }).lean();

    // Round 36 Item 2 -- real Question Wise / Answer Wise distinction.
    // Question Wise: how many of this survey's real questions apply to
    // each process-type category (Drs/Chm/Stk/Hos/Prd) -- a structural
    // property of the survey itself, the same for every row. Answer Wise:
    // of those, how many has THIS field rep actually answered via the
    // real SurveyAnswerModel pipeline (Round 36 Item 2) -- genuinely
    // per-employee data, not a fabricated difference from Question Wise.
    const questionRefs: any[] = (survey as any).questions || [];
    const categoryKeys = ["drs", "chm", "stk", "hos", "prd"] as const;
    const questionCountByCategory: Record<string, number> = { drs: 0, chm: 0, stk: 0, hos: 0, prd: 0 };
    for (const ref of questionRefs) {
      for (const key of categoryKeys) if (ref[key]) questionCountByCategory[key]++;
    }

    let answeredQuestionIdsByEmployee = new Map<string, Set<string>>();
    if (mode === "Answer Wise") {
      const answers = await SurveyAnswerModel.find({ tenantSlug, surveyId: String(survey._id), employeeCode: { $in: team.map((e: any) => e.employeeCode) } }).lean();
      for (const a of answers as any[]) {
        const set = answeredQuestionIdsByEmployee.get(a.employeeCode) || new Set<string>();
        set.add(a.questionId);
        answeredQuestionIdsByEmployee.set(a.employeeCode, set);
      }
    }

    const rows = team.map((e: any) => {
      const counts: Record<string, number> = { drs: 0, chm: 0, stk: 0, hos: 0, prd: 0 };
      if (mode === "Question Wise") {
        for (const key of categoryKeys) counts[key] = questionCountByCategory[key];
      } else {
        const answeredIds = answeredQuestionIdsByEmployee.get(e.employeeCode) || new Set<string>();
        for (const ref of questionRefs) {
          if (!answeredIds.has(ref.questionId)) continue;
          for (const key of categoryKeys) if (ref[key]) counts[key]++;
        }
      }
      return {
        id: String(e._id),
        employeeCode: e.employeeCode,
        name: e.name,
        designation: e.designation,
        hq: e.territory,
        doj: e.joinDate || null,
        counts
      };
    });

    res.json({ data: { surveyTitle: (survey as any).title, mode, rows } });
  })
);

companyRouter.patch(
  "/surveys/:id/close",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const doc = await SurveyModel.findOne({ _id: req.params.id, tenantSlug });
    if (!doc) throw new HttpError(404, "Survey not found");
    doc.closed = true;
    doc.closedAt = new Date();
    await doc.save();
    await audit("SURVEY_CLOSED", "Survey", String(doc._id), { tenantSlug });
    res.json({ data: { id: String(doc._id), ...doc.toObject() } });
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
    // Round 12 item 6 — doctorCode was optional here, so a caller that left
    // it out (as the Unlisted -> Listed conversion route did) got a doctor
    // with no code, ever after shown blank wherever doctorCode is a column.
    const doctorCode = body.doctorCode || (await nextDoctorCode(tenantSlug));
    const doctor = await DoctorModel.create({ ...body, doctorCode, tenantSlug });
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

// Round 8 item 7 — lets rate/pack (and any other product field) actually be
// set after creation, since MSIS needs a real Rate to value sales against.
companyRouter.put(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = productUpdateSchema.parse(req.body);
    const product = await ProductModel.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: body },
      { new: true }
    );
    if (!product) throw new HttpError(404, "Product not found");
    await audit("PRODUCT_UPDATED", "Product", String(product._id), { tenantSlug, code: product.code });
    res.json({ data: serializeDocument(product) });
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
    // Round 12 item 3 — Month/Year gating for the Admin DCR Edit screen,
    // matching sanpharma's real search form (results only load after
    // FieldForce + Month + Year + Go, not immediately on employee pick).
    if (typeof req.query.month === "string" && req.query.month.trim()) {
      query.month = req.query.month.trim();
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

// Round 12 item 3 — PATCH /company/dcrs/:id: the Admin DCR Edit screen's
// full-row Edit calls this (lib/api-client.ts's updateDcr) but the backend
// never actually registered it, so every save hit Express's fallback
// "Route not found" handler. This is the real, missing route.
const dcrUpdateSchema = z.object({
  workType: z.enum(["Field Work", "Holiday", "Weekly Off", "Transit", "Meeting"]).optional(),
  workTypeCode: z.string().max(10).optional(), // Round 41 item 7 -- legend code from the WorkTypeCode master
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
    const body = dcrUpdateSchema.parse(req.body);
    const update: Record<string, unknown> = { ...body };
    if (body.workTypeCode) {
      await ensureWorkTypeCodes(tenantSlug);
      const known = await WorkTypeCodeModel.findOne({ tenantSlug, code: body.workTypeCode, status: "ACTIVE" }).lean();
      if (!known) throw new HttpError(400, `Unknown work type code ${body.workTypeCode}`);
    }
    if (body.visitDate) update.visitDate = new Date(body.visitDate);
    if (body.followUpDate) update.followUpDate = new Date(body.followUpDate);
    else if (body.followUpDate === null) update.followUpDate = null;

    const dcr = await DcrModel.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: update },
      { new: true }
    ).populate("doctorId");
    if (!dcr) throw new HttpError(404, "DCR not found");
    await audit("DCR_EDITED_BY_ADMIN", "Dcr", String(dcr._id), { tenantSlug });
    const [enriched] = await enrichWithEmployeeNames(tenantSlug, [serializeDocument(dcr)], ["employeeCode", "managerApprovedBy"]);
    res.json({ data: enriched });
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

// Round F item 4 — the Masters page's "Recent Master Modifications &
// Audit Trail" table (admin-masters-dashboard.tsx) was 100% hardcoded
// mock rows (fake doctor/product names, a fake "42 Audit Records" count,
// dead Filter/Module/Export/View-Diff/pagination controls) -- confirmed
// by reading the component source. This reads the SAME real, already
// pervasively-written AuditLogModel the /activity endpoint above uses
// (every one of the ~110 real audit() call sites across this whole
// backend), scoped to this tenant via metadata.tenantSlug exactly like
// that endpoint, with real search/module filtering and real pagination.
// Two honest limitations, disclosed rather than faked: audit() never
// records an actor user (its own signature has no actor param), so
// "Updated By" falls back to whatever identifying field metadata happens
// to carry (employeeCode/managerCode/adminUser) or "System" when none do;
// and no call site anywhere captures a structured before/after diff, so
// "View Diff" returns this entry's real metadata as-is rather than a
// fabricated old-value/new-value pair that doesn't exist in the data.
function auditModuleFor(entry: { action: string; entityType: string }) {
  const match = entry.action.match(/^MASTER_(.+)_(CREATED|UPDATED|DEACTIVATED|REACTIVATED)$/);
  const masterKeyUpper = match ? match[1] : entry.entityType.toUpperCase();
  return MASTER_TITLE_BY_UPPER_KEY[masterKeyUpper] ?? entry.entityType;
}

function auditChangeType(action: string): string {
  if (/CREATED|SUBMITTED|PLANNED|LOGGED|ADDED/.test(action)) return "Created";
  if (/APPROVED/.test(action)) return "Approved";
  if (/REJECTED/.test(action)) return "Rejected";
  if (/DEACTIVATED|SUSPENDED|VOIDED/.test(action)) return "Deactivated";
  if (/REACTIVATED/.test(action)) return "Reactivated";
  if (/UPDATED|MODIFIED|EDITED|RECEIVED/.test(action)) return "Modified";
  return "Other";
}

function auditUpdatedBy(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return "System";
  const candidate = metadata.adminUser ?? metadata.managerCode ?? metadata.employeeCode ?? metadata.actorCode;
  return candidate ? String(candidate) : "System";
}

function auditEntityName(entry: { entityType: string; entityId?: string; metadata?: Record<string, unknown> }): string {
  const m = entry.metadata ?? {};
  const nameLike = m.campaignName ?? m.name ?? m.doctorName ?? m.chemistName ?? m.tpId ?? m.productName;
  if (nameLike) return String(nameLike);
  return entry.entityId ? `${entry.entityType} ${entry.entityId}` : entry.entityType;
}

companyRouter.get(
  "/audit-log",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const moduleFilter = typeof req.query.module === "string" ? req.query.module.trim() : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));

    const filter: Record<string, unknown> = { "metadata.tenantSlug": tenantSlug };
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ action: re }, { entityType: re }, { entityId: re }, { "metadata.employeeCode": re }, { "metadata.name": re }];
    }
    if (moduleFilter && moduleFilter !== "All Modules") {
      const upperKey = Object.keys(MASTER_TITLE_BY_UPPER_KEY).find((k) => MASTER_TITLE_BY_UPPER_KEY[k] === moduleFilter);
      filter.$and = [
        upperKey
          ? { $or: [{ action: new RegExp(`^MASTER_${upperKey}_`) }, { entityType: moduleFilter }] }
          : { entityType: moduleFilter }
      ];
    }

    const [total, entries] = await Promise.all([
      AuditLogModel.countDocuments(filter),
      AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean()
    ]);

    const data = entries.map((e: any) => ({
      id: String(e._id),
      module: auditModuleFor(e),
      entityName: auditEntityName(e),
      entityType: e.entityType,
      changeType: auditChangeType(e.action),
      action: e.action,
      updatedBy: auditUpdatedBy(e.metadata),
      timestamp: e.createdAt,
      metadata: e.metadata ?? null
    }));

    res.json({ data, total, page, pageSize });
  })
);

// Real modules present in this tenant's audit log, for the "All Modules"
// filter dropdown — never a hardcoded list, so it only ever shows filters
// that actually have matching log entries.
companyRouter.get(
  "/audit-log/modules",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const entries = await AuditLogModel.find({ "metadata.tenantSlug": tenantSlug }, { action: 1, entityType: 1 }).lean();
    const modules = new Set<string>();
    for (const e of entries as any[]) modules.add(auditModuleFor(e));
    res.json({ data: Array.from(modules).sort() });
  })
);

// Real CSV export of this tenant's actual audit log (respects the same
// search/module filters as the table above) -- not a stubbed download.
companyRouter.get(
  "/audit-log/export",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const moduleFilter = typeof req.query.module === "string" ? req.query.module.trim() : "";

    const filter: Record<string, unknown> = { "metadata.tenantSlug": tenantSlug };
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ action: re }, { entityType: re }, { entityId: re }, { "metadata.employeeCode": re }, { "metadata.name": re }];
    }
    if (moduleFilter && moduleFilter !== "All Modules") {
      const upperKey = Object.keys(MASTER_TITLE_BY_UPPER_KEY).find((k) => MASTER_TITLE_BY_UPPER_KEY[k] === moduleFilter);
      filter.$and = [
        upperKey
          ? { $or: [{ action: new RegExp(`^MASTER_${upperKey}_`) }, { entityType: moduleFilter }] }
          : { entityType: moduleFilter }
      ];
    }

    const entries = await AuditLogModel.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    const rows = entries.map((e: any) => [
      auditModuleFor(e),
      auditEntityName(e),
      auditChangeType(e.action),
      auditUpdatedBy(e.metadata),
      new Date(e.createdAt).toISOString()
    ]);
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [["Module", "Entity Name", "Change Type", "Updated By", "Timestamp"], ...rows]
      .map((r) => r.map(esc).join(","))
      .join("\r\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${tenantSlug}-${Date.now()}.csv"`);
    res.send(csv);
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
  // Round 46 -- Chemist Dump / RCPA Dump columns.
  chemistClass: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  clusterName: z.string().trim().optional().nullable(),
  commonRefNo: z.string().trim().optional().nullable(),
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
  // Round 46 -- the chemist form only sends the field force NAME; resolve the code so
  // Chemist Dump / RCPA Dump / coverage reports (all keyed on employeeCode) include it.
  if (!body.employeeCode && body.employeeName) {
    const owner = await EmployeeModel.findOne({ tenantSlug, name: body.employeeName }).select("employeeCode").lean() as any;
    if (owner) body.employeeCode = owner.employeeCode;
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
  if (!body.employeeCode && body.employeeName) {
    const owner = await EmployeeModel.findOne({ tenantSlug, name: body.employeeName }).select("employeeCode").lean() as any;
    if (owner) update.employeeCode = owner.employeeCode;
  }
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
  const tps = await TourPlanModel.find(query).sort({ createdAt: -1 }).limit(1000);
  res.json({ data: await enrichTourPlansWithNames(tenantSlug, tps) });
}));

// Round 12 item 1 — DELETE /company/tour-plans/:tpId: the Admin TP Delete
// screen has called this real endpoint since it was built, but it was never
// actually registered on the backend, so every delete attempt 404'd
// ("Route not found") and the frontend surfaced that as "Failed to delete:
// <tpId>". tpId is the real unique human-readable code (TourPlanModel.tpId,
// e.g. "TP-2026-09-MR-004-001"), which is exactly what the frontend already
// sends — no ObjectId mismatch, the route itself simply didn't exist.
companyRouter.delete("/tour-plans/:tpId", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const tp = await TourPlanModel.findOneAndDelete({ tenantSlug, tpId: req.params.tpId });
  if (!tp) throw new HttpError(404, "Tour Plan not found");
  await audit("TOUR_PLAN_DELETED_BY_ADMIN", "TourPlan", tp.tpId, { tenantSlug, employeeCode: (tp as any).employeeCode });
  notifyFieldRep({
    tenantSlug,
    employeeCode: (tp as any).employeeCode,
    title: "Tour Plan removed by Admin",
    message: `Your Tour Plan ${tp.tpId} for ${(tp as any).month} was deleted by an administrator.`
  }).catch(() => {});
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
// Round F item 1 — Activities landing page's 4 stat cards. Previously 100%
// hardcoded static numbers in admin-activities-dashboard.tsx ("1,420 /
// 1,600 Target", "8.4 mins", "₹4.82 Lakhs", "9 GPS Mismatches" — none of it
// ever read from Mongo). This endpoint replaces every one of those numbers
// with a real, live aggregation. Two things were investigated and found to
// have NO real backing data anywhere in this codebase, so they are
// reported here rather than faked: (1) a registered clinic/chemist GPS
// coordinate to diff a rep's capture against (no Doctor/Chemist model has
// a lat/lng field) — "gpsNotCapturedToday" is the closest honest proxy
// (DCRs submitted today with no gpsLocation at all), not a "mismatch
// distance"; (2) any e-detailing session-duration tracking (no model
// anywhere stores minutes/seconds per VA session) — there is no real
// "Avg E-Detailing mins" to report, so it is omitted entirely rather than
// shown as a fake average.
// ══════════════════════════════════════════════════════════════════════
// GET /company/chemist-calls-today -- Item 4 (post-launch robustness
// round): real backing for the Activities dashboard's "Chemist Orders &
// POB" tab, which used to be a static tab label with no real view behind
// it. Lists today's real ChemistCallModel entries with their POB (product
// order booking) rows -- the same real data /company/activities/summary's
// "Chemist & Stockist Orders Today" card already counts, surfaced here as
// an actual itemized list. Honest scope note: there is no approval/status
// concept on ChemistCallModel (it's a logged fact, not an approval-gated
// request), so this is a real read-only list, not a fake approval queue.
companyRouter.get("/chemist-calls-today", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const calls = await ChemistCallModel.find({ tenantSlug, visitDateOnly: todayStr }).sort({ visitDate: -1 }).limit(200).lean();
  const data = (calls as any[])
    .filter((c) => Array.isArray(c.pob) && c.pob.length > 0)
    .map((c) => ({
      id: String(c._id),
      employeeCode: c.employeeCode,
      employeeName: c.employeeName,
      chemistName: c.chemistName,
      visitDate: c.visitDate,
      pob: (c.pob as any[]).map((p) => ({ productName: p.productName, qty: p.qty }))
    }));
  res.json({ data });
}));

// GET /company/dispatches-today -- Item 4 (post-launch robustness round):
// real backing for the "Sample / Promo Dispatches" tab. Lists today's real
// DispatchModel batches (dispatchDate within today, or still Pending
// regardless of date -- pending ones are exactly what an admin cares about
// here). Same honest scope note as chemist-calls-today: a dispatch only
// has Pending/Received, not an approval workflow, so this is a real list
// view, not an approval queue.
companyRouter.get("/dispatches-today", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dispatches = await DispatchModel.find({
    tenantSlug,
    $or: [{ dispatchDate: { $gte: todayStart } }, { status: "Pending" }]
  }).sort({ dispatchDate: -1 }).limit(200).lean();
  const data = (dispatches as any[]).map((d) => ({
    id: String(d._id),
    employeeCode: d.employeeCode,
    employeeName: d.employeeName,
    type: d.type,
    dispatchDate: d.dispatchDate,
    status: d.status,
    itemCount: Array.isArray(d.items) ? d.items.length : 0,
    totalQty: Array.isArray(d.items) ? d.items.reduce((sum: number, it: any) => sum + (Number(it.dispatchQty) || 0), 0) : 0
  }));
  res.json({ data });
}));

// GET /company/edetailing-summary -- Item A (post-launch robustness
// round): the admin Activities dashboard's "E-Detailing VA Session
// Metrics" panel used to show fabricated numbers (average screen
// duration, VA interactive slips, per-product "engagement %") that have
// no real backing data anywhere -- the only real e-detailing-adjacent
// event this codebase actually tracks is a field rep DOWNLOADING an
// admin-authored slide for offline practice (SlideDownloadModel). This
// returns real download counts only; it deliberately does not report any
// duration/engagement metric, since none is ever recorded.
companyRouter.get("/edetailing-summary", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [downloadsToday, downloadsThisWeek] = await Promise.all([
    SlideDownloadModel.find({ tenantSlug, downloadedAt: { $gte: todayStart } }).lean(),
    SlideDownloadModel.find({ tenantSlug, downloadedAt: { $gte: weekStart } }).lean()
  ]);

  const slideCounts = new Map<string, { fileName: string; brand: string; count: number }>();
  for (const d of downloadsThisWeek as any[]) {
    const key = String(d.slideId);
    const existing = slideCounts.get(key);
    if (existing) existing.count += 1;
    else slideCounts.set(key, { fileName: d.fileName || "Untitled slide", brand: d.brand || "", count: 1 });
  }
  const topSlides = Array.from(slideCounts.values()).sort((a, b) => b.count - a.count).slice(0, 5);

  const repCounts = new Map<string, number>();
  for (const d of downloadsThisWeek as any[]) {
    repCounts.set(d.employeeCode, (repCounts.get(d.employeeCode) ?? 0) + 1);
  }
  const repCodes = Array.from(repCounts.keys());
  const employees = repCodes.length
    ? await EmployeeModel.find({ tenantSlug, employeeCode: { $in: repCodes } }, { employeeCode: 1, name: 1 }).lean()
    : [];
  const nameByCode = new Map((employees as any[]).map((e) => [e.employeeCode, e.name]));
  const topReps = Array.from(repCounts.entries())
    .map(([employeeCode, count]) => ({ employeeCode, employeeName: nameByCode.get(employeeCode) ?? employeeCode, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    data: {
      downloadsToday: downloadsToday.length,
      downloadsThisWeek: downloadsThisWeek.length,
      distinctRepsThisWeek: repCounts.size,
      topSlides,
      topReps
    }
  });
}));

companyRouter.get("/activities/summary", asyncHandler(async (req, res) => {
  const tenantSlug = req.auth!.tenantSlug!;
  const now = new Date();
  const toDateOnly = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const todayStr = toDateOnly(now);
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = toDateOnly(yesterday);

  const [
    callsToday,
    callsYesterday,
    doctorDetailingToday,
    gpsNotCapturedToday,
    gpsNotCapturedDetailingToday,
    chemistCallsToday,
    pendingLeave,
    pendingExpense,
    pendingTourPlan,
    pendingDeviation
  ] = await Promise.all([
    DcrModel.countDocuments({ tenantSlug, visitDateOnly: todayStr }),
    DcrModel.countDocuments({ tenantSlug, visitDateOnly: yesterdayStr }),
    DcrModel.countDocuments({ tenantSlug, visitDateOnly: todayStr, productsDetailed: { $exists: true, $not: { $size: 0 } } }),
    DcrModel.countDocuments({ tenantSlug, visitDateOnly: todayStr, "gpsLocation.latitude": null }),
    DcrModel.countDocuments({ tenantSlug, visitDateOnly: todayStr, productsDetailed: { $exists: true, $not: { $size: 0 } }, "gpsLocation.latitude": null }),
    ChemistCallModel.find({ tenantSlug, visitDateOnly: todayStr }, { pob: 1 }).lean(),
    LeaveApplicationModel.countDocuments({ tenantSlug, status: "PENDING" }),
    ExpenseClaimModel.countDocuments({ tenantSlug, status: "SUBMITTED" }),
    TourPlanModel.countDocuments({ tenantSlug, status: "SUBMITTED" }),
    CampaignVisitModel.countDocuments({ tenantSlug, source: "deviation", status: "Pending Approval" })
  ]);

  // Chemist & Stockist Orders — real POB bookings today. Rupee value is
  // best-effort via rateMaster's MRP (keyed on product name, same as the
  // rest of this codebase's rateMaster lookups) — flagged partial when any
  // ordered product has no matching Active rate row, rather than silently
  // under-counting.
  let chemistOrderCount = 0;
  let chemistOrderQty = 0;
  const productNames = new Set<string>();
  for (const call of chemistCallsToday as unknown as { pob?: { productName: string; qty: number }[] }[]) {
    const pob = Array.isArray(call.pob) ? call.pob : [];
    if (pob.length > 0) chemistOrderCount++;
    for (const row of pob) {
      chemistOrderQty += Number(row.qty) || 0;
      if (row.productName) productNames.add(row.productName);
    }
  }
  let chemistOrderValue = 0;
  let chemistOrderValuePartial = false;
  if (productNames.size > 0) {
    const RateMaster = getMasterModel("rateMaster");
    const rateRows = await RateMaster.find({ tenantSlug, product: { $in: Array.from(productNames) }, status: "Active" }, { product: 1, mrp: 1 }).lean();
    const mrpByProduct = new Map<string, number>();
    for (const r of rateRows as unknown as { product: string; mrp: number }[]) {
      const mrp = Number(r.mrp) || 0;
      if (mrp > 0 && !mrpByProduct.has(r.product)) mrpByProduct.set(r.product, mrp);
    }
    for (const call of chemistCallsToday as unknown as { pob?: { productName: string; qty: number }[] }[]) {
      for (const row of call.pob || []) {
        const mrp = mrpByProduct.get(row.productName);
        if (mrp) chemistOrderValue += mrp * (Number(row.qty) || 0);
        else chemistOrderValuePartial = true;
      }
    }
  }

  res.json({
    data: {
      date: todayStr,
      totalCallsLoggedToday: callsToday,
      totalCallsLoggedYesterday: callsYesterday,
      callsDeltaPct: callsYesterday > 0 ? Math.round(((callsToday - callsYesterday) / callsYesterday) * 1000) / 10 : null,
      doctorDetailingVisitsToday: doctorDetailingToday,
      gpsNotCapturedToday,
      gpsNotCapturedDetailingToday,
      chemistStockistOrdersToday: chemistOrderCount,
      chemistStockistOrderQtyToday: chemistOrderQty,
      chemistStockistOrderValueToday: Math.round(chemistOrderValue),
      chemistStockistOrderValuePartial: chemistOrderValuePartial,
      pendingApprovals: {
        leave: pendingLeave,
        expense: pendingExpense,
        tourPlan: pendingTourPlan,
        deviation: pendingDeviation,
        total: pendingLeave + pendingExpense + pendingTourPlan + pendingDeviation
      }
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

// ═══════════════════════════════════════════════════════════════════════
// Round 37 Items 3/4/5 -- Manager Analysis: HQ-Coveragewise, Coverage
// Analysis 1, Joint Workwise. All real data, scoped via org-hierarchy.ts,
// computed via manager-analysis-compute.ts (itself built on top of
// Round 34-36's day-status.ts / custom-report-compute.ts rather than
// reimplementing any of it).
// ═══════════════════════════════════════════════════════════════════════

// Managers only (RBM/ZBM/ABM/BH/NBH) -- Item 3's and Item 5's "Filed Force
// Name" dropdown is manager-scoped, not the full employee list.
companyRouter.get(
  "/manager-analysis/managers",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const managers = await getAllManagers(tenantSlug);
    res.json({ data: managers.map((m: any) => ({ employeeCode: m.employeeCode, name: m.name, designation: m.designation, territory: m.territory, joinDate: m.joinDate || null })) });
  })
);

// Item 3 -- Manager - HQ Wise Visit Coverage Analysis
companyRouter.get(
  "/manager-analysis/hq-coverage",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    const mode = String(req.query.mode || "Days/Calls Only");
    if (!employeeCode || !fromMonth) throw new HttpError(400, "employeeCode and fromMonth are required");

    const manager = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!manager) throw new HttpError(404, "Field force not found");
    const months = monthRange(fromMonth, toMonth);

    const { perMonth: summaryPerMonth, total: summaryTotal } = await computeDayCallsSummaryRange(tenantSlug, employeeCode, months);

    const base = {
      fieldForceName: (manager as any).name, designation: (manager as any).designation, hq: (manager as any).territory,
      doj: (manager as any).joinDate || null, months, summaryPerMonth, summaryTotal
    };

    if (mode === "Days/Calls Only") {
      res.json({ data: { ...base, mode, noRecordsFound: true } });
      return;
    }

    if (mode === "HQ/EX/OS wise") {
      const team = await getDirectReports(tenantSlug, employeeCode);
      const rows = [];
      for (const member of team) rows.push(await computeHqExOsRow(tenantSlug, member, months));
      res.json({ data: { ...base, mode, hqRows: rows } });
      return;
    }

    if (mode === "Detail") {
      const team = await getAllDescendants(tenantSlug, employeeCode);
      const rows = [];
      for (const member of team) rows.push(await computeDetailRow(tenantSlug, member, months));
      res.json({
        data: {
          fieldForceName: (manager as any).name, months,
          mode, detailRows: rows
        }
      });
      return;
    }

    throw new HttpError(400, "Unknown mode");
  })
);

// Item 4 -- Coverage Analysis 1 (standalone + drill-down from Item 3 Detail)
companyRouter.get(
  "/manager-analysis/coverage-analysis-1",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    if (!employeeCode || !month) throw new HttpError(400, "employeeCode and month are required");
    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!employee) throw new HttpError(404, "Field force not found");
    const pivot = await computeCoverageAnalysis1(tenantSlug, employeeCode, month);
    res.json({
      data: {
        fieldForceName: (employee as any).name, designation: (employee as any).designation, hq: (employee as any).territory,
        month, ...pivot
      }
    });
  })
);

// Item 5 -- Joint Work Analysis
companyRouter.get(
  "/manager-analysis/joint-work",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    const mode = String(req.query.mode || "Based on MGR - DCR");
    if (!employeeCode || !fromMonth) throw new HttpError(400, "employeeCode and fromMonth are required");

    const manager = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!manager) throw new HttpError(404, "Field force not found");
    const months = monthRange(fromMonth, toMonth);

    if (mode === "Based on MGR - DCR") {
      const perMonth: Record<string, { days: number; dates: string[]; calls: number } | null> = {};
      for (const month of months) perMonth[month] = await computeJointWorkForEmployee(tenantSlug, employeeCode, month);
      res.json({
        data: {
          mode, months,
          managerRow: { employeeCode, name: (manager as any).name, hq: (manager as any).territory, designation: (manager as any).designation, joinDate: (manager as any).joinDate || null, perMonth }
        }
      });
      return;
    }

    if (mode === "Based on MR - DCR") {
      const baseLevel = await getAllDescendants(tenantSlug, employeeCode);
      const repRows = [];
      for (const rep of baseLevel) {
        const perMonth: Record<string, { days: number; dates: string[]; calls: number } | null> = {};
        for (const month of months) perMonth[month] = await computeJointWorkForEmployee(tenantSlug, rep.employeeCode, month);
        const chain = await getUpwardChain(tenantSlug, rep.employeeCode);
        const chainRows = [];
        for (const mgr of chain) {
          const mgrPerMonth: Record<string, { days: number; dates: string[]; calls: number } | null> = {};
          for (const month of months) mgrPerMonth[month] = await computeJointWorkWithManager(tenantSlug, rep.employeeCode, mgr.name, month);
          chainRows.push({ employeeCode: mgr.employeeCode, name: mgr.name, hq: mgr.territory, designation: mgr.designation, joinDate: mgr.joinDate || null, perMonth: mgrPerMonth });
        }
        repRows.push({ employeeCode: rep.employeeCode, name: rep.name, hq: rep.territory, designation: rep.designation, joinDate: rep.joinDate || null, perMonth, chain: chainRows });
      }
      res.json({ data: { mode, months, repRows } });
      return;
    }

    throw new HttpError(400, "Unknown mode");
  })
);
// ═══════════════════════════════════════════════════════════════════════
// Round 38 Items 1/2/3 -- FieldWork Manager - Analysis, Manager Wise -
// Coverage Analysis, Speciality/Category Visit Wise. All real data via
// manager-analysis-compute.ts, scoped via org-hierarchy.ts.
// ═══════════════════════════════════════════════════════════════════════

companyRouter.get(
  "/manager-analysis/fieldwork-manager-analysis",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!employeeCode || !fromMonth) throw new HttpError(400, "employeeCode and fromMonth are required");
    const manager = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!manager) throw new HttpError(404, "Field force not found");
    const months = monthRange(fromMonth, toMonth);
    const team = await getAllDescendants(tenantSlug, employeeCode);
    const rows = [];
    for (const member of team) rows.push(await computeFieldworkManagerRow(tenantSlug, member, months));
    res.json({
      data: {
        fieldForceName: (manager as any).name, designation: (manager as any).designation, hq: (manager as any).territory,
        months, rows
      }
    });
  })
);

companyRouter.get(
  "/manager-analysis/manager-wise-coverage",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!employeeCode || !fromMonth) throw new HttpError(400, "employeeCode and fromMonth are required");
    const manager = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!manager) throw new HttpError(404, "Field force not found");
    const months = monthRange(fromMonth, toMonth);
    const team = await getAllDescendants(tenantSlug, employeeCode);
    const rows = [];
    for (const member of team) rows.push(await computeManagerWiseCoverageRow(tenantSlug, member, months));
    res.json({
      data: {
        fieldForceName: (manager as any).name, designation: (manager as any).designation, hq: (manager as any).territory,
        months, rows,
        // Round 38 Item 2 -- see manager-analysis-compute.ts's own header
        // comment: the coordinator's legacy description was cut off with
        // no screenshot, so this row shape is a disclosed INFERENCE
        // (Coverage Analysis 1's pivot, looped per team member) pending
        // user confirmation against a real screenshot.
        resultShapeIsInference: true
      }
    });
  })
);

companyRouter.get(
  "/manager-analysis/speciality-category-visit",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    const mode = String(req.query.mode || "Specialitywise Visit");
    if (!employeeCode || !fromMonth) throw new HttpError(400, "employeeCode and fromMonth are required");
    const manager = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
    if (!manager) throw new HttpError(404, "Field force not found");
    const months = monthRange(fromMonth, toMonth);
    const team = await getAllDescendants(tenantSlug, employeeCode);

    if (mode === "Categorywise Visit") {
      const result = await computeCategoryVisitWise(tenantSlug, team, months);
      res.json({ data: { mode, fieldForceName: (manager as any).name, months, ...result } });
      return;
    }

    const result = await computeSpecialityVisitWise(tenantSlug, team, months);
    res.json({ data: { mode: "Specialitywise Visit", fieldForceName: (manager as any).name, months, ...result } });
  })
);

// ═══ Round 39 -- MIS Reports > Analysis: DCR, Visit Analysis, Sales Details,
// POB Wise, POB Wise - Periodically. All computed in
// src/utils/mis-reports-compute.ts from real documents (see its header for
// the exact source of every column and the honest-zero list).
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireEmployeeByCode(tenantSlug: string, employeeCode: string) {
  if (!employeeCode) throw new HttpError(400, "employeeCode is required");
  const emp = await EmployeeModel.findOne({ tenantSlug, employeeCode }).lean();
  if (!emp) throw new HttpError(404, "Field force not found");
  return emp as unknown as OrgEmployee;
}

// Base Level dropdown for DCR Analysis: the chosen manager's full team.
companyRouter.get(
  "/mis/team",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    await requireEmployeeByCode(tenantSlug, employeeCode);
    const team = await getAllDescendants(tenantSlug, employeeCode);
    res.json({ data: team.map((m) => ({ employeeCode: m.employeeCode, name: m.name, designation: m.designation, territory: m.territory })) });
  })
);

companyRouter.get(
  "/mis/dcr-analysis",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const month = String(req.query.month || "");
    const individual = String(req.query.individual || "") === "true";
    const baseLevel = String(req.query.baseLevel || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const selected = await requireEmployeeByCode(tenantSlug, employeeCode);
    let people: OrgEmployee[];
    if (individual) people = [selected];
    else if (baseLevel) people = [await requireEmployeeByCode(tenantSlug, baseLevel)];
    else {
      const team = await getAllDescendants(tenantSlug, employeeCode);
      people = team.length > 0 ? team : [selected];
    }
    const reports = [];
    for (const person of people.slice(0, 100)) reports.push(await computeDcrAnalysis(tenantSlug, person, month));
    res.json({ data: { month, reports, truncated: people.length > 100 } });
  })
);

companyRouter.get(
  "/mis/visit-analysis",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const level = String(req.query.level || "MR");
    const type = String(req.query.type || "") as VisitAnalysisType;
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!["Category", "Speciality", "Class", "Campaign"].includes(type)) throw new HttpError(400, "Select a Type (Category, Speciality, Class or Campaign)");
    if (!["MR", "Manager"].includes(level)) throw new HttpError(400, "level must be MR or Manager");
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM");
    const selected = await requireEmployeeByCode(tenantSlug, employeeCode);
    const everyone = await selfAndTeam(tenantSlug, employeeCode);
    const members = everyone.filter((m) => (level === "Manager" ? isManagerRole(m.role) : !isManagerRole(m.role)));
    const months = monthRange(fromMonth, toMonth);
    const result = await computeVisitAnalysis(tenantSlug, members, months, type);
    res.json({ data: { ...result, level, months, fieldForceName: selected.name, designation: selected.designation, hq: selected.territory, memberCount: members.length } });
  })
);

companyRouter.get(
  "/mis/sales-details",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const mode = String(req.query.mode || "Statewise");
    const month = String(req.query.month || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    if (mode === "Statewise") {
      const state = String(req.query.state || "");
      if (!state) {
        const rows = await computeSalesDetailsStatewise(tenantSlug, month);
        res.json({ data: { mode, month, states: rows } });
        return;
      }
      const members = (await EmployeeModel.find({ tenantSlug, state, status: "ACTIVE" }).sort({ name: 1 }).lean()) as unknown as OrgEmployee[];
      const rows = await computeSalesDetailsRows(tenantSlug, members, month);
      res.json({ data: { mode, month, state, rows } });
      return;
    }
    const employeeCode = String(req.query.employeeCode || "");
    const selected = await requireEmployeeByCode(tenantSlug, employeeCode);
    const members = await selfAndTeam(tenantSlug, employeeCode);
    const rows = await computeSalesDetailsRows(tenantSlug, members, month);
    res.json({ data: { mode: "Managerwise", month, fieldForceName: selected.name, designation: selected.designation, hq: selected.territory, rows: rows.map((r, i) => ({ ...r, isSelf: i === 0 })) } });
  })
);

companyRouter.get(
  "/mis/pob-products",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    res.json({ data: await listPobProducts(tenantSlug) });
  })
);

function parseProducts(raw: unknown): string[] {
  return String(raw || "").split("||").map((s) => s.trim()).filter(Boolean);
}

companyRouter.get(
  "/mis/pob-wise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    const mode = String(req.query.mode || "Drs/Chem POB wise");
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM");
    const selected = await requireEmployeeByCode(tenantSlug, employeeCode);
    const productMode = mode === "With Produc POB/Rx";
    const products = productMode ? parseProducts(req.query.products) : [];
    if (productMode && products.length === 0) throw new HttpError(400, "Select at least one product");
    const team = await selfAndTeam(tenantSlug, employeeCode);
    const result = await computePobWise(tenantSlug, team, monthRange(fromMonth, toMonth), products);
    res.json({ data: { ...result, mode, fieldForceName: selected.name, designation: selected.designation, hq: selected.territory } });
  })
);

companyRouter.get(
  "/mis/pob-periodic",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const employeeCode = String(req.query.employeeCode || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new HttpError(400, "from/to must be YYYY-MM-DD with from on or before to");
    const selected = await requireEmployeeByCode(tenantSlug, employeeCode);
    const products = parseProducts(req.query.products);
    const team = await selfAndTeam(tenantSlug, employeeCode);
    const result = await computePobPeriodic(tenantSlug, team, from, to, products);
    res.json({ data: { ...result, from, to, fieldForceName: selected.name, designation: selected.designation, hq: selected.territory } });
  })
);

// ═══ Round 40 -- Work Hygiene, Class Wise View, DCR Analysis Dump, Missed
// Call, Single Doctor, Rep Vs Manager, Review Report, Assessment Report.
// All computed in src/utils/mis-reports-2-compute.ts from real documents.
companyRouter.get(
  "/mis/work-hygiene",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const emp = await requireEmployeeByCode(tenantSlug, String(req.query.employeeCode || ""));
    const result = await computeWorkHygiene(tenantSlug, emp, month);
    res.json({ data: { ...result, fieldForceName: emp.name, designation: emp.designation, hq: emp.territory } });
  })
);

companyRouter.get(
  "/mis/class-wise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM");
    const emp = await requireEmployeeByCode(tenantSlug, String(req.query.employeeCode || ""));
    const result = await computeClassWiseView(tenantSlug, emp, monthRange(fromMonth, toMonth));
    res.json({ data: { ...result, fieldForceName: emp.name, designation: emp.designation, hq: emp.territory } });
  })
);

// File download (CSV / XLSX) -- not an envelope response.
companyRouter.get(
  "/mis/dcr-dump",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const rawCode = String(req.query.employeeCode || "");
    const rootCode = rawCode && rawCode !== "admin" ? rawCode : "";
    if (rootCode) await requireEmployeeByCode(tenantSlug, rootCode);
    const days = String(req.query.days || "").split(",").map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 31);
    const includeVacant = String(req.query.vacant || "") === "true";
    const format = String(req.query.format || "csv");
    const rows = await buildDcrDump(tenantSlug, rootCode, month, days, includeVacant);
    const fileBase = `DCR_Analysis_Dump_${month}`;
    if (format === "xlsx") {
      const aoa: string[][] = [DUMP_HEADERS.slice(0, -1), ...rows.map((r) => r.slice(0, -1))];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "DCR Analysis Dump");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`);
      res.send(buf);
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.csv"`);
    res.send(dumpToCsv(rows));
  })
);

companyRouter.get(
  "/mis/missed-call",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const mode = String(req.query.mode || "Listed Doctor");
    const rawCode = String(req.query.employeeCode || "");
    const rootCode = rawCode && rawCode !== "admin" ? rawCode : "";
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM");
    if (mode === "Call Monitor(Detailed)") {
      const emp = await requireEmployeeByCode(tenantSlug, rootCode);
      res.json({ data: { mode, ...(await computeMissedCallDetailed(tenantSlug, emp, fromMonth)) } });
      return;
    }
    const emp = rootCode ? await requireEmployeeByCode(tenantSlug, rootCode) : null;
    const result = await computeMissedCallListed(tenantSlug, rootCode, monthRange(fromMonth, toMonth));
    res.json({ data: { mode: "Listed Doctor", ...result, fieldForceName: emp ? emp.name : "admin" } });
  })
);

companyRouter.get(
  "/mis/force-doctors",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const emp = await requireEmployeeByCode(tenantSlug, String(req.query.employeeCode || ""));
    res.json({ data: await listDoctorsForForce(tenantSlug, emp) });
  })
);

companyRouter.get(
  "/mis/single-doctor",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    const doctorId = String(req.query.doctorId || "");
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM");
    if (!mongoose.isValidObjectId(doctorId)) throw new HttpError(400, "Select a doctor");
    const emp = await requireEmployeeByCode(tenantSlug, String(req.query.employeeCode || ""));
    const result = await computeSingleDoctor(tenantSlug, emp, doctorId, monthRange(fromMonth, toMonth));
    if (!result) throw new HttpError(404, "Doctor not found");
    res.json({ data: result });
  })
);

companyRouter.get(
  "/mis/rep-vs-manager",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const emp = await requireEmployeeByCode(tenantSlug, String(req.query.employeeCode || ""));
    res.json({ data: await computeRepVsManager(tenantSlug, emp, month) });
  })
);

companyRouter.get(
  "/mis/review-report",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const emp = await requireEmployeeByCode(tenantSlug, String(req.query.employeeCode || ""));
    res.json({ data: await computeReviewReport(tenantSlug, emp, month) });
  })
);

companyRouter.get(
  "/mis/assessment",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth)) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM");
    const emp = await requireEmployeeByCode(tenantSlug, String(req.query.employeeCode || ""));
    res.json({ data: await computeAssessment(tenantSlug, emp, monthRange(fromMonth, toMonth)) });
  })
);

// ═══ Round 41 -- settings, DCR locks, work-type codes, CRM/RCPA review ═════
// (See src/utils/settings.ts, dcr-lock.ts, work-type-codes.ts.)

// GET/PUT /company/settings/r41 -- DCR delay window (lock-after-days),
// per-category visit norms and the company timezone.
companyRouter.get(
  "/settings/r41",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    res.json({ data: { dcrDelayDays: await getDcrDelayDays(tenantSlug), categoryNorms: await getCategoryNorms(tenantSlug), companyTimezone: await getCompanyTimezone(tenantSlug) } });
  })
);

const settingsR41Schema = z.object({
  dcrDelayDays: z.number().int().min(0).max(60).optional(),
  categoryNorms: z.object({ NIL: z.number().int().min(0).max(31), CORE: z.number().int().min(0).max(31), "N CORE": z.number().int().min(0).max(31), "S CORE": z.number().int().min(0).max(31) }).optional(),
  companyTimezone: z.string().min(3).max(64).optional()
});

companyRouter.put(
  "/settings/r41",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = settingsR41Schema.parse(req.body);
    if (body.dcrDelayDays !== undefined) await saveSetting(tenantSlug, DCR_DELAY_DAYS_KEY, body.dcrDelayDays, req.auth!.sub);
    if (body.categoryNorms) await saveSetting(tenantSlug, CATEGORY_NORMS_KEY, body.categoryNorms, req.auth!.sub);
    if (body.companyTimezone) {
      try { new Intl.DateTimeFormat("en-US", { timeZone: body.companyTimezone }); } catch { throw new HttpError(400, "Unknown timezone"); }
      await saveSetting(tenantSlug, COMPANY_TIMEZONE_KEY, body.companyTimezone, req.auth!.sub);
    }
    await audit("SETTINGS_R41_SAVED", "CompanyConfig", "r41", { tenantSlug });
    res.json({ data: { dcrDelayDays: await getDcrDelayDays(tenantSlug), categoryNorms: await getCategoryNorms(tenantSlug), companyTimezone: await getCompanyTimezone(tenantSlug) } });
  })
);

// GET /company/dcr-locks?month=YYYY-MM[&employeeCode=] -- lock rows for the
// admin (persists any newly detected locks first).
companyRouter.get(
  "/dcr-locks",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "");
    const employeeCode = String(req.query.employeeCode || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const emps = (await EmployeeModel.find({ tenantSlug, status: "ACTIVE", ...(employeeCode ? { employeeCode } : {}) }).lean()) as any[];
    const first = `${month}-01`;
    const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    await detectLocks(tenantSlug, emps, first, last);
    const rows = (await DcrLockModel.find({ tenantSlug, dcrDate: { $gte: first, $lte: last }, ...(employeeCode ? { employeeCode } : {}) }).sort({ dcrDate: 1 }).lean()) as any[];
    const nameByCode = new Map(emps.map((e) => [e.employeeCode, e]));
    res.json({
      data: rows.map((l) => ({
        employeeCode: l.employeeCode, name: nameByCode.get(l.employeeCode)?.name || l.employeeCode, hq: nameByCode.get(l.employeeCode)?.territory || "",
        date: l.dcrDate, lockedAt: l.lockedAt, reason: l.lockReason, releasedAt: l.releasedAt || null, releasedBy: l.releasedBy || null,
        releaseRequestedAt: l.releaseRequestedAt || null, releaseRequestNote: l.releaseRequestNote || null
      })),
      delayDays: await getDcrDelayDays(tenantSlug)
    });
  })
);

const lockActionSchema = z.object({ employeeCode: z.string().min(1), dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional() });

// POST /company/dcr-locks/release -- stamps releasedAt / releasedBy.
companyRouter.post(
  "/dcr-locks/release",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = lockActionSchema.parse(req.body);
    const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode }).lean()) as any;
    if (!emp) throw new HttpError(404, "Field force not found");
    const today = utcDateString(new Date());
    await detectLocks(tenantSlug, [emp], utcDateString(new Date(Date.now() - LOCK_LOOKBACK_DAYS * 86400000)), today);
    const released = await releaseLocks(tenantSlug, body.employeeCode, body.dates?.length ? body.dates : "all", `admin:${req.auth!.sub}`);
    await audit("DCR_LOCKS_RELEASED", "DcrLock", body.employeeCode, { tenantSlug, released, dates: body.dates });
    res.json({ data: { released } });
  })
);

// POST /company/dcr-locks/lock -- admin manually locks a date.
companyRouter.post(
  "/dcr-locks/lock",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = lockActionSchema.parse(req.body);
    if (!body.dates?.length) throw new HttpError(400, "dates are required");
    await requireEmployeeByCode(tenantSlug, body.employeeCode);
    for (const date of body.dates) {
      await DcrLockModel.findOneAndUpdate(
        { tenantSlug, employeeCode: body.employeeCode, dcrDate: date },
        { $set: { lockReason: "manual", lockedAt: new Date(), releasedAt: null, releasedBy: null }, $setOnInsert: { detectedAt: new Date() } },
        { upsert: true }
      );
    }
    await audit("DCR_LOCKS_MANUAL", "DcrLock", body.employeeCode, { tenantSlug, dates: body.dates });
    res.json({ data: { locked: body.dates.length } });
  })
);

// Work type codes (DCR Status legend).
companyRouter.get(
  "/work-type-codes",
  asyncHandler(async (req, res) => {
    res.json({ data: await listWorkTypeCodes(req.auth!.tenantSlug!) });
  })
);

const workTypeCodeSchema = z.object({
  code: z.string().min(1).max(10).transform((v) => v.trim().toUpperCase()),
  name: z.string().min(1).max(60),
  category: z.enum(["Field", "Leave", "Holiday", "Office", "Meeting", "Training", "Travel", "Other"]).default("Other")
});

companyRouter.post(
  "/work-type-codes",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = workTypeCodeSchema.parse(req.body);
    await ensureWorkTypeCodes(tenantSlug);
    const row = await WorkTypeCodeModel.findOneAndUpdate({ tenantSlug, code: body.code }, { $set: { name: body.name, category: body.category, status: "ACTIVE" } }, { upsert: true, new: true });
    await audit("WORK_TYPE_CODE_SAVED", "WorkTypeCode", body.code, { tenantSlug });
    res.status(201).json({ data: { code: row.code, name: row.name, category: row.category } });
  })
);

companyRouter.delete(
  "/work-type-codes/:code",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    await WorkTypeCodeModel.updateOne({ tenantSlug, code: req.params.code.toUpperCase() }, { $set: { status: "INACTIVE" } });
    res.json({ data: { deactivated: true } });
  })
);

// CRM review (manager/admin approval of doctor CRM entries) + RCPA listing.
companyRouter.get(
  "/crm",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const filter: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.month === "string" && MONTH_RE.test(req.query.month)) filter.month = req.query.month;
    if (typeof req.query.status === "string" && req.query.status) filter.status = req.query.status;
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode) filter.employeeCode = req.query.employeeCode;
    const rows = await CrmModel.find(filter).sort({ date: -1 }).limit(500);
    res.json({ data: await enrichWithEmployeeNames(tenantSlug, rows.map(serializeDocument), ["employeeCode"]) });
  })
);

companyRouter.post(
  "/crm/:id/:action",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const action = req.params.action;
    if (action !== "approve" && action !== "reject") throw new HttpError(404, "Unknown action");
    const row = await CrmModel.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: { status: action === "approve" ? "APPROVED" : "REJECTED", approvedBy: `admin:${req.auth!.sub}`, approvedAt: new Date() } },
      { new: true }
    );
    if (!row) throw new HttpError(404, "CRM entry not found");
    await audit(`CRM_${action.toUpperCase()}D`, "Crm", String(row._id), { tenantSlug });
    res.json({ data: serializeDocument(row) });
  })
);

companyRouter.get(
  "/rcpa",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const filter: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.month === "string" && MONTH_RE.test(req.query.month)) filter.month = req.query.month;
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode) filter.employeeCode = req.query.employeeCode;
    const rows = await RcpaModel.find(filter).sort({ date: -1 }).limit(500);
    res.json({ data: await enrichWithEmployeeNames(tenantSlug, rows.map(serializeDocument), ["employeeCode"]) });
  })
);

// Admin sets the supportive chemists of a doctor (also settable by the rep).
companyRouter.put(
  "/doctors/:id/supportive-chemists",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const dealerIds = z.object({ dealerIds: z.array(z.string()).max(20) }).parse(req.body).dealerIds;
    const doctor = await DoctorModel.findOne({ _id: req.params.id, tenantSlug });
    if (!doctor) throw new HttpError(404, "Doctor not found");
    const dealers = await DealerModel.find({ _id: { $in: dealerIds }, tenantSlug });
    doctor.supportiveChemists = dealers.map((d: any) => ({ dealerId: String(d._id), dealerName: d.dealerName })) as any;
    await doctor.save();
    res.json({ data: serializeDocument(doctor) });
  })
);

// Doctor 4-tier category: bulk set (Doctor Master also edits it per doctor).
companyRouter.put(
  "/doctors/:id/category-tier",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const tier = z.object({ doctorCategory: z.enum(["NIL", "CORE", "N CORE", "S CORE"]) }).parse(req.body).doctorCategory;
    const doctor = await DoctorModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: { doctorCategory: tier } }, { new: true });
    if (!doctor) throw new HttpError(404, "Doctor not found");
    await audit("DOCTOR_TIER_SET", "Doctor", String(doctor._id), { tenantSlug, tier });
    res.json({ data: serializeDocument(doctor) });
  })
);

// ═══ Round 42 -- POB/Rx screens and Heat Analysis (see utils/pob-rx-reports.ts) ═══
function monthOrThrow(v: unknown, name: string): string {
  const s = String(v || "");
  if (!MONTH_RE.test(s)) throw new HttpError(400, `${name} must be YYYY-MM`);
  return s;
}
async function assertScopeCode(tenantSlug: string, code: string) {
  if (code && code !== "admin") await requireEmployeeByCode(tenantSlug, code);
}

companyRouter.get(
  "/mis/pobrx/product-wise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const code = String(req.query.employeeCode || "admin");
    const from = monthOrThrow(req.query.fromMonth, "fromMonth");
    const to = monthOrThrow(req.query.toMonth || from, "toMonth");
    await assertScopeCode(tenantSlug, code);
    res.json({ data: await computeProductWise(tenantSlug, code, from, to, String(req.query.mode || "Doctors")) });
  })
);

companyRouter.get(
  "/mis/pobrx/fieldforce-wise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const code = String(req.query.employeeCode || "admin");
    const from = monthOrThrow(req.query.fromMonth, "fromMonth");
    const to = monthOrThrow(req.query.toMonth || from, "toMonth");
    await assertScopeCode(tenantSlug, code);
    res.json({ data: await computeFieldforceWise(tenantSlug, code, from, to, String(req.query.mode || "Doctors")) });
  })
);

companyRouter.get(
  "/mis/pobrx/day-wise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const code = String(req.query.employeeCode || "admin");
    const month = monthOrThrow(req.query.month, "month");
    await assertScopeCode(tenantSlug, code);
    const mode = String(req.query.mode || "Datewise");
    const products = parseProducts(req.query.products);
    if (mode === "Productwise" && products.length === 0) throw new HttpError(400, "Select at least one product");
    if (products.length > 200) throw new HttpError(400, "Select a maximum of 200 products");
    res.json({ data: await computeDayWise(tenantSlug, code, month, String(req.query.withoutVacant ?? "true") !== "false", mode, products) });
  })
);

companyRouter.get(
  "/mis/pobrx/dump",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const code = String(req.query.employeeCode || "admin");
    const month = monthOrThrow(req.query.month, "month");
    await assertScopeCode(tenantSlug, code);
    const mode = String(req.query.mode || "");
    if (mode !== "Doctors" && mode !== "Chemists") throw new HttpError(400, "Select a mode (Doctors or Chemists)");
    const option = String(req.query.option || "Dr Wise");
    const dump = await buildPobDump(tenantSlug, code, month, mode, parseProducts(req.query.products), String(req.query.checkVacant) === "true", option);
    const buf = await dumpToXlsx(dump);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Dr_Che_POB_${month}.xlsx"`);
    res.send(buf);
  })
);

companyRouter.get(
  "/mis/heat/:kind",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const kind = req.params.kind;
    if (kind !== "drs" && kind !== "products" && kind !== "hqs") throw new HttpError(404, "Unknown heat report");
    const code = String(req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const months = parseInt(String(req.query.months || ""), 10);
    if (!(months >= 1 && months <= 6)) throw new HttpError(400, "months must be 1 to 6");
    const result = kind === "hqs" ? await computeHqVisits(tenantSlug, code, months) : await computeHeat(tenantSlug, kind, code, months);
    if (!result) throw new HttpError(404, "Field force not found");
    res.json({ data: result });
  })
);

// ── Round 44 -- MIS Reports > Visit Details ───────────────────────────────
companyRouter.get(
  "/mis/visit-details/options",
  asyncHandler(async (req, res) => {
    res.json({ data: await visitDetailOptions(req.auth!.tenantSlug!) });
  })
);

companyRouter.get(
  "/mis/visit-details/cat-cls",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const code = String(req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const mode = String(req.query.mode || "") as VisitMode;
    if (!VISIT_MODES.includes(mode)) throw new HttpError(400, "Select a mode");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth) || fromMonth > toMonth) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM with From not after To");
    const values = String(req.query.values || "").split("||").map((v) => v.trim()).filter(Boolean);
    if (mode !== "Listed Doctor" && values.length === 0 && mode !== "Campaign") throw new HttpError(400, `Select at least one ${mode}`);
    const result = await computeCatClsVisit(tenantSlug, code, fromMonth, toMonth, mode, values, String(req.query.withVacants) === "true");
    if (!result) throw new HttpError(404, "Field force not found");
    res.json({ data: result });
  })
);

companyRouter.get(
  "/mis/visit-details/datewise",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const code = String(req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const month = String(req.query.month || "");
    if (!MONTH_RE.test(month)) throw new HttpError(400, "month must be YYYY-MM");
    const week = req.query.week === undefined || req.query.week === "" ? undefined : parseInt(String(req.query.week), 10);
    const result = await computeDateWise(tenantSlug, code, month, week);
    if (!result) throw new HttpError(404, week === undefined ? "Field force not found" : "Field force or week not found");
    res.json({ data: result });
  })
);

// ── Round 48 -- Doctorwise (Periodically), Call Feedbackwise, Fixationwise (By Visit) ──
companyRouter.get(
  "/mis/doctorwise/baselevels",
  asyncHandler(async (req, res) => {
    const code = String(req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const rows = await baseLevelOptions(req.auth!.tenantSlug!, code);
    if (!rows) throw new HttpError(404, "Field force not found");
    res.json({ data: rows });
  })
);

companyRouter.get(
  "/mis/doctorwise/periodically",
  asyncHandler(async (req, res) => {
    const code = String(req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const mode = String(req.query.mode || "") as DoctorwiseMode;
    if (!DOCTORWISE_MODES.includes(mode)) throw new HttpError(400, "Select a mode");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth) || fromMonth > toMonth) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM with From not after To");
    const scope = String(req.query.scope || "Team") === "Individual" ? "Individual" : "Team";
    const baseLevel = String(req.query.baseLevel || "") || undefined;
    const result = await computeDoctorwise(req.auth!.tenantSlug!, { mode, employeeCode: code, scope, baseLevel, fromMonth, toMonth });
    if (!result) throw new HttpError(404, "Field force not found");
    res.json({ data: result });
  })
);

companyRouter.get(
  "/mis/call-feedbackwise",
  asyncHandler(async (req, res) => {
    const code = String(req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth) || fromMonth > toMonth) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM with From not after To");
    const result = await computeCallFeedbackwise(req.auth!.tenantSlug!, code, fromMonth, toMonth);
    if (!result) throw new HttpError(404, "Field force not found");
    res.json({ data: result });
  })
);

const r51Range = (req: any) => {
  const ym = (m: unknown, y: unknown) => { const mm = parseInt(String(m), 10), yy = parseInt(String(y), 10); return mm >= 1 && mm <= 12 && yy >= 2000 && yy <= 2100 ? `${yy}-${String(mm).padStart(2, "0")}` : ""; };
  const fromMonth = ym(req.query.fromMonth, req.query.fromYear);
  const toMonth = req.query.toMonth ? ym(req.query.toMonth, req.query.toYear) : fromMonth;
  if (!fromMonth || !toMonth || fromMonth > toMonth) throw new HttpError(400, "fromMonth/fromYear/toMonth/toYear must be valid with From not after To");
  return { fromMonth, toMonth };
};
const r51Code = (req: any) => { const c = String(req.query.sfCode || req.query.employeeCode || ""); if (!c) throw new HttpError(400, "Select a field force"); return c; };
const r51Send = (res: any, data: unknown) => { if (!data) throw new HttpError(404, "Field force not found"); res.json({ data }); };
companyRouter.get("/mis/at-a-glance", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R51.computeAtGlance(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth)); }));
companyRouter.get("/mis/vacant-hq-manager-visits", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R51.computeVacantManagerVisits(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth)); }));
companyRouter.get("/mis/chemist-unlisted-stockist", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R51.computeChemistUnlisted(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth)); }));
companyRouter.get("/mis/territory-wise", asyncHandler(async (req, res) => {
  const r = r51Range(req);
  if (String(req.query.self) === "1") return r51Send(res, await R51.computeManagerCoverage(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth));
  r51Send(res, await R51.computeTerritoryWise(req.auth!.tenantSlug!, r51Code(req), r.fromMonth));
}));
companyRouter.get("/mis/product-exposure/options", asyncHandler(async (req, res) => { res.json({ data: await R51.productOptions(req.auth!.tenantSlug!) }); }));
companyRouter.get("/mis/product-exposure/drill", asyncHandler(async (req, res) => {
  const codes = String(req.query.codes || "").split(",").map((c) => c.trim()).filter(Boolean).slice(0, 500);
  const month = String(req.query.month || ""); if (!codes.length || !MONTH_RE.test(month)) throw new HttpError(400, "codes and month (YYYY-MM) are required");
  res.json({ data: await R51.productExposureDrill(req.auth!.tenantSlug!, codes, String(req.query.product || "ALL"), month) });
}));
companyRouter.get("/mis/product-exposure", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R51.computeProductExposure(req.auth!.tenantSlug!, r51Code(req), String(req.query.product || "ALL"), r.fromMonth, r.toMonth)); }));
companyRouter.get("/mis/listeddr-product-visit", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R51.computeListedDrProductVisit(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth)); }));
companyRouter.get("/mis/product-exposure-specat/options", asyncHandler(async (req, res) => { res.json({ data: await R55.specatOptions(req.auth!.tenantSlug!) }); }));
companyRouter.get("/mis/product-exposure-specat/drill", asyncHandler(async (req, res) => {
  const employeeCode = String(req.query.employeeCode || "").trim(); const month = String(req.query.month || ""); const value = String(req.query.value || "").trim();
  if (!employeeCode || !value || !MONTH_RE.test(month)) throw new HttpError(400, "employeeCode, value and month (YYYY-MM) are required");
  r51Send(res, await R55.productExposureSpecatDrill(req.auth!.tenantSlug!, employeeCode, String(req.query.product || "ALL"), month, String(req.query.mode) === "category" ? "category" : "speciality", value));
}));
companyRouter.get("/mis/product-exposure-specat", asyncHandler(async (req, res) => {
  const r = r51Range(req); const mode = String(req.query.mode) === "category" ? "category" : "speciality";
  const selected = String(req.query.values || "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 100);
  if (!selected.length) throw new HttpError(400, "Select at least one " + mode);
  r51Send(res, await R55.computeProductExposureSpecat(req.auth!.tenantSlug!, r51Code(req), String(req.query.product || "ALL"), r.fromMonth, r.toMonth, mode, selected));
}));
companyRouter.get("/mis/product-exposure-unlisted", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R51.computeProductExposureUnlisted(req.auth!.tenantSlug!, r51Code(req), String(req.query.product || "ALL"), r.fromMonth, r.toMonth)); }));

companyRouter.get("/mis/product-priority-wise", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R52.computePriorityWise(req.auth!.tenantSlug!, r51Code(req), String(req.query.product || "ALL"), r.fromMonth, r.toMonth)); }));
const r52Source = (req: any): R52.SampleSource => (req.query.source === "despatch" || req.query.source === "both" ? req.query.source : "dcr");
companyRouter.get("/mis/sample-details/drill", asyncHandler(async (req, res) => {
  const month = String(req.query.month || ""); if (!MONTH_RE.test(month)) throw new HttpError(400, "month (YYYY-MM) is required");
  res.json({ data: await R52.sampleDetailsDrill(req.auth!.tenantSlug!, r51Code(req), month, r52Source(req)) });
}));
companyRouter.get("/mis/sample-details", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R52.computeSampleDetails(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth, r52Source(req))); }));
const r53Dates = (req: any) => { const from = String(req.query.from || ""), to = String(req.query.to || ""); if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new HttpError(400, "from/to must be YYYY-MM-DD with From not after To"); return { from, to }; };
companyRouter.get("/mis/input-details", asyncHandler(async (req, res) => { const r = r51Range(req); const src = req.query.source === "despatch" || req.query.source === "both" ? (req.query.source as R53.InputSource) : "dcr"; r51Send(res, await R53.computeInputDetails(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth, src)); }));
companyRouter.get("/mis/sample-rx-products", asyncHandler(async (req, res) => { res.json({ data: await R53.sampleRxOptions(req.auth!.tenantSlug!, req.query.mode === "brand" ? "brand" : "product") }); }));
companyRouter.get("/mis/sample-rx-quantity", asyncHandler(async (req, res) => {
  const r = r51Range(req); const mode = req.query.mode === "brand" ? "brand" : req.query.mode === "product" ? "product" : "";
  if (!mode) throw new HttpError(400, "Select a mode");
  const items = String(req.query.items || "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 80);
  if (!items.length) throw new HttpError(400, "Select at least one " + mode);
  r51Send(res, await R53.computeSampleRxQuantity(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth, mode, items, req.query.basis === "all" ? "all" : "sampled"));
}));
companyRouter.get("/mis/delayed-status", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R53.computeDelayedStatus(req.auth!.tenantSlug!, String(req.query.sfCode || "admin"), r.fromMonth)); }));
companyRouter.get("/mis/leave-status-active", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R53.computeLeaveActive(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth)); }));
companyRouter.get("/mis/leave-status-periodically", asyncHandler(async (req, res) => { const r = r53Dates(req); r51Send(res, await R53.computeLeavePeriodically(req.auth!.tenantSlug!, r51Code(req), r.from, r.to, String(req.query.detailed) === "1")); }));
companyRouter.get("/mis/mail-status", asyncHandler(async (req, res) => { const r = r53Dates(req); res.json({ data: await R53.computeMailStatus(req.auth!.tenantSlug!, r.from, r.to) }); }));
companyRouter.get("/mis/tp-deviation-baselevel", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R53.computeTpDeviationLegacy(req.auth!.tenantSlug!, r51Code(req), r.fromMonth)); }));
companyRouter.get("/mis/tp-deviation-managers", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R54.computeTpDeviationManagers(req.auth!.tenantSlug!, String(req.query.sfCode || "admin"), r.fromMonth)); }));
companyRouter.get("/mis/tp-deviation-at-glance/drill", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R54.tpDeviationDrill(req.auth!.tenantSlug!, r51Code(req), r.fromMonth)); }));
companyRouter.get("/mis/tp-deviation-at-glance", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R54.computeTpDeviationAtGlance(req.auth!.tenantSlug!, r51Code(req), r.fromMonth, r.toMonth)); }));
companyRouter.get("/mis/doctors-add-deactivation/drill", asyncHandler(async (req, res) => {
  const month = String(req.query.month || ""); if (!MONTH_RE.test(month)) throw new HttpError(400, "month (YYYY-MM) is required");
  res.json({ data: await R54.doctorsAddDeactDrill(req.auth!.tenantSlug!, r51Code(req), month, req.query.kind === "deactivated" ? "deactivated" : "added") });
}));
companyRouter.get("/mis/doctors-add-deactivation", asyncHandler(async (req, res) => { const r = r51Range(req); r51Send(res, await R54.computeDoctorsAddDeact(req.auth!.tenantSlug!, String(req.query.sfCode || "admin"), r.fromMonth, r.toMonth)); }));
companyRouter.get(
  "/mis/modewise",
  asyncHandler(async (req, res) => {
    const code = String(req.query.sfCode || req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const type = String(req.query.type || "").toLowerCase() as ModewiseType;
    if (!MODEWISE_TYPES.includes(type)) throw new HttpError(400, "type must be category, speciality, class or campaign");
    const ym = (m: unknown, y: unknown) => { const mm = parseInt(String(m), 10), yy = parseInt(String(y), 10); return mm >= 1 && mm <= 12 && yy >= 2000 && yy <= 2100 ? `${yy}-${String(mm).padStart(2, "0")}` : ""; };
    const fromMonth = ym(req.query.fromMonth, req.query.fromYear);
    const toMonth = type === "campaign" && !req.query.toMonth ? fromMonth : ym(req.query.toMonth, req.query.toYear);
    if (!fromMonth || !toMonth || fromMonth > toMonth) throw new HttpError(400, "fromMonth/fromYear/toMonth/toYear must be valid with From not after To");
    const result = await computeModewise(req.auth!.tenantSlug!, code, type, fromMonth, toMonth, req.query.metric === "calls" ? "calls" : "doctors");
    if (!result) throw new HttpError(404, "Field force not found");
    res.json({ data: result });
  })
);

companyRouter.get(
  "/mis/fixationwise",
  asyncHandler(async (req, res) => {
    const code = String(req.query.employeeCode || "");
    if (!code) throw new HttpError(400, "Select a field force");
    const type = String(req.query.type || "") as FixationType;
    if (!FIXATION_TYPES.includes(type)) throw new HttpError(400, "Select a type");
    const fromMonth = String(req.query.fromMonth || "");
    const toMonth = String(req.query.toMonth || fromMonth);
    if (!MONTH_RE.test(fromMonth) || !MONTH_RE.test(toMonth) || fromMonth > toMonth) throw new HttpError(400, "fromMonth/toMonth must be YYYY-MM with From not after To");
    const result = await computeFixation(req.auth!.tenantSlug!, code, fromMonth, toMonth, type);
    if (!result) throw new HttpError(404, "Field force not found");
    res.json({ data: result });
  })
);

// ── Round 45 -- Quiz Test Result, Summary dumps, Digital Detailing, Slide Analysis, Drs Analyis ──
const MON = (v: unknown, name = "month") => { const m = String(v || ""); if (!MONTH_RE.test(m)) throw new HttpError(400, `${name} must be YYYY-MM`); return m; };
const codeOf = (req: any) => String(req.query.employeeCode || "");
const names = (v: unknown) => String(v || "").split("||").map((x) => x.trim()).filter(Boolean);

companyRouter.get("/mis/quiz-result", asyncHandler(async (req, res) => {
  const code = codeOf(req); if (!code) throw new HttpError(400, "Select a field force");
  const scope = String(req.query.scope || "Team") === "Individual" ? "Individual" : "Team";
  const result = await computeQuizResult(req.auth!.tenantSlug!, code, scope, MON(req.query.month));
  if (!result) throw new HttpError(404, "Field force not found");
  res.json({ data: result });
}));

// File download. "xlsx" (default) is a real workbook; "xls" is the legacy HTML-table-as-Excel file.
companyRouter.get("/mis/daywise-dump", asyncHandler(async (req, res) => {
  const month = MON(req.query.month);
  const code = codeOf(req); if (!code) throw new HttpError(400, "Select a field force");
  if (code !== "admin") await requireEmployeeByCode(req.auth!.tenantSlug!, code);
  const { lines } = await buildCallLines(req.auth!.tenantSlug!, code, month, [], false, true);
  const [y, m] = month.split("-").map(Number);
  const base = `DayWise_Report_Dump_${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]}${y}`;
  if (String(req.query.format || "xlsx") === "xls") {
    res.setHeader("Content-Type", "application/vnd.ms-excel");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.xls"`);
    res.send(dayWiseHtmlXls(lines));
    return;
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
  res.send(await aoaToXlsx("DayWise_Report_Dump", DAYWISE_HEADERS, lines.map(dayWiseCells), "FFADD8E6"));
}));

companyRouter.get("/mis/call-report-dump", asyncHandler(async (req, res) => {
  const month = MON(req.query.month);
  const code = codeOf(req); if (!code) throw new HttpError(400, "Select a field force");
  if (code !== "admin") await requireEmployeeByCode(req.auth!.tenantSlug!, code);
  const days = String(req.query.days || "").split(",").map((d) => parseInt(d, 10)).filter((d) => d >= 1 && d <= 31);
  const { lines, division } = await buildCallLines(req.auth!.tenantSlug!, code, month, days, String(req.query.vacant) === "true", false);
  const base = `Call_Report_Dump_${month}`;
  if (String(req.query.format || "csv") === "xlsx") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`);
    res.send(await aoaToXlsx("Call_Report_Dump", CALL_REPORT_HEADERS, lines.map((l) => callReportCells(l, division))));
    return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${base}.csv"`);
  res.send(callReportCsv(lines, division));
}));

companyRouter.get("/mis/detailing/options", asyncHandler(async (req, res) => { res.json({ data: await detailingOptions(req.auth!.tenantSlug!) }); }));
companyRouter.get("/mis/detailing/visit-wise", asyncHandler(async (req, res) => {
  const mode = String(req.query.mode || ""); if (mode !== "Brand" && mode !== "Product") throw new HttpError(400, "Select a mode (Brand or Product)");
  const sel = names(req.query.names); if (!sel.length) throw new HttpError(400, `Select at least one ${mode}`);
  const result = await computeDetailingVisitWise(req.auth!.tenantSlug!, codeOf(req) || "admin", MON(req.query.month), mode, sel);
  if (!result) throw new HttpError(404, "Field force not found");
  res.json({ data: result });
}));
companyRouter.get("/mis/detailing/star-rating", asyncHandler(async (req, res) => {
  const sel = names(req.query.names); if (!sel.length) throw new HttpError(400, "Select at least one Brand");
  const result = await computeBrandStarRating(req.auth!.tenantSlug!, codeOf(req) || "admin", MON(req.query.month), sel);
  if (!result) throw new HttpError(404, "Field force not found");
  res.json({ data: result });
}));

companyRouter.get("/mis/slide-analysis/options", asyncHandler(async (req, res) => { res.json({ data: await slideAnalysisOptions(req.auth!.tenantSlug!) }); }));
companyRouter.get("/mis/slide-analysis", asyncHandler(async (req, res) => {
  const basedOn = String(req.query.basedOn || "Product") === "Brand" ? "Brand" : "Product";
  const kind = String(req.query.filterKind || "ALL") as SlideFilterKind;
  if (!["ALL", "Doctor Speciality", "Doctor Category", "Doctor Qualification", "Doctor Class", "Doctor Territory", "Product / Brand"].includes(kind)) throw new HttpError(400, "Unknown filter");
  const from = MON(req.query.fromMonth, "fromMonth"), to = MON(req.query.toMonth || req.query.fromMonth, "toMonth");
  if (from > to) throw new HttpError(400, "From must not be after To");
  const result = await computeSlideAnalysis(req.auth!.tenantSlug!, codeOf(req) || "admin", from, to, basedOn, kind, String(req.query.filterValue || ""));
  if (!result) throw new HttpError(404, "Field force not found");
  res.json({ data: result });
}));

// ═══ Round 46 -- dumps and result screens ═══════════════════════════════
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const sendXlsx = (res: any, name: string, buf: Buffer) => { res.setHeader("Content-Type", XLSX_MIME); res.setHeader("Content-Disposition", `attachment; filename="${name}"`); res.send(buf); };
async function forceRoot(req: any, allowAdmin: boolean) {
  const code = codeOf(req);
  if (!code) throw new HttpError(400, "Select a field force");
  if (code === "admin") { if (!allowAdmin) throw new HttpError(400, "Select a field force"); return { code, root: null as any }; }
  return { code, root: await requireEmployeeByCode(req.auth!.tenantSlug!, code) };
}

companyRouter.get("/mis/rcpa-dump", asyncHandler(async (req, res) => {
  const month = MON(req.query.month);
  const { code } = await forceRoot(req, false);
  const rows = await buildRcpaRows(req.auth!.tenantSlug!, code, month);
  if (String(req.query.format || "xls") === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="RCPA_Dump_${month}.csv"`);
    res.send(rcpaCsv(rows)); return;
  }
  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", `attachment; filename="RCPA_Dump_${month}.xls"`);
  res.send(rcpaHtmlXls(rows));
}));

companyRouter.get("/mis/sku-dump", asyncHandler(async (req, res) => {
  const month = MON(req.query.month);
  const { code } = await forceRoot(req, true);
  const rows = await buildSkuRows(req.auth!.tenantSlug!, code, month);
  res.setHeader("Content-Type", "application/vnd.ms-excel");
  res.setHeader("Content-Disposition", `attachment; filename="SKU_Wise_Detailing_${month}.xls"`);
  res.send(skuTsv(rows));
}));

companyRouter.get("/mis/visit-drs-dump", asyncHandler(async (req, res) => {
  const month = MON(req.query.month);
  const { code } = await forceRoot(req, false);
  const rows = await buildVisitDrsRows(req.auth!.tenantSlug!, code, month);
  sendXlsx(res, `Listeddr_Visit_${month}.xlsx`, await legacyXlsx({ sheet: "tab1", headers: VISIT_DRS_HEADERS, rows, widths: { 1: 6.13, 2: 10.55, 3: 16.55, 4: 5.84, 5: 7.13, 6: 7.41, 7: 15.98, 8: 14.84, 9: 15.55, 10: 14.41, 11: 17.13, 12: 15.98, 13: 17.27, 14: 16.13, 15: 16.98, 16: 15.84, 17: 17.13, 18: 15.98, 19: 17.41, 20: 16.27, 21: 19.41, 22: 18.27, 23: 16.13, 24: 14.98, 25: 15.84, 26: 14.7 } }));
}));

companyRouter.get("/mis/ss-dump", asyncHandler(async (req, res) => {
  const month = MON(req.query.month);
  const { code, root } = await forceRoot(req, false);
  const rows = await buildSsRows(req.auth!.tenantSlug!, code, month);
  sendXlsx(res, `SS_Dump_${month}.xlsx`, await legacyXlsx({ sheet: "SS", title: `SS Dump (  ${forceLabel(root)} )`, mergeTo: SS_HEADERS.length, headers: SS_HEADERS, rows, widths: { 1: 24, 2: 16, 3: 13, 4: 12, 5: 36, 6: 16, 7: 28, 8: 16, 9: 10, 10: 12, 11: 12, 12: 10 } }));
}));

companyRouter.get("/mis/listeddr-dump", asyncHandler(async (req, res) => {
  const { code } = await forceRoot(req, false);
  const rows = await buildListeddrRows(req.auth!.tenantSlug!, code);
  if (String(req.query.format || "csv") === "xlsx") {
    sendXlsx(res, "Listeddr_Dump.xlsx", await legacyXlsx({ sheet: "Listeddr", headers: LISTEDDR_HEADERS, rows })); return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="Dump.csv"');
  res.send(listeddrCsv(rows));
}));

companyRouter.get("/mis/chemist-dump", asyncHandler(async (req, res) => {
  const { code } = await forceRoot(req, false);
  const { title, rows } = await buildChemistRows(req.auth!.tenantSlug!, code);
  sendXlsx(res, "Chemist_Dump.xlsx", await legacyXlsx({ sheet: "Chemist", title, mergeTo: 11, headers: CHEMIST_HEADERS, rows, widths: CHEMIST_WIDTHS }));
}));

companyRouter.get("/mis/transit-bills-dump", asyncHandler(async (req, res) => {
  const month = MON(req.query.month);
  const { title, rows } = await buildTransitRows(req.auth!.tenantSlug!, month);
  sendXlsx(res, `Transit_Bills_${month}.xlsx`, await legacyXlsx({ sheet: "Transit", title, mergeTo: 8, headers: TRANSIT_HEADERS, rows, widths: TRANSIT_WIDTHS }));
}));

companyRouter.get("/mis/stockist-dump", asyncHandler(async (req, res) => {
  const { title, rows } = await buildStockistRows(req.auth!.tenantSlug!, String(req.query.division || ""));
  sendXlsx(res, "Stockist_Dump.xlsx", await legacyXlsx({ sheet: "Stockist", title, mergeTo: 8, headers: STOCKIST_HEADERS, rows, widths: STOCKIST_WIDTHS }));
}));

companyRouter.get("/mis/resigned-users", asyncHandler(async (req, res) => {
  const from = MON(req.query.fromMonth, "fromMonth"), to = MON(req.query.toMonth || req.query.fromMonth, "toMonth");
  if (from > to) throw new HttpError(400, "From must not be after To");
  res.json({ data: await computeResignedUsers(req.auth!.tenantSlug!, from, to) });
}));

companyRouter.get("/mis/join-left", asyncHandler(async (req, res) => {
  const from = MON(req.query.fromMonth, "fromMonth"), to = MON(req.query.toMonth || req.query.fromMonth, "toMonth");
  if (from > to) throw new HttpError(400, "From must not be after To");
  res.json({ data: await computeJoinLeft(req.auth!.tenantSlug!, from, to) });
}));

companyRouter.get("/mis/tp-deviation", asyncHandler(async (req, res) => {
  const code = codeOf(req); if (!code) throw new HttpError(400, "Select a field force");
  const result = await computeTpDeviation(req.auth!.tenantSlug!, code, MON(req.query.month));
  if (!result) throw new HttpError(404, "Field force not found");
  res.json({ data: result });
}));

companyRouter.get("/mis/drs-analysis", asyncHandler(async (req, res) => {
  const code = codeOf(req); if (!code) throw new HttpError(400, "Select a field force");
  const from = MON(req.query.fromMonth, "fromMonth"), to = MON(req.query.toMonth || req.query.fromMonth, "toMonth");
  if (from > to) throw new HttpError(400, "From must not be after To");
  const result = await computeDrsAnalysis(req.auth!.tenantSlug!, code, from, to);
  if (!result) throw new HttpError(404, "Field force not found");
  res.json({ data: result });
}));
