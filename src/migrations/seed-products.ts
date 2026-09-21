import path from "node:path";
import XLSX from "xlsx";
import mongoose from "mongoose";
import { connectMongo } from "../db.js";
import { ProductModel } from "../models/product.model.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { config } from "../config.js";

const TENANT_SLUG = "zivira-labs";
const PRODUCT_SHEET = "Product";
const BRAND_SHEET = "Brand";

type ProductImportRow = {
  ProductName?: string;
  BrandName?: string;
  Molecule?: string;
  Therapy?: string;
};

type BrandImportRow = {
  BrandName?: string;
  Division?: string;
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
    console.error("Usage: tsx src/migrations/seed-products.ts <path-to-data-template.xlsx>");
    process.exit(1);
  }

  const target = describeMongoTarget(config.mongoUri);
  console.log("=== Connection target ===");
  console.log(`Host:     ${target.host}`);
  console.log(`Database: ${target.database}\n`);

  const workbook = XLSX.readFile(path.resolve(filePath));

  const brandSheet = workbook.Sheets[BRAND_SHEET];
  if (!brandSheet) {
    console.error(`Sheet "${BRAND_SHEET}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }
  const brandRows = XLSX.utils.sheet_to_json<BrandImportRow>(brandSheet, { defval: "" });

  // brandName -> division, built from the Brand sheet
  const brandToDivision = new Map<string, string>();
  for (const row of brandRows) {
    const brandName = String(row.BrandName ?? "").trim();
    const division = String(row.Division ?? "").trim();
    if (brandName && division) brandToDivision.set(brandName, division);
  }
  console.log(`Built brand -> division lookup from ${brandToDivision.size} Brand sheet row(s).\n`);

  const productSheet = workbook.Sheets[PRODUCT_SHEET];
  if (!productSheet) {
    console.error(`Sheet "${PRODUCT_SHEET}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json<ProductImportRow>(productSheet, { defval: "" });
  console.log(`=== Read ${rows.length} data row(s) from "${PRODUCT_SHEET}" sheet in ${path.basename(filePath)} ===\n`);

  await connectMongo();
  console.log(`Connected to ${target.host} / ${target.database}.\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let unmappedDivision = 0;

  for (const row of rows) {
    const productName = String(row.ProductName ?? "").trim();
    const brandName = String(row.BrandName ?? "").trim();
    const description = String(row.Molecule ?? "").trim();
    const category = String(row.Therapy ?? "").trim();

    if (!productName || !brandName || !category) {
      console.warn("Skipping row with missing productName/brandName/category (Therapy):", row);
      skipped++;
      continue;
    }

    const division = brandToDivision.get(brandName);
    if (!division) {
      console.warn(`No Division found in Brand sheet for BrandName "${brandName}" — leaving division unset.`);
      unmappedDivision++;
    }

    const result = await ProductModel.updateOne(
      { tenantSlug: TENANT_SLUG, brandName, productName },
      {
        $set: {
          tenantSlug: TENANT_SLUG,
          productName,
          brandName,
          description,
          category,
          saleUnit: "",
          group: "",
          ...(division ? { division } : {}),
          status: "ACTIVE"
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount) {
      created++;
      console.log(`Created: ${productName} (${brandName}) -> division=${division ?? "(none)"}`);
    } else {
      updated++;
      console.log(`Updated: ${productName} (${brandName}) -> division=${division ?? "(none)"}`);
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Unmapped division: ${unmappedDivision}`);

  // ── Verification: total count + count grouped by division ──
  console.log(`\n=== Verification ===`);
  const totalCount = await ProductModel.countDocuments({ tenantSlug: TENANT_SLUG, productName: { $exists: true } });
  console.log(`Total products (bulk-imported, tenantSlug="${TENANT_SLUG}"): ${totalCount}`);

  const byDivision = await ProductModel.aggregate([
    { $match: { tenantSlug: TENANT_SLUG, productName: { $exists: true } } },
    { $group: { _id: "$division", count: { $sum: 1 } } }
  ]);
  const countMap = new Map(byDivision.map((row) => [row._id ?? "(unset)", row.count as number]));

  // Print against the full canonical Sub-Division list so 0-product divisions show explicitly, not silently.
  const subdivisions = await SubdivisionModel.find({ tenantSlug: TENANT_SLUG }).sort({ subdivisionName: 1 }).lean();
  console.log("\nCount by division (against all known Sub-Divisions):");
  for (const sub of subdivisions) {
    console.log(`  ${sub.subdivisionName}: ${countMap.get(sub.subdivisionName) ?? 0}`);
  }
  const unrecognized = [...countMap.keys()].filter(
    (key) => !subdivisions.some((sub) => sub.subdivisionName === key)
  );
  if (unrecognized.length > 0) {
    console.log("\nProducts with a division not matching any known Sub-Division:");
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
