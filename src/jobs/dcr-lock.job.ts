import { sweepAllTenants } from "../utils/dcr-lock.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Round 41 Gap A -- daily background sweep that persists auto-delay DCR
// locks. First run 90s after boot (never blocks the port bind), then daily.
export function startDcrLockJob() {
  async function run() {
    try {
      const n = await sweepAllTenants();
      if (n > 0) console.log(`[DcrLock] persisted ${n} new lock(s)`);
    } catch (err) {
      console.error("[DcrLock] sweep failed:", err);
    }
  }
  setTimeout(() => { void run(); }, 90 * 1000);
  setInterval(() => { void run(); }, DAY_MS);
  console.log("[DcrLock] daily sweep scheduled");
}
