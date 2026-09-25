import { Router } from "express";
import { asyncHandler } from "../http/async-handler.js";
import { HttpError } from "../http/errors.js";
import { getMasterModel } from "../models/master-record.model.js";
import { MASTERS, getMasterConfig } from "../masters/registry.js";
import { audit } from "../utils/audit.js";
import { broadcastNotice } from "../utils/notify.js";
import { serializeDocument } from "../utils/serialize.js";
import { EmployeeModel } from "../models/employee.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { ensureEmployeeLoginAccount } from "../utils/credentials.js";

export const mastersRouter = Router();

// Every masters response must always be fresh — a stale cached list after a
// successful save is what makes a real duplicate-code error look like a bug.
mastersRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function requireConfig(key: string) {
  const config = getMasterConfig(key);
  if (!config) {
    throw new HttpError(404, `Unknown master: ${key}`);
  }
  return config;
}

// Defense-in-depth: any field declared with a fixed `options` list (e.g.
// Doctor Category -> A/B/C) can only ever be saved as one of those exact
// values, no matter what the client sends. This is what keeps a stray value
// like a leftover "D" from ever finding its way back into a fixed-choice
// column, even if a client bug or an old cached form manages to submit one.
function validateOptionFields(config: ReturnType<typeof requireConfig>, body: Record<string, unknown>) {
  for (const f of config.fields) {
    if (!f.options || !f.options.length) continue;
    const val = body[f.key];
    if (val === undefined || val === null || val === "") continue;
    if (!f.options.includes(String(val))) {
      throw new HttpError(400, `${f.label} must be one of: ${f.options.join(", ")}`);
    }
  }
}

// Zivira_Master_Tab_Client_Change_3B.docx — "the key calculations should be
// centralized in the backend/service layer rather than duplicated in the
// frontend": Target Value = Target Unit x Unit Price, and Net Sale
// Unit/Value = Sales - Return for both Primary and Secondary Sales. Mutates
// `doc` in place (the record about to be saved) so the client never has to
// compute or submit these — it can send them, but whatever it sends is
// overwritten with the real calculation.
function applyComputedSalesFields(key: string, doc: Record<string, unknown>) {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  if (key === "targetMaster") {
    doc.targetValue = num(doc.targetUnit) * num(doc.unitPrice);
  }

  if (key === "primarySales" || key === "secondarySales") {
    doc.netSaleUnit = num(doc.salesUnit) - num(doc.returnUnit);
    doc.netSaleValue = num(doc.salesValue) - num(doc.returnValue);
  }
}

// ══════════════════════════════════════════════════════════════════════
// Request G — "Doctor — Mapping" (and every other master field sourced
// from "employees") was writing into its OWN separate generic collection
// (masters-registry gives every key, including "employees", its own
// isolated Mongo collection — see master-record.model.ts) that the
// Manager portal, FieldRepo portal, and HR never read from. Adding a
// mapping here never touched the real Employee/Doctor collections those
// portals actually query, so nothing showed up anywhere else — the page's
// own subtitle ("Data CRUD can be wired to its MongoDB collection") was a
// literal, accurate description of the gap.
//
// Fix, in two parts:
//  1. The "employees" master key is now a compatibility view directly over
//     the real EmployeeModel (the same collection /company/employees,
//     /manager/team, and every portal login already use) instead of its
//     own disconnected copy. Every OTHER master field declared with
//     `sourceMaster: "employees"` (Doctor Mapping's Medical Representative
//     and Area Manager, Reporting Manager, DCR/Tour Plan/Expense "MR"
//     pickers, and more) is served through this same GET /masters/employees
//     endpoint, so all of them now resolve to real, loginable employees —
//     not just Doctor Mapping.
//  2. Writing a "doctorMapping" record now also upserts a real Doctor
//     document (joined against the Doctor Master row for name/specialty/
//     city/state, and the picked Medical Representative's real
//     employeeCode) — the same Doctor collection FieldRepo's doctor list
//     and DCR form, and the Manager/company doctors screens, already read
//     from via mappedEmployeeCode.
// ══════════════════════════════════════════════════════════════════════

const MASTER_STATUS_TO_MODEL: Record<string, "ACTIVE" | "INACTIVE"> = { Active: "ACTIVE", Inactive: "INACTIVE" };
const MODEL_STATUS_TO_MASTER: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive" };
// The "employees" master's Role options included a stray "OTH2" that never
// matched the real EmployeeModel enum (NBH/BH/RBM/ZBM/ABM/SR_MR/MR/OTHER) —
// harmless while this master wrote to its own disconnected collection, but
// would have rejected every real employee create/update once wired to the
// real model. Mapped through here rather than left to fail at insert time.
const EMPLOYEE_ROLE_ALIASES: Record<string, string> = { OTH2: "OTHER" };

function employeeToMasterShape(e: Record<string, unknown>) {
  const dateOrNull = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
  return {
    id: String(e._id),
    tenantSlug: e.tenantSlug,
    employeeCode: e.employeeCode,
    name: e.name,
    designation: e.designation,
    division: e.division,
    territory: e.territory,
    role: e.role,
    dob: dateOrNull(e.dob),
    email: e.email,
    phone: e.phone,
    joinDate: dateOrNull(e.joinDate),
    city: e.city,
    state: e.state,
    country: e.country,
    reportingManager: e.reportingManager,
    status: MODEL_STATUS_TO_MASTER[e.status as string] ?? "Active",
    createdAt: dateOrNull(e.createdAt),
    updatedAt: dateOrNull(e.updatedAt)
  };
}

// Best-effort resolve a picked "Medical Representative" / "Area Manager"
// NAME (that's what Doctor Mapping's dropdown submits — see
// registry.ts's `sourceField: "name"`) back to a real employeeCode.
async function resolveEmployeeCodeByName(tenantSlug: string, name: string | undefined) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return undefined;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const employee = await EmployeeModel.findOne({ tenantSlug, name: new RegExp(`^${escaped}$`, "i") }).lean();
  return employee?.employeeCode as string | undefined;
}

// Joins a saved "doctorMapping" record against "doctorMaster" (name,
// specialty, city, state) and "doctorClassification" (category A/B/C, if
// set) to upsert the real Doctor document those fields feed into. Silently
// no-ops if the Doctor Master row for this doctorCode doesn't exist yet —
// Doctor Mapping's own doctorCode field is itself sourced from Doctor
// Master, so in the normal flow it always will.
async function syncDoctorMappingToDoctor(tenantSlug: string, record: Record<string, unknown>) {
  const doctorCode = String(record.doctorCode ?? "").trim();
  if (!doctorCode) return;

  const DoctorMasterModel = getMasterModel("doctorMaster");
  const doctorMasterRecord = await DoctorMasterModel.findOne({ tenantSlug, doctorCode }).lean<Record<string, unknown>>();
  if (!doctorMasterRecord) return;

  const DoctorClassificationModel = getMasterModel("doctorClassification");
  const classification = await DoctorClassificationModel.findOne({ tenantSlug, doctorCode }).lean<Record<string, unknown>>();

  const mappedEmployeeCode = await resolveEmployeeCodeByName(tenantSlug, record.medicalRepresentative as string | undefined);
  const territory = (record.hq as string) || (record.patch as string) || (doctorMasterRecord.city as string) || "Unassigned";
  const status = record.status === "Inactive" ? "INACTIVE" : "ACTIVE";
  const category = ["A", "B", "C"].includes(classification?.doctorCategory as string) ? (classification!.doctorCategory as string) : undefined;

  await DoctorModel.findOneAndUpdate(
    { tenantSlug, doctorCode },
    {
      $set: {
        tenantSlug,
        doctorCode,
        name: (doctorMasterRecord.doctorName as string) || doctorCode,
        specialty: (doctorMasterRecord.specialty as string) || "General Physician",
        state: (doctorMasterRecord.state as string) || territory,
        city: (doctorMasterRecord.city as string) || territory,
        territory,
        mappedEmployeeCode: mappedEmployeeCode ?? null,
        mappedEmployeeName: (record.medicalRepresentative as string) || null,
        qualification: (doctorMasterRecord.qualification as string) || null,
        clinicName: (doctorMasterRecord.clinicName as string) || null,
        address1: (doctorMasterRecord.address as string) || null,
        phone: (doctorMasterRecord.mobile as string) || (doctorMasterRecord.phone as string) || null,
        email: (doctorMasterRecord.email as string) || null,
        registrationNo: (doctorMasterRecord.registrationNumber as string) || null,
        ...(category ? { category } : {}),
        status
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

// GET /masters — list every master's key/title/fields, so the frontend can render
// exact document headers without hardcoding them anywhere.
mastersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ data: MASTERS.map(({ key, title, fields, keyFields, uiKind }) => ({ key, title, fields, keyFields, uiKind })) });
  })
);

// GET /masters/:key/schema — field list + labels for a single master
mastersRouter.get(
  "/:key/schema",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    res.json({ data: config });
  })
);

// GET /masters/:key — list all records for this tenant. Supports filtering
// by any declared field via query params (e.g. ?division=Astra&hq=Chennai),
// so the Sales tab's cascading Division -> Zone -> Region -> Area -> HQ ->
// Product -> Month dropdowns (Zivira_Master_Tab_Client_Change_3B.docx) can
// narrow results without the frontend having to fetch and filter everything
// client-side.
mastersRouter.get(
  "/:key",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    const tenantSlug = req.auth!.tenantSlug;

    if (config.key === "employees") {
      const filter: Record<string, unknown> = { tenantSlug };
      if (typeof req.query.employeeCode === "string" && req.query.employeeCode.trim()) filter.employeeCode = req.query.employeeCode.trim();
      if (typeof req.query.name === "string" && req.query.name.trim()) filter.name = req.query.name.trim();
      if (typeof req.query.division === "string" && req.query.division.trim()) filter.division = req.query.division.trim();
      if (typeof req.query.status === "string" && req.query.status.trim()) {
        filter.status = MASTER_STATUS_TO_MODEL[req.query.status.trim()] ?? req.query.status.trim();
      }
      const employees = await EmployeeModel.find(filter).sort({ createdAt: 1 });
      res.json({ data: employees.map((e) => employeeToMasterShape(e.toObject())), schema: config });
      return;
    }

    const Model = getMasterModel(config.key);
    const filter: Record<string, unknown> = { tenantSlug };
    const fieldKeys = new Set(config.fields.map((f) => f.key));
    for (const [key, value] of Object.entries(req.query)) {
      if (!fieldKeys.has(key) || typeof value !== "string" || !value.trim()) continue;
      filter[key] = value;
    }
    const records = await Model.find(filter).sort({ createdAt: 1 });
    res.json({ data: records.map(serializeDocument), schema: config });
  })
);

// POST /masters/:key — create one record
mastersRouter.post(
  "/:key",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    const tenantSlug = req.auth!.tenantSlug;

    // A `computed` field (e.g. HQ/Designation/Emp.Code auto-derived from a
    // selected SF/Field Force Name) is display-only — the frontend never
    // includes it in the create payload, so it can never satisfy a
    // required-field check here. Skip those even if a screen also lists
    // them in keyFields (some approval screens do, to describe the
    // logical identity of a row), or every "Add Request" on that screen
    // would fail with a false "Missing required field(s)" error.
    const missing = config.fields
      .filter((f) => config.keyFields.includes(f.key) && !f.computed)
      .filter((f) => req.body[f.key] === undefined || req.body[f.key] === null || req.body[f.key] === "");
    if (missing.length) {
      throw new HttpError(400, `Missing required field(s): ${missing.map((f) => f.label).join(", ")}`);
    }

    validateOptionFields(config, req.body);

    if (config.key === "employees") {
      const existing = await EmployeeModel.findOne({ tenantSlug, employeeCode: req.body.employeeCode });
      if (existing) throw new HttpError(409, "A record with this Employee Code already exists");
      const dupeName = await EmployeeModel.findOne({ tenantSlug, name: req.body.name });
      if (dupeName) throw new HttpError(409, "A record with this Employee Name already exists");

      const role = EMPLOYEE_ROLE_ALIASES[req.body.role] ?? req.body.role;
      const created = await EmployeeModel.create({
        tenantSlug,
        employeeCode: req.body.employeeCode,
        name: req.body.name,
        designation: req.body.designation,
        division: req.body.division,
        territory: req.body.territory,
        role,
        dob: req.body.dob || null,
        email: req.body.email || null,
        phone: req.body.phone || null,
        joinDate: req.body.joinDate || null,
        city: req.body.city || null,
        state: req.body.state || null,
        country: req.body.country || null,
        reportingManager: req.body.reportingManager || null,
        status: "ACTIVE"
      });
      // A new MR/Manager gets a real Field/Manager portal login account
      // immediately, using the same standing credential convention as
      // every other employee (username = Employee Code, password = the
      // fixed default) — so they can log in (or Admin can Vacant-MR-Login
      // into them) right away, with no separate manual seeding step.
      await ensureEmployeeLoginAccount({
        employeeCode: created.employeeCode,
        name: created.name,
        role,
        tenantSlug: tenantSlug!
      });

      await audit("MASTER_EMPLOYEES_CREATED", "employees", String(created._id), { tenantSlug });
      await broadcastNotice({
        tenantSlug: tenantSlug!,
        audience: "ALL",
        title: `${config.title} added`,
        message: `A new ${config.title.toLowerCase()} record was added by Admin.`
      });
      res.status(201).json({ data: employeeToMasterShape(created.toObject()) });
      return;
    }

    const Model = getMasterModel(config.key);
    // Same reasoning as the required-field check above: a `computed`
    // keyField (like HQ, derived from SF Name) is never present in the
    // create payload, so including it here would either silently drop out
    // of the Mongo filter (Mongoose strips `undefined` values) and widen
    // the duplicate check to match on the remaining keys alone, or match
    // nothing at all — neither is the intended "does this exact request
    // already exist" check. Only compare on keyFields the client actually
    // sends.
    // Approval-queue screens (TP/DCR/Leave/Listed Dr Addition &
    // Deactivation Approval, etc.) represent individual SUBMITTED
    // REQUESTS, not a unique master record per person -- the same SF Name
    // legitimately submits many Tour Plans, DCRs, and leave requests over
    // time (that's the whole point of an approval queue). Once `hq`/
    // `designation` are `computed` (and so dropped from dupeCheckFields
    // above), the remaining key was often "sfName" alone, which wrongly
    // blocked a second, unrelated request for anyone who already had ANY
    // row on the screen -- exactly what happened once the queue was
    // seeded with one row per employee. Skip the dupe check entirely for
    // approval queues; it stays in place for real one-record-per-person
    // masters (Employee, Doctor Mapping, Target Master, etc.).
    const dupeCheckFields = config.uiKind === "approvalQueue"
      ? []
      : config.keyFields.filter((k) => !config.fields.find((f) => f.key === k)?.computed);
    let existing = null;
    if (dupeCheckFields.length) {
      const keyFilter: Record<string, unknown> = { tenantSlug };
      for (const k of dupeCheckFields) keyFilter[k] = req.body[k];
      existing = await Model.findOne(keyFilter);
    }
    if (existing) {
      throw new HttpError(409, `A record with this ${dupeCheckFields.join(" + ")} already exists`);
    }

    for (const uf of config.uniqueFields ?? []) {
      if (req.body[uf] === undefined || req.body[uf] === null || req.body[uf] === "") continue;
      const dupe = await Model.findOne({ tenantSlug, [uf]: req.body[uf] });
      if (dupe) {
        const label = config.fields.find((f) => f.key === uf)?.label ?? uf;
        throw new HttpError(409, `A record with this ${label} already exists`);
      }
    }

    const doc: Record<string, unknown> = { tenantSlug, status: "Active" };
    for (const f of config.fields) {
      if (req.body[f.key] !== undefined) doc[f.key] = req.body[f.key];
    }
    applyComputedSalesFields(config.key, doc);

    const created = await Model.create(doc);

    if (config.key === "doctorMapping") {
      await syncDoctorMappingToDoctor(tenantSlug!, created.toObject());
    }

    await audit(`MASTER_${config.key.toUpperCase()}_CREATED`, config.key, String(created._id), { tenantSlug });
    // Item 3 — "if the admin changes some things, it must send a
    // notification for the respected manager, hr, field repo."
    await broadcastNotice({
      tenantSlug: tenantSlug!,
      audience: "ALL",
      title: `${config.title} added`,
      message: `A new ${config.title.toLowerCase()} record was added by Admin.`
    });
    res.status(201).json({ data: serializeDocument(created) });
  })
);

// PUT /masters/:key/:id — update one record
mastersRouter.put(
  "/:key/:id",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    const tenantSlug = req.auth!.tenantSlug;

    if (config.key === "employees") {
      const update: Record<string, unknown> = {};
      for (const f of config.fields) {
        if (req.body[f.key] === undefined) continue;
        if (f.key === "role") { update.role = EMPLOYEE_ROLE_ALIASES[req.body.role] ?? req.body.role; continue; }
        if (f.key === "status") { update.status = MASTER_STATUS_TO_MODEL[req.body.status] ?? req.body.status; continue; }
        update[f.key] = req.body[f.key];
      }
      validateOptionFields(config, req.body);

      if (update.employeeCode) {
        const dupe = await EmployeeModel.findOne({ tenantSlug, employeeCode: update.employeeCode, _id: { $ne: req.params.id } });
        if (dupe) throw new HttpError(409, "A record with this Employee Code already exists");
      }
      if (update.name) {
        const dupe = await EmployeeModel.findOne({ tenantSlug, name: update.name, _id: { $ne: req.params.id } });
        if (dupe) throw new HttpError(409, "A record with this Employee Name already exists");
      }

      const updated = await EmployeeModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: update }, { new: true });
      if (!updated) throw new HttpError(404, `${config.title} record not found`);

      await audit("MASTER_EMPLOYEES_UPDATED", "employees", String(updated._id), { tenantSlug });
      await broadcastNotice({
        tenantSlug: tenantSlug!,
        audience: "ALL",
        title: `${config.title} updated`,
        message: `A ${config.title.toLowerCase()} record was updated by Admin.`
      });
      res.json({ data: employeeToMasterShape(updated.toObject()) });
      return;
    }

    const Model = getMasterModel(config.key);
    const update: Record<string, unknown> = {};
    for (const f of config.fields) {
      if (req.body[f.key] !== undefined) update[f.key] = req.body[f.key];
    }

    validateOptionFields(config, update);

    for (const uf of config.uniqueFields ?? []) {
      if (update[uf] === undefined || update[uf] === null || update[uf] === "") continue;
      const dupe = await Model.findOne({ tenantSlug, [uf]: update[uf], _id: { $ne: req.params.id } });
      if (dupe) {
        const label = config.fields.find((f) => f.key === uf)?.label ?? uf;
        throw new HttpError(409, `A record with this ${label} already exists`);
      }
    }

    // A PUT here can be a partial update (e.g. only Return Unit changed) —
    // computing Target Value / Net Sale Unit / Net Sale Value from `update`
    // alone would silently drop whichever side of the calculation wasn't
    // resubmitted. Merge onto the existing record first so the computed
    // fields always reflect the real, complete row.
    if (config.key === "targetMaster" || config.key === "primarySales" || config.key === "secondarySales") {
      const existing = await Model.findOne({ _id: req.params.id, tenantSlug }).lean();
      if (!existing) throw new HttpError(404, `${config.title} record not found`);
      const merged: Record<string, unknown> = { ...existing, ...update };
      applyComputedSalesFields(config.key, merged);
      const computedKeys = config.key === "targetMaster" ? ["targetValue"] : ["netSaleUnit", "netSaleValue"];
      for (const k of computedKeys) update[k] = merged[k];
    }

    const updated = await Model.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: update }, { new: true });
    if (!updated) throw new HttpError(404, `${config.title} record not found`);

    if (config.key === "doctorMapping") {
      await syncDoctorMappingToDoctor(tenantSlug!, updated.toObject());
    }

    await audit(`MASTER_${config.key.toUpperCase()}_UPDATED`, config.key, String(updated._id), { tenantSlug });
    await broadcastNotice({
      tenantSlug: tenantSlug!,
      audience: "ALL",
      title: `${config.title} updated`,
      message: `A ${config.title.toLowerCase()} record was updated by Admin.`
    });
    res.json({ data: serializeDocument(updated) });
  })
);

// POST /masters/:key/:id/deactivate — soft delete
mastersRouter.post(
  "/:key/:id/deactivate",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    const tenantSlug = req.auth!.tenantSlug;

    if (config.key === "employees") {
      const updated = await EmployeeModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: { status: "INACTIVE" } }, { new: true });
      if (!updated) throw new HttpError(404, `${config.title} record not found`);
      await audit("MASTER_EMPLOYEES_DEACTIVATED", "employees", String(updated._id), { tenantSlug });
      await broadcastNotice({
        tenantSlug: tenantSlug!,
        audience: "ALL",
        title: `${config.title} deactivated`,
        message: `A ${config.title.toLowerCase()} record was deactivated by Admin.`
      });
      res.json({ data: employeeToMasterShape(updated.toObject()) });
      return;
    }

    const Model = getMasterModel(config.key);
    const updated = await Model.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: { status: "Inactive" } },
      { new: true }
    );
    if (!updated) throw new HttpError(404, `${config.title} record not found`);

    if (config.key === "doctorMapping") {
      await syncDoctorMappingToDoctor(tenantSlug!, updated.toObject());
    }

    await audit(`MASTER_${config.key.toUpperCase()}_DEACTIVATED`, config.key, String(updated._id), { tenantSlug });
    await broadcastNotice({
      tenantSlug: tenantSlug!,
      audience: "ALL",
      title: `${config.title} deactivated`,
      message: `A ${config.title.toLowerCase()} record was deactivated by Admin.`
    });
    res.json({ data: serializeDocument(updated) });
  })
);

// POST /masters/:key/:id/reactivate
mastersRouter.post(
  "/:key/:id/reactivate",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    const tenantSlug = req.auth!.tenantSlug;

    if (config.key === "employees") {
      const updated = await EmployeeModel.findOneAndUpdate({ _id: req.params.id, tenantSlug }, { $set: { status: "ACTIVE" } }, { new: true });
      if (!updated) throw new HttpError(404, `${config.title} record not found`);
      res.json({ data: employeeToMasterShape(updated.toObject()) });
      return;
    }

    const Model = getMasterModel(config.key);
    const updated = await Model.findOneAndUpdate(
      { _id: req.params.id, tenantSlug },
      { $set: { status: "Active" } },
      { new: true }
    );
    if (!updated) throw new HttpError(404, `${config.title} record not found`);

    if (config.key === "doctorMapping") {
      await syncDoctorMappingToDoctor(tenantSlug!, updated.toObject());
    }

    res.json({ data: serializeDocument(updated) });
  })
);

// ══════════════════════════════════════════════════════════════════════
// DELETE /masters/:key/:id — real hard delete for the handful of screens
// where sanpharma.info's own UI is a literal "Delete" action, not a
// deactivate: Mobile App - Device Id Deletion and Mail Delete. Every
// other master keeps its existing soft-deactivate/reactivate behavior;
// this is deliberately restricted the same way clear-all is below.
// ══════════════════════════════════════════════════════════════════════
const HARD_DELETABLE_MASTERS = new Set(["deviceIdDeletion", "mailDeleteLog", "callFeedbackCreation", "callRemarksTemplates", "notificationMessage", "fileUploadDesignationwise", "userManualUpload"]);

mastersRouter.delete(
  "/:key/:id",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    if (!HARD_DELETABLE_MASTERS.has(config.key)) {
      throw new HttpError(403, `${config.title} does not support delete`);
    }
    const tenantSlug = req.auth!.tenantSlug;
    const Model = getMasterModel(config.key);
    const deleted = await Model.findOneAndDelete({ _id: req.params.id, tenantSlug });
    if (!deleted) throw new HttpError(404, `${config.title} record not found`);

    await audit(`MASTER_${config.key.toUpperCase()}_DELETED`, config.key, String(deleted._id), { tenantSlug });
    res.json({ data: { success: true, id: req.params.id } });
  })
);

// ══════════════════════════════════════════════════════════════════════
// POST /masters/:key/clear-all — hard-delete every record of one master
// for the current tenant. Client request: "remove all the datas in the
// sales tab (Target Master, Primary Sales, Secondary Sales, Claims
// Master, IMS)" — a one-time wipe of demo/sample rows, not a soft
// deactivate (which only flips status and leaves the row in place).
// Deliberately restricted to just these 5 Sales-tab masters: this is a
// destructive, tenant-wide bulk delete, and nowhere else was this asked
// for — every other master keeps its existing per-record
// create/update/deactivate/reactivate behavior untouched.
// ══════════════════════════════════════════════════════════════════════
const CLEARABLE_MASTERS = new Set(["targetMaster", "primarySales", "secondarySales", "claimsMaster", "imsMaster"]);

mastersRouter.post(
  "/:key/clear-all",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    if (!CLEARABLE_MASTERS.has(config.key)) {
      throw new HttpError(403, `${config.title} does not support bulk clear`);
    }

    const tenantSlug = req.auth!.tenantSlug;
    const Model = getMasterModel(config.key);
    const result = await Model.deleteMany({ tenantSlug });

    await audit(`MASTER_${config.key.toUpperCase()}_CLEARED`, config.key, "ALL", {
      tenantSlug,
      deletedCount: result.deletedCount
    });

    res.json({ data: { success: true, deletedCount: result.deletedCount } });
  })
);

// ══════════════════════════════════════════════════════════════════════
// DCR Bulk Approval — sanpharma.info's DCR_Bulk_Approval.aspx shows a
// manager one row per activity DATE for a chosen field rep + month, with
// checkboxes to approve/reject many dates in one shot, instead of the
// single-row "Click Here to Approve" detail popup the existing
// `approvalDcr` ApprovalQueueTable renders one request at a time (see the
// registry.ts comment on the `approvalDcr` master). This is an ADDITIONAL
// view over the exact same `approvalDcr` master collection/rows the
// single-row queue already reads and writes — it does not replace that
// screen or its route, so anything still using the single-row flow keeps
// working exactly as before.
//
// `setApprovalStatus` below is the same read-modify-write PUT /:key/:id
// above performs when the only field being changed is `approvalStatus`
// (Model.findOneAndUpdate + audit + broadcastNotice) — pulled into a
// named function so the new bulk-action endpoint reuses this exact
// approve/reject write instead of re-implementing it inline. The generic
// PUT handler itself is left untouched (it also has to serve every other
// master's full-record edit), so this is a shared helper for the new
// bulk path, not a refactor of the existing single-row route.
// ══════════════════════════════════════════════════════════════════════
const BULK_APPROVAL_MASTERS = new Set(["approvalDcr"]);

async function setApprovalStatus(
  config: ReturnType<typeof requireConfig>,
  tenantSlug: string,
  id: string,
  status: "Approved" | "Rejected"
) {
  const Model = getMasterModel(config.key);
  const updated = await Model.findOneAndUpdate(
    { _id: id, tenantSlug },
    { $set: { approvalStatus: status } },
    { new: true }
  );
  if (!updated) throw new HttpError(404, `${config.title} record not found`);
  await audit(`MASTER_${config.key.toUpperCase()}_UPDATED`, config.key, String(updated._id), { tenantSlug, approvalStatus: status });
  await broadcastNotice({
    tenantSlug,
    audience: "ALL",
    title: `${config.title} updated`,
    message: `A ${config.title.toLowerCase()} record was updated by Admin.`
  });
  return updated;
}

// GET /masters/:key/bulk?sfName=<name>&month=<YYYY-MM> — every approvalDcr
// row for one field rep in one calendar month, one row per activity date,
// oldest first. `activityDate` is stored as a real Date (mirrorApprovalRow
// in field.routes.ts assigns `dcr.visitDate` directly, not a string), so
// the month is matched with a UTC date range rather than a string prefix.
mastersRouter.get(
  "/:key/bulk",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    if (!BULK_APPROVAL_MASTERS.has(config.key)) {
      throw new HttpError(403, `${config.title} does not support bulk approval`);
    }
    const tenantSlug = req.auth!.tenantSlug!;

    const sfName = typeof req.query.sfName === "string" ? req.query.sfName.trim() : "";
    const month = typeof req.query.month === "string" ? req.query.month.trim() : "";
    if (!sfName || !/^\d{4}-\d{2}$/.test(month)) {
      throw new HttpError(400, "sfName and month (YYYY-MM) query params are required");
    }
    const [year, monthNum] = month.split("-").map(Number);
    const rangeStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, monthNum, 1));

    const Model = getMasterModel(config.key);
    const records = await Model.find({
      tenantSlug,
      sfName,
      activityDate: { $gte: rangeStart, $lt: rangeEnd }
    }).sort({ activityDate: 1 });

    res.json({ data: records.map(serializeDocument), schema: config });
  })
);

// POST /masters/:key/bulk-action — body { ids: string[], status: "Approved" | "Rejected" }.
// Applies the same single-row approve/reject write to every id, one at a
// time (a plain loop, not a Mongo multi-document transaction — this
// deployment's Mongo isn't guaranteed to run as a replica set, and each
// row's approval is independently meaningful, so a partial success is
// reported back rather than treated as a failure needing rollback). Any
// row that fails (already gone, wrong tenant) is reported per-id instead
// of aborting the rest of the batch.
mastersRouter.post(
  "/:key/bulk-action",
  asyncHandler(async (req, res) => {
    const config = requireConfig(req.params.key);
    if (!BULK_APPROVAL_MASTERS.has(config.key)) {
      throw new HttpError(403, `${config.title} does not support bulk approval`);
    }
    const tenantSlug = req.auth!.tenantSlug!;

    const status = req.body?.status;
    if (status !== "Approved" && status !== "Rejected") {
      throw new HttpError(400, "status must be 'Approved' or 'Rejected'");
    }
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((v: unknown) => typeof v === "string" && v.trim()) : [];
    if (!ids.length) {
      throw new HttpError(400, "ids must be a non-empty array of record ids");
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await setApprovalStatus(config, tenantSlug, id, status);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : "Failed to update" });
      }
    }

    res.json({ data: { results, updatedCount: results.filter((r) => r.ok).length } });
  })
);
