# Spec: express-api — V1

Status: proposed (awaiting user review)

## Objective

Today every request is handled by one function in `backend/server/app.mjs` (`createApplicationServer`), a
plain `http.createServer` callback with a long chain of `if (path.match(...))` checks. Request bodies are
checked by hand inside the repositories. That makes every new endpoint harder to add and review.

We will put **Express 5 + TypeScript + Zod** in front of it, **without changing what any client sees**:
same URLs, status codes, JSON bodies, error codes and messages, headers, cookies, origin/CSRF/session
checks and body limits. Routes move into typed Express routers **one group at a time**. A request for a
route that has not moved yet falls through to today's handler, untouched.

Who benefits: the founder's demo keeps working; engineers get typed, validated routes for the many new
features that are coming.

**For the Friday 2026-11-27 demo (hosted Vercel):** the Express foundation and the first route group
are in place, verified, and committed on `feat/express-backend`. Someone with deployment authority deploys
it; this work never pushes or deploys.

## Tech Stack

- Node `>=22.16 <23` (unchanged), TypeScript 5.8.3 strict (unchanged, repository `tsconfig.json`).
- **New runtime dependencies:** `express` 5.3.0, `zod` 4.6.7. **New dev dependency:** `@types/express` 5.0.6.
- Existing: `pg` 8.23.1, repositories and services in `backend/server/**/*.mjs` (not rewritten in this spec).

## How it fits together

```
http.Server (same timeouts: request 15 s, headers 10 s, max header 16 KB)
  └─ Express app (x-powered-by off, ETag off)
       ├─ migrated routers (TypeScript, Zod-validated) ── call the existing repositories
       └─ fallback: today's request handler (unchanged) for every route not yet migrated
```

- `createApplicationServer(options)` keeps its name and options, so `backend/server/start.mjs`,
  `api/index.mjs` (Vercel) and all existing tests keep working without changes to how they call it.
- Migrated routes reuse today's building blocks: the security headers, origin check, session and CSRF
  checks, the `body()` reader (415/413/400 behaviour), `InputError` and the error response shape.
- Zod validates request bodies, path parameters and query strings of migrated routes at the boundary.

**First route group (before the demo):** `POST/GET/DELETE /api/session`, `GET /api/workspace`,
`GET /api/export`, `GET/POST /api/applications`, `GET /api/applications/:id`.
Later groups (after the demo, see plan): changes/obligations/revisions, assurance, resolution, drafting,
impact, templates, intake, support.

## Commands

```
Build:            npm run build                (tsc compiles backend TypeScript into dist/, then Vite)
Type check:       npm run typecheck
All checks:       npm run check                (syntax, types, build, Vitest, node:test backend suites)
Browser suites:   PATH=$HOME/.nvm/versions/node/v22.23.5/bin:$PATH .venv-browser/bin/python3 test/run-browser-suites.py
Demos:            npm run demo:assurance && npm run demo:resolution && npm run demo:generalization
Local server:     npm start
```

## Project Structure

```
backend/http/            NEW. Express app and HTTP layer (TypeScript), compiled to dist/http/
  app.ts                 createExpressApp(): middleware order, migrated routers, legacy fallback
  middleware/            security headers + request id, origin, session, CSRF, error handler
  validate.ts            small helper: apply a Zod schema to body/params/query, map failures to InputError
  routes/                one file per route group (session.ts, workspace.ts, applications.ts, ...)
backend/server/          existing code; app.mjs keeps createApplicationServer() and the fallback handler
test/                    node:test suites (.mjs); new express-*.test.mjs files test the compiled dist/http
```

`backend/server`, `backend/verifiers` and `backend/migrations` stay where they are (verifier digests
depend on their relative paths).

## Code Style

```ts
// backend/http/routes/applications.ts
export function applicationRoutes({ repository }: Services): Router {
  const router = Router();
  router.get('/api/applications/:id', async (req, res) => {
    const { id } = parse(applicationParams, req.params);        // Zod; failure → same 404/400 as today
    const application = await repository.getApplication(id);
    if (!application) throw new InputError('APPLICATION_NOT_FOUND', 'Application not found.', 404);
    res.status(200).json(application);
  });
  return router;
}
```

Small route handlers that validate, call the existing repository and send JSON. No business logic in
routes. Strict TypeScript, no `any`, no `@ts-ignore`. Comments explain why, not what.

## Testing Strategy

- **Behaviour parity is the bar.** Every existing backend test (`node --test test/*.test.mjs`, currently
  694 tests: 686 pass, 8 PostgreSQL suites skipped) must pass unchanged.
- **HTTP parity check:** for a recorded list of requests (valid, invalid, unauthenticated, wrong origin,
  missing CSRF, oversized and malformed bodies) the new build returns the same status, JSON body and
  security headers as commit 018ab17 (request ids and cookie values excluded). Kept as a scratch harness.
- **New unit tests** (`test/express-*.test.mjs`): Zod helper error mapping, middleware order (origin
  before session, CSRF on writes), fallback to the legacy handler, no `X-Powered-By` and no `ETag` headers.
- All 8 native browser suites and the 3 demo commands pass on the final build.
- The 8 PostgreSQL suites are run against a disposable Docker PostgreSQL 17 (`postgres:17-alpine`, loopback).

## Boundaries

- **Always:** keep URLs, status codes, JSON bodies, error codes/messages, headers, cookies and limits
  identical; keep the Content-Security-Policy and other security headers; check origin before the
  session and CSRF on every non-GET; run `npm run check` and the browser suites before each commit;
  commit each verified slice locally on `feat/express-backend`.
- **Ask first:** any change a client could notice (a response, error text, header or status); adding a
  dependency other than express, zod and @types/express; changing `vercel.json`; changing which route
  group comes next; anything touching the database schema.
- **Never:** push, deploy, or change live resources, credentials, databases or account settings; change
  migration, profile or verifier bytes; log request bodies, passwords, cookies or tokens; weaken a
  security check to make a test pass; remove a failing test without approval.

## Success Criteria

1. Every HTTP request (local `npm start` and the Vercel function) passes through the Express app.
2. The first route group is served by TypeScript Express routers with Zod validation; all other routes
   are served by the unchanged fallback handler.
3. The HTTP parity check shows identical results to 018ab17 for every recorded request.
4. `npm run check` passes with all existing tests plus the new ones; 0 failures.
5. All 8 native browser suites and the 3 demos pass; the 8 PostgreSQL suites pass on Docker PostgreSQL.
6. `npm run build` produces the compiled `dist/http/` that `api/index.mjs` loads, so the deployment owner
   can deploy the verified commit (deployment and hosted acceptance are separate gates).

## Out of Scope (Deferred)

- OpenAPI 3.1 generation from the Zod schemas — after most routes use Zod.
- Rewriting repositories or services in TypeScript or on Kysely/Drizzle — library choice is open.
- Worker and lock rework; multitenancy — see the capability map.
- Migrating every route group before Friday — only the first group is needed for the demo.
- Removing SQLite — separate module (`postgres-only`).

## Open Questions

1. **Zod error messages.** Today invalid input gets specific codes and messages (for example
   `INVALID_FIELD`, "Application name must contain 1–100 readable characters.", from
   `backend/server/workflow-input.mjs:7`). Recommended: Zod failures are mapped
   to exactly the same codes and messages, so clients see no change. Alternative: accept new, more
   detailed Zod messages (the UI shows server messages, so users would see different text). Which?
2. **First route group.** Is session + workspace + export + applications the right demo-safe first
   group, or should the demo exercise a different area?
3. **Order after the demo.** Confirm: express-api foundation first (Friday), then postgres-only, then the
   remaining route groups and new features.
