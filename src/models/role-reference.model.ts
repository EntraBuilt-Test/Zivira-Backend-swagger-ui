import mongoose, { Schema } from "mongoose";

// Reference list of business-role titles + descriptions, distinct from EmployeeModel.role
// (the coarse enum used for access control). Sourced from the Excel Role sheet.
const roleReferenceSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    roleName: { type: String, required: true, trim: true },
    fullForm: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

roleReferenceSchema.index({ tenantSlug: 1, roleName: 1 }, { unique: true });

export const RoleReferenceModel = mongoose.model("RoleReference", roleReferenceSchema, "roleReferences");
