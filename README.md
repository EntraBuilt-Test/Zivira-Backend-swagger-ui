# Zivira Labs Backend API (Swagger-UI service)

This Render service used to run a generic Swagger/OpenAPI demo backend with
placeholder data. It now runs the real Zivira Labs backend — ported over
from the separate `Zivira-Backend-main` repo — so this one service is the
single source of truth for the Admin, Manager, Field, and HR/ESS portals.

## Setup

```
npm install
npm run build
npm start
```

For local development with auto-reload:

```
npm run dev
```

Copy `.env.example` to `.env` and fill in real values (MongoDB URI, JWT
secret, seed secret, etc.) before running locally or deploying.

## Seeding

Render's free tier has no shell access, so seeding against the live
database happens over HTTP, protected by the `SEED_SECRET` header:

```
curl -X POST https://<this-service>.onrender.com/api/seed/exact-10 \
     -H "x-seed-secret: <SEED_SECRET>"
```

This resets every master tab to exactly 10 cross-linked demo records per
tenant. See `src/routes/seed.routes.ts` for the other available seed
endpoints (`/run`, `/fix-data`, `/create-abm002`, `/hr-user`,
`/leave-types`, `/inspect/:key`).

## Structure

- `src/server.ts` — Express app entry point, mounts every router
- `src/routes/` — `auth`, `superadmin`, `company` (admin), `field`,
  `manager`, `ess` (employee self-service / HR), `seed`
- `src/masters/registry.ts` — the ~54-tab generic masters registry backing
  the Admin portal's Masters screens
- `src/models/` — Mongoose schemas
- `src/seed/exact-10.ts` — the "exactly 10 demo records per tab" seeder
