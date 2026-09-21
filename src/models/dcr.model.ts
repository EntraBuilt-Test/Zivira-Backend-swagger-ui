import mongoose, { Schema } from "mongoose";

// PRD 12.3A — Drug Count: structured samples, one row per product per visit.
// productCode/productName sourced from the product master (no free-text entry
// allowed on the frontend). batchNumber is optional — reserved for Phase 2
// batch-level tracking.
const sampleSchema = new Schema(
  {
    productName:  { type: String, required: true },
    productCode:  { type: String, default: null },
    qty:          { type: Number, required: true, default: 0, min: 0 },
    batchNumber:  { type: String, default: null },
    // Zivira_Project_Basic.docx Topic 1 — "Product Priority" under Product
    // Promotion. Per-product, not per-visit — an MR may discuss 3 products
    // in one call with different emphasis on each.
    priority:     { type: String, enum: ["HIGH", "MEDIUM", "LOW"], default: null }
  },
  { _id: false }
);

// PRD 12.3B — Gift Count: structured promotional inputs given to a doctor.
// itemType is the compliance-tracked category (Pen, Calendar, Notepad,
// Literature, ...); valueRs is optional and feeds the MCI gift-value alert.
const inputSchema = new Schema(
  {
    inputName:  { type: String, required: true },
    itemType:   { type: String, default: null },
    qty:        { type: Number, required: true, default: 0, min: 0 },
    valueRs:    { type: Number, default: null, min: 0 }
  },
  { _id: false }
);

const dcrSchema = new Schema(
  {
    tenantSlug:      { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode:    { type: String, required: true, trim: true, index: true },
    doctorId:        { type: Schema.Types.ObjectId, ref: "Doctor" },
    visitDate:       { type: Date, required: true, index: true },
    // 'YYYY-MM' derived server-side (UTC) from visitDate — PRD 12.2:
    // "Store visitDate as UTC Date server-side. Derive month from the UTC
    // Date on the server — never trust client-sent month string."
    month:           { type: String, index: true },
    // UTC calendar-day string ('YYYY-MM-DD'), derived server-side in the
    // pre-save hook below — backs the daily-uniqueness guard (PRD 12.2).
    visitDateOnly:   { type: String, index: true },
    productsDetailed: [{ type: String }],
    notes:           { type: String },
    // ── New fields ──────────────────────────────────────────────────
    callSession:     { type: String, enum: ["MORNING", "AFTERNOON", "EVENING"], default: "MORNING" },
    callTime:        { type: String },                  // e.g. "10:30"
    samplesGiven:    { type: [sampleSchema], default: [] },
    inputsGiven:     { type: [inputSchema],  default: [] },
    jointWork: {
      accompanyingManager: { type: String },
      jointWorkType:       { type: String, enum: ["FIELD_WORK", "ON_JOB_TRAINING", "PERFORMANCE_REVIEW"], default: "FIELD_WORK" },
      managerObservations: { type: String }
    },
    // ── Zivira_Project_Basic.docx Topic 1 — DCR Management Module ──────
    // "Visit Information": check-in/out, GPS, hospital/clinic, duration.
    checkInTime:      { type: String, default: null },   // "HH:MM"
    checkOutTime:      { type: String, default: null },
    gpsLocation: {
      latitude:  { type: Number, default: null },
      longitude: { type: Number, default: null },
      label:     { type: String, default: null }
    },
    hospitalClinic:    { type: String, default: null },
    visitDurationMinutes: { type: Number, default: null, min: 0 },
    // "Product Promotion": materials/visual aids beyond samples/gifts.
    promotionalMaterialsShared: { type: [String], default: [] },
    visualAidUsed:      { type: Boolean, default: false },
    // "Doctor Feedback": beyond the free-text notes field.
    prescriptionInterest: { type: String, enum: ["HIGH", "MEDIUM", "LOW", "NONE"], default: null },
    productFeedback:    { type: String, default: null },
    competitorMentioned: { type: String, default: null },
    followUpRequired:   { type: Boolean, default: false },
    followUpDate:        { type: Date, default: null },
    // ── PRD 12.2 — MR-to-Doctor Visit Tracking (3 visits/month soft cap) ──
    // Soft warning only — the DCR still saves even when overVisitFlag=true.
    overVisitFlag:   { type: Boolean, default: false },
    overVisitCount:  { type: Number, default: null },
    // ── Workflow ─────────────────────────────────────────────────────
    status:          { type: String, enum: ["DRAFT", "SUBMITTED", "MANAGER_APPROVED", "APPROVED", "REJECTED", "AUTO_APPROVED"], default: "SUBMITTED", index: true },
    managerApprovedBy:   { type: String },
    managerApprovedAt:   { type: Date },
    adminVisibleAt:      { type: Date }
  },
  { timestamps: true }
);

dcrSchema.pre("save", function (next) {
  if (this.isNew && !this.adminVisibleAt) {
    this.adminVisibleAt = new Date();
  }
  // PRD 12.2 — "Store visitDate as UTC Date server-side. Derive month from
  // the UTC Date on the server — never trust client-sent month string." Also
  // backs the daily-uniqueness guard ("Same doctor logged twice in one day
  // by same MR").
  if (this.visitDate) {
    const d = this.visitDate as Date;
    this.month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    this.visitDateOnly = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  next();
});
// Note: partialFilterExpression only supports a limited operator set (no
// $ne), so this index can't itself exclude REJECTED rows from the
// uniqueness check. field.routes.ts is the source of truth for "rejected
// visits don't count" — see the explicit status filter in every visit/drug/
// gift aggregation (PRD Section 12.2 & 12.3 "Exact Solutions").
dcrSchema.index(
  { tenantSlug: 1, employeeCode: 1, doctorId: 1, visitDateOnly: 1 },
  { unique: true, partialFilterExpression: { doctorId: { $exists: true } } }
);

export const DcrModel = mongoose.model("Dcr", dcrSchema);
