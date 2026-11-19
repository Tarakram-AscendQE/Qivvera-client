# Increment 9 — release acceptance record

Version 0.10.0 / maximum supported schema 7. Complete against the exact hosted commit.
Source publication and engineering CI do not fill in these outcomes.

## Release identity

- Exact Git commit:
- CI run and conclusion:
- Hosted URL/environment:
- Deployment owner:
- Database migration/grants owner:
- QE owner:
- Product acceptance owner:
- Execution dates/timezone:
- Prior hosted increment and database schema:
- Verification templates enabled:
- Optional drafting AI enabled/model identity:

## 1. Migration, compatibility and effective permissions

Rehearse the cumulative upgrade from the actual starting schema through schema 7 on an isolated
restored copy. Verify existing migration checksums, obligations/history, source receipts, drafting
decisions, plans, evidence and resolutions remain intact. Verify templates enabled without valid
schema/configuration/grants fail explicitly. Check the actual non-owner web grants and inherited
privileges; verify the worker still cannot write template/authority records. Older binaries must
not be pointed at schema 7. Record the compatible web/worker deployment sequence.

Evidence / Actual Result:

Pass/Fail:

## 2. Hosted persistence and native user journey

Verify the exact release identity, HTTPS/session behavior, static assets, cold starts and normal
redeployment. Create a template from a current approved plan. Reload through separate API
invocations; inspect its exact provenance, immutable version and downloaded snapshot. Publish a
new version and inspect the first unchanged version. Verify Viewer and Author restrictions,
mobile presentation, literal malicious text, expiration and actual session revocation.

Evidence / Actual Result:

Pass/Fail:

## 3. Fresh approval, worker evidence and complete declared scope

Use a template on another current revision with deliberate accepted-obligation matching, a fresh
target and reasons. Verify neither selecting nor saving it starts an assessment. Approve a new
plan and verify atomic template provenance. Execute through the actual separate worker. Confirm
that unaccepted or unmapped non-rejected requirements remain gaps, old evidence is not inherited,
and existing counterexamples cannot be hidden by reuse. Exercise supported and faulty targets.

Evidence / Actual Result:

Pass/Fail:

## 4. Races, uncertain responses and lifecycle

Use independent sessions/API instances to race version publication, plan approval and archive.
Verify stale scope, plan and template submissions are rejected. Drop a successful response and
verify inspecting records / identical replay produces one durable result. Changed payload under
the same request key must fail. Archived/superseded templates cannot start a new use, while prior
plans and evidence remain intact. Capture failures and prove rollback leaves no orphan plan/use.

Evidence / Actual Result:

Pass/Fail:

## 5. Independent QE and unfamiliar-user acceptance

Execute cumulative QE plus `increment-9-qe.md`. Record actual results, defects, severity, owner,
fix commit and retest evidence. An unfamiliar user should save, inspect and reuse a template and
explain why source acceptance and evidence do not transfer. Confirm the product's scope remains
understood: two supported check types, explicit source/target contracts, full declared mandatory
scope, and no universal verification or production readiness claim.

Evidence / Actual Result:

Pass/Fail:

## 6. Recovery and optional integrations

Restore a backup to a separate database and verify immutable versions, request receipts, source
links and plan-use records alongside existing evidence. Record observed recovery time and
reconciliation of newer records. Verify disable/re-enable behavior without erasing data. If live
AI drafting is enabled, retain its separate model/provider and human-quality acceptance from
Increment 7; this increment's template tests do not establish live AI quality.

Evidence / Actual Result:

Pass/Fail:

## Release decision

- Blocking defects / unresolved limitations:
- Evidence reviewed:
- Decision (approved / held):
- Approved feature scope:
- Decision owner:
- Decision time:
- Rationale:

Blank fields do not mean approval. Keep earlier increment acceptance traceable when this cumulative
deployment supersedes it.
