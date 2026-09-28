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
    mode: {
      type: String,
      enum: ["Common Activity", "Doctors", "Chemist", "Stockist", "Unlisted Doctors", "Hospital", "CIP"],
      default: "Common Activity"
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
