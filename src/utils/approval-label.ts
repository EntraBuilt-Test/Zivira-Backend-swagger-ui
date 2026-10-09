// Round 59 -- the ONE approval / cancellation status label used by every portal (admin, manager, field) and the backend.
// Pure and dependency-free so the same file is copied byte-for-byte into each portal's lib/approval-label.ts.
// "Approved by Admin" | "Approved by Manager (Name)" | "Rejected by ..." | "Leave cancelled by ..." | "Approved"/"Rejected" (no trail: older records) | "Pending".
type Rec = Record<string, unknown>;
const asRec = (v: unknown): Rec | null => (v && typeof v === "object" ? (v as Rec) : null);
const text = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export function approvalLabel(rec: object | null | undefined): string {
  const r = asRec(rec);
  if (!r) return "Pending";
  const by = (role?: string, name?: string) => (role === "ADMIN" ? " by Admin" : role === "MANAGER" ? ` by Manager${name ? ` (${name})` : ""}` : "");
  const raw = text(r.status ?? r.approvalStatus).toUpperCase();
  if (raw === "CANCELLED") {
    const c = asRec(r.cancelledBy);
    return `Leave cancelled${by(text(c?.role), text(c?.name))}`;
  }
  const a = asRec(r.approval);
  const approvedLike = raw === "APPROVED" || raw === "MANAGER_APPROVED" || raw === "AUTO_APPROVED";
  const state = approvedLike ? "Approved" : raw === "REJECTED" ? "Rejected" : "Pending";
  if (state === "Pending") return "Pending";
  const who = a && a.status === state ? asRec(a.approvedBy) : null;      // only trust the trail when it agrees with the current status
  return `${state}${by(text(who?.role), text(who?.name))}`;
}
export function approvalDate(rec: object | null | undefined): string | null {
  const r = asRec(rec);
  if (!r) return null;
  const v = text(r.status).toUpperCase() === "CANCELLED" ? r.cancelledAt : asRec(r.approval)?.approvedAt;
  return v ? (v instanceof Date ? v.toISOString() : text(v)) : null;
}
