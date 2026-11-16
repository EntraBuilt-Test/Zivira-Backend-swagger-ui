// src/models/erp-sales.model.ts
// Phase 2 ERP (ENT-ZVR-2026-P2) -- Secondary Sales from distributor
// "Stock & Sales" statements.
//
//   SalesProduct      Zivira's sellable products with PTS (price to stockist).
//   SalesStockist     Distributor / stockist profile (state, HQ, place, division).
//   StockistStatement One distributor's statement for one month, with one line
//                     per product. Re-uploading the same stockist + month
//                     replaces the earlier statement.
import mongoose, { Schema } from "mongoose";

const salesProductSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name:       { type: String, required: true, trim: true },
    pack:       { type: String, default: "" },
    division:   { type: String, default: "" },
    pts:        { type: Number, default: null },
    aliases:    { type: [String], default: [] },
    active:     { type: Boolean, default: true }
  },
  { timestamps: true }
);
salesProductSchema.index({ tenantSlug: 1, name: 1 }, { unique: true });
export const SalesProductModel = mongoose.model("SalesProduct", salesProductSchema);

const salesStockistSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name:       { type: String, required: true, trim: true },
    gstin:      { type: String, default: "" },
    state:      { type: String, default: "" },
    hq:         { type: String, default: "" },
    place:      { type: String, default: "" },
    division:   { type: String, default: "" },
    active:     { type: Boolean, default: true }
  },
  { timestamps: true }
);
salesStockistSchema.index({ tenantSlug: 1, name: 1 }, { unique: true });
export const SalesStockistModel = mongoose.model("SalesStockist", salesStockistSchema);

const statementLineSchema = new Schema(
  {
    product:        { type: String, required: true },
    rawName:        { type: String, default: "" },
    pack:           { type: String, default: "" },
    opening:        { type: Number, default: 0 },
    primary:        { type: Number, default: 0 },
    primaryFree:    { type: Number, default: 0 },
    purchaseReturn: { type: Number, default: 0 },
    secondary:      { type: Number, default: 0 },
    secondaryFree:  { type: Number, default: 0 },
    salesReturn:    { type: Number, default: 0 },
    closing:        { type: Number, default: 0 },
    secondaryValue: { type: Number, default: null }
  },
  { _id: false }
);

const stockistStatementSchema = new Schema(
  {
    tenantSlug:   { type: String, required: true, lowercase: true, trim: true, index: true },
    stockistName: { type: String, required: true, trim: true },
    month:        { type: String, required: true, index: true }, // YYYY-MM
    periodFrom:   { type: String, default: "" },
    periodTo:     { type: String, default: "" },
    sourceFile:   { type: String, default: "" },
    format:       { type: String, default: "" },
    uploadedBy:   { type: String, default: "" },
    lines:        { type: [statementLineSchema], default: [] }
  },
  { timestamps: true }
);
stockistStatementSchema.index({ tenantSlug: 1, stockistName: 1, month: 1 }, { unique: true });
export const StockistStatementModel = mongoose.model("StockistStatement", stockistStatementSchema);
