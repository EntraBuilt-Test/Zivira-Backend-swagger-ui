import { Router } from "express";
import bcrypt from "bcryptjs";
import { asyncHandler } from "../http/async-handler.js";
import { UserModel } from "../models/user.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { runExactTenSeed } from "../seed/exact-10.js";
import { runBaseSeed } from "../seed/base.js";
import { runDataCorrections } from "../seed/fix-data-corrections.js";
import { getMasterModel } from "../models/master-record.model.js";
import { LeaveTypeModel } from "../models/leave-type.model.js";
import { ensureAllEmployeeCredentials, DEFAULT_EMPLOYEE_PASSWORD } from "../utils/credentials.js";

export const seedRouter = Router();

// Read-only diagnostic — dumps exactly what the masters-registry collection
// for `key` actually contains, using the SAME cached model instance that
// masters.routes.ts uses for both its list (GET) and duplicate-check (POST)
// queries. Exists to answer, with certainty, "does this value already exist
// in the collection or not" when the Admin UI's list and its own
// already-exists check appear to disagree — no shell access is available on
// Render's free tier, so this is the only way to see the raw documents on
// the live database.
//
//   curl "https://<backend>/api/seed/inspect/divisionMaster?tenantSlug=zivira-labs" \
//        -H "x-seed-secret: <SEED_SECRET>"
seedRouter.get("/inspect/:key", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const tenantSlug = typeof req.query.tenantSlug === "string" ? req.query.tenantSlug : "zivira-labs";
  const Model = getMasterModel(req.params.key);

  // Two separate queries on purpose, mirroring exactly what masters.routes.ts
  // does: .find() the same way the list endpoint does, and .findOne() for
  // whatever code value is passed in `?check=`, the same way the create
  // endpoint's duplicate check does. If these ever disagree about whether a
  // given value exists, that disagreement — not a guess — is the bug.
  const allForTenant = await Model.find({ tenantSlug }).sort({ createdAt: 1 }).lean();
  const checkValue = typeof req.query.check === "string" ? req.query.check : undefined;
  const checkField = typeof req.query.checkField === "string" ? req.query.checkField : "divisionCode";
  const checkMatch = checkValue
    ? await Model.findOne({ tenantSlug, [checkField]: checkValue }).lean()
    : null;

  res.json({
    key: req.params.key,
    tenantSlug,
    totalDocumentsForTenant: allForTenant.length,
    documents: allForTenant.map((d: any) => ({ id: String(d._id), ...d, _id: undefined, __v: undefined })),
    duplicateCheck: checkValue
      ? {
          field: checkField,
          value: checkValue,
          existingMatchFound: !!checkMatch,
          matchedDocument: checkMatch ? { id: String((checkMatch as any)._id), ...checkMatch, _id: undefined } : null
        }
      : undefined
  });
}));

// Targeted, non-destructive data cleanup: "ARA" -> "Aura" spelling,
// Doctor Category "D" -> A/B/C, and placeholder Year values (1, 2, 3...)
// -> real calendar years, across the live tenant data. Does NOT delete or
// reset any records (unlike /exact-10 below) — use this instead of a full
// reseed when the goal is just to correct those known-bad values without
// touching anything else the user has since added.
//
//   curl -X POST https://<backend>/api/seed/fix-data -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post("/fix-data", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await runDataCorrections();
  res.json({ success: true, message: "ARA -> Aura and Doctor Category D -> A/B/C corrections applied." });
}));

// Reset EVERY master dataset (legacy models + all 54 generic masters-registry
// tabs) to exactly 10 cross-linked records per tenant. Same secret-header
// pattern as /run below — exists because Render's free tier has no shell
// access, so this is the only way to run scripts/seed-exact-10.ts against
// the live database (PRD Section 5.4 / 18).
//
//   curl -X POST https://<backend>/api/seed/exact-10 -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post("/exact-10", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await runExactTenSeed();
  res.json({ success: true, message: "Every master dataset reset to exactly 10 records for tenant zivira-labs." });
}));

// Bootstrap seed for a FRESH database — creates the base login accounts
// (adminzivira / superadminzivira / mr-001 / abm-001, password
// "ziviramumbai" for all), the zivira-labs tenant, and platform module
// rows. Run this ONCE before /exact-10 when pointing this service at a
// database that has never had src/seed.ts run against it — /exact-10 only
// resets master-tab data, it doesn't create these base accounts. Safe to
// re-run any time (every write is an upsert).
//
//   curl -X POST https://<backend>/api/seed/base -H "x-seed-secret: <SEED_SECRET>"
// Resets (or creates) a Field/Manager portal login account for EVERY
// employee currently in the tenant's Employee Master — not just the fixed
// canonical seed list — to the standing convention: username = Employee
// Code (lowercased), password = "Zivirachennai" for every employee. Run
// this once against the live database so Vacant MR Login - Access, and
// every employee's own portal login, work with that known password
// immediately; every employee created afterwards gets this automatically
// (see masters.routes.ts's employees POST handler). Safe to re-run any
// time (every write is an upsert/update, never a delete).
//
//   curl -X POST "https://<backend>/api/seed/ensure-credentials?tenantSlug=zivira-labs" \
//        -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post("/ensure-credentials", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const tenantSlug = typeof req.query.tenantSlug === "string" ? req.query.tenantSlug : "zivira-labs";
  const { count, failed } = await ensureAllEmployeeCredentials(tenantSlug);
  res.json({
    success: true,
    message: `Login accounts ensured for ${count} employees (username: employee code, password: ${DEFAULT_EMPLOYEE_PASSWORD}).`,
    failed
  });
}));

seedRouter.post("/base", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await runBaseSeed();
  res.json({ success: true, message: "Base logins, tenant, and platform modules seeded." });
}));

// ONE-TIME seed endpoint — disable after use by removing SEED_SECRET env var
seedRouter.post("/run", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const passwordHash = await bcrypt.hash("ziviramumbai", 12);

  // Create ABM Manager user
  await UserModel.updateOne(
    { username: "abm-001" },
    {
      username: "abm-001",
      passwordHash,
      displayName: "Demo Area Business Manager",
      role: "ABM",
      portal: "FIELD_FORCE",
      tenantSlug: "zivira-labs",
      active: true
    },
    { upsert: true }
  );

  // Create ABM Employee record
  await EmployeeModel.updateOne(
    { tenantSlug: "zivira-labs", employeeCode: "ABM-001" },
    {
      tenantSlug: "zivira-labs",
      name: "Demo Area Business Manager",
      employeeCode: "ABM-001",
      designation: "Area Business Manager",
      division: "Cardio Diabetes",
      reportingManager: "NBH-001",
      territory: "Mumbai",
      role: "ABM",
      status: "ACTIVE"
    },
    { upsert: true }
  );

  // Link MR-001 to report to ABM-001
  await EmployeeModel.updateOne(
    { tenantSlug: "zivira-labs", employeeCode: "MR-001" },
    { reportingManager: "ABM-001" }
  );

  res.json({ success: true, message: "abm-001 created. Login: abm-001 / ziviramumbai" });
}));

// Request C, item 1 — a second Area Business Manager (abm-002) so Tour
// Plans can be reassigned from abm-001 to a different manager and approved
// there (uses the existing cross-manager reassign/cross-team endpoints —
// this route only creates the login + employee record those endpoints
// need). Purely additive, same shape as /run above for abm-001; does not
// touch abm-001's account, MR-001's reporting line, or any other record.
// Territory "Chennai" so this manager naturally owns the new
// Chennai-territory field force (see the manager /team route's starter
// doctor + item 4's territory correction).
//
//   curl -X POST https://<backend>/api/seed/create-abm002 -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post("/create-abm002", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const passwordHash = await bcrypt.hash("Ziviramumbai", 12);

  await UserModel.updateOne(
    { username: "abm-002" },
    {
      username: "abm-002",
      passwordHash,
      displayName: "Area Business Manager - Chennai",
      role: "ABM",
      portal: "FIELD_FORCE",
      tenantSlug: "zivira-labs",
      active: true
    },
    { upsert: true }
  );

  await EmployeeModel.updateOne(
    { tenantSlug: "zivira-labs", employeeCode: "ABM-002" },
    {
      tenantSlug: "zivira-labs",
      name: "Area Business Manager - Chennai",
      employeeCode: "ABM-002",
      designation: "Area Business Manager",
      division: "Cardio Diabetes",
      reportingManager: "NBH-001",
      territory: "Chennai",
      role: "ABM",
      status: "ACTIVE"
    },
    { upsert: true }
  );

  res.json({ success: true, message: "abm-002 created. Login: abm-002 / Ziviramumbai" });
}));

// Creates/updates a dedicated Company Admin login for the HR portal —
// same portal/permissions as the main Admin app's "adminzivira" account
// (there is no separate HR role in the backend), just a distinct,
// memorable username for the HR team instead of reusing the Admin one.
//
//   curl -X POST https://<backend>/api/seed/hr-user -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post("/hr-user", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const username = "zivirahr@gmail.com";
  const passwordHash = await bcrypt.hash("Ziviramumbai", 12);

  await UserModel.updateOne(
    { username },
    {
      username,
      passwordHash,
      displayName: "Zivira HR Admin",
      role: "COMPANY_ADMIN",
      portal: "COMPANY_ADMIN",
      tenantSlug: "zivira-labs",
      active: true
    },
    { upsert: true }
  );

  res.json({ success: true, message: `${username} created. Login: ${username} / Ziviramumbai` });
}));

// Standard Leave Types (Zivira_HR_Client_Requirement_1A.docx §25 Leave
// Management). The Leave module went live with no rows in the leaveTypes
// collection at all, so the ESS "Apply for Leave" dropdown had nothing to
// select — this seeds the standard set HR expects to see out of the box.
// Idempotent (upsert), safe to call more than once.
//
//   curl -X POST https://<backend>/api/seed/leave-types -H "x-seed-secret: <SEED_SECRET>"
seedRouter.post("/leave-types", asyncHandler(async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (!secret || secret !== process.env.SEED_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const tenantSlug = "zivira-labs";
  const types = ["Casual Leave", "Sick Leave", "Earned Leave", "Loss of Pay"];

  for (const leaveTypeDesc of types) {
    await LeaveTypeModel.updateOne(
      { tenantSlug, leaveTypeDesc },
      { tenantSlug, leaveTypeDesc, status: "ACTIVE" },
      { upsert: true }
    );
  }

  res.json({ success: true, message: `Seeded ${types.length} leave types for ${tenantSlug}.` });
}));
