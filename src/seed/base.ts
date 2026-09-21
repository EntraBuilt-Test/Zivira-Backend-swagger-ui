// src/seed/base.ts
//
// The original one-off bootstrap seed (base logins, tenant, platform
// modules, one demo doctor/product) — pulled out of src/seed.ts so it can
// be called both from the CLI (`npm run seed`) and, since Render's free
// tier has no shell access to run that CLI script against the live
// database, from the protected HTTP endpoint POST /api/seed/base (see
// src/routes/seed.routes.ts). Same export pattern as runExactTenSeed in
// src/seed/exact-10.ts.
//
// Run this ONCE against a fresh database before /api/seed/exact-10 —
// exact-10 resets master data to exactly 10 cross-linked records, but it
// does not create the base login accounts (adminzivira, superadminzivira,
// mr-001, abm-001) or the zivira-labs tenant/platform-module rows this
// seed creates. Safe to re-run any time (every write is an upsert).
import bcrypt from "bcryptjs";
import { connectMongo } from "../db.js";
import { FeatureFlagModel } from "../models/feature-flag.model.js";
import { DoctorModel } from "../models/doctor.model.js";
import { EmployeeModel } from "../models/employee.model.js";
import { PlatformModuleModel } from "../models/platform-module.model.js";
import { ProductModel } from "../models/product.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { UserModel } from "../models/user.model.js";

export async function runBaseSeed() {
  await connectMongo();

  const passwordHash = await bcrypt.hash("ziviramumbai", 12);

  await UserModel.updateOne(
    { username: "superadminzivira" },
    {
      username: "superadminzivira",
      passwordHash,
      displayName: "Zivira Super Admin",
      role: "SUPER_ADMIN",
      portal: "SUPER_ADMIN",
      active: true
    },
    { upsert: true }
  );

  await UserModel.updateOne(
    { username: "adminzivira" },
    {
      username: "adminzivira",
      passwordHash,
      displayName: "Zivira Company Admin",
      role: "COMPANY_ADMIN",
      portal: "COMPANY_ADMIN",
      tenantSlug: "zivira-labs",
      active: true
    },
    { upsert: true }
  );

  await UserModel.updateOne(
    { username: "mr-001" },
    {
      username: "mr-001",
      passwordHash,
      displayName: "Demo Medical Representative",
      role: "MR",
      portal: "FIELD_FORCE",
      tenantSlug: "zivira-labs",
      active: true
    },
    { upsert: true }
  );

  await UserModel.updateOne(
    { username: "abm-001" },
    {
      username: "abm-001",
      passwordHash,
      displayName: "Demo Area Business Manager",
      role: "ABM",
      portal: "FIELD_FORCE",
      tenantSlug: "zivira-labs",
      active: true
    },
    { upsert: true }
  );

  await EmployeeModel.updateOne(
    { tenantSlug: "zivira-labs", employeeCode: "ABM-001" },
    {
      tenantSlug: "zivira-labs",
      name: "Demo Area Business Manager",
      employeeCode: "ABM-001",
      designation: "Area Business Manager",
      division: "Cardio Diabetes",
      reportingManager: "NBH-001",
      territory: "Mumbai",
      role: "ABM",
      status: "ACTIVE"
    },
    { upsert: true }
  );

  await TenantModel.updateOne(
    { slug: "zivira-labs" },
    {
      name: "Zivira Labs",
      slug: "zivira-labs",
      status: "LIVE",
      subscriptionPlan: "ENTERPRISE",
      licenseLimit: 1500,
      activeUsers: 5,
      enabledModuleKeys: ["doctor-crm", "dcr-intelligence", "tour-planning", "field-intelligence"]
    },
    { upsert: true }
  );

  const modules = [
    ["organization-management", "Organization Management", "Hierarchy, employees, roles, and territory setup.", "CORE"],
    ["doctor-crm", "Doctor CRM", "Doctor universe, mappings, engagement, and segmentation.", "CORE"],
    ["dcr-intelligence", "DCR Intelligence", "DCR submission, approvals, rules, and analytics.", "FIELD"],
    ["tour-planning", "Tour Planning", "Tour calendars, approvals, deviations, and route optimization.", "FIELD"],
    ["field-intelligence", "Field Intelligence", "Live tracking, route replay, geo alerts, and heatmaps.", "FIELD"],
    ["reporting-engine", "Reporting Engine", "Standard reports, builders, export queues, and schedules.", "REPORTING"],
    ["sample-management", "Sample Management", "Sample allocation, issue, consumption, balance, and audit.", "COMPLIANCE"],
    ["expense-management", "Expense Management", "Claims, GPS distance, approval, and finance dashboard.", "ADMIN"]
  ] as const;

  for (const [key, name, description, category] of modules) {
    await PlatformModuleModel.updateOne(
      { key },
      { key, name, description, category, defaultEnabled: true, featureKeys: [] },
      { upsert: true }
    );
  }

  await FeatureFlagModel.updateOne(
    { key: "mobile-offline-dcr" },
    {
      key: "mobile-offline-dcr",
      name: "Mobile Offline DCR",
      description: "Allows field users to submit DCRs offline and sync later.",
      enabledGlobally: false,
      enabledTenantSlugs: ["zivira-labs"],
      rolloutStage: "BETA"
    },
    { upsert: true }
  );

  await EmployeeModel.updateOne(
    { tenantSlug: "zivira-labs", employeeCode: "NBH-001" },
    {
      tenantSlug: "zivira-labs",
      name: "Demo National Business Head",
      employeeCode: "NBH-001",
      designation: "National Business Head",
      division: "Cardio Diabetes",
      territory: "India",
      role: "NBH",
      status: "ACTIVE"
    },
    { upsert: true }
  );

  await EmployeeModel.updateOne(
    { tenantSlug: "zivira-labs", employeeCode: "MR-001" },
    {
      tenantSlug: "zivira-labs",
      name: "Demo Medical Representative",
      employeeCode: "MR-001",
      designation: "Medical Representative",
      division: "Cardio Diabetes",
      reportingManager: "ABM-001",
      territory: "Mumbai Central",
      role: "MR",
      status: "ACTIVE"
    },
    { upsert: true }
  );

  await DoctorModel.updateOne(
    { tenantSlug: "zivira-labs", name: "Dr. Ananya Mehta", city: "Mumbai" },
    {
      tenantSlug: "zivira-labs",
      name: "Dr. Ananya Mehta",
      specialty: "Cardiologist",
      category: "A",
      state: "Maharashtra",
      city: "Mumbai",
      territory: "Mumbai Central",
      mappedEmployeeCode: "MR-001",
      status: "ACTIVE"
    },
    { upsert: true }
  );

  await ProductModel.updateOne(
    { tenantSlug: "zivira-labs", code: "ZV-CARD-10" },
    {
      tenantSlug: "zivira-labs",
      name: "Zivacard 10",
      code: "ZV-CARD-10",
      category: "Cardiology",
      division: "Cardio Diabetes",
      status: "ACTIVE"
    },
    { upsert: true }
  );
}
