# Increment 6 — controlled early-access acceptance record

This is an unfilled execution record, not a release approval. The deployment owner, QE lead and
product owner complete it against the actual hosted build. Record BLOCKED with an owner when
execution cannot occur; an unavailable fixture or skipped check is not a pass.

## Deployment identity

Product version:

Exact deployed Git commit:

Source branch:

Deployment URL/environment:

CI run and reviewed source tree:

Web deployment/build ID:

Worker source revision and identity:

Applied migration versions/checksums:

Execution date/time/timezone:

Deployment owner / QE lead / release decision owner:

## Required gates

For each gate record actual observations, evidence location, outcome, defects/blockers and owner.

### 1. Exact source, locked install and cumulative automated checks

Expected: reviewed deployed commit matches the successful pipeline; mandatory PostgreSQL suites,
reference journeys, browser checks and asset-sync validation executed without required skips.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

### 2. Hosted configuration, schema, effective permissions and startup

Expected: approved HTTPS origin, named users, schema 5 where required, verified database TLS and
non-owner web/worker roles; no migration at build/request time, no local-storage fallback, no secrets
in browser assets/errors. Function packaging includes the modules required by enabled features.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

### 3. Native hosted browser and unfamiliar-user journey

Expected: sign-in, Guide, role-aware next steps, review, assessment, evidence, correction, resolution
and Support work against the actual HTTPS host at desktop/mobile widths. Viewer denials, expired
sessions and network failures are understandable. A new invited user completes the supported journey
without an engineer telling them which hidden control to use.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

### 4. Worker and scope-bound evidence

Expected: an authorized queued run is consumed by the separate worker; supported/violated/insufficient
results, distinct mappings and positive controls behave as declared. Worker absence does not become
success. Earlier counterevidence and historical findings survive later passes and correction review.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

### 5. Live GitHub product integration, if included in the release

Expected: the separately authorized read credential and repository identity are validated; preview,
explicit import, stale preview rejection and credential rotation work. There are no outbound checks,
comments or merges. If excluded from this controlled release, document the explicit scope decision
and verify disabled-feature guidance instead of inventing an integration pass.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

### 6. Persistence, cold starts and revocation

Expected: records, versions, source receipts, evidence and history persist after process restart and
redeployment; cold-start login works; sign-out and changed credentials/roles revoke relevant sessions
across instances. Old in-flight responses do not restore a signed-out user's view.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

### 7. Recovery and operational ownership

Expected: isolated database restore is demonstrated, restored records/evidence inspected, compatible
web/worker versions recorded, recovery timings observed and rollback/roll-forward owners named.
No working database is reset by test tooling. The operator demonstrates the available failure-log
correlation, documents which references are not logged, and supplies the incident route to invited users.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

### 8. Independent QE and release scope

Expected: cumulative Increments 1–6 cases have execution records against this deployment; blocking
defects are fixed/retested; any accepted limitation has a named decision and clear user wording.
The supported two-control boundary and invitation-only audience are explicit.

Actual Result:

Pass/Fail:

Evidence / defect / blocker / owner:

## Product owner decision

Decision:

Approved audience and supported functionality:

Excluded functionality / unresolved limitations:

Evidence reviewed:

Named approvers and date/time/timezone:

Next review date or condition:
