// src/utils/enrich-tour-plans.ts
//
// Every Tour Plan list response (FieldRepo/Manager/Admin) only ever stored
// employeeCode-style values for assignedManager/voidedBy — the UI showed
// raw codes like "ABM-001" with no name, which the MR/manager reading it
// has no reason to have memorized. This batch-resolves every distinct code
// referenced across a page of Tour Plans into a name in one query, and
// attaches it as assignedManagerName/voidedByName without touching the
// stored documents.

import { EmployeeModel } from "../models/employee.model.js";
import { serializeDocument } from "./serialize.js";

// Deliberately loose — this runs over Mongoose documents in some call sites
// (which don't satisfy a plain index signature) and plain objects in others.
// Only assignedManager/voidedBy are read; everything else passes through
// serializeDocument untouched.
type TourPlanDoc = { _id: unknown; createdAt?: Date; updatedAt?: Date } & Record<string, any>;

export async function enrichTourPlansWithNames(tenantSlug: string, tps: TourPlanDoc[]) {
  const codes = new Set<string>();
  for (const tp of tps) {
    if (tp.assignedManager) codes.add(tp.assignedManager as string);
    if (tp.voidedBy) codes.add(tp.voidedBy as string);
  }

  let nameByCode = new Map<string, string>();
  if (codes.size) {
    const employees = await EmployeeModel.find(
      { tenantSlug, employeeCode: { $in: Array.from(codes) } },
      { employeeCode: 1, name: 1 }
    ).lean();
    nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));
  }

  return tps.map((tp) => ({
    ...serializeDocument(tp),
    assignedManagerName: tp.assignedManager ? nameByCode.get(tp.assignedManager) ?? undefined : undefined,
    voidedByName: tp.voidedBy ? nameByCode.get(tp.voidedBy) ?? undefined : undefined
  }));
}
