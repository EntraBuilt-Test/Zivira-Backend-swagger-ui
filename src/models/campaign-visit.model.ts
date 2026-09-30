// src/models/campaign-visit.model.ts
//
// Phase 1 of the "Call Manager" reference build (Campaign Planning &
// Execution) — a real, dedicated model rather than a generic master,
// because this needs a clean employeeCode/doctorId foreign-key
// relationship the later Deviation phase will build directly on top of
// (a deviation is just another CampaignVisit row with
// source: "deviation" and no prior Campaign Planning step, pending
// manager approval — the coordinator's explicit instruction for this
// round is to shape the schema for that now without building the
// deviation UI itself yet).
//
// One row = "this MR planned (or, later, deviated to) a visit to this
// doctor, under this campaign, on this date." When the MR actually logs
// the DCR for that visit, dcrId gets set (not wired yet this phase — the
// field this round only reads/writes the planning half; a later phase
// will link real DcrModel rows back here).
import mongoose, { Schema } from "mongoose";

const campaignVisitSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    // Phase 3 (deviation) — a deviation visit is not attached to any
    // marketing campaign, so these are no longer schema-required; the
    // Campaign Planning flow (source: "planned") still always sets both.
    campaignId: { type: String, default: null, index: true }, // string id of a campaignMaster generic-master row
    campaignName: { type: String, trim: true, default: "" }, // denormalized for cheap display, same precedent as tour-plan/expense-claim's stored names
    employeeCode: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, trim: true, default: "" },
    doctorId: { type: String, required: true, index: true }, // string id of a real DoctorModel row
    doctorName: { type: String, trim: true, default: "" },
    visitDate: { type: String, required: true, index: true }, // YYYY-MM-DD, same convention as Dcr.visitDateOnly
    // "planned" rows come from Campaign Planning; "deviation" rows are an
    // off-plan doctor the rep picked on the fly (Phase 3), pending manager
    // approval before they count as a real planned visit.
    source: { type: String, enum: ["planned", "deviation"], default: "planned", index: true },
    // "Pending Approval"/"Rejected" only ever apply to source: "deviation"
    // rows — a manager-approved deviation flips to "Planned" and behaves
    // exactly like a normally-planned visit from then on (Phase 2's
    // checkout gate, Phase 1's Campaign Execution list, etc).
    status: {
      type: String,
      enum: ["Planned", "Completed", "Cancelled", "Pending Approval", "Rejected"],
      default: "Planned",
      index: true
    },
    // Phase 3 — deviation reason category + the manager approval trail.
    deviationType: { type: String, trim: true, default: null },
    approvedBy: { type: String, trim: true, default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: String, trim: true, default: null },
    rejectedAt: { type: Date, default: null },
    rejectReason: { type: String, trim: true, default: null },
    dcrId: { type: String, default: null }, // set once a later phase links this to a real DcrModel row
    notes: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

campaignVisitSchema.index({ tenantSlug: 1, employeeCode: 1, visitDate: 1 });

export const CampaignVisitModel = mongoose.model("CampaignVisit", campaignVisitSchema, "campaign_visits");
