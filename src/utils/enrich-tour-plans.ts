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
    // Item 3 (TP Delete, sanpharma parity) — the Designation/HQ columns
    // need the FIELD REP's own employee record too, not just the manager's.
    if (tp.employeeCode) codes.add(tp.employeeCode as string);
  }

  let nameByCode = new Map<string, string>();
  let designationByCode = new Map<string, string>();
  let territoryByCode = new Map<string, string>();
  if (codes.size) {
    const employees = await EmployeeModel.find(
      { tenantSlug, employeeCode: { $in: Array.from(codes) } },
      { employeeCode: 1, name: 1, designation: 1, territory: 1 }
    ).lean();
    nameByCode = new Map(employees.map((e) => [e.employeeCode, e.name]));
    designationByCode = new Map(employees.map((e) => [e.employeeCode, e.designation]));
    territoryByCode = new Map(employees.map((e) => [e.employeeCode, e.territory]));
  }

  // "Last Month TP" (sanpharma's TP Delete column) — the month label
  // immediately BEFORE the one being viewed ("Aug 2026" for a Sep 2026 TP),
  // shown so the admin can see this row's tour month in context at a
  // glance, matching the reference screen's column.
  function priorMonthLabel(month: string): string | undefined {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) return undefined;
    const year = Number(match[1]);
    const monthNum = Number(match[2]);
    const prior = monthNum === 1 ? { y: year - 1, m: 12 } : { y: year, m: monthNum - 1 };
    return new Date(prior.y, prior.m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  return tps.map((tp) => ({
    ...serializeDocument(tp),
    assignedManagerName: tp.assignedManager ? nameByCode.get(tp.assignedManager) ?? undefined : undefined,
    voidedByName: tp.voidedBy ? nameByCode.get(tp.voidedBy) ?? undefined : undefined,
    employeeDesignation: tp.employeeCode ? designationByCode.get(tp.employeeCode as string) ?? undefined : undefined,
    employeeHQ: tp.employeeCode ? territoryByCode.get(tp.employeeCode as string) ?? undefined : undefined,
    lastMonthTP: typeof tp.month === "string" ? priorMonthLabel(tp.month) : undefined
  }));
}
