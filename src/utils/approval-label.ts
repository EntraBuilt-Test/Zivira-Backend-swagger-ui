// Round 59 -- the ONE approval / cancellation status label used by every portal (admin, manager, field) and the backend.
// Pure and dependency-free so the same file is copied byte-for-byte into each portal's lib/approval-label.ts.
// "Approved by Admin" | "Approved by Manager (Name)" | "Rejected by ..." | "Leave cancelled by ..." | "Approved"/"Rejected" (no trail: older records) | "Pending".
export function approvalLabel(rec: any): string {
  if (!rec) return "Pending";
  const by = (role?: string, name?: string) => (role === "ADMIN" ? " by Admin" : role === "MANAGER" ? ` by Manager${name ? ` (${name})` : ""}` : "");
  const raw = String(rec.status ?? rec.approvalStatus ?? "").toUpperCase();
  if (raw === "CANCELLED") {
    const c = rec.cancelledBy;
    return `Leave cancelled${by(c?.role, c?.name)}`;
  }
  const a = rec.approval;
  const approvedLike = raw === "APPROVED" || raw === "MANAGER_APPROVED" || raw === "AUTO_APPROVED";
  const state = approvedLike ? "Approved" : raw === "REJECTED" ? "Rejected" : "Pending";
  if (state === "Pending") return "Pending";
  const who = a && a.status === state ? a.approvedBy : null;      // only trust the trail when it agrees with the current status
  return `${state}${by(who?.role, who?.name)}`;
}
export function approvalDate(rec: any): string | null {
  if (!rec) return null;
  if (String(rec.status ?? "").toUpperCase() === "CANCELLED") return rec.cancelledAt ?? null;
  return rec.approval?.approvedAt ?? null;
}

