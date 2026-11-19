# Increment 9 — engineering and deployment handoff

Version 0.10.0. Source baseline: Increment 8 commit
`60153c714cf0b97794166c069dd59f1ff284ff62`. Publish to `increment9`.

Read `increment-9-contract.md` first. Verification templates reuse recorded check-selection
preparation. They are not editable assurance policies, authority decisions or software evidence.

## Architecture

The template service is attached to the existing assurance repository and shares its database
adapter and pool. It stores immutable, digest-bound version snapshots, family lifecycle state,
actor-bound mutation receipts and sidecar plan-use provenance. Template-backed plan approval
validates and writes the new plan, receipt and activity in one transaction.

The old version-1 and version-2 plan/evidence formats, fixed profile definitions and verifier
executables are preserved. A template does not run a worker, call an AI provider, fetch GitHub,
change target configuration or submit an assessment. Existing independent authority review and
full mandatory-scope rules still apply to destination requirements.

`server/templates/` holds the implementation and migration loader. Existing web/serverless entry
points pass the protected assurance configuration. `web/templates.js` implements catalogue,
version inspection, saving, archiving and explicit fresh mapping. `public/` is generated from
canonical `web/` assets. The existing Vercel/PostgreSQL/separate-worker architecture is retained.

## Enablement and migration

`QIVVERA_TEMPLATES_ENABLED` defaults to `false`. Enabling it requires both
`QIVVERA_ASSURANCE_ENABLED=true` and `QIVVERA_GENERALIZATION_ENABLED=true`. Missing prerequisites
fail startup explicitly. The feature also requires valid schema 7 and the reviewed runtime grants.
There are no new accounts, external services, provider credentials or runtime dependencies.

The deployment owner must first rehearse the cumulative migration on a disposable restored copy
of the actual starting database. Schema 7 is additive and preserves prior migrations/checksums,
source receipts, drafted candidates, obligation history, plans, evidence and resolution records.

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run build
# Authorized database owner, using the intended isolated migration rehearsal connection:
npm run migrate
```

`npm run migrate` requires an explicit PostgreSQL `DATABASE_URL` and applies the cumulative
sequence through `007_verification_templates.sql`. Builds and hosted startup do not migrate.
Review `ops/templates-permissions.sql` against the actual non-owner web role and inherited
permissions. Keep the worker's existing restricted grants; it needs no template writes.
Validate the exact web and worker versions against schema 7 before enabling the feature.

Older published application binaries reject schema 7. Turning the feature off does not reverse
the migration. An application rollback is not a database rollback. Recovery requires a rehearsed
restore to a separate database and explicit reconciliation of newer records; do not delete
migration rows or rewrite history to force an older binary to start.

Existing deployments can run the new binary with templates disabled while the team rehearses the
migration. Enabling the feature on an absent or mismatched migration fails; it does not create an
in-memory catalogue or silently downgrade to an old plan.

## Operator boundaries

Source and destination configured targets must use the same supported adapter for this slice.
A different application can reuse a template only after fresh accepted-obligation matching and
selection of a target bound to that application's declared revision. The captured source target
origin and credentials are not template fields. No target is provisioned through this UI.

All authenticated users can inspect business template records. Policy Authority controls their
creation, versioning, archive and fresh plan approval. A name or template digest is not a source
authenticity guarantee. Founder-review mode remains qualified. Ordinary database administrator
trust and the operator-pinned target-identity limitation remain unchanged.

Archive blocks new use of the family. Superseded versions remain inspectable but cannot create new
plans. Neither event invalidates an already approved plan or erases an assessment. Later source
changes do not rewrite historical template versions. The destination's current scope, target and
verifier contracts govern its own plan and evidence.

## Failure and recovery behavior

- On an uncertain mutation response, inspect saved records before repeating the action. Identical
  actor/request-key/payload replay is supported; keys cannot be reused for changed intent. The UI
  never retries a mutation automatically.
- Concurrent plan, scope, version or archive changes reject stale submissions. Reload the relevant
  records and make a new deliberate decision; do not overwrite a newer decision.
- Corrupt snapshots, missing source links or broken membership/history fail with an integrity
  error. Investigate against trusted backups. Do not remove failed checks or edit old digests.
- List/history limits are explicit. A limit is not evidence that the catalogue is complete or that
  excluded requirements need no verification.
- A database-side 16 MiB combined serialized-context budget prevents oversized template history
  bodies from being loaded into server memory. New versions that exceed a family's budget roll
  back atomically. Large catalogue pages are retried as smaller read-only pages with a visible
  notice and explicit Next navigation; records are never truncated to manufacture a valid result.
  Creation/versioning reserve archive-receipt headroom. The final archive receipt is also checked
  inside its transaction; an oversized archive rolls back and leaves the active family unchanged.
- A saved template, preview, export or approved plan never establishes a passing assessment.
  Existing evidence, worker lease, counterexample and resolution semantics continue unchanged.

## Engineering checks

Use Node 22.16 or later within major 22 and the locked dependencies. Local runs without a
disposable PostgreSQL connection explicitly skip database sentinel cases; those skips are not
successful database verification.

```sh
npm run check
npm run demo:assurance
npm run demo:resolution
npm run demo:generalization
# Requires TEST_DATABASE_URL for a disposable loopback qivvera_test_* database:
npm run check:release
```

The full release check must execute all seven PostgreSQL suites. They reset disposable fixtures;
never supply a working staging/customer database. The template suite must verify true concurrent
mutation/replay, migration preservation and narrow grants as well as normal persistence.

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python3 -m pip install -r test/requirements-browser.txt
.venv-browser/bin/python3 -m playwright install --with-deps chromium
.venv-browser/bin/python3 test/run-browser-suites.py
git diff --exit-code -- public/
```

All seven native browser suites are mandatory. The new journey uses real authenticated HTTP and
database records, with no browser fetch mocks. Earlier delayed-response/session assertions remain
in place; response-body completion replaces leaked browser-tool response-finished tasks.
Exact-commit CI supplies executed totals and archived reports/screenshots.

## Team acceptance

Run the cumulative QE suite and `increment-9-qe.md`, recording actual results and defects. Use
`increment-9-release-acceptance.md` for the exact hosted commit, database grants/migration,
HTTPS/session behavior, persistence, recovery and independent product acceptance. Ask an unfamiliar
user to explain why a template does not carry evidence or approval to another revision.

Git publication keeps the automatic `increment9` deployment hold and earlier branch flags.
Publication does not deploy, migrate a live database, provision credentials or approve release.
Optional live AI drafting validation from Increment 7 remains a separate gate if enabled.
