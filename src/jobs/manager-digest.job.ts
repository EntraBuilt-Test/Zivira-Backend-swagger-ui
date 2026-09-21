// src/jobs/manager-digest.job.ts
// NEW FILE — Task 2: daily MR → Manager digest
//
// After creating this file, add these two lines to server.ts
// (right after the existing app.listen(...) call):
//
//   import { startManagerDigestJob } from "./jobs/manager-digest.job.js";
//   import { startAutoApproveJob }   from "./jobs/auto-approve.job.js";
//   // ... after app.listen(config.port, () => { ... })
//   startAutoApproveJob();
//   startManagerDigestJob();

import { DcrModel } from "../models/dcr.model.js";
import { EmployeeModel } from "../models/employee.model.js";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Returns true if we are still in the same calendar day (UTC) as
 * the given date — used to avoid double-sending when Render restarts
 * the service, which resets the setInterval counter.
 *
 * NOTE: For guaranteed once-per-day delivery, use Render's native
 * Cron Job service type instead. This in-process timer is a
 * best-effort fallback for the free tier.
 */
function isSameUtcDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

let lastRanAt: Date | null = null;

async function sendDigest() {
  const now = new Date();

  // Skip if we already ran today (guards against Render restart loops)
  if (lastRanAt && isSameUtcDay(lastRanAt, now)) {
    console.log("[Digest] Already ran today — skipping");
    return;
  }

  console.log(`[Digest] Running at ${now.toISOString()}`);
  lastRanAt = now;

  try {
    // Fetch all active managers across every tenant
    const managers = await EmployeeModel.find({
      role: { $in: ["ABM", "RBM", "ZBM", "NBH", "BH"] },
      status: "ACTIVE"
    }).lean();

    for (const mgr of managers) {
      const team = await EmployeeModel.find({
        tenantSlug: mgr.tenantSlug,
        reportingManager: mgr.employeeCode,
        status: "ACTIVE"
      }).lean();

      if (team.length === 0) continue;

      const codes = team.map((t) => t.employeeCode);

      const pending = await DcrModel.countDocuments({
        tenantSlug: mgr.tenantSlug,
        employeeCode: { $in: codes },
        status: "SUBMITTED"
      });

      if (pending === 0) continue;

      // ── Send via your notification channel ──────────────────────────
      //
      // Option A — Resend email (already in your stack):
      //   import { Resend } from "resend";
      //   const resend = new Resend(process.env.RESEND_API_KEY);
      //   await resend.emails.send({
      //     from: "noreply@zivira-labs.com",
      //     to: mgr.email,          // add email field to EmployeeModel if needed
      //     subject: `[Zivira] ${pending} DCR${pending > 1 ? "s" : ""} pending your review`,
      //     text: `Hi ${mgr.name},\n\nYou have ${pending} submitted DCR${pending > 1 ? "s" : ""} waiting for your approval.\n\nLogin at https://zivira-labs-manager.vercel.app\n\nZivira Labs`
      //   });
      //
      // Option B — WhatsApp Business API (already in architecture doc):
      //   POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages
      //   body: { type: "template", template: { name: "dcr_pending_digest", ... } }
      //
      // For now, log so you can see it working in Render's log stream:
      console.log(
        `[Digest] → ${mgr.employeeCode} (${mgr.name}, ${mgr.role}): ${pending} pending DCR${pending > 1 ? "s" : ""}`
      );
    }

    console.log("[Digest] Done");
  } catch (err) {
    console.error("[Digest] Error:", err);
  }
}

export function startManagerDigestJob() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Digest] Skipping — not in production");
    return;
  }

  // Run once at startup (catches overnight submissions if server restarted at odd hours)
  void sendDigest();

  // Then every 24 hours
  setInterval(() => {
    void sendDigest();
  }, INTERVAL_MS);

  console.log("[Digest] Started — interval: 24h");
}
