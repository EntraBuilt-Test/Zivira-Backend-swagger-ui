// Request F — a populated field (e.g. DcrModel.find(...).populate("doctorId"))
// comes back as a full nested Mongoose document, with its own `_id`. Only
// the TOP-level `_id` was ever being normalized to `id` here, so any
// populated subdocument kept its raw `_id` — every consumer that reads
// e.g. `doctor.name` off it still worked, but anything trying to key/group
// by the populated doctor's `id` (like the FieldRepo Doctor DCR Report tab
// grouping visits by doctor) silently got `undefined` and matched nothing.
//
// The earlier attempt at this fix checked `typeof value.toObject ===
// "function"` to decide whether a nested value was a populated
// subdocument worth recursing into. That check can never fire: by the
// time normalizeValue() sees the nested value, the PARENT has already
// been through `doc.toObject()` on line ~41 below — and Mongoose's
// toObject() recursively converts every populated subdocument into a
// plain object too, stripping its toObject() method along with it. So
// `dcr.doctorId` arrives here as `{ _id, name, specialty, ... }` with no
// `toObject` function on it, the condition is always false, and the
// populated doctor's `_id` is left un-normalized — reproducing the exact
// bug this comment describes.
//
// Fix: detect a populated subdocument by shape instead — a plain object
// carrying its own `_id` — rather than by an in-flight `toObject` method
// that's already gone by this point. The only other objects that carry an
// own/inherited `_id`-like property here are raw (still-Mongo-native)
// ObjectId/Decimal128 BSON values for un-populated refs, which are always
// tagged with `_bsontype` and are excluded so they pass through untouched
// (JSON.stringify already renders them as their hex/string form via their
// own toJSON()).
function isPlainSubdocument(value: unknown): value is Record<string, unknown> & { _id: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Date) &&
    !("_bsontype" in value) &&
    "_id" in value
  );
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (isPlainSubdocument(value)) {
    return serializeDocument(value as { _id: unknown; createdAt?: Date; updatedAt?: Date });
  }
  return value;
}

export function serializeDocument<T extends { _id: unknown; createdAt?: Date; updatedAt?: Date }>(doc: T) {
  const object = "toObject" in doc && typeof doc.toObject === "function" ? doc.toObject() : doc;
  const { _id, __v, ...rest } = object as Record<string, unknown>;

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    normalized[key] = normalizeValue(value);
  }

  return {
    id: String(_id),
    ...normalized,
    createdAt: normalized.createdAt instanceof Date ? (normalized.createdAt as Date).toISOString() : normalized.createdAt,
    updatedAt: normalized.updatedAt instanceof Date ? (normalized.updatedAt as Date).toISOString() : normalized.updatedAt
  };
}
