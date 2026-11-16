// QA-24 (Nov 2026): leave balance = entitlement minus APPROVED leave taken
// in that entitlement's year. The field and manager balance cards used to
// show the stored quota only, so approvals never reduced it.
import { LeaveApplicationModel } from "../models/leave-application.model.js";

type Bucket = "cl" | "pl" | "sl" | "lop";

function leaveBucket(leaveType: string, isLWP: boolean): Bucket | null {
  if (isLWP) return "lop";
  const t = (leaveType || "").toLowerCase();
  if (t.includes("casual")) return "cl";
  if (t.includes("sick")) return "sl";
  if (t.includes("earned") || t.includes("privilege")) return "pl";
  if (t.includes("loss of pay")) return "lop";
  return null;
}

/**
 * rows: leaveEntitlementEntry records. codeOf: returns the employee code
 * for a row (matched by name the same way the routes already do).
 * Adds takenX / balanceX (both "Cl" and "CL" spellings, which the manager
 * and field screens read respectively).
 */
export async function withLeaveBalances(
  tenantSlug: string,
  rows: Record<string, unknown>[],
  codeOf: (row: Record<string, unknown>) => string | null
): Promise<Record<string, unknown>[]> {
  const codes = Array.from(new Set(rows.map(codeOf).filter((c): c is string => Boolean(c))));
  if (codes.length === 0) return rows;
  const leaves = (await LeaveApplicationModel.find({ tenantSlug, employeeCode: { $in: codes }, status: "APPROVED" }).lean()) as any[];
  return rows.map((row) => {
    const code = codeOf(row);
    const year = Number(row.year) || new Date().getFullYear();
    const taken: Record<Bucket, number> = { cl: 0, pl: 0, sl: 0, lop: 0 };
    for (const l of leaves) {
      if (l.employeeCode !== code) continue;
      const from = l.fromDate ? new Date(l.fromDate) : null;
      if (!from || from.getFullYear() !== year) continue;
      const b = leaveBucket(String(l.leaveType ?? ""), Boolean(l.isLWP));
      if (b) taken[b] += Number(l.days) || 0;
    }
    const out: Record<string, unknown> = { ...row };
    for (const b of ["cl", "pl", "sl", "lop"] as Bucket[]) {
      const quota = Number(row[b] ?? 0) || 0;
      const balance = Math.max(0, quota - taken[b]);
      const cap = b.charAt(0).toUpperCase() + b.slice(1); // Cl
      const up = b.toUpperCase(); // CL
      out[`taken${cap}`] = taken[b];
      out[`taken${up}`] = taken[b];
      out[`balance${cap}`] = balance;
      out[`balance${up}`] = balance;
    }
    return out;
  });
}
