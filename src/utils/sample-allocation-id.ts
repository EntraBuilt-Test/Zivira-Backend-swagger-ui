// src/utils/sample-allocation-id.ts
// Same collision-safe pattern as expense-claim-id.ts / tour-plan-id.ts.
// Format: SA-{YYYY-MM}-{EMPLOYEECODE}-{SEQUENCE}

import { SampleAllocationModel } from "../models/sample-allocation.model.js";
import { HttpError } from "../http/errors.js";

async function nextSequence(tenantSlug: string, employeeCode: string, month: string): Promise<number> {
  const existing = await SampleAllocationModel.find({ tenantSlug, employeeCode, month }, { allocationId: 1 }).lean();
  let max = 0;
  for (const doc of existing) {
    const match = /-(\d+)$/.exec(doc.allocationId ?? "");
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

export async function nextAllocationId(tenantSlug: string, employeeCode: string, month: string) {
  const sequence = String(await nextSequence(tenantSlug, employeeCode, month)).padStart(3, "0");
  return `SA-${month}-${employeeCode.toUpperCase()}-${sequence}`;
}

export async function createSampleAllocationWithRetry<T>(
  tenantSlug: string,
  employeeCode: string,
  month: string,
  create: (allocationId: string) => Promise<T>,
  maxAttempts = 8
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const allocationId = await nextAllocationId(tenantSlug, employeeCode, month);
    try {
      return await create(allocationId);
    } catch (error) {
      const isDuplicateKey =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000;
      if (!isDuplicateKey) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 75));
    }
  }
  console.error("[SampleAllocation] Exhausted retries generating a unique allocationId:", lastError);
  throw new HttpError(409, "Could not generate a unique allocation ID right now — please try again.");
}
