import { AuditLogModel } from "../models/audit-log.model.js";

// Audit logging is a secondary side-effect, not part of the operation the
// user actually asked for. Every call site looks like:
//
//   const created = await Model.create(doc);   // the real save — succeeds
//   await audit(...);                          // ← used to be able to fail
//   res.status(201).json(...);                 // ← never ran if it did
//
// If this write hiccuped for any reason (a brief Mongo connection blip,
// a cold-start reconnect on Render's free tier, etc.), the record was
// already safely persisted, but the request still errored out — so the
// Admin UI showed "Something went wrong" for a save that had, in fact,
// gone through. Retrying then hit a genuine duplicate-key/duplicate-code
// conflict on the second attempt, which is what actually reached the user
// as an error. Swallowing (and logging) failures here instead of letting
// them propagate means an audit-log hiccup can never masquerade as a
// failed Add/Update/Deactivate across any of the ~110 call sites that use
// this helper.
export async function audit(action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) {
  try {
    await AuditLogModel.create({
      action,
      entityType,
      entityId,
      metadata
    });
  } catch (err) {
    console.error(`[audit] failed to write audit log for ${action} (non-fatal, request continues):`, err);
  }
}
