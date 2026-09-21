import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { requireAuth, requireSuperAdmin } from "../http/auth.js";
import { FeatureFlagModel } from "../models/feature-flag.model.js";
import { PlatformModuleModel } from "../models/platform-module.model.js";
import { TenantModel } from "../models/tenant.model.js";
import { audit } from "../utils/audit.js";
import { serializeDocument } from "../utils/serialize.js";

const tenantSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  status: z.enum(["SETUP", "SANDBOX", "PILOT", "LIVE", "SUSPENDED"]).default("SETUP"),
  subscriptionPlan: z.enum(["SANDBOX", "GROWTH", "ENTERPRISE"]).default("SANDBOX"),
  licenseLimit: z.number().int().positive().default(25),
  enabledModuleKeys: z.array(z.string()).default([])
});

const moduleSchema = z.object({
  key: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  description: z.string().min(8),
  category: z.enum(["CORE", "FIELD", "AI", "REPORTING", "ADMIN", "COMPLIANCE"]),
  defaultEnabled: z.boolean().default(false),
  featureKeys: z.array(z.string()).default([])
});

const flagSchema = z.object({
  key: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(2),
  description: z.string().min(8),
  enabledGlobally: z.boolean().default(false),
  enabledTenantSlugs: z.array(z.string()).default([]),
  rolloutStage: z.enum(["INTERNAL", "BETA", "GA", "PAUSED"]).default("INTERNAL")
});

export const superAdminRouter = Router();

superAdminRouter.use(requireAuth, requireSuperAdmin);

superAdminRouter.get("/dashboard", asyncHandler(async (_req, res) => {
  const [tenantCount, liveTenantCount, moduleCount, flagCount, tenants] = await Promise.all([
    TenantModel.countDocuments(),
    TenantModel.countDocuments({ status: "LIVE" }),
    PlatformModuleModel.countDocuments(),
    FeatureFlagModel.countDocuments(),
    TenantModel.find().sort({ updatedAt: -1 }).limit(8)
  ]);

  res.json({
    data: {
      metrics: {
        tenantCount,
        liveTenantCount,
        moduleCount,
        flagCount
      },
      tenants: tenants.map(serializeDocument)
    }
  });
}));

superAdminRouter.get("/tenants", asyncHandler(async (_req, res) => {
  const tenants = await TenantModel.find().sort({ createdAt: -1 });
  res.json({ data: tenants.map(serializeDocument) });
}));

superAdminRouter.post("/tenants", asyncHandler(async (req, res) => {
  const body = tenantSchema.parse(req.body);
  const tenant = await TenantModel.create(body);
  await audit("TENANT_CREATED", "Tenant", String(tenant._id), { slug: tenant.slug });
  res.status(201).json({ data: serializeDocument(tenant) });
}));

superAdminRouter.get("/tenants/:slug", asyncHandler(async (req, res) => {
  const tenant = await TenantModel.findOne({ slug: req.params.slug });

  if (!tenant) {
    res.status(404).json({ error: { message: "Tenant not found", statusCode: 404 } });
    return;
  }

  res.json({ data: serializeDocument(tenant) });
}));

superAdminRouter.patch("/tenants/:slug", asyncHandler(async (req, res) => {
  const body = tenantSchema.partial().parse(req.body);
  const tenant = await TenantModel.findOneAndUpdate({ slug: req.params.slug }, body, { new: true });

  if (!tenant) {
    res.status(404).json({ error: { message: "Tenant not found", statusCode: 404 } });
    return;
  }

  await audit("TENANT_UPDATED", "Tenant", String(tenant._id), { slug: tenant.slug });
  res.json({ data: serializeDocument(tenant) });
}));

superAdminRouter.delete("/tenants/:slug", asyncHandler(async (req, res) => {
  const tenant = await TenantModel.findOneAndDelete({ slug: req.params.slug });

  if (!tenant) {
    res.status(404).json({ error: { message: "Tenant not found", statusCode: 404 } });
    return;
  }

  await audit("TENANT_DELETED", "Tenant", String(tenant._id), { slug: tenant.slug });
  res.json({ data: { deleted: true, slug: req.params.slug } });
}));

superAdminRouter.get("/modules", asyncHandler(async (_req, res) => {
  const modules = await PlatformModuleModel.find().sort({ category: 1, name: 1 });
  res.json({ data: modules.map(serializeDocument) });
}));

superAdminRouter.post("/modules", asyncHandler(async (req, res) => {
  const body = moduleSchema.parse(req.body);
  const module = await PlatformModuleModel.create(body);
  await audit("MODULE_CREATED", "PlatformModule", String(module._id), { key: module.key });
  res.status(201).json({ data: serializeDocument(module) });
}));

superAdminRouter.get("/feature-flags", asyncHandler(async (_req, res) => {
  const flags = await FeatureFlagModel.find().sort({ key: 1 });
  res.json({ data: flags.map(serializeDocument) });
}));

superAdminRouter.post("/feature-flags", asyncHandler(async (req, res) => {
  const body = flagSchema.parse(req.body);
  const flag = await FeatureFlagModel.create(body);
  await audit("FEATURE_FLAG_CREATED", "FeatureFlag", String(flag._id), { key: flag.key });
  res.status(201).json({ data: serializeDocument(flag) });
}));

superAdminRouter.patch("/feature-flags/:key", asyncHandler(async (req, res) => {
  const body = flagSchema.partial().parse(req.body);
  const flag = await FeatureFlagModel.findOneAndUpdate({ key: req.params.key }, body, { new: true });

  if (!flag) {
    res.status(404).json({ error: { message: "Feature flag not found", statusCode: 404 } });
    return;
  }

  await audit("FEATURE_FLAG_UPDATED", "FeatureFlag", String(flag._id), { key: flag.key });
  res.json({ data: serializeDocument(flag) });
}));
