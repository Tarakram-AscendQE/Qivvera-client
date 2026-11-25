# Qivvera — Independent Change Assurance

**Change → Obligations → Evidence → Gaps → scope-bound Disposition**

## Increment 10 · version 0.11.0

Cumulative implementation on verified Increment 9 commit `1e67bd6`, strengthening **assurance
integrity, record-bound user actions and operational verification**. Damaged scope or plan/run
records cannot silently omit obligations and produce a result. Delayed responses cannot change
the target of a visible action. Explicit operator tools audit effective runtime permissions and
rehearse a genuine PostgreSQL backup/restore into a new disposable database.

Start with the [contract](docs/increment-10-contract.md),
[Product Atlas reconciliation](docs/product-completion-status.md),
[operational verification](docs/operations-verification.md),
[verification record](docs/increment-10-verification.md) and
[unfilled release acceptance record](docs/increment-10-release-acceptance.md).

## What the product supports

- Register applications and source-bound revisions, propose sourced obligations, and record named
  authority review with contributor separation and preserved history.
- Approve a supported mapping and request execution by a separate worker. Up to two distinct
  obligations can map to approval separation and the declared approval-finality contract. Every
  non-rejected declared obligation remains mandatory; unsupported ones stay gaps.
- Inspect expected/observed behavior, frozen assessment scope, evidence and a reasoned READY,
  NOT_READY or INDETERMINATE disposition when the completed result is admissible.
- Track findings, challenges, ownership and corrections; link fresh reassessment and separately
  review a resolution while preserving the original evidence.
- Preview and explicitly import GitHub PR metadata from an operator-configured repository as
  source context, using a separately provisioned product read credential.
- Follow role-aware guidance, read the product Guide and download a safe Support summary.
- Prepare source-grounded drafts with durable source, generator and human-decision provenance.
  Retry receipts prevent duplicate candidates; source quotations do not establish policy authority.
- Inspect declared revision impact, exact copied-obligation differences and current assurance context.
  Follow reasoned next steps while preserving every mandatory obligation and prior evidence record.
- Save, version, inspect and archive verification templates; reuse their supported check choices through
  explicit fresh mappings and a new plan decision with atomic, inspectable preparation provenance.

The two fixed adapters and synthetic reference applications demonstrate bounded reuse in one
workspace. Qivvera does not discover all requirements, execute arbitrary uploaded checks, attest a
running binary, publish GitHub checks, block merges, grant waivers or certify a release.
Requirement acceptance is a human applicability decision; it is not software verification.

## For invited users

Sign in with the named account supplied by the workspace owner. Start at **Workspace**, open
**Guide** for the first-review journey and terminology, and follow **What to do next** on a change.
Your displayed role controls available actions, with record-specific checks on the server.
Use **Support** to inspect configuration and gather a reference. It does not send a ticket or
establish that a worker is running.

There is no public signup or account administration screen. The founder steers the product as an
end user; the deployment owner provisions accounts, protected configuration, targets and operations.

## Repository layout

```text
frontend/
  src/          React 19 + TypeScript app (Vite, TanStack Query; Vitest + Testing Library tests)
  static/       index.html, stylesheets and logo, copied into public/ by the build
  public/       Build output served by the Node server and Vercel. Generated; do not edit by hand.
backend/
  api/          Express 5 + TypeScript HTTP layer: routes.ts (every endpoint), endpoints/, common/ helpers
  server/       Repositories and the assurance/resolution/drafting/impact/templates/intake modules
  verifiers/    Fixed verifier bundles run by the separate assurance worker
  migrations/   Published PostgreSQL migrations
  scripts/      Backend operator CLIs: worker, migrate, accounts, permission audit, recovery rehearsal
  core/         TypeScript disposition model (compiled to dist/core/)
  ops/          Reviewed database grant scripts
  config/       Example target and repository catalogues (shape only)
api/index.mjs   Vercel function entry; Vercel requires it at the project root
scripts/        Build, syntax, verification and reference-demo tooling
test/           Unit, HTTP, PostgreSQL and native browser suites
fixtures/       Synthetic reference target applications used by tests and demos
docs/           Contracts, operations and historical increment records
```

### Frontend

The browser app is React 19 + TypeScript (strict), built by Vite into one ES module,
`frontend/public/app.js`, which `index.html` loads; `scripts/sync-assets.mjs` copies the static files
from `frontend/static/`. The output is plain static JavaScript with no eval and no inline script or
style, so the strict Content-Security-Policy (`script-src 'self'; style-src 'self'`) is unchanged.

- `frontend/src/app/` is the shell: session start and sign-in, the API client (CSRF header,
  stale-session rejection, session expiry), the page frame, the hash route table (`routes.ts`), the
  shared dialog and toast, and assessment polling.
- Each area has a folder (`workspace/`, `change/`, `dialogs/`, `resolution/`, `intake/`, `impact/`,
  `drafting/`, `templates/`, `guide/`). Its `*-module.tsx` loads data and draws screens through the shell.

The UI keeps the rules of the hand-written UI it replaced: results are bound to the visit, route and
session that requested them (`visits.ts`, `viewContext()`); a dialog save is bound to its dialog
generation; saves keep one request ID per unchanged submission and are never retried automatically;
server text is rendered only as text; a screen that fails to render shows the error page. Buttons
act through `data-action` / `data-resolution` attributes handled by the shell.

Routing is a typed hash route table rather than React Router: the screen modules load their data and
then draw, and moving them to route loaders is a separate refactor planned after the backend work.

### Backend

Every HTTP request goes through one Express 5 app written in TypeScript (`backend/api/`, compiled to
`dist/api/` by `npm run build`). The layout is the same for every endpoint:

- `backend/api/routes.ts` lists **every endpoint** (method, path, handler), grouped by the step of the
  request pipeline it runs in. Optional features are wrapped in `onlyWhen(...)`, so their endpoints
  exist only when the feature is configured.
- `backend/api/endpoints/<area>/<name>.ts` holds **one endpoint per file**, declared with
  `defineEndpoint({ params, query, handle })`. `handle` receives a context (services, checked params
  and query, the session, `readBody()`) and returns a reply; it never writes to the response itself.
- `backend/api/common/` holds the shared helpers: `routing.ts` (endpoint and route types),
  `validate.ts` (Zod checks for ids, queries and pages), `respond.ts` (`reply`, `download`),
  `errors.ts` (`InputError`, the error body and handler), `body.ts` (JSON body limits),
  `security.ts` (headers, origin and CSRF), `session.ts`, `assets.ts`, `services.ts` (typed
  repository interfaces) and `assessment-summary.ts`.
- `backend/api/app.ts` shows the pipeline order: security headers → health → web files → origin check
  → sign-in → session required → CSRF → endpoints → 404 → error handler.

To add an endpoint, create its file and add one line to `routes.ts`:

```ts
// backend/api/endpoints/applications/get-application.ts
export const getApplication = defineEndpoint({
  params: idParams('applicationId'),            // Zod: a malformed id is simply not this route (404)
  async handle({ services: { repository }, params }) {
    const application = await repository.getApplication(params.applicationId);
    if (!application) throw new InputError('APPLICATION_NOT_FOUND', 'Application not found.', 404);
    return reply(application);
  }
});
// backend/api/routes.ts:   get('/api/applications/:applicationId', getApplication),
```

Repositories in `backend/server/` validate request bodies and return the exact error codes and
messages clients rely on. Zod already checks every path id and query string; Zod schemas for request
bodies, OpenAPI generation, a query-library rewrite, worker/lock rework and multitenancy are planned
(see `tasks/plan.md`).

### Database

PostgreSQL 17 is the only database. `DATABASE_URL` is required to start the server.

- `npm run dev` starts a temporary local PostgreSQL in Docker when `.env.local` has no `DATABASE_URL`
  (its data is removed when you stop). `node scripts/postgres-dev.mjs` starts one on its own and prints
  the URL to use with `npm start`.
- Tests, demos and browser suites run through `node scripts/with-postgres.mjs`, which starts a
  throwaway `postgres:17-alpine` container bound to 127.0.0.1 and removes it afterwards. Each test gets
  its own empty `qivvera_test_*` database (`test/postgres-test-database.mjs`).

`backend/server/`, `backend/verifiers/` and `backend/migrations/` must stay sibling directories.
Published verifier digests include the relative path strings `../../verifiers/…`, so moving one of
them without the others changes the recorded verifier identity. Historical increment records in
`docs/` predate this layout and refer to `server/`, `web/`, `public/`, `verifiers/`, `migrations/`,
`ops/`, `config/` and `src/core/` at the repository root. The hand-written `web/` UI has been replaced by
`frontend/src/`; its static files are in `frontend/static/`.

## Engineering checks

Use Node 22.16 or later within Node 22 and the locked dependencies. Docker is required: every
backend test, demo and browser suite runs against a throwaway PostgreSQL 17 container.

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run check            # syntax, strict TypeScript, Vite build, Vitest frontend tests, node:test suites
npm run demo:assurance
npm run demo:resolution
npm run demo:generalization
```

`npm run check` runs all eight PostgreSQL suites on the Docker database. `npm run check:release`
additionally requires an explicitly named disposable loopback database in `TEST_DATABASE_URL`, which
the release suites then use. Never reset working data. The operations (recovery) suite also requires
PostgreSQL 17 `pg_dump` and `pg_restore` on this machine (`postgresql-client-17` from the official
PostgreSQL apt repository on Ubuntu).

For genuine local HTTP browser journeys:

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python3 -m pip install -r test/requirements-browser.txt
.venv-browser/bin/python3 -m playwright install --with-deps chromium
npm run test:browser       # runs test/run-browser-suites.py with a throwaway PostgreSQL
```

After configuring the disposable database and pinned browser runtime, run the whole cumulative gate:

```sh
npm run check:engineering
```

This writes `review-test-results/engineering-verification.json` with the source commit, clean-tree
status, actual gate results and retained logs. All eight native browser suites are mandatory.

CI runs these browser checks alongside cumulative regression/reference tests. Hosted HTTPS,
actual provider grants/migration, cold starts, persistence, actual hosted-backup restore and
independent human QE remain separate checks. The cumulative [QE supplement](docs/increment-9-qe.md)
and [release record](docs/increment-10-release-acceptance.md) do not predeclare those outcomes.

## Deployment and compatibility

Keep the existing Vercel/PostgreSQL/worker architecture and team-controlled deployment method.
Increment 10 retains schema 7 and all published migration/profile/verifier bytes. The protected feature switch
`QIVVERA_TEMPLATES_ENABLED` defaults off; enabling it requires assurance and generalization enabled.
Templates share the existing assurance database and introduce no external provider or credentials.
Earlier deployment baselines need the reviewed cumulative migration/grants sequence. Hosted startup
and builds do not migrate. Older published binaries reject schema 7; switching application code back
does not reverse a database upgrade. Optional drafting AI remains separately configured and requires
live evaluation. See the operator handoff for the isolated migration/recovery rehearsal.

Automatic Git deployment for `increment10` remains held in `vercel.json`; prior flags are preserved.
Source publication performs no live migration, secret provisioning, paid resource creation or
deployment. Exact current verification/publication status belongs in the delivery record.
Earlier increment contracts and handoffs remain in `docs/` as historical records.
