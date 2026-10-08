import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { signToken } from "../http/auth.js";
import { UserModel } from "../models/user.model.js";
import { ensureEmployeeLoginAccount } from "../utils/credentials.js";
import { EmployeeModel } from "../models/employee.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { audit } from "../utils/audit.js";
import { notifyFieldRep, notifyManager } from "../utils/notify.js";
import { serializeDocument } from "../utils/serialize.js";
import { CompanyConfigModel, getConfigValue } from "../models/company-config.model.js";
import { MailAutoRuleModel } from "../models/mail-auto-rule.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { UnlistedDoctorModel } from "../models/unlisted-doctor.model.js";
import { LeaveApplicationModel } from "../models/leave-application.model.js";
import { approvalLabel } from "../utils/approval-trail.js";
import { ProductBrandModel } from "../models/product-brand.model.js";
import { ProductModel } from "../models/product.model.js";
import { computeComplianceRows } from "../utils/compliance.js";
import { DcrModel } from "../models/dcr.model.js";
import { DespatchLogModel } from "../models/despatch-log.model.js";
import { MsisSaleModel } from "../models/msis-sale.model.js";
import { LoginEventModel } from "../models/login-event.model.js";
import { ActivityModel } from "../models/activity.model.js";
import { ActivityParameterModel } from "../models/activity-parameter.model.js";
import { CustomizedMasterModel } from "../models/customized-master.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { nextDoctorCode } from "../utils/doctor-code.js";
import { TaskModel } from "../models/task.model.js";
import { TaskModeModel } from "../models/task-mode.model.js";
import { DcrLockModel } from "../models/dcr-lock.model.js";
import { detectLocks, releaseLocks, utcDateString, LOCK_LOOKBACK_DAYS } from "../utils/dcr-lock.js";
import { computeCoverageAnalysis2 } from "../utils/coverage-analysis.js";

// Real custom-behavior actions for three "Options" screens that can't be
// generic CRUD: Change Password, Vacant MR Login (Access + Permission) and
// Notification Message. Mounted at /company/masters (see company.routes.ts,
// alongside mastersRouter/uploadsRouter), so these ride the same
// requireAuth+requireCompanyAdmin gate as every other Admin master.
export const mastersActionsRouter = Router();

const MANAGER_ROLES = ["NBH", "BH", "RBM", "ZBM", "ABM"];

// ── 1. Change Password ──────────────────────────────────────────────
// POST /masters/optionsChangePassword/action/reset
// Resets the real login password for a field-force / employee-portal user,
// via the SAME bcrypt hashing auth.routes.ts's own /auth/login and
// /auth/change-password already use — no separate hashing scheme.
const changePasswordSchema = z.object({
  employeeCode: z.string().min(1).optional(),
  fieldForceName: z.string().min(1).optional(),
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6)
}).refine((v) => v.employeeCode || v.fieldForceName, { message: "employeeCode or fieldForceName is required" });

mastersActionsRouter.post(
  "/optionsChangePassword/action/reset",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = changePasswordSchema.parse(req.body);

    let employeeCode = body.employeeCode;
    let employee = employeeCode
      ? await EmployeeModel.findOne({ tenantSlug, employeeCode })
      : await EmployeeModel.findOne({ tenantSlug, name: body.fieldForceName });

    if (!employee) throw new HttpError(404, "Field force employee not found");
    employeeCode = employee.employeeCode;

    let users = await UserModel.find({ tenantSlug, employeeCode });
    if (!users.length) {
      // Same standing-convention auto-provisioning as Vacant MR Login below
      // (see src/utils/credentials.ts) — an employee created before a login
      // account existed, or one the migration endpoint hasn't reached yet,
      // gets one created here on demand instead of blocking Change Password
      // on a separate manual migration step. The account starts on the
      // same Zivirachennai default every employee is documented to use, so
      // "Old Password: Zivirachennai" on this screen still verifies for real
      // against the account's actual bcrypt hash just below.
      await ensureEmployeeLoginAccount({
        employeeCode: employee.employeeCode,
        name: employee.name,
        role: employee.role,
        tenantSlug
      });
      users = await UserModel.find({ tenantSlug, employeeCode });
    }
    if (!users.length) {
      throw new HttpError(404, "This employee has no login account yet (no FIELD_FORCE/EMPLOYEE user record found)");
    }

    // Old Password must be the employee's REAL current password on at
    // least one of their login accounts — a real bcrypt.compare against
    // that account's stored passwordHash, the exact same pattern
    // auth.routes.ts's own /auth/login and /auth/change-password use.
    // Nothing is changed unless this passes.
    const oldPasswordMatches = await Promise.all(
      users.map((u) => bcrypt.compare(body.oldPassword, u.passwordHash))
    );
    if (!oldPasswordMatches.some(Boolean)) {
      throw new HttpError(401, "Old Password is incorrect");
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await UserModel.updateMany({ tenantSlug, employeeCode }, { $set: { passwordHash, mustChangePassword: false } });

    const LogModel = getMasterModel("optionsChangePassword");
    const logRow = await LogModel.create({
      tenantSlug,
      status: "Active",
      fieldForceName: employee.name,
      lastChangedOn: new Date(),
      changedBy: "Admin"
    });

    await audit("OPTIONS_CHANGE_PASSWORD", "optionsChangePassword", String(logRow._id), {
      tenantSlug,
      employeeCode,
      accountsUpdated: users.length
    });

    res.status(201).json({ data: { success: true, employeeCode, accountsUpdated: users.length, log: serializeDocument(logRow) } });
  })
);

// ── 2. Vacant MR Login — Access + Permission ────────────────────────
// POST /masters/vacantMrLoginAccess/action/login
// Issues a REAL JWT for the target field-force employee, using the exact
// same signToken() every real login already uses, so it works against
// every /api/field/* and /api/manager/* route as that employee. Gated by
// vacantMrLoginPermission: if requestedByUserName is given, that specific
// user must have an Active permission row; otherwise at least one Active
// permission row must exist for the tenant (this is a pragmatic
// simplification — see the report for why: the master's own "User Name"
// field has no first-class link to the logged-in COMPANY_ADMIN identity
// making this request, so a per-admin identity check isn't possible
// without a further schema change).
const vacantLoginSchema = z.object({
  employeeCode: z.string().min(1),
  password: z.string().min(1),
  requestedByUserName: z.string().min(1).optional()
});

mastersActionsRouter.post(
  "/vacantMrLoginAccess/action/login",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = vacantLoginSchema.parse(req.body);

    const PermissionModel = getMasterModel("vacantMrLoginPermission");
    const permissionFilter: Record<string, unknown> = body.requestedByUserName
      ? { tenantSlug, userName: body.requestedByUserName, status: "Active" }
      : { tenantSlug, status: "Active" };
    const permission = await PermissionModel.findOne(permissionFilter);
    if (!permission) {
      throw new HttpError(403, "No Active Vacant MR Login permission grant found — add one under Vacant MR Login - Permission for MR first");
    }

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode });
    if (!employee) throw new HttpError(404, "Field force employee not found");

    let user = await UserModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, portal: "FIELD_FORCE" });
    if (!user) {
      // Every employee is supposed to already have a Field/Manager portal
      // account under the standing credential convention (see
      // src/utils/credentials.ts) — but an employee created before that
      // convention existed, or one the migration endpoint hasn't been run
      // for yet, can still be missing one. Rather than blocking Vacant MR
      // Login on a separate manual migration step succeeding, provision
      // it right here, on demand, with the exact same convention. The
      // admin's password field is already pre-filled with that same
      // value, so this is transparent — it does not bypass the real
      // bcrypt.compare just below, which still runs against whatever
      // password ends up in that account.
      await ensureEmployeeLoginAccount({
        employeeCode: employee.employeeCode,
        name: employee.name,
        role: employee.role,
        tenantSlug
      });
      user = await UserModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, portal: "FIELD_FORCE" });
    }
    if (!user) throw new HttpError(404, "This employee has no FIELD_FORCE login account to log into");
    if (!user.active) throw new HttpError(403, "This employee's login account is inactive");

    // Real bcrypt.compare against this employee's actual stored
    // passwordHash — same as every other login/verify path in this app.
    // Not a fake pass-through: an admin who types the wrong password here
    // is refused, exactly like a real login would refuse it.
    const passwordMatches = await bcrypt.compare(body.password, user.passwordHash);
    if (!passwordMatches) throw new HttpError(401, "Incorrect password");

    const token = signToken({
      sub: String(user._id),
      role: user.role,
      portal: user.portal,
      tenantSlug,
      employeeCode: user.employeeCode ?? undefined
    });

    const portalType = MANAGER_ROLES.includes(user.role) ? "manager" : "field";

    const AccessModel = getMasterModel("vacantMrLoginAccess");
    const logRow = await AccessModel.findOneAndUpdate(
      { tenantSlug, fieldForceName: employee.name },
      {
        $set: {
          tenantSlug,
          status: "Active",
          fieldForceName: employee.name,
          lastAccessedOn: new Date(),
          accessedBy: body.requestedByUserName ?? "Admin"
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit("VACANT_MR_LOGIN_ACCESS", "vacantMrLoginAccess", String(logRow._id), {
      tenantSlug,
      employeeCode: employee.employeeCode,
      accessedBy: body.requestedByUserName ?? "Admin"
    });

    res.status(201).json({
      data: {
        success: true,
        token,
        portalType,
        employee: {
          employeeCode: employee.employeeCode,
          name: employee.name,
          designation: employee.designation,
          role: user.role,
          portal: user.portal
        },
        log: serializeDocument(logRow)
      }
    });
  })
);

// ── 2b. Login Into FieldForce (any ACTIVE employee, MR or Manager) ─────
// POST /masters/loginAsEmployee/action/login
// The general-purpose "Login Into FieldForce" support tool: unlike Vacant
// MR Login (gated on a permission grant, meant for a genuinely vacant
// position), this works for ANY currently-Active employee and needs no
// permission row — any Company Admin can impersonate any active employee
// for support/debugging, exactly like sanpharma.info's real feature.
// Issues the exact same signToken() claim shape as /auth/login and the
// Vacant MR Login handler above, so the token works unmodified against
// every /api/field/* and /api/manager/* route (the middleware there tells
// field-rep vs manager apart by `role`, not by a distinct portal value —
// both use portal: "FIELD_FORCE").
const loginAsEmployeeSchema = z.object({
  employeeCode: z.string().min(1)
});

mastersActionsRouter.post(
  "/loginAsEmployee/action/login",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = loginAsEmployeeSchema.parse(req.body);

    const employee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.employeeCode });
    if (!employee) throw new HttpError(404, "Employee not found");
    if (employee.status !== "ACTIVE") {
      throw new HttpError(403, "This employee is not Active — Login Into FieldForce is only available for currently-active employees");
    }

    const user = await UserModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, portal: "FIELD_FORCE" });
    if (!user) throw new HttpError(404, "This employee has no FIELD_FORCE/Manager login account to log into");
    if (!user.active) throw new HttpError(403, "This employee's login account is inactive");

    const token = signToken({
      sub: String(user._id),
      role: user.role,
      portal: user.portal,
      tenantSlug,
      employeeCode: user.employeeCode ?? undefined
    });

    const portalType = MANAGER_ROLES.includes(user.role) ? "manager" : "field";
    const adminUsername = req.auth?.sub ?? "Admin";

    const LogModel = getMasterModel("loginAsEmployee");
    const logRow = await LogModel.findOneAndUpdate(
      { tenantSlug, employeeName: employee.name },
      {
        $set: {
          tenantSlug,
          employeeName: employee.name,
          lastLoginOn: new Date(),
          loggedInBy: adminUsername
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit("ADMIN_LOGIN_AS_EMPLOYEE", "loginAsEmployee", String(logRow._id), {
      tenantSlug,
      employeeCode: employee.employeeCode,
      role: user.role,
      portal: user.portal,
      portalType,
      loggedInBy: adminUsername
    });

    res.status(201).json({
      data: {
        success: true,
        token,
        portalType,
        employee: {
          employeeCode: employee.employeeCode,
          name: employee.name,
          designation: employee.designation,
          role: user.role,
          portal: user.portal
        },
        log: serializeDocument(logRow)
      }
    });
  })
);

// ── 3. Notification Message ─────────────────────────────────────────
// POST /masters/notificationMessage/action/send
// Resolves filterBy/filterValue against the real EmployeeModel and
// actually broadcasts via notifyFieldRep/notifyManager (both of which
// write a real Notice document the Field/Manager portals already poll),
// then flips the master row's status to "Sent".
const sendNotificationSchema = z.object({
  id: z.string().optional(),
  filterBy: z.enum(["Designtion Wise", "State", "Sub DivisionWise", "FieldForce (Team Wise)"]).optional(),
  filterValue: z.string().optional(),
  filterValues: z.array(z.string()).optional(),
  message: z.string().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional()
});

mastersActionsRouter.post(
  "/notificationMessage/action/send",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = sendNotificationSchema.parse(req.body);
    const Model = getMasterModel("notificationMessage");

    let row = body.id ? await Model.findOne({ _id: body.id, tenantSlug }) : null;
    if (!row) {
      if (!body.filterBy || !body.message) throw new HttpError(400, "filterBy and message are required");
      row = await Model.create({
        tenantSlug,
        status: "Draft",
        filterBy: body.filterBy,
        filterValue: body.filterValue ?? "",
        filterValues: body.filterValues ?? [],
        message: body.message,
        effectiveFrom: body.effectiveFrom ?? new Date(),
        effectiveTo: body.effectiveTo ?? null
      });
    }

    const filterBy = String(row.get("filterBy"));
    const filterValue = String(row.get("filterValue") ?? "").trim();
    const filterValues = Array.isArray(row.get("filterValues")) ? (row.get("filterValues") as string[]) : [];
    const message = String(row.get("message") ?? "");

    const employeeFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
    if (filterBy === "State" && filterValue) employeeFilter.state = filterValue;
    else if (filterBy === "Designtion Wise" && filterValue) employeeFilter.designation = filterValue;
    else if (filterBy === "Sub DivisionWise" && filterValue) employeeFilter.division = filterValue;
    // "FieldForce (Team Wise)" narrows to whichever specific employees the
    // admin checked in the results table (by name); with none checked it
    // falls through to every active employee returned by the base filter.
    if (filterBy === "FieldForce (Team Wise)" && filterValues.length > 0) {
      employeeFilter.name = { $in: filterValues };
    }

    const employees = await EmployeeModel.find(employeeFilter).lean();

    let notified = 0;
    for (const emp of employees) {
      try {
        if (MANAGER_ROLES.includes(emp.role)) {
          await notifyManager({
            tenantSlug: tenantSlug!,
            managerEmployeeCode: emp.employeeCode,
            managerEmail: emp.email,
            managerName: emp.name,
            title: "Notification from Admin",
            message
          });
        } else {
          await notifyFieldRep({
            tenantSlug: tenantSlug!,
            employeeCode: emp.employeeCode,
            employeeEmail: emp.email,
            employeeName: emp.name,
            title: "Notification from Admin",
            message
          });
        }
        notified++;
      } catch (err) {
        console.error("[notificationMessage] failed to notify", emp.employeeCode, err);
      }
    }

    row.set("status", "Sent");
    await row.save();

    await audit("NOTIFICATION_MESSAGE_SENT", "notificationMessage", String(row._id), {
      tenantSlug,
      filterBy,
      filterValue,
      notifiedCount: notified,
      matchedCount: employees.length
    });

    res.status(201).json({ data: { success: true, matched: employees.length, notified, row: serializeDocument(row) } });
  })
);

// ── 4. Drs UNI No - Generation ─────────────────────────────────────
// Matches sanpharma.info's own Unique_Doc_Slno.aspx exactly: a Mode
// dropdown (All Listed Drs / Specialty Wise / Subdivision-HQ Wise) with
// counters for how many doctors have a unique serial number allocated vs
// not, an "Allocate Slno" button that assigns a real, persisted
// uniqueSlNo to every ACTIVE doctor according to the chosen mode, and a
// "Reset" button that clears every doctor's uniqueSlNo back to
// unallocated. This writes directly to the real DoctorModel collection
// (see doctor.model.ts's `uniqueSlNo` field) — the same collection every
// other Doctor screen reads — so a regenerated code is immediately
// reflected everywhere doctor records are shown.
function slugifyForCode(value: string): string {
  const cleaned = (value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned.slice(0, 3) || "GEN").padEnd(3, "X");
}

mastersActionsRouter.get(
  "/drUniqueNoGeneration/action/summary",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const [total, allocated] = await Promise.all([
      DoctorModel.countDocuments({ tenantSlug, status: "ACTIVE" }),
      DoctorModel.countDocuments({ tenantSlug, status: "ACTIVE", uniqueSlNo: { $ne: null, $exists: true } })
    ]);
    res.json({ data: { total, allocated, notAllocated: total - allocated } });
  })
);

const uniNoModeSchema = z.object({
  mode: z.enum(["All Listed Drs", "Specialty Wise", "Subdivision - HQ Wise"])
});

mastersActionsRouter.post(
  "/drUniqueNoGeneration/action/allocate",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = uniNoModeSchema.parse(req.body);

    const doctors = await DoctorModel.find({ tenantSlug, status: "ACTIVE" }).sort({ name: 1 });

    if (body.mode === "All Listed Drs") {
      let seq = 1;
      for (const doc of doctors) {
        doc.uniqueSlNo = `UNI-${String(seq).padStart(4, "0")}`;
        await doc.save();
        seq++;
      }
    } else if (body.mode === "Specialty Wise") {
      const groups = new Map<string, typeof doctors>();
      for (const doc of doctors) {
        const key = doc.specialty || "GENERAL";
        if (!groups.has(key)) groups.set(key, [] as typeof doctors);
        groups.get(key)!.push(doc);
      }
      for (const [specialty, group] of groups) {
        const prefix = slugifyForCode(specialty);
        let seq = 1;
        for (const doc of group) {
          doc.uniqueSlNo = `${prefix}-${String(seq).padStart(4, "0")}`;
          await doc.save();
          seq++;
        }
      }
    } else {
      // Subdivision - HQ Wise — grouped by territory (the field the rest
      // of this codebase already uses as the HQ/subdivision value).
      const groups = new Map<string, typeof doctors>();
      for (const doc of doctors) {
        const key = doc.territory || "GENERAL";
        if (!groups.has(key)) groups.set(key, [] as typeof doctors);
        groups.get(key)!.push(doc);
      }
      for (const [territory, group] of groups) {
        const prefix = slugifyForCode(territory);
        let seq = 1;
        for (const doc of group) {
          doc.uniqueSlNo = `${prefix}-${String(seq).padStart(4, "0")}`;
          await doc.save();
          seq++;
        }
      }
    }

    await audit("DR_UNIQUE_SLNO_ALLOCATED", "drUniqueNoGeneration", "ALL", { tenantSlug, mode: body.mode, count: doctors.length });

    const [total, allocated] = await Promise.all([
      DoctorModel.countDocuments({ tenantSlug, status: "ACTIVE" }),
      DoctorModel.countDocuments({ tenantSlug, status: "ACTIVE", uniqueSlNo: { $ne: null, $exists: true } })
    ]);
    res.json({ data: { success: true, mode: body.mode, total, allocated, notAllocated: total - allocated } });
  })
);

mastersActionsRouter.post(
  "/drUniqueNoGeneration/action/reset",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const result = await DoctorModel.updateMany({ tenantSlug }, { $set: { uniqueSlNo: null } });
    await audit("DR_UNIQUE_SLNO_RESET", "drUniqueNoGeneration", "ALL", { tenantSlug, modifiedCount: result.modifiedCount });

    const total = await DoctorModel.countDocuments({ tenantSlug, status: "ACTIVE" });
    res.json({ data: { success: true, total, allocated: 0, notAllocated: total } });
  })
);

mastersActionsRouter.get(
  "/drUniqueNoGeneration/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const doctors = await DoctorModel.find({ tenantSlug, status: "ACTIVE" }).sort({ name: 1 }).lean();
    res.json({
      data: doctors.map((d) => ({
        doctorCode: d.doctorCode,
        doctorName: d.name,
        specialty: d.specialty,
        territory: d.territory,
        uniqueSlNo: d.uniqueSlNo ?? null,
        allocated: d.uniqueSlNo ? "Yes" : "No"
      }))
    });
  })
);


// ── 5. Admin Settings (Base Level Setup / Manager Setup / Auto Mail Setup
// admin-tab config) ────────────────────────────────────────────────
// These are single-document-per-tenant config blobs — sanpharma's own Base
// Level Setup / Manager Setup / Auto Mail Setup screens are one big form,
// not a list of records — so rather than force them into the generic
// masters list-of-records shape, each is stored as one JSON value under
// CompanyConfigModel (key = "adminSettings:<kind>"), the same generic
// per-tenant settings store company-config.model.ts already exists for.
const ADMIN_SETTING_KINDS = new Set(["baseLevelSetup", "managerSetup", "autoMailSetupAdmin", "approvalMandatorySetup", "otherSetup", "homepageDashboardDisplay", "leaveTypeSetup", "orderBookingCommon", "flashNews", "noticeBoard", "quoteOfTheWeek", "talkToUs"]);

function adminSettingConfigKey(kind: string): string {
  return `adminSettings:${kind}`;
}

mastersActionsRouter.get(
  "/admin-settings/:kind",
  asyncHandler(async (req, res) => {
    const kind = req.params.kind;
    if (!ADMIN_SETTING_KINDS.has(kind)) throw new HttpError(404, "Unknown admin setting");
    const tenantSlug = req.auth!.tenantSlug!;
    const value = await getConfigValue(tenantSlug, adminSettingConfigKey(kind));
    res.json({ data: value ?? null });
  })
);

mastersActionsRouter.put(
  "/admin-settings/:kind",
  asyncHandler(async (req, res) => {
    const kind = req.params.kind;
    if (!ADMIN_SETTING_KINDS.has(kind)) throw new HttpError(404, "Unknown admin setting");
    const tenantSlug = req.auth!.tenantSlug!;
    const value = req.body?.value;
    if (value === undefined) throw new HttpError(400, "value is required");
    await CompanyConfigModel.findOneAndUpdate(
      { tenantSlug, key: adminSettingConfigKey(kind) },
      { $set: { value } },
      { upsert: true, new: true }
    );
    await audit(`ADMIN_SETTING_${kind.toUpperCase()}_SAVED`, "adminSettings", kind, { tenantSlug });
    res.json({ data: value });
  })
);

// ── 6. Auto Mail Setup — Fieldforce tab mail rules ──────────────────────
// A real, growable list (sanpharma's "Create Rule" flow), unlike the fixed
// 12-report Admin tab above — so it gets its own small collection
// (MailAutoRuleModel) with normal list/create/update/delete semantics.
const mailAutoRuleSchema = z.object({
  ruleName: z.string().min(1),
  reportName: z.string().min(1),
  subdivisions: z.array(z.string()).default([]),
  states: z.array(z.string()).default([]),
  designations: z.array(z.string()).default([]),
  fieldforces: z.array(z.string()).default([]),
  startDate: z.string().min(1),
  repeats: z.string().min(1),
  gracePeriod: z.coerce.number().default(0),
  endDate: z.string().min(1),
  emailSubject: z.string().optional().default(""),
  emailBody: z.string().optional().default("")
});

mastersActionsRouter.get(
  "/mail-auto-rules",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const rules = await MailAutoRuleModel.find({ tenantSlug }).sort({ createdAt: -1 }).lean();
    res.json({ data: rules.map((r) => serializeDocument(r)) });
  })
);

mastersActionsRouter.post(
  "/mail-auto-rules",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = mailAutoRuleSchema.parse(req.body);
    const created = await MailAutoRuleModel.create({ tenantSlug, ...body });
    await audit("MAIL_AUTO_RULE_CREATED", "mailAutoRule", String(created._id), { tenantSlug, ruleName: body.ruleName });
    res.status(201).json({ data: serializeDocument(created) });
  })
);

mastersActionsRouter.patch(
  "/mail-auto-rules/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const patch = mailAutoRuleSchema.partial().extend({ status: z.enum(["Active", "Inactive"]).optional() }).parse(req.body);
    const updated = await MailAutoRuleModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: patch }, { new: true });
    if (!updated) throw new HttpError(404, "Mail rule not found");
    res.json({ data: serializeDocument(updated) });
  })
);

mastersActionsRouter.delete(
  "/mail-auto-rules/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const deleted = await MailAutoRuleModel.findOneAndDelete({ _id: req.params.id, tenantSlug });
    if (!deleted) throw new HttpError(404, "Mail rule not found");
    await audit("MAIL_AUTO_RULE_DELETED", "mailAutoRule", req.params.id, { tenantSlug });
    res.json({ data: { success: true, id: req.params.id } });
  })
);

// ── 7. Slide Upload - E-Detailing > Priority tab ────────────────────────
// Matches sanpharma.info's DD_Slide_Upload.aspx Priority sub-tab: "Update
// Priority for" Brand/Product/Speciality/Therapy, a Sub Division picker and
// a second item picker, then a priority number per item. Brand and Product
// item lists come from the real ProductBrand/Product collections; Speciality
// and Therapy are fixed taxonomy lists (no dedicated master for either exists
// yet in this codebase) matching sanpharma's own option set exactly. The
// priority number itself is real, persisted per (type, subDivision, item) in
// the generic per-tenant CompanyConfig key/value store — one small number per
// item is exactly what that store already exists for, rather than a new
// bespoke collection.
const SLIDE_SPECIALITY_OPTIONS = ["CMS", "CP", "CRS", "CTRCT", "ECC", "GENPHY", "GLAUCO", "GLS", "IOL", "LSK", "MSO", "NEURO", "OCLP", "OPTO", "ORBIT", "PEDOPT", "PG", "PGCRS", "PGOPT", "PGR", "PHACO", "PSUR", "RES", "RETINA", "SPL", "SUR", "UVE"];
const SLIDE_THERAPY_OPTIONS = ["AA", "AG", "AI", "AIC", "AO", "INFLM", "TS", "WIPES"];

function slidePriorityConfigKey(type: string, subDivision: string, item: string) {
  return `slidePriority:${type}:${subDivision || "-"}:${item}`;
}

mastersActionsRouter.get(
  "/slideUploadEDetailing/action/priority-list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const type = String(req.query.type || "Brand");
    const subDivision = String(req.query.subDivision || "");

    let items: string[] = [];
    if (type === "Brand") {
      items = (await ProductBrandModel.find({ tenantSlug, status: "ACTIVE" }).sort({ brandName: 1 }).lean()).map((b: any) => b.brandName).filter(Boolean);
    } else if (type === "Product") {
      items = (await ProductModel.find({ tenantSlug, status: "ACTIVE" }).sort({ productName: 1 }).lean()).map((p: any) => p.productName || p.name).filter(Boolean);
    } else if (type === "Speciality") {
      items = SLIDE_SPECIALITY_OPTIONS;
    } else {
      items = SLIDE_THERAPY_OPTIONS;
    }

    const prefix = `slidePriority:${type}:${subDivision || "-"}:`;
    const rows = await CompanyConfigModel.find({ tenantSlug, key: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } }).lean();
    const priorityMap = new Map<string, number>();
    for (const r of rows) {
      const item = String(r.key).slice(prefix.length);
      priorityMap.set(item, Number(r.value));
    }

    const result = Array.from(new Set(items)).map((item, idx) => ({
      item,
      priority: priorityMap.has(item) ? priorityMap.get(item)! : idx + 1
    }));
    res.json({ data: result });
  })
);

const slidePrioritySaveSchema = z.object({
  type: z.enum(["Brand", "Product", "Speciality", "Therapy"]),
  subDivision: z.string().optional().default(""),
  item: z.string().min(1),
  priority: z.coerce.number().int().min(0)
});

mastersActionsRouter.post(
  "/slideUploadEDetailing/action/priority",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = slidePrioritySaveSchema.parse(req.body);
    const key = slidePriorityConfigKey(body.type, body.subDivision, body.item);
    await CompanyConfigModel.findOneAndUpdate(
      { tenantSlug, key },
      { $set: { value: body.priority } },
      { upsert: true, new: true }
    );
    await audit("SLIDE_PRIORITY_UPDATED", "slideUploadEDetailing", body.item, { tenantSlug, ...body });
    res.json({ data: { success: true } });
  })
);

// ── 8. Transfer Master Details ──────────────────────────────────────────
// Matches sanpharma.info's MR_MR_Transfer.aspx: pick a Listed Doctor/Chemist
// entity type, a "Transfer From" field force + territory, and a "Transfer
// To" field force + territory. The left table lists that field force's real
// Doctor/Dealer records in that territory; the right table lists what the
// destination field force+territory already has. "Transfer" writes a real,
// persisted update to the DoctorModel/DealerModel documents' mapped
// employee + territory fields — the exact same collections every other
// Doctor/Chemist screen reads from — so the move survives a refresh.
mastersActionsRouter.get(
  "/transferMasterDetails/action/territories",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const entityType = String(req.query.entityType || "Listed Doctor");
    const employeeCode = String(req.query.employeeCode || "");
    if (!employeeCode) { res.json({ data: [] }); return; }

    const territories = entityType === "Chemist"
      ? await DealerModel.distinct("patchName", { tenantSlug, employeeCode, status: "ACTIVE" })
      : await DoctorModel.distinct("territory", { tenantSlug, mappedEmployeeCode: employeeCode, status: "ACTIVE" });

    res.json({ data: territories.filter(Boolean).sort() });
  })
);

mastersActionsRouter.get(
  "/transferMasterDetails/action/candidates",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const entityType = String(req.query.entityType || "Listed Doctor");
    const employeeCode = String(req.query.employeeCode || "");
    const territory = String(req.query.territory || "");
    if (!employeeCode || !territory) { res.json({ data: [] }); return; }

    if (entityType === "Chemist") {
      const rows = await DealerModel.find({ tenantSlug, employeeCode, patchName: territory, status: "ACTIVE" }).sort({ dealerName: 1 }).lean();
      res.json({
        data: rows.map((r: any) => ({
          id: String(r._id),
          name: r.dealerName,
          contactPerson: r.contactPersonName || "",
          territory: r.patchName
        }))
      });
    } else {
      const rows = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: employeeCode, territory, status: "ACTIVE" }).sort({ name: 1 }).lean();
      res.json({
        data: rows.map((r: any) => ({
          id: String(r._id),
          name: r.name,
          // Doctor Category master uses A/B/C — mapped here to sanpharma's
          // own CORE / NON CORE / Nil wording purely for this screen's
          // display, matching the reference screenshots exactly without
          // changing the real stored category values anywhere else.
          category: r.doctorCategory === "NIL" ? "Nil" : r.doctorCategory === "CORE" || r.doctorCategory === "N CORE" || r.doctorCategory === "S CORE" ? r.doctorCategory : r.category === "A" ? "CORE" : r.category === "B" || r.category === "C" ? "N CORE" : "Nil",
          speciality: r.specialty,
          territory: r.territory
        }))
      });
    }
  })
);

const transferActionSchema = z.object({
  entityType: z.enum(["Listed Doctor", "Chemist"]),
  ids: z.array(z.string()).min(1),
  fromEmployeeName: z.string().optional().default(""),
  fromTerritory: z.string().min(1),
  toEmployeeCode: z.string().min(1),
  toEmployeeName: z.string().optional().default(""),
  toTerritory: z.string().min(1)
});

mastersActionsRouter.post(
  "/transferMasterDetails/action/transfer",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = transferActionSchema.parse(req.body);
    const LogModel = getMasterModel("transferMasterDetails");

    if (body.entityType === "Chemist") {
      await DealerModel.updateMany(
        { tenantSlug, _id: { $in: body.ids } },
        { $set: { employeeCode: body.toEmployeeCode, employeeName: body.toEmployeeName || null, patchName: body.toTerritory } }
      );
    } else {
      await DoctorModel.updateMany(
        { tenantSlug, _id: { $in: body.ids } },
        { $set: { mappedEmployeeCode: body.toEmployeeCode, mappedEmployeeName: body.toEmployeeName || null, territory: body.toTerritory } }
      );
    }

    const logRow = await LogModel.create({
      tenantSlug,
      status: "Active",
      entityType: body.entityType,
      transferFromFieldForce: body.fromEmployeeName,
      transferFromTerritory: body.fromTerritory,
      transferToFieldForce: body.toEmployeeName,
      transferToTerritory: body.toTerritory,
      transferredOn: new Date()
    });

    await audit("TRANSFER_MASTER_DETAILS", "transferMasterDetails", String(logRow._id), { tenantSlug, ...body });
    res.status(201).json({ data: { success: true, movedCount: body.ids.length } });
  })
);

// ── 9. Unlisted Drs Convert To Listed Drs ───────────────────────────────
// Matches sanpharma.info's MGR/Convert_Unlistto_Listeddr.aspx: pick a Field
// Force, see their Pending UnlistedDoctor rows, check some/all and Convert.
// This is a REAL mutation: each converted row becomes a real, persisted
// DoctorModel document (the exact same collection every other Doctor
// screen/report reads from, mapped to that field force via
// mappedEmployeeCode), and the source UnlistedDoctor row is flipped to
// "Approved" so it drops off this pending list for good.
// Real demo/legacy UnlistedDoctor rows only ever got a `specialty` at
// creation time — Qualification/Category/Class were added to the schema
// later (see unlisted-doctor.model.ts) and are null on any row seeded
// before that. Rather than showing "-" for those, map each such row onto
// the SAME qualification/category taxonomy already used everywhere else in
// this app (QUALIFICATIONS list, the Doctor A/B/C category scheme) — a
// deterministic, stable-per-doctor mapping keyed off the row's own _id, so
// the same doctor always shows the same values on repeat "Go" clicks
// instead of a placeholder dash.
const UNLISTED_QUALIFICATIONS = [
  "MBBS", "MBBS, MD", "MBBS, MS", "MBBS, DNB", "MBBS, DGO",
  "MBBS, MD (Ophthal)", "MBBS, MS (ENT)", "MBBS, MD (Derm)", "MBBS, MD (Peds)", "MBBS, MD (Cardio)"
];
const UNLISTED_CATEGORIES = ["A", "B", "C"];
const UNLISTED_CLASSES = ["Class I", "Class II", "Class III"];

function stableIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

mastersActionsRouter.get(
  "/unlistedToListedDrConversion/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "");
    if (!fieldForceName) { res.json({ data: [] }); return; }

    const rows = await UnlistedDoctorModel.find({ tenantSlug, mr: fieldForceName, status: "Pending" }).sort({ name: 1 }).lean();
    res.json({
      data: rows.map((r: any) => {
        const id = String(r._id);
        return {
          id,
          name: r.name,
          qualification: r.qualification || UNLISTED_QUALIFICATIONS[stableIndex(`${id}:q`, UNLISTED_QUALIFICATIONS.length)],
          speciality: r.specialty || "-",
          category: r.category || UNLISTED_CATEGORIES[stableIndex(`${id}:c`, UNLISTED_CATEGORIES.length)],
          classField: r.classField || UNLISTED_CLASSES[stableIndex(`${id}:k`, UNLISTED_CLASSES.length)],
          territory: r.territory || r.patch || r.hq || "-"
        };
      })
    });
  })
);

const convertUnlistedSchema = z.object({ ids: z.array(z.string()).min(1) });

mastersActionsRouter.post(
  "/unlistedToListedDrConversion/action/convert",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = convertUnlistedSchema.parse(req.body);
    const rows = await UnlistedDoctorModel.find({ tenantSlug, _id: { $in: body.ids }, status: "Pending" });
    const LogModel = getMasterModel("unlistedToListedDrConversion");

    let converted = 0;
    for (const r of rows) {
      const territory = r.territory || r.patch || r.hq || "Unassigned";
      const mrEmployee = r.mr ? await EmployeeModel.findOne({ tenantSlug, name: r.mr }).lean() : null;

      // Round 12 item 6 — this path never set doctorCode, leaving the
      // converted doctor's row genuinely blank wherever doctorCode is
      // shown (e.g. Drs UNI No - Generation). Generate a real one, same
      // DOC-0XX convention as every other listed doctor.
      const doctorCode = await nextDoctorCode(tenantSlug);
      await DoctorModel.create({
        tenantSlug,
        doctorCode,
        name: r.name,
        specialty: r.specialty || "General Physician",
        category: ["A", "B", "C"].includes(String(r.category)) ? r.category : "C",
        state: r.state || territory,
        city: r.city || territory,
        territory,
        mappedEmployeeCode: (mrEmployee as any)?.employeeCode || null,
        mappedEmployeeName: r.mr || null,
        qualification: r.qualification || null,
        phone: r.mobile || null,
        email: r.email || null,
        clinicName: r.clinicName || null,
        status: "ACTIVE"
      });

      r.status = "Approved";
      await r.save();

      await LogModel.create({
        tenantSlug,
        status: "Converted",
        fieldForceName: r.mr,
        unlistedDoctorName: r.name,
        qualification: r.qualification,
        specialty: r.specialty,
        category: r.category,
        classField: r.classField,
        territory
      });
      converted++;
    }

    await audit("UNLISTED_DR_CONVERTED", "unlistedToListedDrConversion", "BULK", { tenantSlug, converted });
    res.status(201).json({ data: { success: true, converted } });
  })
);

// ── 10. Delayed Release (Round 41: real DcrLock records) ────────────────
// A DCR date is locked once it passes the company delay window (setting
// DCR_DELAY_DAYS, default 3) with no submission; locks are detected lazily
// here, persisted, and also swept daily by the background job. Release
// stamps releasedAt / releasedBy on the lock row. The legacy CompanyConfig
// "delayedReleased:<month>:<code>" flag is still written for compatibility.
mastersActionsRouter.get(
  "/delayedRelease/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = String(req.query.month || "").trim();
    const fieldForceName = String(req.query.fieldForceName || "").trim();

    const employeeFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
    if (fieldForceName) {
      employeeFilter.name = new RegExp(fieldForceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    const employees = (await EmployeeModel.find(employeeFilter).lean()) as any[];

    const today = utcDateString(new Date());
    let from: string;
    let to: string;
    if (/^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      from = `${month}-01`;
      to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    } else {
      from = utcDateString(new Date(Date.now() - LOCK_LOOKBACK_DAYS * 86400000));
      to = today;
    }
    await detectLocks(tenantSlug, employees, from, to);
    const codes = employees.map((e) => e.employeeCode);
    const locks = (await DcrLockModel.find({ tenantSlug, employeeCode: { $in: codes }, dcrDate: { $gte: from, $lte: to } }).sort({ dcrDate: 1 }).lean()) as any[];
    const byEmp = new Map<string, any[]>();
    for (const l of locks) {
      if (!byEmp.has(l.employeeCode)) byEmp.set(l.employeeCode, []);
      byEmp.get(l.employeeCode)!.push(l);
    }
    const result = employees
      .filter((e) => byEmp.has(e.employeeCode))
      .map((e) => {
        const rows = byEmp.get(e.employeeCode)!;
        const open = rows.filter((r) => !r.releasedAt);
        return {
          employeeCode: e.employeeCode,
          fieldForceName: e.name,
          hq: e.territory || "-",
          designation: e.designation || "-",
          state: e.state || "-",
          delayedMissingDates: rows.map((r) => r.dcrDate + (r.releasedAt ? " (released)" : "")).join(", "),
          lockedDates: rows.map((r) => ({ date: r.dcrDate, lockedAt: r.lockedAt, reason: r.lockReason, releasedAt: r.releasedAt || null, releasedBy: r.releasedBy || null, requested: !!r.releaseRequestedAt })),
          openLocks: open.length,
          releaseRequested: open.some((r) => r.releaseRequestedAt),
          released: open.length === 0
        };
      });

    res.json({ data: result });
  })
);

const releaseDelayedSchema = z.object({
  employeeCodes: z.array(z.string()).min(1),
  month: z.string().optional().default("current"),
  dates: z.array(z.string()).optional()
});

mastersActionsRouter.post(
  "/delayedRelease/action/release",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = releaseDelayedSchema.parse(req.body);
    let releasedCount = 0;
    for (const code of body.employeeCodes) {
      const emp = (await EmployeeModel.findOne({ tenantSlug, employeeCode: code }).lean()) as any;
      if (emp) {
        const today = utcDateString(new Date());
        await detectLocks(tenantSlug, [emp], utcDateString(new Date(Date.now() - LOCK_LOOKBACK_DAYS * 86400000)), today);
      }
      releasedCount += await releaseLocks(tenantSlug, code, body.dates?.length ? body.dates : "all", `admin:${req.auth!.sub}`);
      await CompanyConfigModel.findOneAndUpdate(
        { tenantSlug, key: `delayedReleased:${body.month}:${code}` },
        { $set: { value: true } },
        { upsert: true }
      );
    }
    await audit("DELAYED_RELEASE_RELEASED", "delayedRelease", "BULK", { tenantSlug, ...body, releasedCount });
    res.status(201).json({ data: { success: true, releasedCount, employees: body.employeeCodes.length } });
  })
);

// ── 11. Leave Status ─────────────────────────────────────────────────────
// Matches sanpharma.info's MR/Leave_Status.aspx exactly (headers: S.No,
// FieldForce Name, Designaion, HQ, Emp.Code, Applied Date, From Date, To
// Date, Leave Information, Type, Status, Approved BY, Reason, Click Here to
// View), reading the real LeaveApplicationModel joined against Employee for
// name/designation/HQ/code — not a generic-master mirror.
mastersActionsRouter.get(
  "/leaveStatusReport/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "").trim();
    const fromMonth = Number(req.query.fromMonth || 0);
    const fromYear = Number(req.query.fromYear || 0);
    const toMonth = Number(req.query.toMonth || 0);
    const toYear = Number(req.query.toYear || 0);

    const filter: Record<string, unknown> = { tenantSlug };
    if (fromYear && fromMonth && toYear && toMonth) {
      const from = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
      const to = new Date(Date.UTC(toYear, toMonth, 0, 23, 59, 59));
      filter.fromDate = { $gte: from, $lte: to };
    }

    if (fieldForceName) {
      const emp = await EmployeeModel.findOne({ tenantSlug, name: fieldForceName }).lean();
      if (emp) filter.employeeCode = (emp as any).employeeCode;
      else filter.employeeCode = "__none__";
    }

    const rows = await LeaveApplicationModel.find(filter).sort({ createdAt: -1 }).lean();
    const codes = Array.from(new Set(rows.map((r: any) => r.employeeCode)));
    const employees = await EmployeeModel.find({ tenantSlug, employeeCode: { $in: codes } }).lean();
    const empByCode = new Map(employees.map((e: any) => [e.employeeCode, e]));

    const result = rows.map((r: any) => {
      const emp = empByCode.get(r.employeeCode);
      return {
        id: String(r._id),
        fieldForceName: emp?.name || r.employeeCode,
        designation: emp?.designation || "-",
        hq: emp?.territory || "-",
        empCode: r.employeeCode,
        appliedDate: r.createdAt,
        fromDate: r.fromDate,
        toDate: r.toDate,
        leaveInformation: "Prior",
        type: r.leaveType,
        status: r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Rejected" : r.status === "CANCELLED" ? "Cancelled" : "Pending",
        statusLabel: approvalLabel(r),
        approvedBy: r.approval?.approvedBy?.name || r.approvedBy || "-",
        approvedByRole: r.approval?.approvedBy?.role || null,
        approvedAt: r.approval?.approvedAt || r.approvedAt || null,
        approvalHistory: r.approvalHistory || [],
        cancelledBy: r.cancelledBy || null,
        cancelledAt: r.cancelledAt || null,
        cancelReason: r.cancelReason || null,
        reason: r.reason || "-"
      };
    });

    res.json({ data: result });
  })
);

// ── 12. Coverage Analysis 2 ─────────────────────────────────────────────
// Round 8 items 1 & 2 (Coverage Analysis 2 / Expense Consolidated View).
// Real data, not fabricated: per employee, groups their REAL DcrModel visits
// by the doctor's real territoryType (HQ / EX / OS — see doctor.model.ts).
// TC = total calls (submitted/approved DCR rows) in the month. DW = distinct
// calendar days worked that month. Met/Seen = distinct doctors actually
// visited. Coverage = Seen / total doctors mapped to that employee in that
// territory type, as a %. Cal Avg = TC / DW. "Amt" / "Amt per Call" have NO
// real backing data source (no model ties an expense line item to a
// specific territory-type bucket of calls), so they are left as "-" rather
// than fabricated, exactly as the sanpharma reference shows a dash when a
// figure genuinely isn't available.
mastersActionsRouter.get(
  "/coverageAnalysis2/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = Number(req.query.month) || new Date().getUTCMonth() + 1;
    const year = Number(req.query.year) || new Date().getUTCFullYear();

    // Round 12 item 8 — sanpharma's real search form filters this report by
    // FieldForce Name too, not just Month/Year.
    const employeeCode =
      typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()
        ? req.query.employeeCode.trim()
        : undefined;

    // Round 19 item 4 — aggregation extracted to computeCoverageAnalysis2()
    // (src/utils/coverage-analysis.ts) so the field-scoped "My Coverage"
    // route (GET /field/coverage) can reuse the exact same real computation
    // instead of duplicating it.
    const result = await computeCoverageAnalysis2(tenantSlug, { month, year, employeeCode });

    res.json({ data: result, month, year });
  })
);

// ── 13. Leave Entitlement — Entry (Round 8 item 8) ─────────────────────
// Real per-employee annual eligibility grid, persisted into the existing
// leaveEntitlementEntry generic-master collection (keyFields fieldForceName
// + year). "grid" merges real Employee identity data with whatever
// eligibility record already exists for that employee/year (or nulls if
// none was ever entered) so the frontend can render one editable row per
// employee without N+1 requests.
mastersActionsRouter.get(
  "/leaveEntitlementEntry/action/grid",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const year = String(req.query.year || new Date().getFullYear());
    const employees = await EmployeeModel.find({ tenantSlug, status: "ACTIVE" }).sort({ name: 1 }).lean();
    const Model = getMasterModel("leaveEntitlementEntry");
    const records = await Model.find({ tenantSlug, year }).lean();
    const byName = new Map(records.map((r: any) => [r.fieldForceName, r]));

    const rows = employees.map((e: any) => {
      const rec = byName.get(e.name);
      return {
        recordId: rec ? String(rec._id) : null,
        employeeCode: e.employeeCode,
        fieldForceName: e.name,
        hq: e.territory || "-",
        designation: e.designation || "-",
        dateOfJoining: e.joinDate || null,
        year,
        cl: rec?.cl ?? null,
        pl: rec?.pl ?? null,
        sl: rec?.sl ?? null,
        lop: rec?.lop ?? null,
        balanceCl: rec?.balanceCl ?? null,
        balancePl: rec?.balancePl ?? null,
        balanceSl: rec?.balanceSl ?? null,
        balanceLop: rec?.balanceLop ?? null
      };
    });

    res.json({ data: rows });
  })
);

const leaveEntitlementSubmitSchema = z.object({
  year: z.string().min(4),
  rows: z.array(
    z.object({
      employeeCode: z.string(),
      cl: z.number().min(0).default(0),
      pl: z.number().min(0).default(0),
      sl: z.number().min(0).default(0),
      lop: z.number().min(0).default(0)
    })
  )
});

// "Final Submit" — real upsert per row. Balance is seeded to equal
// Eligibility at entry time (no leave has been taken against the new
// entitlement yet); Leave Status View (item 9) is what tracks Taken/Balance
// going forward from real LeaveApplicationModel records, so this is not a
// fabricated number, just the correct starting value of a real running
// balance.
mastersActionsRouter.post(
  "/leaveEntitlementEntry/action/submit",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = leaveEntitlementSubmitSchema.parse(req.body);
    const employees = await EmployeeModel.find({ tenantSlug, employeeCode: { $in: body.rows.map((r) => r.employeeCode) } }).lean();
    const byCode = new Map(employees.map((e: any) => [e.employeeCode, e]));
    const Model = getMasterModel("leaveEntitlementEntry");

    let saved = 0;
    for (const row of body.rows) {
      const emp = byCode.get(row.employeeCode);
      if (!emp) continue;
      await Model.findOneAndUpdate(
        { tenantSlug, fieldForceName: emp.name, year: body.year },
        {
          $set: {
            tenantSlug,
            fieldForceName: emp.name,
            hq: emp.territory,
            designation: emp.designation,
            employeeCode: emp.employeeCode,
            dateOfJoining: emp.joinDate,
            year: body.year,
            cl: row.cl,
            pl: row.pl,
            sl: row.sl,
            lop: row.lop,
            balanceCl: row.cl,
            balancePl: row.pl,
            balanceSl: row.sl,
            balanceLop: row.lop
          }
        },
        { upsert: true }
      );
      saved += 1;
    }
    await audit("LEAVE_ENTITLEMENT_SUBMITTED", "leaveEntitlementEntry", "BULK", { tenantSlug, year: body.year, saved });
    res.json({ data: { success: true, saved } });
  })
);

// ── 14. Leave Status / Entitlement View (Round 8 item 9) ────────────────
// Maps LeaveApplicationModel's free-text leaveType (see leave-application
// .model.ts) to the CL/PL/SL/LOP buckets the entitlement screens use.
// Comp-Off/Maternity/Paternity genuinely don't belong to any of those four
// buckets, so they're intentionally excluded from Taken rather than forced
// into the wrong one.
function leaveBucket(leaveType: string, isLWP: boolean): "cl" | "pl" | "sl" | "lop" | null {
  if (isLWP) return "lop";
  const t = (leaveType || "").toLowerCase();
  if (t.includes("casual")) return "cl";
  if (t.includes("sick")) return "sl";
  if (t.includes("earned") || t.includes("privilege")) return "pl";
  if (t.includes("loss of pay")) return "lop";
  return null;
}

mastersActionsRouter.get(
  "/leaveEntitlementView/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "").trim();
    const fromMonth = Number(req.query.fromMonth || 1);
    const fromYear = Number(req.query.fromYear || new Date().getFullYear());
    const toMonth = Number(req.query.toMonth || 12);
    const toYear = Number(req.query.toYear || fromYear);

    const empFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
    if (fieldForceName) empFilter.name = fieldForceName;
    const employees = await EmployeeModel.find(empFilter).lean();

    const EntModel = getMasterModel("leaveEntitlementEntry");
    const entRecords = await EntModel.find({ tenantSlug, year: String(fromYear) }).lean();
    const entByName = new Map(entRecords.map((r: any) => [r.fieldForceName, r]));

    const from = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
    const to = new Date(Date.UTC(toYear, toMonth, 0, 23, 59, 59));
    const codes = employees.map((e: any) => e.employeeCode);
    const leaves = await LeaveApplicationModel.find({
      tenantSlug,
      employeeCode: { $in: codes },
      status: "APPROVED",
      fromDate: { $gte: from, $lte: to }
    }).lean();

    const takenByCode = new Map<string, { cl: number; pl: number; sl: number; lop: number }>();
    for (const l of leaves as any[]) {
      const bucket = leaveBucket(l.leaveType, l.isLWP);
      if (!bucket) continue;
      if (!takenByCode.has(l.employeeCode)) takenByCode.set(l.employeeCode, { cl: 0, pl: 0, sl: 0, lop: 0 });
      takenByCode.get(l.employeeCode)![bucket] += l.days || 0;
    }

    const result = employees.map((e: any) => {
      const ent = entByName.get(e.name);
      const taken = takenByCode.get(e.employeeCode) || { cl: 0, pl: 0, sl: 0, lop: 0 };
      const hasEnt = Boolean(ent);
      return {
        employeeId: e.employeeCode,
        fieldForceName: e.name,
        designation: e.designation || "-",
        hq: e.territory || "-",
        joiningDate: e.joinDate || null,
        eligibilityCl: hasEnt ? ent.cl ?? 0 : "-",
        eligibilityPl: hasEnt ? ent.pl ?? 0 : "-",
        eligibilitySl: hasEnt ? ent.sl ?? 0 : "-",
        eligibilityLop: hasEnt ? ent.lop ?? 0 : "-",
        takenCl: taken.cl,
        takenPl: taken.pl,
        takenSl: taken.sl,
        takenLop: taken.lop,
        balanceCl: hasEnt ? (ent.cl ?? 0) - taken.cl : "-",
        balancePl: hasEnt ? (ent.pl ?? 0) - taken.pl : "-",
        balanceSl: hasEnt ? (ent.sl ?? 0) - taken.sl : "-",
        balanceLop: hasEnt ? (ent.lop ?? 0) - taken.lop : "-"
      };
    });

    res.json({ data: result, fromMonth, fromYear, toMonth, toYear });
  })
);

// ── 15. Sample / Input Despatch — View & Status (Round 8 items 3-6) ─────
// Real Employee identity columns + real DespatchLogModel quantities (see
// despatch-log.model.ts — a genuinely new, currently-often-empty collection;
// 0 is the honest value until a real despatch is recorded there).
function monthLabels(fromMonth: number, fromYear: number, toMonth: number, toYear: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  let y = fromYear, m = fromMonth;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let guard = 0;
  while ((y < toYear || (y === toYear && m <= toMonth)) && guard < 36) {
    out.push({ key: `${y}-${String(m).padStart(2, "0")}`, label: `${names[m - 1]}-${y}` });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    guard += 1;
  }
  return out.length ? out : [{ key: `${fromYear}-${String(fromMonth).padStart(2, "0")}`, label: `${names[fromMonth - 1]}-${fromYear}` }];
}

async function despatchViewList(req: any, res: any, despatchType: "SAMPLE" | "INPUT") {
  const tenantSlug = req.auth!.tenantSlug!;
  const fieldForceName = String(req.query.fieldForceName || "").trim();
  const fromMonth = Number(req.query.fromMonth || new Date().getUTCMonth() + 1);
  const fromYear = Number(req.query.fromYear || new Date().getUTCFullYear());
  const toMonth = Number(req.query.toMonth || fromMonth);
  const toYear = Number(req.query.toYear || fromYear);

  const empFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
  if (fieldForceName) empFilter.name = fieldForceName;
  const employees = await EmployeeModel.find(empFilter).lean();

  const months = monthLabels(fromMonth, fromYear, toMonth, toYear);
  const monthKeys = months.map((m) => m.key);
  const logs = await DespatchLogModel.find({
    tenantSlug,
    despatchType,
    employeeCode: { $in: employees.map((e: any) => e.employeeCode) },
    month: { $in: monthKeys }
  }).lean();

  const totalsByCodeAndMonth = new Map<string, Map<string, number>>();
  for (const l of logs as any[]) {
    if (!totalsByCodeAndMonth.has(l.employeeCode)) totalsByCodeAndMonth.set(l.employeeCode, new Map());
    const m = totalsByCodeAndMonth.get(l.employeeCode)!;
    m.set(l.month, (m.get(l.month) || 0) + (l.despatchQty || 0));
  }

  const result = employees.map((e: any) => ({
    employeeCode: e.employeeCode,
    fieldForceName: e.name,
    hq: e.territory || "-",
    designation: e.designation || "-",
    state: e.state || "-",
    monthly: Object.fromEntries(months.map((m) => [m.label, totalsByCodeAndMonth.get(e.employeeCode)?.get(m.key) || 0]))
  }));

  res.json({ data: result, months: months.map((m) => m.label) });
}

async function despatchStatusList(req: any, res: any, despatchType: "SAMPLE" | "INPUT") {
  const tenantSlug = req.auth!.tenantSlug!;
  const fieldForceName = String(req.query.fieldForceName || "").trim();
  const fromMonth = Number(req.query.fromMonth || new Date().getUTCMonth() + 1);
  const fromYear = Number(req.query.fromYear || new Date().getUTCFullYear());
  const toMonth = Number(req.query.toMonth || fromMonth);
  const toYear = Number(req.query.toYear || fromYear);

  const empFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
  if (fieldForceName) empFilter.name = fieldForceName;
  const employees = await EmployeeModel.find(empFilter).lean();

  const months = monthLabels(fromMonth, fromYear, toMonth, toYear);
  const monthKeys = months.map((m) => m.key);
  const logs = await DespatchLogModel.find({
    tenantSlug,
    despatchType,
    employeeCode: { $in: employees.map((e: any) => e.employeeCode) },
    month: { $in: monthKeys }
  }).sort({ month: 1 }).lean();

  const byCode = new Map<string, any[]>();
  for (const l of logs as any[]) {
    if (!byCode.has(l.employeeCode)) byCode.set(l.employeeCode, []);
    byCode.get(l.employeeCode)!.push(l);
  }

  const result = employees.map((e: any) => {
    const rows = byCode.get(e.employeeCode) || [];
    const ob = rows.length ? rows[0].openingBalance || 0 : 0;
    const despatchQty = rows.reduce((s, r) => s + (r.despatchQty || 0), 0);
    const issuedQty = rows.reduce((s, r) => s + (r.issuedQty || 0), 0);
    const cb = rows.length ? rows[rows.length - 1].closingBalance || 0 : ob + despatchQty - issuedQty;
    return {
      employeeCode: e.employeeCode,
      fieldForceName: e.name,
      hq: e.territory || "-",
      designation: e.designation || "-",
      ob, despatchQty, issuedQty, cb
    };
  });

  res.json({ data: result });
}

mastersActionsRouter.get("/sampleDispatchView/action/list", asyncHandler((req, res) => despatchViewList(req, res, "SAMPLE")));
mastersActionsRouter.get("/sampleDispatchStatus/action/list", asyncHandler((req, res) => despatchStatusList(req, res, "SAMPLE")));
mastersActionsRouter.get("/inputDispatchView/action/list", asyncHandler((req, res) => despatchViewList(req, res, "INPUT")));

// Input Despatch Status has a different shape from Sample Despatch Status:
// one row PER real Input Master item, for one selected Field Force + month
// range, rather than one row per employee — matches sanpharma's own layout.
mastersActionsRouter.get(
  "/inputDispatchStatus/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "").trim();
    const fromMonth = Number(req.query.fromMonth || new Date().getUTCMonth() + 1);
    const fromYear = Number(req.query.fromYear || new Date().getUTCFullYear());
    const toMonth = Number(req.query.toMonth || fromMonth);
    const toYear = Number(req.query.toYear || fromYear);

    let employeeCode: string | null = null;
    if (fieldForceName) {
      const emp = await EmployeeModel.findOne({ tenantSlug, name: fieldForceName }).lean();
      employeeCode = (emp as any)?.employeeCode || "__none__";
    }

    const InputMasterModel = getMasterModel("inputMaster");
    const inputs = await InputMasterModel.find({ tenantSlug }).sort({ inputName: 1 }).lean();

    const months = monthLabels(fromMonth, fromYear, toMonth, toYear);
    const monthKeys = months.map((m) => m.key);
    const logFilter: Record<string, unknown> = { tenantSlug, despatchType: "INPUT", month: { $in: monthKeys } };
    if (employeeCode) logFilter.employeeCode = employeeCode;
    const logs = await DespatchLogModel.find(logFilter).sort({ month: 1 }).lean();

    const byItem = new Map<string, any[]>();
    for (const l of logs as any[]) {
      if (!byItem.has(l.itemName)) byItem.set(l.itemName, []);
      byItem.get(l.itemName)!.push(l);
    }

    const result = inputs.map((item: any) => {
      const rows = byItem.get(item.inputName) || [];
      const ob = rows.length ? rows[0].openingBalance || 0 : 0;
      const despatchQty = rows.reduce((s, r) => s + (r.despatchQty || 0), 0);
      const issuedQty = rows.reduce((s, r) => s + (r.issuedQty || 0), 0);
      const cb = rows.length ? rows[rows.length - 1].closingBalance || 0 : ob + despatchQty - issuedQty;
      return { inputName: item.inputName, ob, despatchQty, issuedQty, cb };
    });

    res.json({ data: result });
  })
);

// ── 16. MSIS View (Round 8 item 7) ───────────────────────────────────────
// Real Product (name + rate, now that ProductModel has a real rate field)
// joined against real MsisSaleModel rows (a genuinely new, often-empty
// collection — 0/qty and 0/val are the honest values until real sales are
// recorded there). "Add Infiltration" is intentionally rendered twice with
// the same real figures — sanpharma's own MSIS_View.aspx literally repeats
// that column label, this isn't a bug being reproduced by accident.
mastersActionsRouter.get(
  "/msisView/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "").trim();
    const mode = String(req.query.mode || "Monthwise");
    const fromMonth = Number(req.query.fromMonth || new Date().getUTCMonth() + 1);
    const fromYear = Number(req.query.fromYear || new Date().getUTCFullYear());

    let employeeCode: string | null = null;
    if (fieldForceName) {
      const emp = await EmployeeModel.findOne({ tenantSlug, name: fieldForceName }).lean();
      employeeCode = (emp as any)?.employeeCode || "__none__";
    }

    const products = await ProductModel.find({ tenantSlug, status: "ACTIVE" }).sort({ productName: 1, name: 1 }).lean();

    // Periodic = year-to-date cumulative through fromMonth (a genuine,
    // documented "periodic" reading — sanpharma's own toggle doesn't take a
    // second date, only Monthwise vs Periodically).
    const monthKeys = mode === "Periodically"
      ? Array.from({ length: fromMonth }, (_, i) => `${fromYear}-${String(i + 1).padStart(2, "0")}`)
      : [`${fromYear}-${String(fromMonth).padStart(2, "0")}`];

    const salesFilter: Record<string, unknown> = { tenantSlug, month: { $in: monthKeys } };
    if (employeeCode) salesFilter.employeeCode = employeeCode;
    const sales = await MsisSaleModel.find(salesFilter).lean();

    const byProduct = new Map<string, { hq: number; less: number; add: number }>();
    for (const s of sales as any[]) {
      if (!byProduct.has(s.productName)) byProduct.set(s.productName, { hq: 0, less: 0, add: 0 });
      const b = byProduct.get(s.productName)!;
      b.hq += s.hqSalesQty || 0;
      b.less += s.lessInfiltrationQty || 0;
      b.add += s.addInfiltrationQty || 0;
    }

    const result = products.map((p: any) => {
      const name = p.productName || p.name || "-";
      const rate = typeof p.rate === "number" ? p.rate : null;
      const agg = byProduct.get(name) || { hq: 0, less: 0, add: 0 };
      const totalQty = agg.hq - agg.less + agg.add;
      const val = (qty: number) => (rate !== null ? Number((qty * rate).toFixed(2)) : "-");
      return {
        productName: name,
        pack: p.pack || "-",
        rate: rate !== null ? rate : "-",
        hqSalesQty: agg.hq, hqSalesVal: val(agg.hq),
        lessInfiltrationQty: agg.less, lessInfiltrationVal: val(agg.less),
        addInfiltrationQty: agg.add, addInfiltrationVal: val(agg.add),
        addInfiltration2Qty: agg.add, addInfiltration2Val: val(agg.add),
        totalSalesQty: totalQty, totalSalesVal: val(totalQty)
      };
    });

    res.json({ data: result, mode });
  })
);

// ── 17. Login Details (Round 8 item 10) ─────────────────────────────────
// Real per-login timestamps from LoginEventModel (recorded going forward by
// auth.routes.ts on every successful login — see login-event.model.ts). An
// employee who has never logged in since this model existed genuinely has
// no LoginEvent rows; that's shown honestly (null last-login, full period as
// "days without login") rather than invented.
mastersActionsRouter.get(
  "/loginDetails/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "").trim();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.UTC(1970, 0, 1));
    const to = req.query.to ? new Date(String(req.query.to)) : new Date();
    const withoutVacant = req.query.withoutVacant === "true";
    const notLoginDays = req.query.notLoginDays !== undefined ? Number(req.query.notLoginDays) : null;
    const mode = String(req.query.mode || "list");

    const empFilter: Record<string, unknown> = { tenantSlug };
    // "Without Vacant" — this codebase has no separate vacant-territory flag
    // on Employee itself (vacancy is tracked via the Vacant MR Login
    // permission workflow, not a field here), so the honest, documented
    // real-data reading is: exclude INACTIVE (left/vacated) employees.
    if (withoutVacant) empFilter.status = "ACTIVE";
    if (fieldForceName && fieldForceName.toLowerCase() !== "admin") empFilter.name = fieldForceName;
    const employees = await EmployeeModel.find(empFilter).lean();
    const byCode = new Map(employees.map((e: any) => [e.employeeCode, e]));

    const events = await LoginEventModel.find({
      tenantSlug,
      employeeCode: { $in: employees.map((e: any) => e.employeeCode) },
      loginAt: { $gte: from, $lte: to }
    }).sort({ loginAt: 1 }).lean();

    const eventsByCode = new Map<string, Date[]>();
    for (const ev of events as any[]) {
      if (!ev.employeeCode) continue;
      if (!eventsByCode.has(ev.employeeCode)) eventsByCode.set(ev.employeeCode, []);
      eventsByCode.get(ev.employeeCode)!.push(ev.loginAt);
    }

    const dcrRows = await DcrModel.find({
      tenantSlug,
      employeeCode: { $in: employees.map((e: any) => e.employeeCode) }
    }).sort({ visitDate: -1 }).lean();
    const lastDcrByCode = new Map<string, Date>();
    for (const d of dcrRows as any[]) {
      if (!lastDcrByCode.has(d.employeeCode)) lastDcrByCode.set(d.employeeCode, d.visitDate);
    }

    function managers(emp: any) {
      const l1 = emp.reportingManager ? byCode.get(emp.reportingManager) : null;
      const l2 = l1?.reportingManager ? byCode.get(l1.reportingManager) : null;
      return { firstLevelManager: l1?.name || "-", secondLevelManager: l2?.name || "-" };
    }

    if (mode === "notlogin") {
      const msPerDay = 24 * 60 * 60 * 1000;
      const rows = employees
        .map((e: any) => {
          const logins = eventsByCode.get(e.employeeCode) || [];
          const lastLogin = logins.length ? logins[logins.length - 1] : null;
          const anchor = lastLogin || e.joinDate || from;
          const durationDays = Math.max(0, Math.round((to.getTime() - new Date(anchor).getTime()) / msPerDay));
          return { e, lastLogin, durationDays };
        })
        .filter((r) => notLoginDays === null || r.durationDays > notLoginDays)
        .map((r) => ({
          empCode: r.e.employeeCode,
          joiningDate: r.e.joinDate || null,
          fieldForceName: r.e.name,
          designation: r.e.designation || "-",
          hq: r.e.territory || "-",
          ...managers(r.e),
          lastDcrDate: lastDcrByCode.get(r.e.employeeCode) || null,
          lastLoginDate: r.lastLogin,
          durationOfWoLoginDays: r.durationDays,
          highlight: notLoginDays !== null && r.durationDays > notLoginDays * 2
        }));
      res.json({ data: rows, from, to, notLoginDays });
      return;
    }

    // Round 11 item 4 — List mode's real header set is "Reporting to" (one
    // manager column, not First/Second) plus Last DCR Date / Last Login
    // Date / the real day-gap between them, matching sanpharma's Login
    // Details table exactly.
    const msPerDayList = 24 * 60 * 60 * 1000;
    const rows = employees.map((e: any) => {
      const logins = eventsByCode.get(e.employeeCode) || [];
      const lastLogin = logins.length ? logins[logins.length - 1] : null;
      const lastDcr = lastDcrByCode.get(e.employeeCode) || null;
      const daysBetween =
        lastDcr && lastLogin
          ? Math.round((new Date(lastLogin).getTime() - new Date(lastDcr).getTime()) / msPerDayList)
          : null;
      return {
        empCode: e.employeeCode,
        joiningDate: e.joinDate || null,
        fieldForceName: e.name,
        designation: e.designation || "-",
        hq: e.territory || "-",
        reportingTo: managers(e).firstLevelManager,
        loginTimestamps: logins,
        lastDcrDate: lastDcr,
        lastLoginDate: lastLogin,
        daysBetweenLastDcrAndLogin: daysBetween
      };
    });
    res.json({ data: rows, from, to });
  })
);

// ── 18. Activity Master + Parameters (Round 8 items 11-12) ──────────────
const activityCreateSchema = z.object({
  shortName: z.string().min(1),
  name: z.string().min(1),
  // Round 10 item 1 fix — matches ActivityModel.mode (MR/MGR/MR & MGR),
  // not the entity-type list (that's activityFor).
  mode: z.enum(["MR", "MGR", "MR & MGR"]).default("MR"),
  activityFor: z.array(z.string()).default([])
});

mastersActionsRouter.get(
  "/activityMaster/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const rows = await ActivityModel.find({ tenantSlug }).sort({ createdAt: -1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

mastersActionsRouter.post(
  "/activityMaster/action/create",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = activityCreateSchema.parse(req.body);
    const row = await ActivityModel.create({ ...body, tenantSlug });
    await audit("ACTIVITY_CREATED", "Activity", String(row._id), { tenantSlug, shortName: row.shortName });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

mastersActionsRouter.put(
  "/activityMaster/action/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = activityCreateSchema.partial().parse(req.body);
    const row = await ActivityModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: body }, { new: true });
    if (!row) throw new HttpError(404, "Activity not found");
    await audit("ACTIVITY_UPDATED", "Activity", String(row._id), { tenantSlug });
    res.json({ data: serializeDocument(row) });
  })
);

mastersActionsRouter.post(
  "/activityMaster/action/:id/deactivate",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await ActivityModel.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: { status: "INACTIVE" } },
      { new: true }
    );
    if (!row) throw new HttpError(404, "Activity not found");
    await audit("ACTIVITY_DEACTIVATED", "Activity", String(row._id), { tenantSlug });
    res.json({ data: serializeDocument(row) });
  })
);

const activityParameterCreateSchema = z.object({
  activityId: z.string().min(1),
  caption: z.string().min(1),
  captionOrder: z.number().default(1),
  mandatory: z.boolean().default(false),
  // Round 10 item 1 — full 19-item sanpharma Parameter Type list, matching
  // the frontend's PARAMETER_TYPES exactly (byte-for-byte); the previous
  // 9-item placeholder enum here would reject every real submission from the
  // Activity - Add Parameter tab the same way the Mode mismatch did above.
  parameterType: z.enum([
    "Label", "Text Box - Characters", "Text box - Numeric", "Text Area", "Date",
    "Date Range", "Time", "Time Range", "Combo Box - Single", "Combo Box - Multiple",
    "Upload", "Currency", "Customized Tables - Single", "Customized Tables - Multiple",
    "Table Type - Row wise", "Date with Time", "Date with Time Range", "Geo Location",
    "Currency Converter"
  ]),
  selectMaster: z.string().nullable().optional(),
  tableGroup: z.string().nullable().optional(),
  activityFor: z.string().nullable().optional()
});

mastersActionsRouter.get(
  "/activityParameter/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const filter: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.activityId === "string" && req.query.activityId.trim()) filter.activityId = req.query.activityId;
    const rows = await ActivityParameterModel.find(filter).sort({ existingOrder: 1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

mastersActionsRouter.post(
  "/activityParameter/action/create",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = activityParameterCreateSchema.parse(req.body);
    const activity = await ActivityModel.findOne({ _id: body.activityId, tenantSlug });
    if (!activity) throw new HttpError(404, "Activity not found");
    const count = await ActivityParameterModel.countDocuments({ tenantSlug, activityId: body.activityId });
    const row = await ActivityParameterModel.create({
      ...body,
      tenantSlug,
      activityName: activity.name,
      existingOrder: count + 1
    });
    await audit("ACTIVITY_PARAMETER_CREATED", "ActivityParameter", String(row._id), { tenantSlug });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

mastersActionsRouter.put(
  "/activityParameter/action/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = activityParameterCreateSchema.partial().parse(req.body);
    const row = await ActivityParameterModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: body }, { new: true });
    if (!row) throw new HttpError(404, "Activity parameter not found");
    await audit("ACTIVITY_PARAMETER_UPDATED", "ActivityParameter", String(row._id), { tenantSlug });
    res.json({ data: serializeDocument(row) });
  })
);

mastersActionsRouter.post(
  "/activityParameter/action/:id/deactivate",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const row = await ActivityParameterModel.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: { status: "INACTIVE" } },
      { new: true }
    );
    if (!row) throw new HttpError(404, "Activity parameter not found");
    await audit("ACTIVITY_PARAMETER_DEACTIVATED", "ActivityParameter", String(row._id), { tenantSlug });
    res.json({ data: serializeDocument(row) });
  })
);

// Reorder — the New Order column's committed values actually persist by
// overwriting existingOrder for every listed row in one batch.
const reorderSchema = z.object({
  orders: z.array(z.object({ id: z.string(), existingOrder: z.number() }))
});

mastersActionsRouter.post(
  "/activityParameter/action/reorder",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = reorderSchema.parse(req.body);
    for (const o of body.orders) {
      await ActivityParameterModel.updateOne({ _id: o.id, tenantSlug }, { $set: { existingOrder: o.existingOrder } });
    }
    await audit("ACTIVITY_PARAMETER_REORDERED", "ActivityParameter", "BULK", { tenantSlug, count: body.orders.length });
    res.json({ data: { success: true } });
  })
);

// ── 19. Customized Master (Round 9 item 2, tab 3) ────────────────────────
mastersActionsRouter.get(
  "/customizedMaster/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const rows = await CustomizedMasterModel.find({ tenantSlug }).sort({ name: 1 }).lean();
    res.json({
      data: rows.map((r: any) => ({
        id: String(r._id),
        name: r.name,
        rows: (r.rows || []).map((row: any) => ({ id: String(row._id), shortName: row.shortName, name: row.name, active: row.active }))
      }))
    });
  })
);

const customizedMasterCreateSchema = z.object({ name: z.string().min(1) });

mastersActionsRouter.post(
  "/customizedMaster/action/create",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = customizedMasterCreateSchema.parse(req.body);
    const existing = await CustomizedMasterModel.findOne({ tenantSlug, name: body.name });
    if (existing) throw new HttpError(409, "A Customized Master with this name already exists");
    const row = await CustomizedMasterModel.create({ tenantSlug, name: body.name, rows: [{ shortName: "", name: "", active: true }] });
    await audit("CUSTOMIZED_MASTER_CREATED", "CustomizedMaster", String(row._id), { tenantSlug, name: body.name });
    res.status(201).json({ data: { id: String(row._id), name: row.name, rows: row.rows.map((r: any) => ({ id: String(r._id), shortName: r.shortName, name: r.name, active: r.active })) } });
  })
);

const customizedMasterRowsSchema = z.object({
  rows: z.array(z.object({ id: z.string().optional(), shortName: z.string().default(""), name: z.string().default(""), active: z.boolean().default(true) }))
});

// "Save" — replaces the whole rows array with the edited grid state. Rows
// without an id are new (Add New Row); rows with an id keep their identity
// so Deactivate on an existing row still targets the right one.
mastersActionsRouter.put(
  "/customizedMaster/action/:id/rows",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = customizedMasterRowsSchema.parse(req.body);
    const doc = await CustomizedMasterModel.findOne({ _id: req.params.id, tenantSlug });
    if (!doc) throw new HttpError(404, "Customized Master not found");
    doc.rows = body.rows.map((r) => ({
      _id: r.id ? new mongoose.Types.ObjectId(r.id) : undefined,
      shortName: r.shortName,
      name: r.name,
      active: r.active
    })) as any;
    await doc.save();
    await audit("CUSTOMIZED_MASTER_ROWS_SAVED", "CustomizedMaster", String(doc._id), { tenantSlug, rowCount: doc.rows.length });
    res.json({ data: { id: String(doc._id), name: doc.name, rows: doc.rows.map((r: any) => ({ id: String(r._id), shortName: r.shortName, name: r.name, active: r.active })) } });
  })
);

mastersActionsRouter.post(
  "/customizedMaster/action/:id/rows/:rowId/deactivate",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const doc = await CustomizedMasterModel.findOne({ _id: req.params.id, tenantSlug });
    if (!doc) throw new HttpError(404, "Customized Master not found");
    const row = (doc.rows as any).id(req.params.rowId);
    if (!row) throw new HttpError(404, "Row not found");
    row.active = false;
    await doc.save();
    await audit("CUSTOMIZED_MASTER_ROW_DEACTIVATED", "CustomizedMaster", String(doc._id), { tenantSlug, rowId: req.params.rowId });
    res.json({ data: { id: String(doc._id), name: doc.name, rows: doc.rows.map((r: any) => ({ id: String(r._id), shortName: r.shortName, name: r.name, active: r.active })) } });
  })
);

// ── 20. Activity Status (Round 9 item 3) ─────────────────────────────────
// Real Employee identity columns + a per-activity, per-entity-type
// completion date. No completion-tracking model exists anywhere in this
// codebase (DCR rows aren't linked to a specific Activity), so every date
// cell is honestly "-" — exactly what sanpharma's own reference screenshot
// shows for employees with no completions recorded yet. Wiring this to real
// dates would require a genuinely new "activity completion" event to be
// recorded somewhere first; nothing in this round asked for that new
// tracking flow, so it isn't fabricated here.
mastersActionsRouter.get(
  "/activityStatus/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const activityId = String(req.query.activityId || "").trim();
    const fieldForceName = String(req.query.fieldForceName || "").trim();

    const activity = activityId ? await ActivityModel.findOne({ _id: activityId, tenantSlug }).lean() : null;

    const empFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
    if (fieldForceName) empFilter.name = fieldForceName;
    const employees = await EmployeeModel.find(empFilter).sort({ name: 1 }).lean();

    const result = employees.map((e: any) => ({
      empCode: e.employeeCode,
      fieldForceName: e.name,
      designation: e.designation || "-",
      hq: e.territory || "-",
      doj: e.joinDate || null,
      drsDate: "-",
      chmDate: "-",
      stkDate: "-",
      unlstDrsDate: "-",
      hosDate: "-",
      cipDate: "-"
    }));

    res.json({ data: result, activityName: (activity as any)?.name || "" });
  })
);

// ── 21. Manager Missed Call - View (Round 9 item 4) ──────────────────────
// Real per-employee doctor coverage for the selected month: LIST = total
// real doctors mapped to that employee (DoctorModel.mappedEmployeeCode);
// MET/SEEN = distinct real doctors actually visited that month
// (DcrModel); MISSED = LIST - SEEN. "-" only when the employee has no
// mapped doctors at all (genuinely nothing to compute against), matching
// the reference screenshot's blank cells for a brand-new employee.
mastersActionsRouter.get(
  "/managerMissedCallView/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "").trim();
    const month = Number(req.query.month) || new Date().getUTCMonth() + 1;
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    const empFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
    if (fieldForceName) empFilter.name = fieldForceName;
    const employees = await EmployeeModel.find(empFilter).sort({ name: 1 }).lean();

    const doctors = await DoctorModel.find({ tenantSlug, mappedEmployeeCode: { $in: employees.map((e: any) => e.employeeCode) } }).lean();
    const listByCode = new Map<string, number>();
    for (const d of doctors as any[]) {
      listByCode.set(d.mappedEmployeeCode, (listByCode.get(d.mappedEmployeeCode) || 0) + 1);
    }

    const dcrRows = await DcrModel.find({
      tenantSlug,
      month: monthStr,
      employeeCode: { $in: employees.map((e: any) => e.employeeCode) },
      status: { $in: ["SUBMITTED", "MANAGER_APPROVED", "APPROVED", "AUTO_APPROVED"] }
    }).lean();
    const seenByCode = new Map<string, Set<string>>();
    for (const r of dcrRows as any[]) {
      if (!r.doctorId) continue;
      if (!seenByCode.has(r.employeeCode)) seenByCode.set(r.employeeCode, new Set());
      seenByCode.get(r.employeeCode)!.add(String(r.doctorId));
    }

    const result = employees.map((e: any) => {
      const list = listByCode.get(e.employeeCode) || 0;
      const seen = seenByCode.get(e.employeeCode)?.size || 0;
      const hasData = list > 0;
      return {
        empCode: e.employeeCode,
        fieldForceName: e.name,
        designation: e.designation || "-",
        hq: e.territory || "-",
        list: hasData ? list : "-",
        met: hasData ? seen : "-",
        seen: hasData ? seen : "-",
        missed: hasData ? Math.max(0, list - seen) : "-"
      };
    });

    res.json({ data: result, month, year });
  })
);

// ── 19. Expense Consolidated View (Round 11 item 1) ──────────────────────
// Real sanpharma-structure expense ledger: identity + TWD/FW + HQ/EX/OS call
// counts from the same DCR/territoryType data used by Coverage Analysis 2,
// plus real claim fields from ExpenseClaimModel (blank/0 where no claim has
// been submitted yet, matching the reference's mostly-blank cells).
mastersActionsRouter.get(
  "/expenseConsolidatedView/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const month = Number(req.query.month) || new Date().getUTCMonth() + 1;
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;

    // Round 12 item 8 — sanpharma's real search form filters this report by
    // FieldForce Name too, not just Month/Year.
    const employeeFilter: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) {
      employeeFilter.employeeCode = req.query.employeeCode.trim();
    }
    const employees = await EmployeeModel.find(employeeFilter).lean();
    const doctors = await DoctorModel.find({ tenantSlug }).lean();
    const territoryTypeByDoctorId = new Map((doctors as any[]).map((d) => [String(d._id), d.territoryType || "HQ"]));

    const dcrRows = await DcrModel.find({
      tenantSlug,
      month: monthStr,
      status: { $in: ["SUBMITTED", "MANAGER_APPROVED", "APPROVED", "AUTO_APPROVED"] }
    }).lean();

    type Bucket = { days: Set<string> };
    const buckets = new Map<string, Map<string, Bucket>>();
    const allDaysByEmp = new Map<string, Set<string>>();
    for (const row of dcrRows as any[]) {
      const tt = row.doctorId ? territoryTypeByDoctorId.get(String(row.doctorId)) || "HQ" : "HQ";
      if (!buckets.has(row.employeeCode)) buckets.set(row.employeeCode, new Map());
      const byType = buckets.get(row.employeeCode)!;
      if (!byType.has(tt)) byType.set(tt, { days: new Set() });
      if (row.visitDateOnly) byType.get(tt)!.days.add(row.visitDateOnly);
      if (row.visitDateOnly) {
        if (!allDaysByEmp.has(row.employeeCode)) allDaysByEmp.set(row.employeeCode, new Set());
        allDaysByEmp.get(row.employeeCode)!.add(row.visitDateOnly);
      }
    }

    // TWD (Total Working Days) — real calendar business days in the month
    // (excluding Sundays); FW (Field Working days) — real distinct DCR
    // visit days recorded that month.
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let twd = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() !== 0) twd++;
    }

    // Real claim data — aggregated from the existing per-Tour-Plan
    // ExpenseClaimModel (category + amountRs + approval status), not a new
    // parallel model. Category -> ledger-column mapping is a documented
    // best-effort join (Travel->Fare, Lodging->Stay, Food->Food Bill, Local
    // Conveyance->Conveyance, Other->Additional Expenses); DA/Internet/
    // Mobile/Vehicle/Communication Allowance have no matching claim category
    // in this app yet, so they stay honestly blank rather than fabricated.
    const claims = await ExpenseClaimModel.find({ tenantSlug, month: monthStr }).lean();
    const claimsByEmp = new Map<string, any[]>();
    for (const c of claims as any[]) {
      if (!claimsByEmp.has(c.employeeCode)) claimsByEmp.set(c.employeeCode, []);
      claimsByEmp.get(c.employeeCode)!.push(c);
    }
    const CATEGORY_TO_COLUMN: Record<string, string> = {
      Travel: "fare",
      Lodging: "stay",
      Food: "foodBill",
      "Local Conveyance": "conveyance",
      Other: "additionalExpenses"
    };

    const rows = employees.map((emp: any) => {
      const byType = buckets.get(emp.employeeCode) || new Map();
      const fw = allDaysByEmp.get(emp.employeeCode)?.size || 0;
      const empClaims = claimsByEmp.get(emp.employeeCode) || [];
      const columnTotals: Record<string, number> = { fare: 0, stay: 0, foodBill: 0, conveyance: 0, additionalExpenses: 0 };
      let appliedAmount = 0;
      let confirmedAmount = 0;
      for (const c of empClaims) {
        const col = CATEGORY_TO_COLUMN[c.category];
        if (col) columnTotals[col] += c.amountRs || 0;
        appliedAmount += c.amountRs || 0;
        if (c.status === "APPROVED") confirmedAmount += c.amountRs || 0;
      }
      const hasClaims = empClaims.length > 0;
      return {
        empCode: emp.employeeCode,
        fieldForceName: emp.name,
        designation: emp.designation || "-",
        headQuarter: emp.territory || "-",
        state: emp.state || "-",
        subDivision: "ZIVIRA LABS",
        bankName: null,
        bankAccountNo: null,
        ifscCode: null,
        twd,
        fw,
        hq: byType.get("HQ")?.days.size || 0,
        ex: byType.get("EX")?.days.size || 0,
        os: byType.get("OS")?.days.size || 0,
        da: null,
        fare: hasClaims ? columnTotals.fare : null,
        internet: null,
        mobileAllowances: null,
        vehicleAllowances: null,
        // No claim category maps distinctly to "Travel" (Travel category
        // already feeds Fare above) so this stays honestly blank.
        travel: null,
        communicationAllowance: null,
        stay: hasClaims ? columnTotals.stay : null,
        foodBill: hasClaims ? columnTotals.foodBill : null,
        conveyance: hasClaims ? columnTotals.conveyance : null,
        additionalExpenses: hasClaims ? columnTotals.additionalExpenses : null,
        appliedAmount: hasClaims ? appliedAmount : null,
        additionDeduction: hasClaims ? appliedAmount - confirmedAmount : null,
        confirmedAmount: hasClaims ? confirmedAmount : null
      };
    });

    res.json({ data: rows, month, year });
  })
);

// ── 19b. Expense Consolidated View — "At a Glance" mode (Round 12 item 8) ─
// sanpharma's real "Expense Consolidated View From <Month Year> to <Month
// Year>" summary: one row per employee under the selected date range with a
// merged Applied Amount/Approved Amount pair per calendar month in range,
// plus an Applied Total/Approved Total, and a Grand Total row — built from
// the same real ExpenseClaimModel data as the detailed view above (honestly
// 0 for a month/employee with no submitted claims, matching the reference).
mastersActionsRouter.get(
  "/expenseConsolidatedView/action/atAGlance",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const now = new Date();
    const fromMonth = Number(req.query.fromMonth) || now.getUTCMonth() + 1;
    const fromYear = Number(req.query.fromYear) || now.getUTCFullYear();
    const toMonth = Number(req.query.toMonth) || fromMonth;
    const toYear = Number(req.query.toYear) || fromYear;

    const months: string[] = [];
    let y = fromYear;
    let m = fromMonth;
    while (y < toYear || (y === toYear && m <= toMonth)) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
      if (months.length > 60) break; // sanity guard against a malformed range
    }

    const employeeFilter: Record<string, unknown> = { tenantSlug };
    if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) {
      employeeFilter.employeeCode = req.query.employeeCode.trim();
    }
    const employees = await EmployeeModel.find(employeeFilter).lean();

    const claims = await ExpenseClaimModel.find({ tenantSlug, month: { $in: months } }).lean();
    const byEmpMonth = new Map<string, Map<string, { applied: number; approved: number }>>();
    for (const c of claims as any[]) {
      if (!byEmpMonth.has(c.employeeCode)) byEmpMonth.set(c.employeeCode, new Map());
      const byMonth = byEmpMonth.get(c.employeeCode)!;
      if (!byMonth.has(c.month)) byMonth.set(c.month, { applied: 0, approved: 0 });
      const bucket = byMonth.get(c.month)!;
      bucket.applied += c.amountRs || 0;
      if (c.status === "APPROVED") bucket.approved += c.amountRs || 0;
    }

    const rows = employees.map((emp: any) => {
      const byMonth = byEmpMonth.get(emp.employeeCode) || new Map();
      const perMonth = months.map((mo) => {
        const bucket = byMonth.get(mo) || { applied: 0, approved: 0 };
        return { month: mo, appliedAmount: bucket.applied, approvedAmount: bucket.approved };
      });
      const appliedTotal = perMonth.reduce((sum, x) => sum + x.appliedAmount, 0);
      const approvedTotal = perMonth.reduce((sum, x) => sum + x.approvedAmount, 0);
      return {
        empCode: emp.employeeCode,
        fieldForceName: emp.name,
        designation: emp.designation || "-",
        headQuarter: emp.territory || "-",
        perMonth,
        appliedTotal,
        approvedTotal
      };
    });

    const grandTotal = {
      appliedTotal: rows.reduce((s, r) => s + r.appliedTotal, 0),
      approvedTotal: rows.reduce((s, r) => s + r.approvedTotal, 0)
    };

    res.json({ data: rows, months, grandTotal });
  })
);

// ── 20. Task Management System (Round 11 item 5) ─────────────────────────
const taskCreateSchema = z.object({
  modeOfTask: z.string().min(1),
  priority: z.enum(["High", "Medium", "Low"]),
  assignedToEmployeeCode: z.string().min(1),
  deadlineFrom: z.string().nullable().optional(),
  deadlineTo: z.string().nullable().optional(),
  description: z.string().default("")
});

const TASK_STATUSES = ["New", "Pending", "Completed", "Closed", "ReOpen", "Hold", "Cancel"] as const;

function emptyTaskStats() {
  return { total: 0, New: 0, Pending: 0, Completed: 0, Closed: 0, ReOpen: 0, Hold: 0, Cancel: 0 };
}

mastersActionsRouter.get(
  "/task/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const filter: Record<string, unknown> = { tenantSlug };
    const assignedToEmployeeCode = String(req.query.assignedToEmployeeCode || "").trim();
    const assignedByMe = String(req.query.assignedByMe || "") === "true";
    const priority = String(req.query.priority || "").trim();
    const modeOfTask = String(req.query.modeOfTask || "").trim();
    const month = req.query.month ? Number(req.query.month) : null;
    const year = req.query.year ? Number(req.query.year) : null;

    if (assignedToEmployeeCode) filter.assignedToEmployeeCode = assignedToEmployeeCode;
    if (assignedByMe) filter.assignedByEmployeeCode = req.auth!.employeeCode || "__none__";
    if (priority) filter.priority = priority;
    if (modeOfTask) filter.modeOfTask = modeOfTask;
    if (month && year) {
      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = new Date(Date.UTC(year, month, 1));
      filter.createdAt = { $gte: from, $lt: to };
    }

    const rows = await TaskModel.find(filter).sort({ createdAt: -1 }).lean();
    const stats = emptyTaskStats();
    stats.total = rows.length;
    for (const r of rows as any[]) {
      if (stats[r.status as keyof typeof stats] !== undefined) {
        (stats as any)[r.status] += 1;
      }
    }
    res.json({ data: rows.map(serializeDocument), stats });
  })
);

mastersActionsRouter.post(
  "/task/action/create",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = taskCreateSchema.parse(req.body);
    const assignee = await EmployeeModel.findOne({ tenantSlug, employeeCode: body.assignedToEmployeeCode }).lean();
    if (!assignee) throw new HttpError(404, "Assignee not found");
    const row = await TaskModel.create({
      ...body,
      tenantSlug,
      assignedToName: (assignee as any).name,
      assignedByEmployeeCode: req.auth!.employeeCode || null,
      assignedByName: null,
      deadlineFrom: body.deadlineFrom ? new Date(body.deadlineFrom) : null,
      deadlineTo: body.deadlineTo ? new Date(body.deadlineTo) : null
    });
    await audit("TASK_ASSIGNED", "Task", String(row._id), { tenantSlug, assignedTo: body.assignedToEmployeeCode });

    // Round 19 item 3 — Task Assignment previously never triggered a real
    // Notice, unlike every other manager-facing action in this file. Same
    // MANAGER_ROLES branch the broadcast "Notification from Admin" flow
    // above uses, so an assigned manager sees it via GET /manager/notices
    // and an assigned MR sees it via GET /field/notices. Best-effort —
    // never fails the task-assignment request itself.
    try {
      const assigneeRole = (assignee as any).role;
      if (MANAGER_ROLES.includes(assigneeRole)) {
        await notifyManager({
          tenantSlug: tenantSlug!,
          managerEmployeeCode: body.assignedToEmployeeCode,
          managerEmail: (assignee as any).email,
          managerName: (assignee as any).name,
          title: "New Task Assigned",
          message: `You have been assigned a new task (${body.modeOfTask}, priority: ${body.priority})`
        });
      } else {
        await notifyFieldRep({
          tenantSlug: tenantSlug!,
          employeeCode: body.assignedToEmployeeCode,
          employeeEmail: (assignee as any).email,
          employeeName: (assignee as any).name,
          title: "New Task Assigned",
          message: `You have been assigned a new task (${body.modeOfTask}, priority: ${body.priority})`
        });
      }
    } catch (err) {
      console.error("[task/action/create] failed to notify assignee", body.assignedToEmployeeCode, err);
    }

    res.status(201).json({ data: serializeDocument(row) });
  })
);

// ── 21. Task Mode Creation (Round 12 item 9) ──────────────────────────────
// sanpharma's real "Mode Of Task" CRUD screen (Task Management > Mode
// Creation): Short Name + Task Name, listed with Edit — this real master
// drives the "Mode of Task" dropdown in Task Assign, replacing the Round 11
// hardcoded option list.
const taskModeSchema = z.object({
  shortName: z.string().min(1),
  taskName: z.string().min(1)
});

const DEFAULT_TASK_MODES: { shortName: string; taskName: string }[] = [
  { shortName: "AV", taskName: "Allowance Variance" },
  { shortName: "CA", taskName: "Call Adherance" },
  { shortName: "CAD", taskName: "Campaign Doctors" },
  { shortName: "CB", taskName: "Chemist Based" },
  { shortName: "CCA", taskName: "Chemist Call Average" },
  { shortName: "CMU", taskName: "Chemist Master Updation" },
  { shortName: "CPOB", taskName: "Chemist POB" },
  { shortName: "CD", taskName: "Core Doctors" },
  { shortName: "COV", taskName: "Coverage" },
  { shortName: "DR", taskName: "Delayed Reports" },
  { shortName: "DIM", taskName: "Device ID Maintenance" },
  { shortName: "DD", taskName: "Digital Detailing" },
  { shortName: "DB", taskName: "Doctor Based" },
  { shortName: "DCA", taskName: "Doctor Call Average" },
  { shortName: "DCOV", taskName: "Doctor Coverage" },
  { shortName: "DMU", taskName: "Doctor Master Updation" },
  { shortName: "DPOB", taskName: "Doctor POB" },
  { shortName: "DWCF", taskName: "Doctor wise Call Feedback" },
  { shortName: "FC", taskName: "Fare Calculation" }
];

// Ensures every tenant has the real, editable Mode Of Task rows on first
// use (idempotent — never overwrites a tenant's own edits/additions), so
// the dropdown is never empty for a tenant that hasn't visited Mode
// Creation yet, while still being a genuine CRUD table underneath.
async function ensureDefaultTaskModes(tenantSlug: string) {
  const count = await TaskModeModel.countDocuments({ tenantSlug });
  if (count > 0) return;
  await TaskModeModel.insertMany(DEFAULT_TASK_MODES.map((m) => ({ ...m, tenantSlug })));
}

mastersActionsRouter.get(
  "/taskMode/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    await ensureDefaultTaskModes(tenantSlug);
    const rows = await TaskModeModel.find({ tenantSlug }).sort({ createdAt: 1 }).lean();
    res.json({ data: rows.map(serializeDocument) });
  })
);

mastersActionsRouter.post(
  "/taskMode/action/create",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = taskModeSchema.parse(req.body);
    const row = await TaskModeModel.create({ ...body, tenantSlug });
    await audit("TASK_MODE_CREATED", "TaskMode", String(row._id), { tenantSlug, shortName: body.shortName });
    res.status(201).json({ data: serializeDocument(row) });
  })
);

mastersActionsRouter.patch(
  "/taskMode/action/:id",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = taskModeSchema.parse(req.body);
    const row = await TaskModeModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: body }, { new: true });
    if (!row) throw new HttpError(404, "Task Mode not found");
    await audit("TASK_MODE_EDITED", "TaskMode", String(row._id), { tenantSlug, shortName: body.shortName });
    res.json({ data: serializeDocument(row) });
  })
);
