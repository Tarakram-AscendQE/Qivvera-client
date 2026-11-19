# Increment 6 — guided use and controlled early-access preparation

Version 0.7.0. Cumulative source based on published Increment 5 commit
`c54e83ac506746bce7233520a2c40d76cece720b` (tree
`af0b423f5fcac77b1cfcfcb76abe6aaf2f00b364`). Database schema remains 5.

## Intended outcome

An invited user who has not helped build Qivvera can understand the workflow, find the next
permitted action, interpret a result within its declared scope, and give the operator a useful
support reference. This increment prepares controlled early access. Deployment acceptance,
independent QE and the product owner's release decision remain separately recorded gates.

The product remains Independent Change Assurance:
**Change → Obligations → Evidence → Gaps → scope-bound Disposition**.

## Functional contract

1. **First use.** The authenticated workspace offers role-aware starting guidance. Authors can
   find application/change/obligation intake; Policy Authorities can find review and mapping;
   Viewers can understand their read-only role. Guidance is not a second authorization system.
   The server still enforces every operation and record-specific rule.
2. **Product guide.** A persistent Guide explains the ordered workflow, named roles, terminology,
   supported checks, interpretation of assessment states, correction/reassessment and declared
   limitations. It remains available when optional assurance, resolution or source intake is disabled.
3. **Next steps.** Change pages explain the current revision's next useful action and distinguish
   human requirement acceptance, a verification plan, execution, evidence, and resolution review.
   Historical/stale evidence remains visibly separate from current applicability. No guidance action
   approves an obligation, invents evidence, suppresses a gap or changes disposition.
4. **Failures and sessions.** Network/unreadable responses receive actionable text. A lost response
   to a write is treated as an uncertain outcome: inspect saved records before resubmitting. There is
   no automatic mutation retry. Session expiry clears the authenticated view and returns to sign-in;
   late results from the old session must not restore its content. A failed sign-in remains a sign-in
   failure, not an assurance conclusion. Viewer actions reflect the same role restrictions as the API.
5. **Support.** Authenticated `GET /api/support-info` returns a bounded configuration snapshot:
   product version/reported commit, observed schema version, storage class, review mode, enabled
   capabilities, the caller's roles, fixed operational warnings and a request reference. It queries
   schema metadata only and does not write product records or contact a provider/target.
6. **Diagnostic boundaries.** Support must not expose account lists, passwords/hashes, cookies,
   CSRF tokens, connection strings, provider credentials, target catalogues, repository configuration,
   business records or raw exception text. It does not probe the worker or GitHub. It does not certify
   migration checksums, privileges, live deployment health or release readiness. Role hints remain
   subject to current-record, contributor-separation and transition checks.
7. **Repeatable verification.** CI runs the cumulative database and reference suites, plus native
   browser journeys over actual local HTTP for registry/review, assurance, resolution and first use.
   Browser absence, launch denial, timeout or failed assertion makes the browser gate fail. Offline
   rendering cannot replace that gate. Local HTTP/SQLite browser success is not hosted HTTPS/
   PostgreSQL acceptance.

## Supported scope remains unchanged

Up to two explicitly mapped approval controls: separation of requester/approver, and the declared
finality contract in which repeat approval returns a conflict without changing the finalized record.
Fixed approval and expense adapters and two synthetic reference applications demonstrate bounded
reuse. They do not establish generic verification or customer deployment success.

Every non-rejected obligation remains mandatory. Missing authority, unsupported mappings and
insufficient evidence stay visible as gaps. Valid contrary evidence cannot be erased by a later pass.
Only completed admissible evidence can yield a disposition. Importing a GitHub PR supplies reviewed
source metadata; it does not execute code, accept requirements, attest a running binary, publish GitHub
checks or block a merge. A verified resolution preserves the original finding and result.

There is no self-service account creation, SSO, tenant isolation, new verifier, autonomous correction,
waiver, outbound repository action or general release certification in this increment. The public demo
and invitation-only early-access decision must describe this boundary in ordinary language.

## Compatibility and delivery

No SQL migration is added; the existing migrations and verification executables retain their identities.
Existing schema-5 data, prior plans, evidence and resolution histories remain supported. The latest
application version is shared by runtime diagnostics and package checks. Older increment reports are
historical records, not current delivery status.

Publish to `increment6` with the published Increment 5 commit as parent. Preserve all previous branches
and deployment flags; explicitly hold automatic Git deployment for `increment6`. A source commit does
not authorize a production database operation or constitute deployment acceptance.

## Acceptance evidence

Automated results belong to the exact tested source/tree and are reported in
`increment-6-verification.md`. Manual cases in `increment-6-qe.md` supplement the previous increment
suites and leave Actual Result and Pass/Fail blank until execution. The operational handoff and
unfilled deployment acceptance record are in `increment-6-engineer.md` and
`increment-6-release-acceptance.md`.

The source implementation can be complete while hosted acceptance remains pending. Release requires
the deployed commit, schema/grants, worker, live authorized intake where enabled, browser/cold-start/
persistence checks, isolated restore exercise, independent QE and named owner decisions to be recorded.
