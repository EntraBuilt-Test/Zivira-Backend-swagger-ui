import mongoose, { Schema } from "mongoose";

// One active salary structure per employee. CTC is the monthly Cost To
// Company; Basic/HRA/Allowance are expressed as percentages of CTC so the
// payroll run can derive earnings without duplicating amounts here.
// Per the client requirement doc's own worked example, Basic defaults to
// 50% of CTC.
const salaryStructureSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    ctc: { type: Number, required: true },
    basicPercent: { type: Number, default: 50 },
    hraPercent: { type: Number, default: 20 },
    allowancePercent: { type: Number, default: 30 },
    effectiveFrom: { type: Date, required: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

salaryStructureSchema.index({ tenantSlug: 1, employeeCode: 1, effectiveFrom: 1 }, { unique: true });

export const SalaryStructureModel = mongoose.model("SalaryStructure", salaryStructureSchema, "salary_structures");
