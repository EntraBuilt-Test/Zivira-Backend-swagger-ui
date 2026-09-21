import { DcrModel } from "../models/dcr.model.js";

const HOURS = Number(process.env.AUTO_APPROVE_HOURS ?? 24);
const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function startAutoApproveJob() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[AutoApprove] Skipping — not in production");
    return;
  }

  async function run() {
    try {
      const cutoff = new Date(Date.now() - HOURS * 60 * 60 * 1000);
      const result = await DcrModel.updateMany(
        { status: "SUBMITTED", createdAt: { $lte: cutoff } },
        { status: "AUTO_APPROVED", managerAction: "AUTO_APPROVED", managerActedAt: new Date() }
      );
      if (result.modifiedCount > 0) {
        console.log(`[AutoApprove] ${result.modifiedCount} DCRs auto-approved at ${new Date().toISOString()}`);
      }
    } catch (err) {
      console.error("[AutoApprove] Error:", err);
    }
  }

  // Run once immediately on startup, then every 30 minutes
  void run();
  setInterval(() => { void run(); }, INTERVAL_MS);
  console.log(`[AutoApprove] Started — window: ${HOURS}hrs, interval: 30min`);
}
