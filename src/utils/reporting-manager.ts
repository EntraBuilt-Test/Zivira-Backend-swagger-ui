import { EmployeeModel } from "../models/employee.model.js";

// The admin "Add Employee" form takes the reporting manager as free text, but every manager
// screen links a rep to a manager by the manager's EXACT employee code. Accept a code in any
// letter case or the manager's full name, and store the real code.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function resolveReportingManagerCode(tenantSlug: string, raw: unknown): Promise<{ code: string | null; error?: string }> {
  const v = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!v) return { code: null };
  const byCode = (await EmployeeModel.findOne({ tenantSlug, employeeCode: { $in: [v, v.toUpperCase()] } }).select("employeeCode").lean()) as any;
  if (byCode) return { code: byCode.employeeCode };
  const byName = (await EmployeeModel.find({ tenantSlug, name: new RegExp(`^${escapeRe(v)}$`, "i") }).select("employeeCode").limit(2).lean()) as any[];
  if (byName.length === 1) return { code: byName[0].employeeCode };
  if (byName.length > 1) return { code: null, error: `More than one employee is named "${v}". Enter the manager's employee code instead.` };
  return { code: null, error: `Reporting manager "${v}" was not found. Enter the manager's employee code (for example E0299).` };
}

// One-time repair, safe to run on every start: re-links employees whose reportingManager was saved
// as a name or in the wrong letter case. Values that match no one (or more than one person) are left as they are.
export async function repairReportingManagers() {
  const all = (await EmployeeModel.find({}).select("tenantSlug employeeCode reportingManager").lean()) as any[];
  const codes = new Set(all.map((e) => `${e.tenantSlug}|${e.employeeCode}`));
  let fixed = 0;
  for (const e of all) {
    const rm = String(e.reportingManager ?? "").trim();
    if (!rm || codes.has(`${e.tenantSlug}|${rm}`)) continue;
    const r = await resolveReportingManagerCode(e.tenantSlug, rm);
    if (r.code && r.code !== e.employeeCode) {
      await EmployeeModel.updateOne({ _id: e._id }, { $set: { reportingManager: r.code } });
      fixed++;
    }
  }
  if (fixed) console.log(`  [OK] Re-linked ${fixed} employee(s) to their reporting manager's code`);
  return fixed;
}
