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

export async function runDataCorrections() {
  await connectMongo();
  console.log(`Connected. Running targeted data corrections for tenant "${TENANT}" (no records deleted, no other fields touched)...`);

  await fixAraSpelling();
  await fixDoctorCategoryD();
  await fixYearFields();

  console.log("\nDone.");
}
