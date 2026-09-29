// scripts/fix-data-corrections.ts — standalone CLI wrapper.
//
// Round 16: the backend now ALSO runs these same corrections automatically
// on every boot (see server.ts) — a normal redeploy is enough, this script
// is no longer required for the live tenant. It still exists for running
// the corrections on demand without a redeploy, or against a different
// tenant/database than whatever MONGODB_URI the backend is deployed with.
//
// Runs the targeted, non-destructive corrections in
// src/seed/fix-data-corrections.ts against the live database: "ARA" -> "Aura"
// spelling, Doctor Category "D" -> A/B/C, the "Demo Medical Representative"
// rename, doctor-code backfill, and generic-master name normalization.
// Unlike scripts/seed-exact-10.ts this does NOT delete or reset anything —
// it only rewrites the specific fields that hold a bad value, leaving every
// other record untouched.
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
