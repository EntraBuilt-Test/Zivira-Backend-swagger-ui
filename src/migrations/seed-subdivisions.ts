import path from "node:path";
import XLSX from "xlsx";
import mongoose from "mongoose";
import { connectMongo } from "../db.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { config } from "../config.js";

const TENANT_SLUG = "zivira-labs";
const SHEET_NAME = "Sub-Division";

type SubdivisionImportRow = {
  Division?: string;
  "Sub Division Name"?: string;
  "Productwise Count"?: number;
  "Fieldforcewise Count"?: number;
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
    console.error("Usage: tsx src/migrations/seed-subdivisions.ts <path-to-Subdivision_Import.xlsx>");
    process.exit(1);
  }

  // ── Step 4: print the connection target BEFORE writing anything ──
  const target = describeMongoTarget(config.mongoUri);
  console.log("=== Connection target ===");
  console.log(`Host:     ${target.host}`);
  console.log(`Database: ${target.database}`);
  console.log("");

  const workbook = XLSX.readFile(path.resolve(filePath));
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    console.error(`Sheet "${SHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json<SubdivisionImportRow>(sheet, { defval: "" });
  console.log(`=== Read ${rows.length} data row(s) from "${SHEET_NAME}" sheet in ${path.basename(filePath)} ===\n`);

  await connectMongo();
  console.log(`Connected to ${target.host} / ${target.database}.\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const division = String(row.Division ?? "").trim();
    const subdivisionName = String(row["Sub Division Name"] ?? "").trim();
    const productwiseCount = Number(row["Productwise Count"] ?? 0);
    const fieldforcewiseCount = Number(row["Fieldforcewise Count"] ?? 0);

    if (!division || !subdivisionName) {
      console.warn("Skipping row with missing division/subdivisionName:", row);
      skipped++;
      continue;
    }

    // productwiseCount / fieldforcewiseCount here are a manual snapshot taken from the
    // client's source Excel at import time — they do NOT auto-update. Once the Product
    // and Employee collections are fully loaded, replace this with a live aggregation
    // (count of Products/Employees whose division matches this record) instead of a
    // static stored number, so counts can't silently go stale.
    const result = await SubdivisionModel.updateOne(
      { tenantSlug: TENANT_SLUG, division },
      {
        $set: {
          tenantSlug: TENANT_SLUG,
          division,
          subdivisionName,
          productwiseCount,
          fieldforcewiseCount,
          status: "ACTIVE"
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount) {
      created++;
      console.log(`Created: ${division} -> ${subdivisionName} (products=${productwiseCount}, fieldforce=${fieldforcewiseCount})`);
    } else {
      updated++;
      console.log(`Updated: ${division} -> ${subdivisionName} (products=${productwiseCount}, fieldforce=${fieldforcewiseCount})`);
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);

  // ── Step 4: verify by reading back exactly what's in the collection now ──
  console.log(`\n=== Verification: Subdivision.find({ tenantSlug: "${TENANT_SLUG}" }) ===`);
  const finalDocs = await SubdivisionModel.find({ tenantSlug: TENANT_SLUG }).sort({ division: 1 }).lean();
  console.log(`${finalDocs.length} document(s) found:\n`);
  for (const doc of finalDocs) {
    console.log(JSON.stringify(doc, null, 2));
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
