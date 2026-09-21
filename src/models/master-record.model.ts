import mongoose, { Schema } from "mongoose";
import { getMasterConfig } from "../masters/registry.js";

const modelCache = new Map<string, mongoose.Model<any>>();

/**
 * Returns a Mongoose model for the given master key, creating it on first use.
 * The schema is intentionally loose (`strict: false`) because each of the 38
 * masters has its own field shape defined in registry.ts — we don't want 38
 * hand-written Mongoose schemas that would only duplicate that same
 * information. Field-level validation (required fields, uniqueness) is
 * enforced in the route handler using the registry, not by Mongoose here.
 */
export function getMasterModel(key: string): mongoose.Model<any> {
  const cached = modelCache.get(key);
  if (cached) return cached;

  const config = getMasterConfig(key);
  if (!config) {
    throw new Error(`Unknown master key: ${key}`);
  }

  const schema = new Schema(
    { tenantSlug: { type: String, required: true, index: true } },
    { strict: false, timestamps: true, collection: key }
  );

  const model = mongoose.model(key, schema, key);
  modelCache.set(key, model);
  return model;
}
