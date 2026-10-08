import mongoose, { Schema } from "mongoose";

// Round 59 -- Listed Doctor / Chemists upload tools: the "Generate Excel" state (which columns were generated). Kept per company user on the server so it
// survives a different browser; "Delete and Generate New Excel" removes it.
const uploadGenerateStateSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: String, required: true, index: true },
    toolKey: { type: String, required: true },
    columns: { type: [String], default: [] },
    generatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);
uploadGenerateStateSchema.index({ tenantSlug: 1, userId: 1, toolKey: 1 }, { unique: true });

export const UploadGenerateStateModel = mongoose.model("UploadGenerateState", uploadGenerateStateSchema, "uploadGenerateStates");
