# Spec: postgres-only — V1

Status: approved 2026-11-24

## Objective

Qivvera has two storage engines today: SQLite (`node:sqlite`) for local review, tests, demos and browser
suites, and PostgreSQL for the hosted deployment. Every query path and test therefore has two possible
behaviours. The user wants **one database, PostgreSQL**, so the many new features coming next are
written and tested for PostgreSQL only.

After this change PostgreSQL 17 is the only database everywhere: hosted, local `npm start`, every test,
the demos and the native browser suites.

## Current behaviour (what exists today)

- `backend/server/config.mjs:68` picks `sqlite` when `DATABASE_URL` is missing (local only; hosted
  already refuses SQLite). Local SQLite needs `QIVVERA_LOCAL_SQLITE=true`.
- `backend/server/workflow-store.mjs:55` `openDatabase()` defaults to in-memory SQLite. Most test helpers
  and all 8 browser-suite fixtures rely on that default.
- `backend/server/repository.mjs` is an old SQLite-only "registry" store. The server and Vercel do not use
  it; only `test/registry.test.mjs`, `test/registry-http.test.mjs` and `test/workflow.test.mjs` import it.
- SQLite also appears in `backend/scripts/accounts.mjs`, `backend/scripts/assurance-worker.mjs`,
  `backend/server/support-info.mjs` (storage label), the demo scripts and about 30 test files.
- The 8 PostgreSQL suites need `TEST_DATABASE_URL` and `REQUIRE_POSTGRES=true`, guarded by
  `test/postgres-safety.mjs` (loopback, `qivvera_test_*` databases only); locally they are skipped.

## New behaviour

- No `node:sqlite` import and no SQLite code path remain in `backend/`, `api/`, `scripts/` or `test/`.
- `DATABASE_URL` is required for every server start; a clear startup error explains how to get one.
- **Local PostgreSQL comes from Docker** (user decision): a script starts a throwaway `postgres:17-alpine`
  container bound to `127.0.0.1`, with a generated password, and removes it afterwards. No system install.
- **Tests:** one container per test run. Migrations are applied once to a template database; each test
  that needs a database gets a fresh copy (`CREATE DATABASE qivvera_test_<id> TEMPLATE ...`) and drops it
  afterwards. The existing disposable-database safety guard stays and applies to every test database.
- The 8 PostgreSQL suites stop being "skipped": they run in `npm run check` like every other suite.
- Browser suites, demos and `npm run dev` use the same Docker database helper.

## Must not change

- Migration files, schema version 7, profile and verifier bytes (AGENTS.md invariants).
- The hosted (Vercel) code path and its behaviour; API responses, except the storage label that local
  runs report (it becomes "PostgreSQL" instead of "Local review").
- Test intent: existing assertions keep their meaning; a test is only removed with user approval.

## Commands

```
Start a local database:  node scripts/postgres-dev.mjs          (prints DATABASE_URL; stops on Ctrl+C)
Local server:            DATABASE_URL=... npm start
All checks:              npm run check                           (starts and removes its own container)
Browser suites:          .venv-browser/bin/python3 test/run-browser-suites.py   (uses the same helper)
```

(Script names are proposals; the plan fixes them.)

## Testing Strategy

- `npm run check` runs every backend suite on PostgreSQL; the "8 skipped" become passing suites.
- Before removing SQLite, the full suite is run once on PostgreSQL alone to find tests that only passed
  on SQLite; each difference is fixed in the code or reported to the user (never silently loosened).
- All 8 native browser suites, the 3 demos and the 4 offline component checks pass on PostgreSQL.
- Runtime: the test run must stay practical; target under 3 minutes for `node --test` locally.

## Boundaries

- **Always:** use only disposable loopback databases for tests (`qivvera_test_*`); remove containers
  after runs; keep migrations untouched; run all checks before each commit.
- **Ask first:** deleting any test file or assertion; changing a migration or the schema; changing
  hosted configuration (`vercel.json`, environment variables); anything that needs sudo or a system install.
- **Never:** connect to the hosted/production database; print or commit database passwords; push or deploy.

## Success Criteria

1. `grep -rn "sqlite" backend api scripts test` finds nothing (docs may keep historical mentions).
2. `npm run check` passes with 0 failures and 0 skipped PostgreSQL suites, using a Docker PostgreSQL 17.
3. All 8 browser suites, 3 demos and 4 offline component checks pass on PostgreSQL.
4. Starting the server without `DATABASE_URL` fails with a clear message (no silent fallback).
5. Hosted behaviour unchanged: the PostgreSQL code path used by Vercel is the one all tests now exercise.

## Out of Scope (Deferred)

- Kysely/Drizzle repository rewrite; per-record locks and worker rework; multitenancy (capability map).
- PgBouncer / connection pooling changes and managed-database settings (hosting work).

## Decisions (formerly open questions)

1. Delete the old registry store (`backend/server/repository.mjs`) with `test/registry.test.mjs`,
   `test/registry-http.test.mjs` and the SQLite file-upgrade test in `test/workflow.test.mjs`.
2. `npm run dev` starts the Docker database automatically.
3. Timing: right after express-api, finished today (2026-11-24), before new features start.
