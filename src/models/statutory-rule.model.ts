import mongoose, { Schema } from "mongoose";

// Phase 2 "Advanced Statutory Calculations" + the old mock UI's "Payroll
// Rules Engine" — one editable, ACTIVE rule set per tenant covering the
// standard Indian statutory deductions: Provident Fund (PF), Professional
// Tax (PT, state-wise slabs), and ESI. Also carries the OT (overtime)
// policy used by the payroll run generator (Phase 2 "OT" item), since both
// are HR-configurable "rules" edited from the same settings screen.
//
// A single ACTIVE document per tenant (like SalaryStructureModel keeps one
// ACTIVE row per employee) — editing the rules via PUT deactivates the old
// row and inserts a new one, so past payroll runs keep referencing whatever
// rates were in effect at generation time (their pf/pt/esi amounts are
// already baked into the PayrollRun row and never recomputed retroactively).
const professionalTaxSlabSchema = new Schema(
  {
    minGross: { type: Number, required: true },
    maxGross: { type: Number, default: null }, // null = no upper bound
    amount: { type: Number, required: true }
  },
  { _id: false }
);

const statutoryRuleSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },

    pfEnabled: { type: Boolean, default: true },
    pfEmployeeRate: { type: Number, default: 12 }, // % of PF wage, employee contribution (deducted from pay)
    pfEmployerRate: { type: Number, default: 12 }, // % of PF wage, employer contribution (informational, not deducted)
    pfWageCeiling: { type: Number, default: 15000 }, // EPFO statutory wage ceiling; PF computed on min(basic, ceiling)

    ptEnabled: { type: Boolean, default: true },
    // Default slabs reflect a common state's Professional Tax structure
    // (e.g. Maharashtra); HR can edit per their actual state via this screen.
    ptSlabs: {
      type: [professionalTaxSlabSchema],
      default: [
        { minGross: 0, maxGross: 7500, amount: 0 },
        { minGross: 7501, maxGross: 10000, amount: 175 },
        { minGross: 10001, maxGross: null, amount: 200 }
      ]
    },

    esiEnabled: { type: Boolean, default: false }, // ESI only applies below a wage threshold; off by default
    esiEmployeeRate: { type: Number, default: 0.75 },
    esiEmployerRate: { type: Number, default: 3.25 },
    esiWageCeiling: { type: Number, default: 21000 }, // employees earning above this are not ESI-eligible

    otEnabled: { type: Boolean, default: true },
    standardShiftHours: { type: Number, default: 9 }, // hours/day beyond which extra worked time counts as OT
    otRatePerHour: { type: Number, default: 0 }, // flat Rs/hour; 0 = derive from (basic / (workingDays*shiftHours)) * 2

    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    updatedBy: { type: String, trim: true, default: null }
  },
  { timestamps: true }
);

statutoryRuleSchema.index({ tenantSlug: 1, status: 1 });

export const StatutoryRuleModel = mongoose.model("StatutoryRule", statutoryRuleSchema, "statutory_rules");
