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
- [ ] Task 3

### Task 4: Assurance and resolution endpoints
- [ ] Task 4

### Task 5: Drafting, impact, verification templates, GitHub intake
- [ ] Task 5

### Task 6: Delete the old router
**Acceptance:** `backend/server/app.mjs` request handler removed; every request is answered by Express
(unknown paths → today's 401/404); parity harness over all endpoints identical; 8 browser suites, 3 demos,
8 PostgreSQL suites (Docker) pass.
- [ ] Task 6

### Checkpoint A
- [ ] All gates green; every endpoint is listed in `backend/api/routes.ts`

## Phase B — postgres-only

### Task 7: Docker PostgreSQL helper for tests and development
**Acceptance:** one script starts a loopback `postgres:17-alpine` container, builds a migrated template
database and hands out `qivvera_test_*` copies; the safety guard applies; containers are removed afterwards.
- [ ] Task 7

### Task 8: Run every test on PostgreSQL; remove SQLite
**Acceptance:** no `node:sqlite` anywhere; `DATABASE_URL` required; all backend tests, the 8 PostgreSQL
suites (no longer skipped), browser suites, demos and offline checks pass on PostgreSQL.
- [ ] Task 8

### Task 9: Developer workflow and docs
**Acceptance:** `npm run dev` starts Docker PostgreSQL; README/AGENTS describe Express layout, common
helpers and PostgreSQL-only setup.
- [ ] Task 9

### Final checkpoint
- [ ] code-review-and-quality review of the backend diff
- [ ] All gates green; report to the user (what changed, verified, not verified)
