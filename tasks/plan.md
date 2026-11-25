# Implementation Plan: Backend platform foundation (express-api + postgres-only)

Source specs: [spec/capability-map.md](../spec/capability-map.md), [spec/SPEC-express-api.md](../spec/SPEC-express-api.md),
[spec/SPEC-postgres-only.md](../spec/SPEC-postgres-only.md). Branch `feat/express-backend` (from 018ab17).
Earlier frontend plan: [tasks/done/frontend-plan.md](done/frontend-plan.md).

## Overview

Today (2026-11-24) the user wants the whole backend and database transition finished, so new features can
start tomorrow and the hosted demo on Friday 2026-11-27 runs on a stable frontend + backend + database:

1. **express-api:** every endpoint on Express 5 + TypeScript, in one uniform layout; the hand-written
   router in `backend/server/app.mjs` is deleted. Behaviour seen by clients does not change.
2. **postgres-only:** SQLite removed; PostgreSQL 17 is the only database (local runs use Docker).

## Decisions (user, 2026-11-24)

| Decision | Choice |
|---|---|
| Framework | Express 5.3.0 (+ `@types/express` 5.0.6 dev); Zod 4.6.7 |
| Scope before Friday | All ~49 endpoints on Express; old router deleted. Demo-safe order: each group verified and committed; the old router stays as a fallback only until the last group moves |
| Layout | `backend/api/`: `app.ts`, `routes.ts` (every endpoint in one list), `endpoints/<area>/<endpoint>.ts` (one function per file), `common/` reusable, documented helpers |
| Validation | Zod checks every path id and query string now; request bodies keep today's validators (exact messages); Zod body schemas after the demo |
| Error messages | Unchanged for clients |
| Old SQLite registry store | Delete `backend/server/repository.mjs` with `test/registry*.test.mjs` and the SQLite file-upgrade test in `test/workflow.test.mjs` |
| Database | PostgreSQL only; local and test databases from Docker `postgres:17-alpine` on 127.0.0.1; `npm run dev` starts it |
| Repositories | Stay `.mjs` for now; endpoints call them through typed interfaces (`common/services.ts`) |

## Architecture notes

- **Build:** `tsc -p backend/api/tsconfig.json` compiles `backend/api/**/*.ts` to `dist/api/` (gitignored;
  Vercel and `npm test` run `npm run build` first). TypeScript imports existing modules as
  `../../backend/server/x.mjs`-style paths that resolve to the same file from `backend/api/` and `dist/api/`
  (same depth), so repositories, `InputError` and verifier paths are the originals, never copies.
  Small `.d.mts` files give those few `.mjs` modules their types.
- **One server:** `createApplicationServer()` (TypeScript) builds the Express app and wraps it in Node's
  `http.Server` with today's timeouts; `start.mjs`, `api/index.mjs` and tests keep calling it.
- **Express settings for identical behaviour:** strict + case-sensitive routing, `x-powered-by` and ETag
  off, HEAD treated like any non-GET (origin check, then 404), unmatched paths → today's 401/404 bodies,
  malformed ids → `NOT_FOUND` (not a validation error), JSON body reader with today's 415/413/400 rules.
- **Middleware order (same as today):** security headers + request id → `/healthz` `/readyz` → static
  assets → origin check (non-GET) → `POST /api/session` → session required → support info → CSRF
  (non-GET) → feature routes → 404.

## Task List

See [tasks/todo.md](todo.md).

## Verification for every slice

`npm run check` (all existing tests unchanged + new ones), the HTTP parity harness against the 018ab17
server (status, JSON body with ids/times normalised, security headers), all 8 native browser suites,
the 3 demos; then a local commit verified in a clean worktree. Nothing is pushed or deployed.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Express defaults differ from the hand-written router (trailing slash, case, HEAD, ETag, query parsing) | High | Explicit settings; parity harness covers each case |
| Moving ~49 endpoints in one day | High | Uniform endpoint template, groups committed one by one; the old router remains the fallback until the last group |
| Tests that only passed on SQLite fail on PostgreSQL | Medium | Run the full suite on PostgreSQL before removing SQLite; fix code, never loosen tests silently; report anything unclear |
| Test run time on PostgreSQL | Medium | One container per run; template database copied per test |
| Vercel bundling of `dist/api` | Medium | `npm run build` produces it; check the function entry imports it; deployment owner verifies hosted |

## Deferred (planned, after the demo)

| Item | Note |
|---|---|
| Zod request-body schemas for every endpoint | Today's validators keep exact messages until then |
| OpenAPI 3.1 generated from the Zod schemas | After body schemas exist |
| Repository rewrite (Kysely or Drizzle) and TypeScript repositories | Library choice open for the architect |
| Background worker and lock rework (per-record locks / job queue) | Replaces the global advisory lock and polling worker |
| Multitenancy | Tenancy model open for the architect |
| PgBouncer / pooling and managed-database settings | Hosting work |

## Open Questions

None blocking. New decisions found while building are asked before acting.
