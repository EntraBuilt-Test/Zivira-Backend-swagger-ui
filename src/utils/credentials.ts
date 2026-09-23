import bcrypt from "bcryptjs";
import { UserModel } from "../models/user.model.js";

// Standing login-credential convention for every employee's Field/Manager
// portal account, per direct instruction: Username = the employee's own
// Employee Code (lowercased, matching UserModel's `lowercase: true` schema
// option), Password = this fixed value for every employee, current and
// future. This is NOT a "recovered" password shown from a hash — it's a
// known convention applied the same way at account-creation time, which is
// why the Vacant MR Login - Access screen can safely pre-fill it without
// ever reading anyone's actual stored passwordHash (those stay one-way
// bcrypt hashes, exactly like every other password in this system).
export const DEFAULT_EMPLOYEE_PASSWORD = "Zivirachennai";

let cachedHash: string | null = null;
async function defaultPasswordHash(): Promise<string> {
  if (!cachedHash) cachedHash = await bcrypt.hash(DEFAULT_EMPLOYEE_PASSWORD, 12);
  return cachedHash;
}

// Managers (per PRD 8.1 / MANAGER_ROLES elsewhere) still log in through the
// same portal value as field reps — the Manager vs Field app is told apart
// by `role`, not by a distinct `portal` enum value — so every employee
// account here is portal: "FIELD_FORCE", matching the existing convention
// used across auth.routes.ts, masters-actions.routes.ts and exact-10.ts.
// EmployeeModel's role enum includes "OTHER" (for a role UserModel's own
// enum doesn't recognize as a portal role) — map that to UserModel's
// "EMPLOYEE" so this never fails validation for an otherwise-normal
// employee record; every other role passes through unchanged.
const USER_ROLE_ENUM = new Set([
  "SUPER_ADMIN", "COMPANY_ADMIN", "NBH", "BH", "RBM", "ZBM", "ABM", "SR_MR", "MR", "EMPLOYEE"
]);
function toUserRole(role: string): string {
  return USER_ROLE_ENUM.has(role) ? role : "EMPLOYEE";
}

export async function ensureEmployeeLoginAccount(employee: {
  employeeCode: string;
  name: string;
  role: string;
  tenantSlug: string;
}) {
  const passwordHash = await defaultPasswordHash();
  await UserModel.updateOne(
    { username: employee.employeeCode.toLowerCase() },
    {
      $set: {
        username: employee.employeeCode.toLowerCase(),
        // BUG FIX: this field was missing from the upsert entirely. Every
        // caller that looks the account back up afterwards — Vacant MR
        // Login, Change Password — queries UserModel by `employeeCode`
        // (not `username`), so an account upserted without this field set
        // could never be found again by that query: the upsert would
        // "succeed" and then the very next findOne({ employeeCode }) would
        // still come back empty, reproducing the exact same "no login
        // account" error this function exists to eliminate.
        employeeCode: employee.employeeCode,
        passwordHash,
        displayName: employee.name,
        role: toUserRole(employee.role),
        portal: "FIELD_FORCE",
        tenantSlug: employee.tenantSlug,
        active: true
      }
    },
    { upsert: true }
  );
}

// Applies the standing convention above to every employee already in the
// database for a tenant (not just a fixed seed list) — this is what backs
// the "ensure credentials for ALL current employees" requirement, and what
// the new employee-creation hook above keeps up to date for anyone added
// after this runs.
export async function ensureAllEmployeeCredentials(tenantSlug: string) {
  const { EmployeeModel } = await import("../models/employee.model.js");
  const employees = await EmployeeModel.find({ tenantSlug }).lean();
  let count = 0;
  const failed: { employeeCode: string; error: string }[] = [];
  // One employee's write failing (a bad/legacy role value, a missing
  // field) must never stop every OTHER employee's account from being
  // created — the earlier version aborted the whole loop on the first
  // error, which is exactly the kind of bug that silently leaves most
  // employees with no login account at all.
  for (const e of employees) {
    if (!e.employeeCode || !e.name || !e.role) continue;
    try {
      await ensureEmployeeLoginAccount({
        employeeCode: e.employeeCode,
        name: e.name,
        role: e.role,
        tenantSlug
      });
      count += 1;
    } catch (err) {
      failed.push({ employeeCode: e.employeeCode, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { count, failed };
}
