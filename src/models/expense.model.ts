import mongoose, { Schema } from "mongoose";

const expenseSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    sourceSNo: { type: Number, index: true },
    role: { type: String, trim: true, required: true },
    listOfExpenseTypes: { type: String, trim: true, default: null },
    station: { type: String, trim: true, default: null },
    metroType: { type: String, trim: true, default: null },
    amountNC: { type: Number, default: null },
    dailyWork: { type: String, trim: true, default: null },
    frequency: { type: String, trim: true, default: null },
    remarks: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

// Sl.No is blank on merged continuation rows in the source sheet, so it can't serve as a
// natural key — upsert on the combination that actually varies per row instead.
expenseSchema.index({ tenantSlug: 1, role: 1, listOfExpenseTypes: 1, station: 1, metroType: 1 }, { unique: true });

export const ExpenseModel = mongoose.model("Expense", expenseSchema, "expenses");
