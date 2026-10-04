// Round 41 -- idempotent boot-time upgrader. Runs in the background AFTER the
// port is bound (see server.ts); safe to re-run. It never touches historical
// DCR POB (old rows stay honestly blank).
//   * seeds the WorkTypeCode legend per tenant
//   * seeds default settings (DCR delay days, category norms) if unset
//   * Doctor.doctorCategory: legacy isCore -> CORE / N CORE, none -> NIL
//   * Doctor.campaign: from the Doctor - Campaign Map master
import { EmployeeModel } from "../models/employee.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { CompanyConfigModel } from "../models/company-config.model.js";
import { getMasterModel } from "../models/master-record.model.js";
import { ensureWorkTypeCodes } from "../utils/work-type-codes.js";
import { enumFromIsCore } from "../utils/doctor-tier.js";
import { CATEGORY_NORMS_KEY, DCR_DELAY_DAYS_KEY, DEFAULT_CATEGORY_NORMS, DEFAULT_DCR_DELAY_DAYS } from "../utils/settings.js";

async function seedDefault(tenantSlug: string, key: string, value: unknown) {
  await CompanyConfigModel.updateOne({ tenantSlug, key }, { $setOnInsert: { value } }, { upsert: true });
}

export async function upgradeTenant(tenantSlug: string) {
  const out = { codes: 0, tiers: 0, campaigns: 0 };
  out.codes = await ensureWorkTypeCodes(tenantSlug);
  await seedDefault(tenantSlug, DCR_DELAY_DAYS_KEY, DEFAULT_DCR_DELAY_DAYS);
  await seedDefault(tenantSlug, CATEGORY_NORMS_KEY, DEFAULT_CATEGORY_NORMS);

  try {
    const coreRows = (await getMasterModel("managerwiseCoreDoctorMap").find({ tenantSlug }).lean()) as any[];
    for (const r of coreRows) {
      if (!r.doctorCode) continue;
      const res = await DoctorModel.updateMany(
        { tenantSlug, doctorCode: r.doctorCode, doctorCategory: { $exists: false } },
        { $set: { doctorCategory: enumFromIsCore(r.isCore) } }
      );
      out.tiers += res.modifiedCount ?? 0;
    }
  } catch { /* master not configured */ }
  const rest = await DoctorModel.updateMany({ tenantSlug, doctorCategory: { $exists: false } }, { $set: { doctorCategory: "NIL" } });
  out.tiers += rest.modifiedCount ?? 0;

  try {
    const campRows = (await getMasterModel("doctorCampaignMap").find({ tenantSlug }).lean()) as any[];
    for (const r of campRows) {
      const campaign = String(r.campaignSubCategory ?? "").trim();
      if (!r.doctorCode || !campaign) continue;
      const res = await DoctorModel.updateMany(
        { tenantSlug, doctorCode: r.doctorCode, $or: [{ campaign: { $exists: false } }, { campaign: null }] },
        { $set: { campaign } }
      );
      out.campaigns += res.modifiedCount ?? 0;
    }
  } catch { /* master not configured */ }
  return out;
}

export async function runRound41Upgrade() {
  const tenants = (await EmployeeModel.distinct("tenantSlug")) as string[];
  for (const t of tenants) {
    const r = await upgradeTenant(t);
    if (r.codes || r.tiers || r.campaigns) console.log(`[Round41] ${t}: codes+${r.codes} tiers+${r.tiers} campaigns+${r.campaigns}`);
  }
}
