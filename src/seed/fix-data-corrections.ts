// src/seed/fix-data-corrections.ts
//
// Targeted, non-destructive data correction for two specific issues reported
// against the live tenant data (NOT the demo seed logic in exact-10.ts,
// which is a full wipe+reset and would also erase any real records the user
// has since added through the admin UI):
//
//   1. Any string field anywhere across the masters registry that is exactly
//      "ARA" (case-insensitive, whole-value match — never a substring, so a
//      genuine surname or word that merely contains "ara" is left alone) is
//      corrected to "Aura".
//   2. Any Doctor Category value of "D" is remapped to A/B/C. The registry
//      (src/masters/registry.ts) has only ever offered A/B/C as options —
//      "D" can only exist in already-stored documents from before that was
//      enforced — so this cycles existing "D" rows across A/B/C evenly
//      rather than dumping them all into one bucket.
//   3. Any field keyed/ending in "year" (Holiday Calendar's Year column,
//      etc.) whose stored value is a small placeholder number (1, 2, 3...)
//      instead of a real calendar year. genericValue() in exact-10.ts was
//      fixed to generate real years for these fields, but documents seeded
//      before that fix still have the old 1/2/3... placeholders sitting in
//      the live database — this corrects those in place without touching
//      anything else on the record.
//
// Safe to re-run any time: it only touches documents that still match the
// bad value, so a second run is a no-op.

import { connectMongo } from "../db.js";
import { getMasterModel } from "../models/master-record.model.js";
import { MASTERS } from "../masters/registry.js";
import { EmployeeModel } from "../models/employee.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { nextDoctorCode } from "../utils/doctor-code.js";
import { TourPlanModel } from "../models/tour-plan.model.js";
import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { DealerModel } from "../models/dealer.model.js";
import { SfcModel } from "../models/sfc.model.js";
import { TaskModel } from "../models/task.model.js";
import { ProductModel } from "../models/product.model.js";

const TENANT = "zivira-labs";
const ROTATION: readonly string[] = ["A", "B", "C"];

async function fixAraSpelling() {
  console.log("\n── Fixing 'ARA' -> 'Aura' across all master collections ──");
  let totalFixed = 0;

  for (const config of MASTERS) {
    const Model = getMasterModel(config.key);
    const stringFieldKeys = config.fields.map((f) => f.key);

    for (const key of stringFieldKeys) {
      const matches = await Model.find({
        tenantSlug: TENANT,
        [key]: { $regex: /^ARA$/i }
      });
      if (!matches.length) continue;

      for (const doc of matches) {
        (doc as any)[key] = "Aura";
        await doc.save();
      }
      totalFixed += matches.length;
      console.log(`  [FIXED] ${config.key}.${key}: ${matches.length} record(s) "ARA" -> "Aura"`);
    }
  }

  // The employees collection is a hand-written legacy model (not part of the
  // generic masters registry) whose free-text "division" field can carry the
  // same typo — Division Master's own dropdown already only offers
  // Astra/Aura/Zivira, but this field is a separate plain string.
  const badEmployees = await EmployeeModel.find({ tenantSlug: TENANT, division: { $regex: /^ARA$/i } });
  if (badEmployees.length) {
    for (const doc of badEmployees) {
      (doc as any).division = "Aura";
      await doc.save();
    }
    totalFixed += badEmployees.length;
    console.log(`  [FIXED] employees.division: ${badEmployees.length} record(s) "ARA" -> "Aura"`);
  }

  console.log(totalFixed ? `  Total corrected: ${totalFixed}` : "  No 'ARA' values found — nothing to fix.");
}

async function fixDoctorCategoryD() {
  console.log("\n── Removing Doctor Category 'D' (A/B/C only) ──");
  let totalFixed = 0;

  // Every master whose registry entry restricts a field to exactly the
  // A/B/C doctor-category options — covers doctorClassification today, and
  // automatically covers any future master reusing the same options list
  // without needing this script updated.
  for (const config of MASTERS) {
    for (const field of config.fields) {
      if (!field.options || field.options.length !== 3) continue;
      if (!(field.options.includes("A") && field.options.includes("B") && field.options.includes("C"))) continue;

      const Model = getMasterModel(config.key);
      const matches = await Model.find({ tenantSlug: TENANT, [field.key]: { $regex: /^D$/i } }).sort({ createdAt: 1 });
      if (!matches.length) continue;

      for (let i = 0; i < matches.length; i++) {
        const doc = matches[i];
        (doc as any)[field.key] = ROTATION[i % ROTATION.length];
        await doc.save();
      }
      totalFixed += matches.length;
      console.log(`  [FIXED] ${config.key}.${field.key}: ${matches.length} record(s) "D" remapped across A/B/C`);
    }
  }

  console.log(totalFixed ? `  Total corrected: ${totalFixed}` : "  No Category 'D' values found — nothing to fix.");
}

async function fixYearFields() {
  console.log("\n── Fixing placeholder Year values (1, 2, 3...) -> real calendar years ──");
  let totalFixed = 0;

  // Same field-matching rule genericValue() in exact-10.ts uses to decide a
  // field needs a real calendar year rather than a row index — covers
  // Holiday Calendar's "year" today, and any future master reusing the same
  // key pattern, automatically.
  for (const config of MASTERS) {
    for (const field of config.fields) {
      if (field.type !== "number") continue;
      const key = field.key.toLowerCase();
      if (key !== "year" && !key.endsWith("year")) continue;

      const Model = getMasterModel(config.key);
      // A genuine calendar year is always >= 1900; anything smaller stored
      // in this field can only be a leftover 1/2/3... placeholder from
      // before exact-10.ts generated real years here.
      const matches = await Model.find({ tenantSlug: TENANT, [field.key]: { $lt: 1900 } }).sort({ createdAt: 1 });
      if (!matches.length) continue;

      for (let i = 0; i < matches.length; i++) {
        const doc = matches[i];
        (doc as any)[field.key] = 2023 + (i % 4);
        await doc.save();
      }
      totalFixed += matches.length;
      console.log(`  [FIXED] ${config.key}.${field.key}: ${matches.length} record(s) placeholder -> real calendar year`);
    }
  }

  console.log(totalFixed ? `  Total corrected: ${totalFixed}` : "  No placeholder Year values found — nothing to fix.");
}


const OLD_DEMO_NAME = "Demo Medical Representative";
const NEW_DEMO_NAME = "Rahul Deshmuth";

async function renameDemoRep() {
  // Round 12 item 2 / Round 13 mandate 2 — the seeded demo employee was
  // literally named "Demo Medical Representative" everywhere (dropdowns,
  // DCR rows, tables). Round 12 added this function but it was never
  // actually invoked against the live database (this script is a CLI the
  // user has to run — it doing nothing until run is exactly why the name
  // was still showing everywhere in Round 13's fresh screenshots). Beyond
  // the Employee record itself, several OTHER collections embed the
  // employee's name as a plain denormalized string at the time each record
  // was created (TourPlanModel.employeeName, ExpenseClaimModel.employeeName,
  // DealerModel/SfcModel.employeeName, TaskModel.assignedToName/
  // assignedByName) rather than joining live against Employee — those
  // already-existing historical records keep the OLD name forever unless
  // corrected here too, even after the Employee record itself is renamed.
  console.log(`\n── Renaming '${OLD_DEMO_NAME}' -> '${NEW_DEMO_NAME}' (Employee + every embedded copy) ──`);

  const employee = await EmployeeModel.findOne({ tenantSlug: TENANT, name: OLD_DEMO_NAME }).lean();
  const employeeCode = (employee as any)?.employeeCode as string | undefined;

  const empResult = await EmployeeModel.updateMany(
    { tenantSlug: TENANT, name: OLD_DEMO_NAME },
    { $set: { name: NEW_DEMO_NAME } }
  );
  console.log(empResult.modifiedCount ? `  [FIXED] employees: ${empResult.modifiedCount} record(s) renamed.` : "  employees: no matching record found.");

  if (employeeCode) {
    const tp = await TourPlanModel.updateMany({ tenantSlug: TENANT, employeeCode, employeeName: OLD_DEMO_NAME }, { $set: { employeeName: NEW_DEMO_NAME } });
    if (tp.modifiedCount) console.log(`  [FIXED] tour plans: ${tp.modifiedCount} record(s) embedded employeeName corrected.`);

    const ec = await ExpenseClaimModel.updateMany({ tenantSlug: TENANT, employeeCode, employeeName: OLD_DEMO_NAME }, { $set: { employeeName: NEW_DEMO_NAME } });
    if (ec.modifiedCount) console.log(`  [FIXED] expense claims: ${ec.modifiedCount} record(s) embedded employeeName corrected.`);

    const dl = await DealerModel.updateMany({ tenantSlug: TENANT, employeeCode, employeeName: OLD_DEMO_NAME }, { $set: { employeeName: NEW_DEMO_NAME } });
    if (dl.modifiedCount) console.log(`  [FIXED] dealers: ${dl.modifiedCount} record(s) embedded employeeName corrected.`);

    const sfc = await SfcModel.updateMany({ tenantSlug: TENANT, employeeCode, employeeName: OLD_DEMO_NAME }, { $set: { employeeName: NEW_DEMO_NAME } });
    if (sfc.modifiedCount) console.log(`  [FIXED] sfc: ${sfc.modifiedCount} record(s) embedded employeeName corrected.`);

    const taskTo = await TaskModel.updateMany({ tenantSlug: TENANT, assignedToEmployeeCode: employeeCode, assignedToName: OLD_DEMO_NAME }, { $set: { assignedToName: NEW_DEMO_NAME } });
    if (taskTo.modifiedCount) console.log(`  [FIXED] tasks (assignedToName): ${taskTo.modifiedCount} record(s) corrected.`);

    const taskBy = await TaskModel.updateMany({ tenantSlug: TENANT, assignedByEmployeeCode: employeeCode, assignedByName: OLD_DEMO_NAME }, { $set: { assignedByName: NEW_DEMO_NAME } });
    if (taskBy.modifiedCount) console.log(`  [FIXED] tasks (assignedByName): ${taskBy.modifiedCount} record(s) corrected.`);
  }

  // Generic-masters registry rows (Leave Cancellation, Chemist Release/Lock,
  // Device Id Deletion, etc.) that seeded a literal fieldForceName string —
  // these don't carry an employeeCode at all, so match on the exact old
  // name value directly rather than via employeeCode.
  let genericFixed = 0;
  for (const config of MASTERS) {
    const hasFieldForceName = config.fields.some((f) => f.key === "fieldForceName");
    if (!hasFieldForceName) continue;
    const Model = getMasterModel(config.key);
    const result = await Model.updateMany(
      { tenantSlug: TENANT, fieldForceName: OLD_DEMO_NAME },
      { $set: { fieldForceName: NEW_DEMO_NAME } }
    );
    if (result.modifiedCount) {
      genericFixed += result.modifiedCount;
      console.log(`  [FIXED] ${config.key}.fieldForceName: ${result.modifiedCount} record(s) corrected.`);
    }
  }
  if (!genericFixed) console.log("  generic masters: no embedded fieldForceName copies found.");
}

async function backfillDoctorCodes() {
  // Round 12 item 6 — the Unlisted -> Listed Doctor conversion route never
  // set doctorCode, leaving converted doctors ("Dr. Pending Review N", etc.)
  // with a permanently blank Doctor Code column. Backfill real, sequential
  // DOC-0XX codes (same convention as every other listed doctor) one at a
  // time so each backfilled doctor gets its own unique next-available code.
  console.log("\n── Backfilling blank Doctor Code values ──");
  const missing = await DoctorModel.find({
    tenantSlug: TENANT,
    $or: [{ doctorCode: null }, { doctorCode: { $exists: false } }, { doctorCode: "" }]
  }).sort({ createdAt: 1 });
  if (!missing.length) {
    console.log("  No blank Doctor Code values found — nothing to fix.");
    return;
  }
  for (const doc of missing) {
    doc.doctorCode = await nextDoctorCode(TENANT);
    await doc.save();
    console.log(`  [FIXED] ${doc.name}: assigned ${doc.doctorCode}`);
  }
  console.log(`  Total corrected: ${missing.length}`);
}

async function normalizeGenericMasterFieldForceNames() {
  // Round 12 item 7 — some generic-master rows (e.g. Chemist - Release/Lock
  // Month-wise) had a fieldForceName value that differed from the real
  // Employee.name only by case or stray whitespace, so the frontend's
  // exact-string join to pull Designation/Emp Code silently failed for
  // those specific rows while every exact-matching row worked fine. Correct
  // the stored value to the real employee's exact name wherever a
  // case/whitespace-insensitive match exists.
  console.log("\n── Normalizing generic-master fieldForceName values against real employees ──");
  const employees = await EmployeeModel.find({ tenantSlug: TENANT }, { name: 1 }).lean();
  const byNormalized = new Map<string, string>();
  for (const e of employees) {
    if (e.name) byNormalized.set(e.name.trim().toLowerCase().replace(/\s+/g, " "), e.name);
  }

  let totalFixed = 0;
  for (const config of MASTERS) {
    const hasFieldForceName = config.fields.some((f) => f.key === "fieldForceName");
    if (!hasFieldForceName) continue;
    const Model = getMasterModel(config.key);
    const rows = await Model.find({ tenantSlug: TENANT });
    for (const row of rows) {
      const raw = (row as any).fieldForceName;
      if (typeof raw !== "string" || !raw) continue;
      const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
      const real = byNormalized.get(normalized);
      if (real && real !== raw) {
        (row as any).fieldForceName = real;
        await row.save();
        totalFixed++;
        console.log(`  [FIXED] ${config.key}: "${raw}" -> "${real}"`);
      }
    }
  }
  console.log(totalFixed ? `  Total corrected: ${totalFixed}` : "  No mismatched fieldForceName values found — nothing to fix.");
}

// Round 13 item 4 — same category -> molecule ("Group") mapping exact-10.ts
// now seeds new Product rows with; backfills the Group value on any
// already-existing Product record that was created before that fix and so
// is still stuck at the schema's null default.
const CATEGORY_TO_GROUP: Record<string, string> = {
  Ophthalmology: "Carboxymethylcellulose",
  Cardiology: "Olopatadine",
  Diabetology: "Moxifloxacin",
  Dermatology: "Loteprednol",
  Pediatrics: "Timolol",
  Neurology: "Brimonidine",
  Gynaecology: "Ketotifen",
  Orthopedics: "Nepafenac",
  ENT: "Bimatoprost",
  "General Medicine": "Cyclosporine"
};

async function backfillProductGroups() {
  console.log("\n── Backfilling blank Product Group values ──");
  const missing = await ProductModel.find({
    tenantSlug: TENANT,
    $or: [{ group: null }, { group: { $exists: false } }, { group: "" }]
  });
  if (!missing.length) {
    console.log("  No blank Group values found — nothing to fix.");
    return;
  }
  let fixed = 0;
  for (const doc of missing) {
    const group = CATEGORY_TO_GROUP[(doc as any).category];
    if (!group) continue;
    (doc as any).group = group;
    await doc.save();
    fixed++;
    console.log(`  [FIXED] ${(doc as any).name} (${(doc as any).category}): Group = ${group}`);
  }
  console.log(`  Total corrected: ${fixed}`);
}

export async function runDataCorrections() {
  await connectMongo();
  console.log(`Connected. Running targeted data corrections for tenant "${TENANT}" (no records deleted, no other fields touched)...`);

  await fixAraSpelling();
  await fixDoctorCategoryD();
  await fixYearFields();
  await renameDemoRep();
  await backfillDoctorCodes();
  await normalizeGenericMasterFieldForceNames();
  await backfillProductGroups();

  console.log("\nDone.");
}
