// src/utils/enrich-employee-names.ts
//
// Generic version of enrich-tour-plans.ts's name-resolution trick, for any
// list response that carries employee-code-only fields (DCR's employeeCode/
// managerApprovedBy, Doctor Coverage's assignedMR, Visit Coverage's
// mappedEmployeeCode, Expense Claim's assignedManager, ...). Call
// serializeDocument on the raw Mongo docs first, then pass the plain
// objects here — it batch-resolves every distinct code across the page in
// one query and adds a "<field>Name" alongside each one requested.

import { EmployeeModel } from "../models/employee.model.js";

export async function enrichWithEmployeeNames<T extends Record<string, unknown>>(
  tenantSlug: string,
  docs: T[],
  codeFields: string[]
): Promise<(T & Record<string, string | undefined>)[]> {
  const codes = new Set<string>();
  for (const doc of docs) {
    for (const f of codeFields) {
      const v = doc[f];
      if (typeof v === "string" && v) codes.add(v);
    }
  }

  let nameByCode = new Map<string, string>();
  if (codes.size) {
    const employees = await EmployeeModel.find(
      { tenantSlug, employeeCode: { $in: Array.from(codes) } },
      { employeeCode: 1, name: 1 }
    ).lean();
    nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));
  }

  return docs.map((doc) => {
    const extra: Record<string, string | undefined> = {};
    for (const f of codeFields) {
      const v = doc[f];
      if (typeof v === "string" && v) extra[`${f}Name`] = nameByCode.get(v);
    }
    return { ...doc, ...extra };
  });
}
