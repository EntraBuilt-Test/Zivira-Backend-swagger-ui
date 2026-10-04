// Round 41 items 2 & 3 -- keep DoctorModel.doctorCategory / campaign in step
// with the generic masters that admins edit (Doctor Master "Doctor Category"
// dropdown, Managerwise Core Doctor Map, Doctor - Campaign Map).
import { DoctorModel } from "../models/doctor.model.js";
import { enumFromIsCore, TIER_ENUM } from "./doctor-tier.js";

export async function syncDoctorDerivedFields(tenantSlug: string, masterKey: string, record: Record<string, unknown>): Promise<void> {
  const doctorCode = String(record.doctorCode ?? "").trim();
  if (!doctorCode) return;
  if (masterKey === "doctorMaster") {
    const tier = record.doctorTier;
    if (typeof tier === "string" && (TIER_ENUM as readonly string[]).includes(tier)) {
      await DoctorModel.updateMany({ tenantSlug, doctorCode }, { $set: { doctorCategory: tier } });
    }
    return;
  }
  if (masterKey === "managerwiseCoreDoctorMap") {
    // Yes -> CORE, No -> N CORE. A doctor an admin has explicitly raised to
    // S CORE keeps that tier (the map only has two states).
    const next = enumFromIsCore(record.isCore);
    await DoctorModel.updateMany({ tenantSlug, doctorCode, doctorCategory: { $ne: "S CORE" } }, { $set: { doctorCategory: next } });
    return;
  }
  if (masterKey === "doctorCampaignMap") {
    const campaign = String(record.campaignSubCategory ?? "").trim();
    await DoctorModel.updateMany({ tenantSlug, doctorCode }, { $set: { campaign: campaign || null } });
  }
}
