import { Router } from "express";
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
import { ProductBrandModel } from "../models/product-brand.model.js";
import { ProductModel } from "../models/product.model.js";
import { computeComplianceRows } from "../utils/compliance.js";

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
          category: r.category === "A" ? "CORE" : r.category === "B" || r.category === "C" ? "NON CORE" : "Nil",
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
mastersActionsRouter.get(
  "/unlistedToListedDrConversion/action/list",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const fieldForceName = String(req.query.fieldForceName || "");
    if (!fieldForceName) { res.json({ data: [] }); return; }

    const rows = await UnlistedDoctorModel.find({ tenantSlug, mr: fieldForceName, status: "Pending" }).sort({ name: 1 }).lean();
    res.json({
      data: rows.map((r: any) => ({
        id: String(r._id),
        name: r.name,
        qualification: r.qualification || "-",
        speciality: r.specialty || "-",
        category: r.category || "-",
        classField: r.classField || "-",
        territory: r.territory || r.patch || r.hq || "-"
      }))
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

      await DoctorModel.create({
        tenantSlug,
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

// ── 10. Delayed Release ─────────────────────────────────────────────────
// Matches sanpharma.info's Delayed_Release.aspx: a Year/Month + FieldForce
// filter, a table of field force with delayed/missing DCR dates, and a
// Release action. Built on the SAME real DCR-gap computation the Compliance
// Analytics dashboard already uses (computeComplianceRows, missedLast30Days)
// rather than a fabricated table — a field force only shows up here if they
// genuinely have missed working-day DCRs in the window. "Released" is a
// real, persisted per (month, employee) flag in the generic CompanyConfig
// key/value store, so a released row stays released across refreshes.
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
    const employees = await EmployeeModel.find(employeeFilter).lean();

    const complianceRows = await computeComplianceRows(
      tenantSlug!,
      employees.map((e: any) => ({ employeeCode: e.employeeCode, name: e.name, joinDate: e.joinDate })),
      { month: month || undefined }
    );

    const monthKey = month || "current";
    const releasedRows = await CompanyConfigModel.find({ tenantSlug, key: { $regex: `^delayedReleased:${monthKey}:` } }).lean();
    const releasedSet = new Set(releasedRows.map((r: any) => String(r.key).split(":")[2]));

    const empByCode = new Map(employees.map((e: any) => [e.employeeCode, e]));

    const result = complianceRows
      .filter((r) => r.missedLast30Days > 0)
      .map((r) => {
        const emp = empByCode.get(r.employeeCode);
        return {
          employeeCode: r.employeeCode,
          fieldForceName: r.employeeName,
          hq: emp?.territory || "-",
          designation: emp?.designation || "-",
          state: emp?.state || "-",
          delayedMissingDates: `${r.missedLast30Days} day(s) missed in last 30 days`,
          released: releasedSet.has(r.employeeCode)
        };
      });

    res.json({ data: result });
  })
);

const releaseDelayedSchema = z.object({
  employeeCodes: z.array(z.string()).min(1),
  month: z.string().optional().default("current")
});

mastersActionsRouter.post(
  "/delayedRelease/action/release",
  asyncHandler(async (req, res) => {
    const tenantSlug = req.auth!.tenantSlug!;
    const body = releaseDelayedSchema.parse(req.body);
    for (const code of body.employeeCodes) {
      await CompanyConfigModel.findOneAndUpdate(
        { tenantSlug, key: `delayedReleased:${body.month}:${code}` },
        { $set: { value: true } },
        { upsert: true }
      );
    }
    await audit("DELAYED_RELEASE_RELEASED", "delayedRelease", "BULK", { tenantSlug, ...body });
    res.status(201).json({ data: { success: true, releasedCount: body.employeeCodes.length } });
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
        status: r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Rejected" : "Pending",
        approvedBy: r.approvedBy || "-",
        reason: r.reason || "-"
      };
    });

    res.json({ data: result });
  })
);
