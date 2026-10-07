import cors from "cors";
import compression from "compression";
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
import { startDcrLockJob } from "./jobs/dcr-lock.job.js";
import { runRound41Upgrade } from "./migrations/round41-upgrade.js";
import { runDataCorrections } from "./seed/fix-data-corrections.js";

const app = express();

app.use(helmet());
// Round 48 Part C -- gzip every JSON response over 1 KB (big report/list payloads shrink ~5-10x).
app.use(compression({ threshold: 1024 }));
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

// Round 48 Part C -- the port now binds IMMEDIATELY (before Mongo connects), so a cold
// start answers /api/health and begins accepting requests at once; Mongoose buffers the first
// queries (bufferTimeoutMS) until the connection is up. Everything that touches the database
// at boot (upgraders, corrections, jobs) runs only after the connection is open, never blocking
// the bind. Connection attempts retry with a short back-off instead of crashing the process.
import mongoose from "mongoose";
mongoose.set("bufferTimeoutMS", 30000);

app.listen(config.port, () => {
  console.log(`Zivira API listening on http://localhost:${config.port}`);
});

function startBackground() {
  // Round 39 -- the nine idempotent data corrections, then the Round 41 upgrader (staggered).
  setTimeout(() => {
    runDataCorrections().catch((err) => console.error("Startup data corrections failed (server is already serving):", err));
  }, 5000);
  setTimeout(() => {
    runRound41Upgrade().catch((err) => console.error("Round 41 upgrade failed (server is serving):", err));
  }, 8000);
  startDcrLockJob();
  startAutoApproveJob();
  startManagerDigestJob();
}

async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      await connectMongo();
      console.log("MongoDB connected");
      startBackground();
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, Math.min(15000, 2000 * attempt)));
    }
  }
}
void connectWithRetry();

// Lightweight keep-warm: while the instance is awake, ping our own public
// /api/health every 10 min so the free tier's 15-min idle spin-down is not
// triggered by quiet periods between real requests. (Cannot wake a sleeping
// instance -- the admin/manager/field apps also ping /api/health while open.)
const selfUrl = process.env.RENDER_EXTERNAL_URL;
if (process.env.NODE_ENV === "production" && selfUrl) {
  setInterval(() => {
    fetch(`${selfUrl}/api/health`).catch(() => {});
  }, 10 * 60 * 1000);
}
