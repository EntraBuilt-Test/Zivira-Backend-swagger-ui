import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    // Optional machine-readable payload alongside the human message — e.g.
    // the tpId of a conflicting Tour Plan, so the frontend can offer a real
    // next action ("add these locations to it instead") rather than just
    // displaying red text with no way forward.
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
}

// Defensive net so a raw MongoDB duplicate-key error (E11000 ...) never
// reaches the UI verbatim — every place that can trigger one should already
// handle it explicitly (e.g. utils/tour-plan-id.ts), but if a new one slips
// through anywhere else in the codebase, this still returns something a user
// can understand instead of a driver-internals string.
function isMongoDuplicateKeyError(error: unknown): error is { code: number; keyValue?: Record<string, unknown> } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: number }).code === 11000;
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (isMongoDuplicateKeyError(error)) {
    const field = error.keyValue ? Object.keys(error.keyValue)[0] : undefined;
    res.status(409).json({
      error: {
        message: field ? `A record with this ${field} already exists.` : "This record already exists.",
        statusCode: 409
      }
    });
    return;
  }

  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      ...(error instanceof HttpError && error.details ? { details: error.details } : {})
    }
  });
}
