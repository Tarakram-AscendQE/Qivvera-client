# Spec: express-api — V1

Status: approved 2026-11-24 (with the decisions below)

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

**Decided 2026-11-24:** all endpoints move to Express before the Friday 2026-11-27 demo (the user wants
the transition finished today) and the hand-written router in `backend/server/app.mjs` is deleted. Groups
are verified and committed one by one; the old router is a fallback only until the last group moves.
Someone with deployment authority deploys; this work never pushes or deploys.

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

**Route groups (all before the demo, in this order):** system + session; workspace, applications, changes,
obligations, revisions, support info; assurance + resolution; drafting, impact, verification templates,
GitHub intake. Then the old router is deleted.

**Validation scope (decided):** Zod checks every path id and query string now. Request bodies keep today's
validators (exact messages); Zod body schemas follow after the demo.

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
backend/api/                 Express app and HTTP layer (TypeScript), compiled to dist/api/
  app.ts                     creates the Express app: settings, security headers, request id, error handler
  server.ts                  createApplicationServer(): Express app inside Node's http.Server (same timeouts)
  routes.ts                  EVERY endpoint in one list: method, path, handler, access rules
  endpoints/<area>/<name>.ts one exported endpoint function per file
  common/                    reusable, documented helpers (validate, respond, errors, security, session,
                             body, services)
test/                        node:test suites (.mjs); new express-*.test.mjs files test the compiled dist/api
```

`backend/server`, `backend/verifiers` and `backend/migrations` stay where they are (verifier digests
depend on their relative paths).

## Code Style

```ts
// backend/api/endpoints/applications/get-application.ts — one endpoint per file
export const getApplication = defineEndpoint({
  params: idParams('applicationId'),            // Zod; a malformed id means "not this route" (404)
  async handle({ services: { repository }, params }) {
    const application = await repository.getApplication(params.applicationId);
    if (!application) throw new InputError('APPLICATION_NOT_FOUND', 'Application not found.', 404);
    return reply(application);
  }
});

// backend/api/routes.ts — every endpoint listed in one place
get('/api/applications/:applicationId', getApplication),
```

Endpoint functions validate, call the existing repository and return a reply; the router sends it.
No business logic in endpoints. Strict TypeScript, no `any`, no `@ts-ignore`. Comments explain why.

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

## Decisions (formerly open questions)

1. Zod failures and existing validators return exactly today's codes and messages.
2. All route groups move before Friday (see above); first group is system + session.
3. Order: express-api today, then postgres-only today; new features start tomorrow (2026-11-25).
