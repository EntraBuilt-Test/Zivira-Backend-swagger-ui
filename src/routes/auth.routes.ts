import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../http/async-handler.js";
import { requireAuth, signToken } from "../http/auth.js";
import { HttpError } from "../http/errors.js";
import { UserModel } from "../models/user.model.js";

const loginSchema = z.object({
  username: z.string().min(2).transform((value) => value.toLowerCase()),
  password: z.string().min(1),
  portal: z.enum(["SUPER_ADMIN", "COMPANY_ADMIN", "FIELD_FORCE", "EMPLOYEE"])
});

export const authRouter = Router();

authRouter.post("/login", asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await UserModel.findOne({ username: body.username, portal: body.portal, active: true });

  if (!user) {
    throw new HttpError(401, "Invalid credentials");
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);

  if (!valid) {
    throw new HttpError(401, "Invalid credentials");
  }

  const token = signToken({
    sub: String(user._id),
    role: user.role,
    portal: user.portal,
    ...(user.tenantSlug ? { tenantSlug: user.tenantSlug } : {}),
    ...(user.employeeCode ? { employeeCode: user.employeeCode } : {})
  });

  res.json({
    data: {
      token,
      user: {
        id: String(user._id),
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        portal: user.portal,
        tenantSlug: user.tenantSlug,
        employeeCode: user.employeeCode,
        mustChangePassword: user.mustChangePassword ?? false
      }
    }
  });
}));

// Zivira_HR_Client_Requirement_1B.docx "CREATE PASSWORD" step — forced
// after an Employee's first temp-password login (mustChangePassword),
// but usable by any portal's logged-in user to change their own password.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6)
});

authRouter.post("/change-password", requireAuth, asyncHandler(async (req, res) => {
  const body = changePasswordSchema.parse(req.body);
  const user = await UserModel.findById(req.auth!.sub);
  if (!user) throw new HttpError(404, "User not found");

  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(401, "Current password is incorrect");

  user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  user.mustChangePassword = false;
  await user.save();

  res.json({ data: { success: true } });
}));
