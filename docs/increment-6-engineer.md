# Increment 6 — engineering and operator handoff

## What to deploy

Use the reviewed cumulative `increment6` branch in `mmronanki/qivvera`, version 0.7.0, after its
verification results and the team's deployment decision. It builds on the published Increment 5
commit `c54e83ac506746bce7233520a2c40d76cece720b`. Preserve any later team changes and verify the
actual branch head before rollout. `main` is not this increment's baseline.

This increment adds guided use, session/error improvements and read-only support diagnostics. It
does not add a database migration or new production dependency. Keep the existing Vercel,
PostgreSQL, named-account and separate-worker architecture. No infrastructure is provisioned by
the build, CI or Support page. The founder should receive a working URL and a short product journey;
operators own installation, protected settings and recovery.

## Verify the source

Use Node 22.16 or later within Node 22, the locked npm dependencies, and Python 3.12 for browser
checks and synthetic reference tests. Run from the repository root:

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run check
npm run demo:assurance
npm run demo:resolution
npm run demo:generalization
```

`npm run check` explicitly reports unexecuted PostgreSQL suites when no test database is supplied;
that result is development feedback, not the required database gate. In an isolated disposable
loopback database whose name starts `qivvera_test_`, provide `TEST_DATABASE_URL` through the test
environment and run `npm run check:release`. All four PostgreSQL suites must execute. Their setup
deletes test tables; never use the hosted workspace, customer data, or a working staging copy.

Install the test-only browser tools in a virtual environment:

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python3 -m pip install -r test/requirements-browser.txt
.venv-browser/bin/python3 -m playwright install --with-deps chromium
.venv-browser/bin/python3 test/run-browser-suites.py
git diff --exit-code -- public/
```

The browser runner chooses the installed Playwright Chromium, or a known system Chromium when
available. `CHROMIUM_EXECUTABLE` can specify an approved compatible binary. Do not turn off
browser or network protections to manufacture a pass. Reports say explicitly that their transport is
local HTTP and their fixtures use SQLite. CI retains synthetic reports/screenshots for review; none
are proof of the hosted deployment. No real account, target or provider secrets belong in test fixtures.

CI keeps its existing PostgreSQL 17 service, pinned actions and locked npm install. It now runs
native browser journeys and fails on missing execution. Read the failing step and retained report
before rerunning; a rerun does not fix a defect. Browser setup follows the upstream
[Playwright Python CI guidance](https://playwright.dev/python/docs/ci).

## Rollout sequence

1. Record the exact reviewed commit, successful CI run, deployment owner and rollback owner in
   `increment-6-release-acceptance.md`. Back up and demonstrate restoration into a separate database.
2. Inspect the currently deployed commit and applied schema. If the team is still on Increment 3/4,
   perform the already reviewed migration 004/005 and grants process with the migration owner.
   Increment 6 itself needs no migration. Hosted startup and builds must not run migrations.
3. Use the existing deployment method. Verify Node 22, build output and the API function's included
   modules on the actual host. Source-controlled flags retain `increment3=true` and other increment
   holds, with `increment6=false`; review any separate provider hooks. Do not enable auto-deployment
   merely to publish the source branch.
4. Confirm protected account configuration and a different eligible Policy Authority. Test at least
   one Author, Policy Authority and Viewer. Do not distribute credentials through reports or screenshots.
5. Confirm PostgreSQL TLS, non-owner runtime roles and actual effective grants. The web role needs
   read access to migration metadata for Support. The new endpoint requests no additional write grant.
   Existing `ops/*-permissions.sql` files use illustrative role names; substitute the team's actual
   roles consistently and check inherited privileges rather than executing templates blindly.
6. Verify web and worker use the same reviewed source and relevant assurance/generalization/target
   configuration. Keep target credentials worker-only. Check a real queued → running → completed
   assessment, then correction/reassessment, without rewriting the original evidence.
7. If GitHub intake is enabled, validate the separately provisioned product read credential, numeric
   repository binding, preview/import, changed-head rejection and rotation. ChatGPT's GitHub
   connection is not this runtime credential. Disabled intake should remain honestly disabled.
8. Execute hosted HTTPS browser acceptance and independent QE against this exact deployment.
   Record failures, owners, fixes and retests. Approve controlled early access only after the required
   evidence is reviewed; support diagnostics alone cannot approve it.

## Onboarding an invited user

Provision named identities through existing protected account configuration. There is no signup,
password-reset or account-management UI. Explain the role assigned and securely provide access
using the team's established channel. A first-time user should be able to start from Workspace,
open Guide, follow a supplied synthetic example, inspect evidence/gaps and use Support without
reading engineering instructions. Test this with a person who did not help build the product.

Start with an approved synthetic test application. Declare a change and its source reference, propose
an applicable sourced obligation, request a different authority's review, approve a supported mapping,
run it and inspect expected/observed behavior. Then demonstrate a violation, a fresh correction and
separate resolution review. State the supported scope before the demonstration. Do not prepopulate
accepted requirements or passing results to make the journey look complete.

## Support and incident handling

Support is available to authenticated workspace readers. The response includes an observation time,
request reference, product version, reported full Git revision, observed schema version, feature flags,
current roles and fixed messages. Copying its summary creates no ticket and sends nothing externally.
It excludes customer records, credentials, account lists and protected catalogue details.

Ask the reporter for the exact symptom, local time/timezone, safe support summary, affected record ID,
expected behavior and steps. Do not ask for passwords, tokens, cookies, raw environment variables,
connection strings or unredacted evidence containing confidential data. Use the failure's request ID
when available; the Support page's ID belongs to its own read, not necessarily the earlier failure.
The application logs request references for unexpected request failures, not for every successful
Support read or expected rejection. Include the timestamp, record ID and symptom; verify the host's
log correlation separately rather than promising that every reference has a corresponding log row.

Interpret common conditions as follows:

- **Queued assessment:** Support does not observe worker liveness. The operator checks the named
  worker and queue/lease configuration. Do not call completion/evidence-writing endpoints as a shortcut.
- **Unrecorded revision:** set the reviewed full commit through protected `QIVVERA_RELEASE_SHA`, or
  verify the host-provided `VERCEL_GIT_COMMIT_SHA`. This remains reported metadata, not attestation.
- **Schema warning:** compare applied versions/checksums with the reviewed source using the database
  owner's tooling. Support observes only the highest version; it does not validate checksum integrity.
- **Missing role or distinct reviewer:** correct protected accounts through the owner. Never reuse the
  author's login as evidence of independent review or toggle founder-review to force a decision through.
- **Lost write response:** inspect saved records and history before retrying. A network error cannot
  establish whether the server committed the action. The UI does not automatically retry the mutation.
- **Expired/revoked session:** sign in again. Saved records persist; unsaved form content is cleared.
- **Disabled feature:** use the available workflow and ask the operator whether the feature is part of
  this deployment. Do not present unavailable functionality as tested or enabled.

`/healthz` and `/readyz` are storage/process checks. Their success is not a worker, assurance,
security, hosted browser or release acceptance result. An unavailable workspace may prevent sign-in
and therefore prevent Support access; use the operator's normal deployment logs and incident route.

## Recovery

Increment 6 preserves schema 5. An application rollback to the reviewed Increment 5 source can only
be chosen after checking current data/configuration compatibility; restore the matching web assets,
server and worker together. Do not erase new records or mutate evidence to imitate an older result.
Schema-4 and older binaries reject a schema-5 database. Reverting those binaries alone is not a
database rollback. Use the previously rehearsed isolated restore/roll-forward procedure, retain any
post-backup records separately for review, and revalidate sessions, history and evidence.

Never run the destructive integration-test reset against hosted data. Record restore timing and
observed recovery outcomes; do not substitute a successful backup command for a restore test.
