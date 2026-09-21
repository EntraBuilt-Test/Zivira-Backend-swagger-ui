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

app.listen(config.port, () => {
  console.log(`Zivira API listening on http://localhost:${config.port}`);
});
startAutoApproveJob();     // ← ADD
startManagerDigestJob();   // ← ADD
