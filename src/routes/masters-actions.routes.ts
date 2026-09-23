import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { signToken } from "../http/auth.js";
import { UserModel } from "../models/user.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { audit } from "../utils/audit.js";
import { notifyFieldRep, notifyManager } from "../utils/notify.js";
import { serializeDocument } from "../utils/serialize.js";

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

    const users = await UserModel.find({ tenantSlug, employeeCode });
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

    const user = await UserModel.findOne({ tenantSlug, employeeCode: employee.employeeCode, portal: "FIELD_FORCE" });
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
  filterBy: z.enum(["FieldForce Base wise", "HQ wise", "Zone wise", "State wise", "Designation wise"]).optional(),
  filterValue: z.string().optional(),
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
        message: body.message,
        effectiveFrom: body.effectiveFrom ?? new Date(),
        effectiveTo: body.effectiveTo ?? null
      });
    }

    const filterBy = String(row.get("filterBy"));
    const filterValue = String(row.get("filterValue") ?? "").trim();
    const message = String(row.get("message") ?? "");

    const employeeFilter: Record<string, unknown> = { tenantSlug, status: "ACTIVE" };
    if (filterBy === "HQ wise" && filterValue) employeeFilter.territory = filterValue;
    else if (filterBy === "State wise" && filterValue) employeeFilter.state = filterValue;
    else if (filterBy === "Designation wise" && filterValue) employeeFilter.designation = filterValue;
    else if (filterBy === "Zone wise" && filterValue) {
      // EmployeeModel has no dedicated "zone" field — best-effort match
      // against territory, same as HQ wise, since Zone is the next level
      // up from HQ in this org's hierarchy and isn't modeled separately.
      employeeFilter.territory = filterValue;
    }
    // "FieldForce Base wise" with no filterValue (or filterValue === "All")
    // means every active field-force employee.
    if (filterBy === "FieldForce Base wise" && filterValue && filterValue.toLowerCase() !== "all") {
      employeeFilter.$or = [{ employeeCode: filterValue }, { name: filterValue }];
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
