import dotenv from "dotenv";

dotenv.config();

const defaultCorsOrigins = [
  "http://localhost:3001",
  "http://localhost:3002",
  "http://localhost:3003",
  // PRD-documented naming (zivira-labs-*.vercel.app)
  "https://zivira-labs-admin.vercel.app",
  "https://zivira-labs-super-admin.vercel.app",
  "https://zivira-labs-field-repo.vercel.app",
  "https://zivira-labs-manager.vercel.app",
  // Actual live naming as of this deployment (zivira-*.vercel.app, no
  // "-labs" segment) — PRD Section 14 / Section 5.2 both call out that a
  // URL naming mismatch between what's hardcoded here and what's actually
  // deployed on Vercel is the #1 cause of "Failed to fetch" on every portal.
  "https://zivira-admin.vercel.app",
  "https://zivira-super-admin.vercel.app",
  "https://zivira-field-repo.vercel.app",
  "https://zivira-repofield.vercel.app",
  "https://zivira-manager.vercel.app"
];

const configuredCorsOrigins = (process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Matches ANY "zivira*" Vercel deployment — covers both the "zivira-labs-*"
// naming from the original PRD and the shorter "zivira-*" naming actually in
// use, plus Vercel's preview-deployment suffixes (-git-branch-team.vercel.app
// etc.), without needing this list hand-maintained every time a portal is
// renamed or redeployed.
const vercelPreviewOriginPattern = /^https:\/\/zivira(-labs)?-[a-z0-9-]*\.vercel\.app$/;

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/zivira-labs",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-replace-this-secret",
  corsOrigins: Array.from(new Set([...defaultCorsOrigins, ...configuredCorsOrigins])),
  isCorsOriginAllowed(origin: string) {
    return this.corsOrigins.includes(origin) || vercelPreviewOriginPattern.test(origin);
  }
};
