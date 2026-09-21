import mongoose from "mongoose";
import { connectMongo } from "../db.js";
import { SubdivisionModel } from "../models/subdivision.model.js";
import { config } from "../config.js";

const TENANT_SLUG = "zivira-labs";

// One-off correction: division should hold the subdivision name itself
// (e.g. "ASTRA"), not the old SAP code (e.g. "DIV 1"). Matched by
// subdivisionName so it's safe to re-run. productwiseCount/fieldforcewiseCount
// are intentionally NOT touched here.
const CORRECTIONS = [
  { subdivisionName: "ASTRA", division: "ASTRA" },
  { subdivisionName: "AURA", division: "AURA" },
  { subdivisionName: "ZIVIRA", division: "ZIVIRA" },
  { subdivisionName: "ZIVIRA EAST", division: "ZIVIRA EAST" }
];

function describeMongoTarget(uri: string) {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//, "");
  const afterAuth = withoutProtocol.includes("@") ? withoutProtocol.split("@")[1] : withoutProtocol;
  const host = afterAuth.split("/")[0] ?? "(unknown)";
  const database = afterAuth.split("/")[1]?.split("?")[0] || "(no db in URI)";
  return { host, database };
}

async function main() {
  const target = describeMongoTarget(config.mongoUri);
  console.log("=== Connection target ===");
  console.log(`Host:     ${target.host}`);
  console.log(`Database: ${target.database}\n`);

  await connectMongo();
  console.log(`Connected to ${target.host} / ${target.database}.\n`);

  for (const { subdivisionName, division } of CORRECTIONS) {
    const result = await SubdivisionModel.updateOne(
      { tenantSlug: TENANT_SLUG, subdivisionName },
      { $set: { division } }
    );
    console.log(
      `${subdivisionName}: matched=${result.matchedCount}, modified=${result.modifiedCount} -> division="${division}"`
    );
  }

  console.log(`\n=== Verification: Subdivision.find({ tenantSlug: "${TENANT_SLUG}" }) ===`);
  const finalDocs = await SubdivisionModel.find({ tenantSlug: TENANT_SLUG }).sort({ subdivisionName: 1 }).lean();
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
