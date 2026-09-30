// src/models/inventory-stock.model.ts
//
// Item 2 — running "Available Inventory" per rep, per product/input code.
// This is the real source of truth the coordinator asked about ("if
// RCPA/sample distribution features reference a rep's available sample
// stock — check if anything already does"): confirmed by reading every
// route/model in this backend that no such running-stock figure exists
// anywhere before this — RCPA (Phase 5, ChemistCallModel) only ever
// records product quantities the rep reports observing at a chemist, and
// never reads or writes any notion of the rep's own held stock. This
// model is genuinely new, incremented only when a rep actually confirms a
// received quantity via POST /field/dispatches/:id/receive, never
// fabricated or backfilled.
import mongoose, { Schema } from "mongoose";

const inventoryStockSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: ["INPUT", "SAMPLE"], required: true },
    code: { type: String, required: true, trim: true }, // productMaster.productCode or inputMaster.inputCode
    name: { type: String, trim: true, default: "" },
    availableQty: { type: Number, required: true, default: 0, min: 0 }
  },
  { timestamps: true }
);

inventoryStockSchema.index({ tenantSlug: 1, employeeCode: 1, type: 1, code: 1 }, { unique: true });

export const InventoryStockModel = mongoose.model("InventoryStock", inventoryStockSchema, "inventory_stocks");
