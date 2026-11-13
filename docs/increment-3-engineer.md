# Increment 3 — engineer handoff

## Published-branch integration note

The `increment3` source branch is based on Increment 2 commit `64ffff2699601c29fe73ef077800695c49f1ebad`. When checking out that branch, Increment 2 and the Increment 3 delta are already present: do not reapply either source ZIP. See `increment-3-publication.md` for the publication record. The package-application wording below is retained as historical guidance for the original overlay. Deployment and database migration are still separate, unverified release gates.

## Sequencing and baseline
Apply AFTER the exact Increment 2 commit-candidate package with the Vercel deployment hold, not directly over the old increments branch. Increment 2 was not deployed or published by this session. The accompanying manifest identifies its package digest and prerequisite file hashes; the helper refuses mismatches, a dirty worktree, main/increments, or conflicting new files. If your team changes Increment 2, reconcile the delta through code review instead of forcing the helper. No helper performs a commit, push, deployment, migration, account creation or charge.

This package preserves Vercel for the application and PostgreSQL for hosted storage. No provider change is requested. It adds a separately run worker process; it does not create another paid service. The deployment team can run the bounded worker on an authorized engineering host for protected review. A continuously hosted worker, new service, scheduler, resource increase or additional spend needs the owner's approval.

## Before applying
Complete Increment 2's credential rotation and retirement of old deployments. Do not reuse credentials previously embedded in the original branch. Review source, SQL, dependencies and the plan/runner permission boundary. Preserve a database backup and test recovery to an isolated database.

## Build and test
Node 22.16+ within Node 22. Use the committed lock: npm ci --ignore-scripts; npm run selfcheck; npm run check. All tests use disposable data. Set TEST_DATABASE_URL ONLY to a loopback PostgreSQL database named qivvera_test_<suffix>. npm run check:release requires both real PostgreSQL suites; these tests reset tables and REFUSE remote database URLs. They must never point to the founder's data. Test files run serially to avoid cross-suite schema resets.

npm run demo:assurance executes the actual application HTTP API, a separate reference target process and a separate worker process, writing evidence for correct, seeded self-approval-defect and reject-all cases. These are genuine local behavioural executions but use the SQLite review store. They are not evidence that PostgreSQL or Vercel works.

Run test/browser-workflow.py for retained Increment 2 functionality and test/browser-assurance.py for the new native browser journey in an allowed environment with Python Playwright and Chromium. test/assurance-component-ui.py only renders captured local execution records with stubbed fetch; never describe it as browser/API E2E. Native HTTPS/Vercel acceptance is separate.

## Migration
Migration 003 is additive and requires schema 2. npm run migrate applies the existing workflow migration and the new assurance migration in the authorized migration environment. It does not run during Vercel build or a function request. Checksums are enforced. Inspect a staging copy of the actual deployed schema and exercise rows/relationships before production. Existing accepted decisions and historical revisions must remain intact.

Schema 3 adds assurance_plans, assurance_runs and assurance_evidence. There is no destructive down migration. Earlier Increment 2 binaries reject schema 3; rollback therefore requires a reviewed forward-compatible build or isolated restoration of the earlier database, preserving new data separately. Do not simply revert code and write into the new database.

## Configure the web application
Existing named-account and PostgreSQL configuration remains. Add:
- QIVVERA_ASSURANCE_ENABLED=true only after schema 3 and runner/catalogue configuration are validated.
- QIVVERA_TARGETS_JSON: protected target metadata, matching a saved application ID and full change revision. See config/assurance-targets.example.json and the contract. Use a synthetic test environment only.
- No target access token belongs in the web application. The JSON holds worker environment-variable NAMES only.

With the feature disabled, existing requirement/revision functions still operate. A configured queue does not establish that a worker is running. The UI explicitly shows QUEUED and eventually FAILED if no worker claims the job.

## Configure and operate the worker
Use the same reviewed source and target catalogue as the web service. It computes and verifies the executable-source digest. Required worker-only settings:
- ASSURANCE_DATABASE_URL: database connection for the separately permissioned worker identity.
- DATABASE_SSL_MODE=verify-full; DATABASE_CA only for a legitimate trusted CA.
- QIVVERA_WORKER_ID: stable, named worker identity.
- QIVVERA_ASSURANCE_ENABLED=true and QIVVERA_TARGETS_JSON.
- The two secret environment variables referenced by each target, provisioned by the target owner.

Run npm run worker:once for one bounded claim, or npm run worker:run under the team's approved process supervisor. The latter polls the durable queue and gracefully finishes its current bounded job on SIGTERM. It is NOT a Vercel function or a browser connection. There is no automatic retry after worker lease expiry. Cancellation prevents accepting later output but cannot recall an HTTP request already sent to the target.

For isolated local reference execution only, QIVVERA_LOCAL_SQLITE=true, DATABASE_PATH and QIVVERA_ALLOW_LOOPBACK_TARGETS=true are explicit. Hosted mode refuses the loopback exception. Do not weaken TLS or DNS rules to reach an unsupported customer target.

## Database and host permissions
Use a non-owner runtime role for the web app and a separate worker role. The web role must have no INSERT/UPDATE/DELETE on assurance_evidence. The worker needs SELECT on plan/workflow inputs, update of run ownership/state, INSERT on evidence/activity, but no modification of policies, plan contents, obligation text or review decisions. Neither is the database owner. The optional ops/assurance-permissions.sql is a review template, not an automatically executed role setup. Validate it against your actual grants and provider restrictions; it is not evidence that separation has been enforced.

The producer/target application must have no worker/database secrets. A separate process alone is not a secure sandbox. The worker runs fixed trusted verifier code; no user-submitted executable code is run. Configure egress restrictions and monitor worker availability before expanding access.

## Preview acceptance
1. Sign in as AUTHOR, create a change with a full source ref, propose a requirement; a different POLICY_AUTHORITY accepts it.
2. POLICY_AUTHORITY opens Assurance, maps the accepted requirement to the configured target, and records why the oracle fits. Check that other non-rejected obligations stay in scope.
3. Request assessment. QUEUED/RUNNING have no disposition. The separate worker creates isolated synthetic requests.
4. Verify the actual target yields the expected supported/violated/insufficient result. Inspect expected vs observed, source/artifact/environment identifiers, scope and verifier digest.
5. Add another candidate: old readiness is no longer current. Rerun: unmapped/unauthorized material requirements remain visible gaps.
6. A valid counterexample followed by a passing rerun must not become READY for the same input context. Contrary evidence must persist.
7. Create a new revision: no old result transfers. Cancel a run and expire a worker lease in staging: neither may become a pass.
8. Restart services and retrieve saved cases. Verify exports and application/database recovery independently.
9. Record real Vercel revision, schema checksums, worker identity, isolated credentials, integration/browser test results and remaining limitations.

Keep the increments auto-deployment hold. Verify other deployment hooks separately. Deploy only to a protected preview after these gates. The founder should receive a browser link and one short acceptance journey, not installation commands.
