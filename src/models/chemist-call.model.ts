// src/models/chemist-call.model.ts
//
// Phase 5 of the "Call Manager" reference build — the Chemist Call
// execution screen (RCPA / POB / Short Expiry / JCC), the chemist-side
// equivalent of a doctor DCR. Investigated first: no ChemistCall/RCPA/POB/
// Short-Expiry/JCC model existed anywhere in this codebase (the admin's
// "RCPA" MIS Reports nav entry is a synthetic placeholder with no route,
// same as the earlier-round "Daily MR Work" finding) — this is genuinely
// new schema, built as one real dedicated model (matching the DcrModel /
// CampaignVisitModel precedent) rather than four separate ones, because a
// single Save persists all four tabs as one record tied to
// chemist/date/employee.
import mongoose, { Schema } from "mongoose";

// RCPA — one row per real ProductBrand, My Qty always entered, Comp Qty
// optional (filled via the "Enter Comp Qty" popup). compBrandName is free
// text on purpose — the popup's "+NEW" lets the rep name a competitor
// brand that isn't in any standard master, so this is never validated
// against ProductBrandModel.
const rcpaRowSchema = new Schema(
  {
    brandId: { type: String, default: null }, // string id of a real ProductBrandModel row
    brandName: { type: String, required: true, trim: true },
    myQty: { type: Number, default: 0, min: 0 },
    compBrandName: { type: String, trim: true, default: null },
    compQty: { type: Number, default: null, min: 0 }
  },
  { _id: false }
);

// POB — one row per real Product (SKU/pack level), only ever persisted
// when qty > 0 (the full product list is the picker, not the saved rows).
const pobRowSchema = new Schema(
  {
    productId: { type: String, required: true }, // string id of a real ProductModel row
    productName: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

// Short Expiry — seeded from the admin's real rateMaster (product/batch/
// expiryDate) generic master; the rep can still edit date + qty per row
// before saving, matching the reference screenshot's editable fields.
const shortExpiryRowSchema = new Schema(
  {
    medicineName: { type: String, required: true, trim: true },
    expiryDate: { type: String, default: null }, // YYYY-MM-DD
    qty: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

// JCC — Joint Call Coverage. employeeCode is set for a real colleague
// picked from GET /field/jcc-colleagues; left null for a "+JCC" ad-hoc
// name not in that list (mirrors compBrandName's free-text escape hatch).
const jccRowSchema = new Schema(
  {
    employeeCode: { type: String, trim: true, default: null },
    name: { type: String, required: true, trim: true },
    designation: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const chemistCallSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, trim: true, default: "" },
    chemistId: { type: String, required: true, index: true }, // string id of a real DealerModel ("Chemist") row
    chemistName: { type: String, trim: true, default: "" },
    visitDate: { type: Date, required: true, index: true },
    visitDateOnly: { type: String, required: true, index: true }, // YYYY-MM-DD, same convention as Dcr.visitDateOnly
    rcpa: { type: [rcpaRowSchema], default: [] },
    pob: { type: [pobRowSchema], default: [] },
    shortExpiry: { type: [shortExpiryRowSchema], default: [] },
    jcc: { type: [jccRowSchema], default: [] },
    status: { type: String, enum: ["SUBMITTED"], default: "SUBMITTED" }
  },
  { timestamps: true }
);

// One real record per chemist per employee per day — Save is an upsert,
// matching the coordinator's exact "one real record tied to that
// chemist/date/employee" spec (re-saving the same day's call updates it
// in place rather than creating duplicates).
chemistCallSchema.index({ tenantSlug: 1, employeeCode: 1, chemistId: 1, visitDateOnly: 1 }, { unique: true });

export const ChemistCallModel = mongoose.model("ChemistCall", chemistCallSchema, "chemist_calls");
