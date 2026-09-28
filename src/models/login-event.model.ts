import mongoose, { Schema } from "mongoose";

// Round 8 item 10 — Login Details / "Not Login Details" reports need a real
// per-login timestamp trail; UserModel never recorded one before (only ever
// held the account itself, no history). One row is written here on every
// successful login from auth.routes.ts, going forward.
const loginEventSchema = new Schema(
  {
    tenantSlug: { type: String, required: true, lowercase: true, trim: true, index: true },
    username: { type: String, required: true, trim: true, index: true },
    employeeCode: { type: String, trim: true, default: null, index: true },
    role: { type: String, trim: true, default: null },
    loginAt: { type: Date, required: true, default: () => new Date(), index: true }
  },
  { timestamps: true }
);

loginEventSchema.index({ tenantSlug: 1, employeeCode: 1, loginAt: -1 });

export const LoginEventModel = mongoose.model("LoginEvent", loginEventSchema, "login_events");
