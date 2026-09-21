// src/utils/tour-plan-id.ts
// PRD Section 12.1 — TP ID generation + collision-safe creation.
//
// Format: TP-{YYYY-MM}-{EMPLOYEECODE}-{SEQUENCE}
// Example: TP-2026-08-MR-001-003
//
// BUG FIXED: the original implementation derived the next sequence from
// countDocuments({employeeCode, month}). That breaks the moment there's ANY
// gap between the count and the highest sequence actually in use — e.g. demo
// seed data that (accidentally) skipped a number, or a doc from a different
// flow (reassign) landing at a higher sequence than the raw count implies.
// When that happens, countDocuments keeps returning the same number after
// every failed insert (a failed create doesn't change the count), so the
// retry loop recomputes the exact same colliding tpId every single attempt
// and exhausts all retries — surfacing a raw MongoDB E11000 error to the MR
// trying to submit a Tour Plan.
//
// FIX: derive the next sequence from the MAX sequence number actually
// in use for this employee+month (parsed out of existing tpIds), not a
// count. This is correct regardless of gaps, and a retry after a genuine
// concurrent-write collision will always see a higher max on the next try.

import { TourPlanModel } from "../models/tour-plan.model.js";
import { HttpError } from "../http/errors.js";

async function nextSequence(tenantSlug: string, employeeCode: string, month: string): Promise<number> {
  const existing = await TourPlanModel.find({ tenantSlug, employeeCode, month }, { tpId: 1 }).lean();
  let max = 0;
  for (const doc of existing) {
    const match = /-(\d+)$/.exec(doc.tpId ?? "");
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

export async function nextTourPlanId(tenantSlug: string, employeeCode: string, month: string) {
  const sequence = String(await nextSequence(tenantSlug, employeeCode, month)).padStart(3, "0");
  return `TP-${month}-${employeeCode.toUpperCase()}-${sequence}`;
}

/**
 * Runs `create` with a freshly generated tpId, retrying on MongoDB E11000
 * duplicate-key errors (two managers voiding/reassigning at the same instant,
 * or any other race). Each retry re-derives the sequence from the current
 * max in the database, so it always makes forward progress.
 */
export async function createTourPlanWithRetry<T>(
  tenantSlug: string,
  employeeCode: string,
  month: string,
  create: (tpId: string) => Promise<T>,
  maxAttempts = 8
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tpId = await nextTourPlanId(tenantSlug, employeeCode, month);
    try {
      return await create(tpId);
    } catch (error) {
      const isDuplicateKey =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000;
      if (!isDuplicateKey) throw error;
      lastError = error;
      // brief jitter so concurrent retries don't immediately collide again
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 75));
    }
  }
  // Never leak a raw MongoDB "E11000 duplicate key" message to the UI — even
  // in the near-impossible case every retry genuinely collided, surface a
  // clean, actionable error instead.
  console.error("[TourPlan] Exhausted retries generating a unique tpId:", lastError);
  throw new HttpError(409, "Could not generate a unique Tour Plan ID right now — please try submitting again.");
}
