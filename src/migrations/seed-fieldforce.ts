import path from "node:path";
import XLSX from "xlsx";
import mongoose from "mongoose";
import { connectMongo } from "../db.js";
import { FieldForceModel } from "../models/fieldforce.model.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { config } from "../config.js";

const TENANT_SLUG = "zivira-labs";
const SHEET_NAME = "Employee";

type EmployeeImportRow = {
  EmployeeName?: string;
  division?: string;
  rolename?: string;
  Employeecode?: string;
  "HQ /Territory"?: string;
  "L1 Reporting manager employeecode"?: string;
};

function describeMongoTarget(uri: string) {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, "");
  const afterAuth = withoutProtocol.includes("@") ? withoutProtocol.split("@")[1] : withoutProtocol;
  const host = afterAuth.split("/")[0] ?? "(unknown)";
  const database = afterAuth.split("/")[1]?.split("?")[0] || "(no db in URI)";
  return { host, database };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx src/migrations/seed-fieldforce.ts <path-to-data-template.xlsx>");
    process.exit(1);
  }

  const target = describeMongoTarget(config.mongoUri);
  console.log("=== Connection target ===");
  console.log(`Host:     ${target.host}`);
  console.log(`Database: ${target.database}\n`);

  const workbook = XLSX.readFile(path.resolve(filePath));
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<EmployeeImportRow>(sheet, { defval: "" });
  console.log(`=== Read ${rows.length} data row(s) from "${SHEET_NAME}" sheet in ${path.basename(filePath)} ===\n`);

  await connectMongo();
  console.log(`Connected to ${target.host} / ${target.database}.\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = String(row.EmployeeName ?? "").trim();
    const designation = String(row.rolename ?? "").trim();
    const subDivision = String(row.division ?? "").trim();
    const employeeCode = String(row.Employeecode ?? "").trim();
    const hq = String(row["HQ /Territory"] ?? "").trim();
    const reportingTo = String(row["L1 Reporting manager employeecode"] ?? "").trim();

    if (!name || !designation || !subDivision || !employeeCode) {
      console.warn("Skipping row with missing name/designation/division/Employeecode:", row);
      skipped++;
      continue;
    }

    const result = await FieldForceModel.updateOne(
      { tenantSlug: TENANT_SLUG, employeeCode },
      {
        $set: {
          tenantSlug: TENANT_SLUG,
          name,
          designation,
          hq,
          reportingTo,
          subDivision,
          employeeCode,
          status: "ACTIVE"
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount) created++; else updated++;
  }

  console.log(`Done. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);

  // ── Verification: total count + count grouped by subDivision, against the known Sub-Divisions ──
  console.log(`\n=== Verification ===`);
  const totalCount = await FieldForceModel.countDocuments({ tenantSlug: TENANT_SLUG });
  console.log(`Total field force records: ${totalCount}`);

  const bySubDivision = await FieldForceModel.aggregate([
    { $match: { tenantSlug: TENANT_SLUG } },
    { $group: { _id: "$subDivision", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(bySubDivision.map((row) => [row._id ?? "(unset)", row.count as number]));

  const subdivisions = await SubdivisionModel.find({ tenantSlug: TENANT_SLUG }).sort({ subdivisionName: 1 }).lean();
  console.log("\nCount by subDivision (against all known Sub-Divisions):");
  for (const sub of subdivisions) {
    console.log(`  ${sub.subdivisionName}: ${countMap.get(sub.subdivisionName) ?? 0}`);
  }
  const unrecognized = [...countMap.keys()].filter((key) => !subdivisions.some((sub) => sub.subdivisionName === key));
  if (unrecognized.length > 0) {
    console.log("\nField force with a subDivision not matching any known Sub-Division:");
    for (const key of unrecognized) {
      console.log(`  ${key}: ${countMap.get(key)}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
