# Capability Map: Backend platform foundation

Approved by the user on 2026-11-24. Demo on the hosted Vercel environment on Friday 2026-11-27.
Work happens on branch `feat/express-backend`, created from the finished frontend (commit 018ab17).

| Module id | Responsibility | Depends on |
|---|---|---|
| express-api | Every HTTP request goes through Express 5 + TypeScript + Zod. Same URLs, responses, headers, cookies and checks. Routes move over in groups; routes not yet moved keep using today's handler unchanged. | — |
| postgres-only | Remove SQLite. PostgreSQL 17 is the only database for local runs, tests, demos and hosting. | — (built after express-api, same branch) |

Build order: express-api (foundation ready for the Friday demo) → postgres-only (finished before any new
feature work, so new features are written for one database only).

## Deferred (planned, not built now)

| Item | Why deferred |
|---|---|
| Multitenancy (tenant_id + row-level security, or another model) | Not needed yet; tenancy model is still the architect's decision. |
| Background worker and lock rework (per-record locks / job queue instead of the global advisory lock and polling worker) | Not needed for the demo; large, separate change to the assurance worker. |
| OpenAPI 3.1 document generated from the Zod schemas | Useful once most routes use Zod; not needed for the demo. |
| Repository rewrite on a query library (Kysely or Drizzle) | The library choice is still open for the architect. |

Specs: [SPEC-express-api.md](SPEC-express-api.md), [SPEC-postgres-only.md](SPEC-postgres-only.md).
