import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError } from "./errors.js";

export type JwtPayload = {
  sub: string;
  role: string;
  portal: string;
  tenantSlug?: string;
  employeeCode?: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "8h" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Missing bearer token"));
  }

  try {
    req.auth = jwt.verify(header.slice("Bearer ".length), config.jwtSecret) as JwtPayload;
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== "SUPER_ADMIN" || req.auth.portal !== "SUPER_ADMIN") {
    return next(new HttpError(403, "Super Admin access required"));
  }

  next();
}

export function requireCompanyAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== "COMPANY_ADMIN" || req.auth.portal !== "COMPANY_ADMIN" || !req.auth.tenantSlug) {
    return next(new HttpError(403, "Company Admin access required"));
  }

  next();
}

export function requireFieldForce(req: Request, _res: Response, next: NextFunction) {
  // SR_MR (Senior Medical Representative) is a field-force role too — managers
  // can already create SR_MR team members (see manager.routes.ts), so the
  // gate here must accept both, or SR_MR logins are locked out of every
  // field endpoint (DCR, Tour Plan, visit tracking) despite having valid
  // FIELD_FORCE credentials.
  const role = req.auth?.role;
  if ((role !== "MR" && role !== "SR_MR") || req.auth?.portal !== "FIELD_FORCE" || !req.auth?.tenantSlug) {
    return next(new HttpError(403, "Field Force access required"));
  }

  next();
}

// Employee Self-Service (ESS) login — Zivira_HR_Client_Requirement_1B.docx
// "Employee Login" screen. Scoped to the logged-in employee's own
// employeeCode; every /api/ess/* route filters by this, never by tenant
// alone, so one employee can never see another's data.
export function requireEmployee(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== "EMPLOYEE" || req.auth?.portal !== "EMPLOYEE" || !req.auth?.tenantSlug || !req.auth?.employeeCode) {
    return next(new HttpError(403, "Employee access required"));
  }

  next();
}

