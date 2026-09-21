// scripts/seed-exact-10.ts — CLI wrapper.
//
// The actual seeding logic lives in src/seed/exact-10.ts (so it compiles
// into dist/ and can be imported by src/routes/seed.routes.ts for the
// HTTP-triggered path — Render's free tier has no shell access, so that
// endpoint is how this runs in production). This file is the local-shell
// entry point described in PRD Section 5.4:
//
//   cd Zivira-backend-main
//   $env:MONGODB_URI="<the real connection string>"
//   npm install
//   npx tsx scripts/seed-exact-10.ts
//
// Safe to re-run any time — every collection is fully reset
// (deleteMany + insertMany) so the result is always exactly 10 rows per
// tenant, never 11, never duplicated.

import { runExactTenSeed } from "../src/seed/exact-10.js";

if (process.env.NODE_ENV === "production") {
  console.error(
    "CANNOT seed in production from the CLI — matches the same guard as src/seed.ts. " +
    "Run locally with a non-production NODE_ENV, or use the protected " +
    "POST /api/seed/exact-10 HTTP endpoint (header: x-seed-secret) instead."
  );
  process.exit(1);
}

runExactTenSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
