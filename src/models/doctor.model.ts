import mongoose, { Schema } from "mongoose";

const doctorSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    specialty: { type: String, required: true, trim: true, index: true },
    category: { type: String, enum: ["A", "B", "C"], default: "C", index: true },
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    territory: { type: String, required: true, trim: true, index: true },
    mappedEmployeeCode: { type: String, trim: true },
    mappedEmployeeName: { type: String, trim: true, default: null },
    doctorCode: { type: String, trim: true, index: true },
    dob: { type: Date, default: null },
    anniversaryDate: { type: Date, default: null },
    gender: { type: String, trim: true, default: null },
    registrationNo: { type: String, trim: true, default: null },
    maritalStatus: { type: String, trim: true, default: null },
    qualification: { type: String, trim: true, default: null },
    specialityCode: { type: String, trim: true, default: null },
    categoryCode: { type: String, trim: true, default: null },
    address1: { type: String, trim: true, default: null },
    location: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
    postalCode: { type: String, trim: true, default: null },
    clinicName: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    email: { type: String, trim: true, lowercase: true, default: null },
    grade: { type: String, trim: true, default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    // Admin "Update/Delete > Drs UNI No - Generation" screen (matches
    // sanpharma.info's own Unique_Doc_Slno.aspx exactly): a unique
    // sequential serial number assigned to each doctor, allocated by mode
    // (All Listed Drs / Specialty Wise / Subdivision-HQ Wise) and cleared
    // by Reset. null/absent means "not allocated yet".
    uniqueSlNo: { type: String, trim: true, default: null, index: true },
    // Round 8 item 1/2 — Coverage Analysis 2's "Territory Type" grouped
    // columns (HQ / EX / OS) need a real per-doctor classification to
    // aggregate DCR calls against; no such field existed anywhere in the
    // schema before. Defaults every doctor to "HQ" (the common case) so
    // existing records stay queryable immediately; genuinely EX/OS doctors
    // can be reclassified via the normal doctor edit flow.
    territoryType: { type: String, enum: ["HQ", "EX", "OS"], default: "HQ", index: true },
    // Round 41 item 2 -- real 4-tier category (A/B/C `category` above is the
    // CLASS). Unset = not yet migrated (readers fall back to the legacy
    // managerwiseCoreDoctorMap flag); the boot upgrader sets every doctor.
    doctorCategory: { type: String, enum: ["NIL", "CORE", "N CORE", "S CORE"], index: true },
    // Round 41 item 3 -- campaign this doctor is mapped to (name of a
    // campaignMaster row), kept in sync with the Doctor - Campaign Map master.
    campaign: { type: String, trim: true, default: null, index: true },
    // Round 44 -- names from the Doctor Type master (doctorTypeMaster).
    doctorTypes: { type: [String], default: [] },
    // Round 45 -- brands this doctor is being promoted for (Custom Report "Promoted DRs").
    promotedBrands: { type: [String], default: [] },
    // Round 41 item 4 -- supportive chemists for this doctor.
    supportiveChemists: { type: [new Schema({ dealerId: { type: String, required: true }, dealerName: { type: String, default: "" } }, { _id: false })], default: [] }
  },
  { timestamps: true }
);

doctorSchema.index({ tenantSlug: 1, name: 1, city: 1, specialty: 1 });
doctorSchema.index({ tenantSlug: 1, doctorCode: 1 }, { unique: true, partialFilterExpression: { doctorCode: { $exists: true } } });

export const DoctorModel = mongoose.model("Doctor", doctorSchema);
