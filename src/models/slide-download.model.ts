// src/models/slide-download.model.ts
//
// Phase 4 ("Master" -> E-Detailing Download / "My Activity" -> E-Detailing
// Practice) — tracks which admin-authored slides (real slideUploadEDetailing
// rows, see registry.ts) a given field rep has "downloaded" for offline
// practice. This is deliberately its own small real model rather than a
// generic master (it's rep-scoped runtime state, not admin-authored
// content) and deliberately does NOT duplicate the slide's base64 file
// bytes — it just records the pointer + denormalized display fields, and
// the Practice tab opens the actual file via the existing
// GET /field/slides/:id/download route.
import mongoose, { Schema } from "mongoose";

const slideDownloadSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    employeeCode: { type: String, required: true, trim: true, index: true },
    slideId: { type: String, required: true, index: true }, // string id of a slideUploadEDetailing row
    // Denormalized for cheap list rendering on the Practice tab without a
    // second round-trip — same precedent as CampaignVisitModel's
    // campaignName/doctorName.
    fileName: { type: String, trim: true, default: "" },
    division: { type: String, trim: true, default: "" },
    subDivision: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    pages: { type: Number, default: null },
    downloadedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

slideDownloadSchema.index({ tenantSlug: 1, employeeCode: 1, slideId: 1 }, { unique: true });

export const SlideDownloadModel = mongoose.model("SlideDownload", slideDownloadSchema, "slide_downloads");
