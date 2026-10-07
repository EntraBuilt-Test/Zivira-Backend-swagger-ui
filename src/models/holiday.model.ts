import mongoose, { Schema } from "mongoose";

const holidaySchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    sourceSNo: { type: Number, index: true },
    stateName: { type: String, required: true, trim: true },
    weekendHoliday: { type: String, trim: true, default: null },
    otherHolidayDate: { type: Date, default: null },
    otherHolidayDescription: { type: String, trim: true, default: null },
    // Round 48 -- Holiday upload layout (HQ / Type columns)
    hq: { type: String, trim: true, default: null },
    holidayType: { type: String, trim: true, default: null },
    extraNotes: { type: [String], default: [] },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true }
  },
  { timestamps: true }
);

holidaySchema.index({ tenantSlug: 1, sourceSNo: 1 }, { unique: true, partialFilterExpression: { sourceSNo: { $exists: true } } });

export const HolidayModel = mongoose.model("Holiday", holidaySchema, "holidays");
