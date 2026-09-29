// src/utils/doctor-code.ts
// Round 12 item 6 — doctorCode was never actually required or generated on
// creation (schema has it as a plain optional/indexed field), so any path
// that didn't pass one in the request body (the Unlisted -> Listed Doctor
// conversion route, notably) silently left it blank. Same
// max-existing-sequence pattern as expense-claim-id.ts/tour-plan-id.ts.
//
// Format: DOC-{SEQUENCE}
// Example: DOC-001

import { DoctorModel } from "../models/doctor.model.js";

export async function nextDoctorCode(tenantSlug: string): Promise<string> {
  const existing = await DoctorModel.find({ tenantSlug, doctorCode: { $regex: /^DOC-\d+$/ } }, { doctorCode: 1 }).lean();
  let max = 0;
  for (const doc of existing) {
    const match = /^DOC-(\d+)$/.exec(doc.doctorCode ?? "");
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `DOC-${String(max + 1).padStart(3, "0")}`;
}
