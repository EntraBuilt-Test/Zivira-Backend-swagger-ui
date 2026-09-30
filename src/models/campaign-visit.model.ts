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
    campaignId: { type: String, required: true, index: true }, // string id of a campaignMaster generic-master row
    campaignName: { type: String, required: true, trim: true }, // denormalized for cheap display, same precedent as tour-plan/expense-claim's stored names
    employeeCode: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, trim: true, default: "" },
    doctorId: { type: String, required: true, index: true }, // string id of a real DoctorModel row
    doctorName: { type: String, trim: true, default: "" },
    visitDate: { type: String, required: true, index: true }, // YYYY-MM-DD, same convention as Dcr.visitDateOnly
    // Foundation for the later Deviation phase — "planned" rows come from
    // Campaign Planning; "deviation" rows (not created anywhere yet) will
    // be an off-plan doctor added on the fly, pending manager approval.
    source: { type: String, enum: ["planned", "deviation"], default: "planned", index: true },
    status: { type: String, enum: ["Planned", "Completed", "Cancelled"], default: "Planned", index: true },
    dcrId: { type: String, default: null }, // set once a later phase links this to a real DcrModel row
    notes: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

campaignVisitSchema.index({ tenantSlug: 1, employeeCode: 1, visitDate: 1 });

export const CampaignVisitModel = mongoose.model("CampaignVisit", campaignVisitSchema, "campaign_visits");
