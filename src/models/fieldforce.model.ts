import mongoose, { Schema } from "mongoose";

const fieldForceSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    hq: { type: String, trim: true },
    reportingTo: { type: String, trim: true },
    subDivision: { type: String, required: true, trim: true, index: true },
    employeeCode: { type: String, trim: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

// only enforced when employeeCode exists, so it doesn't affect any rows created before this field existed.
fieldForceSchema.index(
  { tenantSlug: 1, employeeCode: 1 },
  { unique: true, partialFilterExpression: { employeeCode: { $exists: true } } }
);

export const FieldForceModel = mongoose.model("FieldForce", fieldForceSchema, "fieldforce");
