// src/models/dispatch.model.ts
//
// Item 2 of a post-launch fix round — the field-rep "Inventory" screen
// (receiving Sample/Input dispatches). Investigated first: the admin's
// existing Sample Despatch Upload / Input Despatch Upload screens
// (sampleDespatchUploadLog / inputDespatchUploadLog) were, by an explicit
// earlier-round design decision, LOG-ONLY — the uploaded file's metadata
// (month/year/filename/status) was recorded, but the real per-employee,
// per-product dispatch line items it describes were never parsed into any
// queryable model at all. That's the real reason nothing ever "showed up"
// for a field rep to receive: there was no real dispatch data anywhere to
// show. This is the genuinely new dedicated model that upload now
// populates for real (see importDespatchRows in uploads.routes.ts),
// mirroring the ChemistCallModel/SlideDownloadModel precedent (a real,
// dedicated model rather than force-fitting this onto a generic master,
// since it needs a real per-item receive workflow a GenericMasterTable
// can't do).
import mongoose, { Schema } from "mongoose";

const dispatchItemSchema = new Schema(
  {
    code: { type: String, required: true, trim: true }, // productMaster.productCode (SAMPLE) or inputMaster.inputCode (INPUT)
    name: { type: String, required: true, trim: true },
    dispatchQty: { type: Number, required: true, min: 0 },
    // Defaults to null until the rep actually receives this line — the
    // field portal shows dispatchQty as the default editable value, but we
    // never fabricate a "received" figure before the rep confirms it.
    receivedQty: { type: Number, default: null, min: 0 },
    remarks: { type: String, trim: true, default: null },
    // Round 48 -- Despatch upload layout (Despatch Date / Docket-LR No / Courier per line)
    despatchDate: { type: Date, default: null },
    docketNo: { type: String, trim: true, default: null },
    courier: { type: String, trim: true, default: null } // "Short Qty Received" | "Excess" | "Breakage"
  },
  { _id: false }
);

const dispatchSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, trim: true, default: "" },
    type: { type: String, enum: ["INPUT", "SAMPLE"], required: true, index: true },
    // The real upload sheet (Employee ID / {Sample ERP Code|Input Code} /
    // Despatch Qty) has no per-row date column — Month + Year is the only
    // real date granularity the admin's upload form actually captures, so
    // dispatchDate is that month's 1st, and month/year are kept alongside
    // for the upload's own "OverWrite with Existing Records" re-import
    // semantics (one batch per employee+type+month+year).
    dispatchDate: { type: Date, required: true },
    month: { type: String, required: true },
    year: { type: String, required: true },
    items: { type: [dispatchItemSchema], default: [] },
    // null until the rep opens the calendar-icon modal and saves a real
    // date, or until they Submit the receive screen (whichever happens
    // first) — never defaulted or backfilled.
    receivedDate: { type: Date, default: null, index: true },
    status: { type: String, enum: ["Pending", "Received"], default: "Pending", index: true }
  },
  { timestamps: true }
);

// One real batch per employee, per dispatch type, per upload cycle — a
// re-upload for the same employee+month+year either overwrites (Overwrite
// mode) or is skipped (Only Insert mode), matching the admin form's own
// existing overwriteMode radio, which previously did nothing because
// there was no real target to overwrite or insert into.
dispatchSchema.index({ tenantSlug: 1, employeeCode: 1, type: 1, month: 1, year: 1 }, { unique: true });

export const DispatchModel = mongoose.model("Dispatch", dispatchSchema, "dispatches");
