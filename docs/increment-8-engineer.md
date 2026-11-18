# Increment 8 — engineering and operator handoff

Version 0.9.0, cumulative from Increment 7 `12042ab`. Maximum schema 6; no new migration.
Use the reviewed `increment8` branch and successful CI for the exact deployed commit.

## User journey

Open a change, select its current revision, and choose **Impact & next checks**. Inspect the revision
identities, exact scope differences, prior declarations with no copied descendant, and explained next
steps. Follow links into existing obligation review, assurance planning and evidence inspection.
Return and refresh the report after an action. The report itself does not alter product records.

A copied unchanged requirement is still a new candidate on a new revision. A new source identity
does not prove a corrected implementation. A prior mapping is a review hint, not an approval. Source
code analysis, automatic verifier mapping, completeness proof and reduced-scope execution are outside
this increment.

## Installation and configuration

1. Identify the deployed baseline and current schema. Preserve the team's established backup,
   isolated restore and recovery evidence from the earlier release acceptance process.
2. If the deployment is already on Increment 7/schema 6, apply no new migration for Increment 8.
   Earlier baselines still need the reviewed cumulative migrations/grants for their enabled features.
   Never delete migration records, reset working data or treat an application rollback as a database rollback.
3. Deploy matching web/API assets and compatible worker code from the reviewed commit through the
   existing team-controlled process. Automatic deployment from `increment8` is held in `vercel.json`.
4. No new feature flag, provider account or secret is needed for revision impact. All named authenticated
   workspace roles may inspect it. Existing role checks govern the actions reached from the workbench.
5. Hosted startup passes the existing assurance configuration to the impact reader. When assurance is
   disabled, declared comparisons remain available and assessment guidance is explicitly unavailable.
   When enabled, the report uses the same configured targets and profile mode as the assurance service.

The reader shares the workflow repository's database pool and uses read-only transactions. Its required
reads are the existing application/change/revision, obligation/workflow/history, migration and, when
configured, plan/run/evidence records. It requires no new INSERT, UPDATE or DELETE privilege. Validate
actual effective runtime privileges, including inherited roles, in the hosted environment.

Schema 6 compatibility is unchanged from Increment 7. The published Increment 7 application remains
compatible with this unchanged schema. Binaries from before schema 6 support still reject schema 6.
Recovery must preserve all records created by whichever feature set is enabled.

## API and data handling

```text
GET /api/changes/:changeId/impact?revision=:revisionId
GET /api/changes/:changeId/impact/export?revision=:revisionId
```

Both require an authenticated session and exactly one `revision` parameter. There is no mutation API.
The JSON report includes declarations and comparison history; share it as a business record. It omits
target network locations, execution identities, credential references and raw observations. Support
exports remain separate and do not gain business record content.

The report's content digest identifies the derived snapshot. It does not prove source authenticity,
administrator-proof history or a trusted generation time. Browser export retains the displayed snapshot;
refresh and server export read again. Explain differences by comparing the recorded report identities
and the intervening product records.

## Operational failure behaviour

- Broken or ambiguous revision/obligation lineage fails explicitly. Investigate against trustworthy
  history and backups; do not rewrite lineage merely to make the comparison succeed.
- A source with no prior revision is a normal initial scope, and no-obligation/all-rejected scope is
  not proof that nothing needs verification.
- Latest failed, cancelled, queued or running assessments remain visible. The workbench does not fall
  back to a prior pass. An observed expired lease is a read-only explanation; existing execution services
  still manage actual run transitions.
- Missing, corrupted or incorrectly bound completed evidence must not provide a current disposition.
  Investigate the evidence and referenced counterexamples without editing them to manufacture validity.
- Incompatible schema/configuration or missing read privileges produce explicit unavailable/error
  behaviour. No in-memory or old-pass fallback is permitted.
- Navigation and session expiry discard stale responses. Reload after a new sign-in rather than
  relying on a report displayed under an earlier identity.

## Engineering verification

Use supported Node 22.16+ within major 22 and the locked dependencies:

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run check
npm run demo:assurance
npm run demo:resolution
npm run demo:generalization
```

`npm run check:release` requires `TEST_DATABASE_URL` for a disposable loopback PostgreSQL database
whose name begins `qivvera_test_`. All six PostgreSQL suites must execute. Their fixture resets destroy
test data; never use a working staging or customer database. The impact tests exercise actual read-only
permissions and database snapshot semantics in addition to the SQLite functional cases.

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python3 -m pip install -r test/requirements-browser.txt
.venv-browser/bin/python3 -m playwright install --with-deps chromium
.venv-browser/bin/python3 test/run-browser-suites.py
git diff --exit-code -- public/
```

All six browser suites use genuine local HTTP, authentication and native Chromium. Disposable SQLite
browser fixtures and separate PostgreSQL integration do not establish hosted HTTPS/PostgreSQL acceptance.
The new browser journey begins with real worker evidence and exercises the declared-revision comparison
without creating an inferred pass. See the exact-commit CI run for actual execution totals and artifacts.

## Team acceptance

Execute `increment-8-qe.md` alongside the cumulative suites. Record observed Actual Result and Pass/Fail
values; none are prefilled. Use `increment-8-release-acceptance.md` for exact deployment identity, hosted
persistence/session behaviour, runtime read permissions, worker compatibility, recovery and independent QE.

Ask a user unfamiliar with the implementation to explain: what changed, what was not carried forward,
which obligations still need authority, why prior evidence does or does not apply, and what action should
follow. They should reach the existing workflow without interpreting “copied unchanged” as “safe to skip.”
Optional live drafting AI acceptance remains a separate Increment 7 gate if that mode is enabled.
