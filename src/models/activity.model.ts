import mongoose, { Schema } from "mongoose";

// Round 8 items 11-12 — real backing for the "Activity Master" screen's
// "Create - Activity" tab (matches sanpharma.info's Activity Master exactly:
// Short Name, Name, Mode, and a multi-select "For" list of entity types this
// activity applies to).
const activitySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    shortName: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    // Round 10 item 1 fix — Mode is MR/MGR/MR & MGR (who this activity is
    // for); the entity-type list belongs to activityFor below. This enum was
    // never actually applied on a prior pass (still had the old entity-type
    // values), which is exactly why the live Create-Activity form was
    // rejected with "Invalid enum value... received 'MR'".
    mode: {
      type: String,
      enum: ["MR", "MGR", "MR & MGR"],
      default: "MR"
    },
    // "For" multi-select — which entity types this activity's parameters
    // apply to (a [Select all] + 7-option checkbox dropdown per the spec).
    activityFor: { type: [String], default: [] },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

activitySchema.index({ tenantSlug: 1, shortName: 1 }, { unique: true });

export const ActivityModel = mongoose.model("Activity", activitySchema, "activities");
