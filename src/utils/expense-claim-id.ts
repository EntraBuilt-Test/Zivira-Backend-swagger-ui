// src/utils/expense-claim-id.ts
// Same collision-safe pattern as tour-plan-id.ts (max-existing-sequence, not
// countDocuments) — see that file's header comment for why count-based
// sequencing is unsafe.
//
// Format: EXP-{YYYY-MM}-{EMPLOYEECODE}-{SEQUENCE}
// Example: EXP-2026-08-MR-001-002

import { ExpenseClaimModel } from "../models/expense-claim.model.js";
import { HttpError } from "../http/errors.js";

async function nextSequence(tenantSlug: string, employeeCode: string, month: string): Promise<number> {
  const existing = await ExpenseClaimModel.find({ tenantSlug, employeeCode, month }, { claimId: 1 }).lean();
  let max = 0;
  for (const doc of existing) {
    const match = /-(\d+)$/.exec(doc.claimId ?? "");
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

export async function nextClaimId(tenantSlug: string, employeeCode: string, month: string) {
  const sequence = String(await nextSequence(tenantSlug, employeeCode, month)).padStart(3, "0");
  return `EXP-${month}-${employeeCode.toUpperCase()}-${sequence}`;
}

export async function createExpenseClaimWithRetry<T>(
  tenantSlug: string,
  employeeCode: string,
  month: string,
  create: (claimId: string) => Promise<T>,
  maxAttempts = 8
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const claimId = await nextClaimId(tenantSlug, employeeCode, month);
    try {
      return await create(claimId);
    } catch (error) {
      const isDuplicateKey =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000;
      if (!isDuplicateKey) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 75));
    }
  }
  console.error("[ExpenseClaim] Exhausted retries generating a unique claimId:", lastError);
  throw new HttpError(409, "Could not generate a unique claim ID right now — please try submitting again.");
}
