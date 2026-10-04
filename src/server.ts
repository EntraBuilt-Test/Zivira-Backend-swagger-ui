import cors from "cors";
import express from "express";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { config } from "./config.js";
import { connectMongo } from "./db.js";
import { errorHandler, HttpError, notFoundHandler } from "./http/errors.js";
import { authRouter } from "./routes/auth.routes.js";
import { companyRouter } from "./routes/company.routes.js";
import { fieldRouter } from "./routes/field.routes.js";
import { managerRouter } from "./routes/manager.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { superAdminRouter } from "./routes/superadmin.routes.js";
import { seedRouter } from "./routes/seed.routes.js";
import { essRouter } from "./routes/ess.routes.js";
import { openApiSpec } from "./openapi-spec.js";
import { startAutoApproveJob }   from "./jobs/auto-approve.job.js";
import { startManagerDigestJob } from "./jobs/manager-digest.job.js";
import { runDataCorrections } from "./seed/fix-data-corrections.js";

const app = express();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.isCorsOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// Swagger UI docs — browse and try every real route here. Login via
// POST /api/auth/login first, then paste the returned token into the
// "Authorize" button (top right of the docs page) to call anything else.
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/superadmin", superAdminRouter);
app.use("/api/company", companyRouter);
app.use("/api/field", fieldRouter);
app.use("/api/manager", managerRouter);
// Employee Self-Service (ESS) — Zivira_HR_Client_Requirement_1B.docx
// "Employee Login" portal, gated by requireEmployee (see src/http/auth.ts).
app.use("/api/ess", essRouter);
// Protected by the x-seed-secret header (SEED_SECRET env var) — see
// src/routes/seed.routes.ts. This is how master data gets (re)seeded on
// Render, which has no shell access to run scripts/seed-exact-10.ts directly.
app.use("/api/seed", seedRouter);

app.use(notFoundHandler);
app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof ZodError) {
    next(new HttpError(400, error.errors.map((item) => item.message).join(", ")));
    return;
  }

  next(error);
});
app.use(errorHandler);

await connectMongo();

// Round 39 item 1 -- LOGIN TOOK MINUTES (root cause). runDataCorrections()
// (nine collection-wide idempotent fixes, see fix-data-corrections.ts) was
// awaited BEFORE app.listen(). On Render's free tier every cold start
// (after ~15 min idle) re-ran all nine scans against the live database
// while the HTTP port was still unbound, so the first Sign In just hung
// until that finished. The port now binds as soon as Mongo is connected,
// and the corrections run in the background afterwards -- they are
// idempotent and were never needed for a login to succeed. A failure is
// still logged, never fatal.
app.listen(config.port, () => {
  console.log(`Zivira API listening on http://localhost:${config.port}`);
});

setTimeout(() => {
  runDataCorrections().catch((err) => {
    console.error("Startup data corrections failed (server is already serving):", err);
  });
}, 5000);

startAutoApproveJob();
startManagerDigestJob();

// Lightweight keep-warm: while the instance is awake, ping our own public
// /api/health every 10 min so the free tier's 15-min idle spin-down is not
// triggered by quiet periods between real requests. (Cannot wake a sleeping
// instance -- an external uptime pinger hitting /api/health does that.)
const selfUrl = process.env.RENDER_EXTERNAL_URL;
if (process.env.NODE_ENV === "production" && selfUrl) {
  setInterval(() => {
    fetch(`${selfUrl}/api/health`).catch(() => {});
  }, 10 * 60 * 1000);
}
