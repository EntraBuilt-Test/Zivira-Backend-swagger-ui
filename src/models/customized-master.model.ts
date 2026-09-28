import mongoose, { Schema } from "mongoose";

// Round 9 item 2 (Customized Master tab) — real persisted, admin-defined
// "mini masters": a name plus an editable list of {shortName, name, active}
// rows, matching sanpharma.info's Activity_Table_Creation.aspx exactly.
const customizedMasterRowSchema = new Schema(
  {
    shortName: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    active: { type: Boolean, default: true }
  },
  { _id: true }
);

const customizedMasterSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    rows: { type: [customizedMasterRowSchema], default: [] }
  },
  { timestamps: true }
);

customizedMasterSchema.index({ tenantSlug: 1, name: 1 }, { unique: true });

export const CustomizedMasterModel = mongoose.model("CustomizedMaster", customizedMasterSchema, "customized_masters");
