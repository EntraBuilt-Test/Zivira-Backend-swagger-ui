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
        passwordHash,
        displayName: employee.name,
        role: employee.role,
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
  for (const e of employees) {
    if (!e.employeeCode || !e.name || !e.role) continue;
    await ensureEmployeeLoginAccount({
      employeeCode: e.employeeCode,
      name: e.name,
      role: e.role,
      tenantSlug
    });
    count += 1;
  }
  return count;
}
