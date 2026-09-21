import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectMongo() {
  // IMPORTANT: must be false (Mongoose 8's own default — this was
  // overriding it back to the legacy Mongoose 5/6 behavior).
  //
  // master-record.model.ts deliberately builds a LOOSE schema for every one
  // of the 40+ generic masters (see that file) — it only declares
  // `tenantSlug`; every other field (divisionCode, brandCode, division,
  // zone, ...) is intentionally left undeclared so one generic model can
  // serve every master's shape.
  //
  // strictQuery: true makes Mongoose silently DROP any query condition on a
  // field that isn't declared in the schema. So `Model.findOne({ tenantSlug,
  // divisionCode: "DIV-11" })` was actually being sent to MongoDB as just
  // `{ tenantSlug }` — matching the FIRST record for that tenant regardless
  // of divisionCode. That made every masters-registry duplicate check
  // (create AND update, across every one of those ~50 tabs) report "already
  // exists" against literally any value, the moment a master had at least
  // one existing record — which is every seeded master. strictQuery: false
  // makes Mongoose pass the full filter through to MongoDB untouched, which
  // is what these loose-schema queries need.
  mongoose.set("strictQuery", false);
  await mongoose.connect(config.mongoUri, {
    autoIndex: true
  });
}
