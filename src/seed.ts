// src/seed.ts — CLI wrapper for the one-off bootstrap seed.
//
// The actual logic lives in src/seed/base.ts (same split as
// scripts/seed-exact-10.ts / src/seed/exact-10.ts) so it can also be
// triggered over HTTP via POST /api/seed/base — Render's free tier has no
// shell access to run this file directly.
//
//   cd <this repo>
//   $env:MONGODB_URI="<the real connection string>"
//   npm install
//   npx tsx src/seed.ts
import { runBaseSeed } from "./seed/base.js";

runBaseSeed()
  .then(() => {
    console.log("Seed complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
