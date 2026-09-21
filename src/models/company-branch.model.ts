// src/models/company-branch.model.ts
// PRD Section 12.5 — GST Multi-Branch Location Bug Fix
//
// Root cause fixed: previously there was no CompanyBranch registry, so every
// document (Tour Plan expense, claim, distributor statement) always resolved
// to the default Bangalore HQ address regardless of which branch's GST number
// actually appeared on the document. This model is the missing lookup table.

import mongoose, { Schema } from "mongoose";

const companyBranchSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    branchName: { type: String, required: true, trim: true },       // e.g. 'Bangalore HQ', 'Chennai Branch'
    gstNumber: { type: String, required: true, uppercase: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    isHeadquarters: { type: Boolean, default: false },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

// Unique compound index — one GST number per tenant (case already normalised via `uppercase: true`)
companyBranchSchema.index({ tenantSlug: 1, gstNumber: 1 }, { unique: true });

export const CompanyBranchModel = mongoose.model("CompanyBranch", companyBranchSchema);
