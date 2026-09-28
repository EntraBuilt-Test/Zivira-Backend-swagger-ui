import mongoose, { Schema } from "mongoose";

// Round 8 item 12 — "Activity - Add Parameter" tab: each parameter belongs
// to one Activity (by its real _id/name), with the exact fields the
// coordinator specified (Caption, a numeric ordering value, Mandatory,
// Parameter Type, an optional "Select Master" when Parameter Type needs one,
// Table Group, and which "For" entity type this parameter applies to).
// existingOrder/newOrder back the reorder table's two number-input columns —
// newOrder is what the user types to move a row; committing a reorder writes
// it back into existingOrder (see activity-parameters.routes reorder route).
const activityParameterSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    activityId: { type: Schema.Types.ObjectId, ref: "Activity", required: true, index: true },
    activityName: { type: String, required: true, trim: true },
    caption: { type: String, required: true, trim: true },
    captionOrder: { type: Number, default: 1 },
    mandatory: { type: Boolean, default: false },
    parameterType: {
      type: String,
      enum: [
        "Text Box", "Text Area", "Number", "Date", "Dropdown", "Checkbox",
        "Radio Button", "Master Lookup", "File Upload"
      ],
      required: true
    },
    // Only meaningful when parameterType === "Master Lookup" — which real
    // master collection (from the same MASTERS registry every other screen
    // uses) backs this parameter's options.
    selectMaster: { type: String, trim: true, default: null },
    tableGroup: { type: String, trim: true, default: null },
    activityFor: { type: String, trim: true, default: null },
    existingOrder: { type: Number, required: true, default: 1 },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

activityParameterSchema.index({ tenantSlug: 1, activityId: 1, existingOrder: 1 });

export const ActivityParameterModel = mongoose.model(
  "ActivityParameter",
  activityParameterSchema,
  "activity_parameters"
);
