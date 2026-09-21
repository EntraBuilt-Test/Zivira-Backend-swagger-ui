// scripts/fix-data-corrections.ts — CLI wrapper.
//
// Runs the targeted, non-destructive corrections in
// src/seed/fix-data-corrections.ts against the live database: "ARA" -> "Aura"
// spelling, and Doctor Category "D" -> A/B/C. Unlike scripts/seed-exact-10.ts
// this does NOT delete or reset anything — it only rewrites the specific
// fields that hold the bad value, leaving every other record untouched.
//
//   cd Zivira-backend-main
//   $env:MONGODB_URI="<the real connection string>"
//   npx tsx scripts/fix-data-corrections.ts
//
// Safe to re-run any time — a second run finds nothing left to fix.

import { runDataCorrections } from "../src/seed/fix-data-corrections.js";

runDataCorrections()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Data correction failed:", err);
    process.exit(1);
  });
