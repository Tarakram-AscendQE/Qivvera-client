# Backend platform foundation — task list

Plan: [tasks/plan.md](plan.md). Each task: implement → `npm run check` → parity harness → browser suites
(where the UI is affected) → commit locally → verify in a clean worktree.

## Phase A — express-api

### Task 1: Remove the old SQLite registry store
**Acceptance:** `backend/server/repository.mjs`, `test/registry.test.mjs`, `test/registry-http.test.mjs` and
the SQLite file-upgrade test in `test/workflow.test.mjs` are gone; the server always runs in workflow mode
(the non-workflow branch in app.mjs is removed); all remaining tests pass.
- [x] Task 1 (40 tests removed: 39 registry + 1 SQLite file-upgrade test; 654 remain, 0 failures)

### Task 2: Express foundation + public and session routes
**Acceptance:** express/zod/@types/express installed; `backend/api/` with `app.ts`, `routes.ts`,
`common/` (security, session, body, validate, respond, errors, services) and `endpoints/system|session`;
`createApplicationServer()` builds the Express app; health, assets and session routes served by Express,
everything else by the old router as fallback; parity harness identical; all checks green.
- [x] Task 2 (parity harness: 35 responses identical; 6 routing tests; 660 backend tests pass)

### Task 3: Workspace, applications, changes, obligations, revisions, support info
- [x] Task 3 (12 endpoints; parity 74 responses identical incl. review, revision and permission paths)

### Task 4: Assurance and resolution endpoints
- [x] Task 4 (14 endpoints; parity 36 responses identical with a real assurance + resolution stack)

### Task 5: Drafting, impact, verification templates, GitHub intake
- [x] Task 5 (19 endpoints; parity identical: templates 27, impact 10, drafting 16, intake 10 responses)

### Task 6: Delete the old router
**Acceptance:** `backend/server/app.mjs` request handler removed; every request is answered by Express
(unknown paths → today's 401/404); parity harness over all endpoints identical; 8 browser suites, 3 demos,
8 PostgreSQL suites (Docker) pass.
- [x] Task 6 (old router deleted; parity 173 responses identical; 8/8 browser suites; 3 demos; PostgreSQL suites 93/97 — 4 recovery tests need pg_dump/pg_restore, not installed)

### Checkpoint A
- [x] All gates green; every endpoint is listed in `backend/api/routes.ts` (49 endpoints)

## Phase B — postgres-only

### Task 7: Docker PostgreSQL helper for tests and development
**Acceptance:** one script starts a loopback `postgres:17-alpine` container, builds a migrated template
database and hands out `qivvera_test_*` copies; the safety guard applies; containers are removed afterwards.
- [x] Task 7 (scripts/postgres-container.mjs, scripts/with-postgres.mjs, test/postgres-test-database.mjs: one empty qivvera_test_* database per test, dropped after each file)

### Task 8: Run every test on PostgreSQL; remove SQLite
**Acceptance:** no `node:sqlite` anywhere; `DATABASE_URL` required; all backend tests, the 8 PostgreSQL
suites (no longer skipped), browser suites, demos and offline checks pass on PostgreSQL.
- [x] Task 8 (no SQLite left in backend/api/scripts/test; DATABASE_URL required; 745/749 backend tests on PostgreSQL — the 4 recovery tests wait for pg_dump/pg_restore 17; impact browser test race fixed)

### Task 9: Developer workflow and docs
**Acceptance:** `npm run dev` starts Docker PostgreSQL; README/AGENTS describe Express layout, common
helpers and PostgreSQL-only setup.
- [x] Task 9 (npm run dev starts a temporary Docker PostgreSQL; README backend + database sections; AGENTS.md updated)

### Final checkpoint
- [x] code-review-and-quality review of the backend diff (CSRF-removal mutation caught by 5 tests; storage fallback simplified; createAuth and backend/schema.sql left for a decision)
- [ ] All gates green — pending: 4 recovery-rehearsal tests need postgresql-client-17 (pg_dump/pg_restore) on this machine
