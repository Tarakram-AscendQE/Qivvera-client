# Qivvera Increment 3 — implementation and verification

Date: 7 November 2026. Version: 0.4.0 engineering review candidate.
Status: implemented and tested locally within the limits below; NOT committed, deployed or cleared for public use.

## Source baseline and sequence
This increment builds on the supplied Increment 2 Commit Candidate with Deployment Hold (0.3.0), not directly on the older live registry. The latest read of MadhuRonanki/qivvera `increments` still points to fe5e15f8ae4b1caf58b52b19fed22913ef879a56, so publication of Increment 2 by the deployment team is not assumed. The package identifies exact prerequisite file hashes. It must be applied after Increment 2 and reconciled with any engineering changes normally. No force overwrite, remote write or deployment is performed by the helper.

The local runnable checkout was assembled from the earlier registry source snapshot plus all 47 exact Increment 2 overlay files. Team branding is retained. No full authenticated Git clone or new remote commit is claimed. Unchanged source files are not repackaged as new implementation. SHA-256 manifests identify bytes; they are not signatures or proof of correctness.

## Implemented capability
- An authorized Policy Authority approves a versioned mapping from an accepted obligation to one supported verifier and a protected test target. Scope includes every non-rejected obligation on the revision; unmapped or unaccepted obligations remain gaps.
- An author or authority queues an idempotent assessment. The web application stores the request; it does not execute target calls inside a Vercel request.
- A separate worker process claims the job with a time-limited ownership token and executes the fixed approval-separation HTTP verifier. Target URL and secret references come from operator configuration, never browser input.
- The verifier checks identity before/after, validates actor identities and initial state, attempts self-approval, reads resulting state, and exercises a different approver as a positive control. Reject-all does not pass. A rejection response followed by an approved state is still a violation.
- Selected, credential-free expected/observed values are preserved with the frozen target, source/artifact/environment declarations, scope, approved mapping, verifier digest and worker/run identities. Evidence digest is verified on read.
- Policy derives READY, NOT_READY or INDETERMINATE within the frozen scope. Accepted requirement, evidence finding, assessment lifecycle and disposition stay distinct.
- Queued/running/failed/cancelled runs have no completed disposition. Invalid evidence, expired ownership and changed inputs cannot create current readiness. Prior assessments remain inspectable.
- A later pass does not erase a valid prior counterexample for the same obligation/target context. Referenced counterevidence remains in the case; missing or corrupted counterevidence suppresses the accepted disposition.
- Real interface actions expose the plan, queue/run progress, cancellation, assurance case, selected raw observations, scope limitations and JSON export. No artificial confidence score or generated result is inserted.

## Tests actually executed here
Runtime: Node 22.16.0, existing global TypeScript 5.8.3, SQLite local-review persistence.
- Syntax checks for server, scripts, fixtures and verifier JavaScript: PASS.
- TypeScript core typecheck and build/asset sync: PASS. This is not a claim that all JavaScript is statically typechecked.
- Full Node suite: 223 top-level tests, 221 PASS, 0 FAIL, 2 SKIPPED sentinels.
- The two skipped sentinels represent the retained workflow and new assurance PostgreSQL suites. Their database tests did NOT execute.
- Manifest/locked-version/integrity-metadata selfcheck: PASS. No fresh registry installation occurred here.
- Required release command without disposable PostgreSQL: intentionally BLOCKED, exit 1.
- Both mandatory PostgreSQL suites with REQUIRE_POSTGRES=true and no database: intentionally FAIL, rather than silently skip.
- Three actual local reference journeys through authenticated application HTTP endpoints, a separate target Node process and a separate worker Node process:
  correct behaviour -> SUPPORTED / READY;
  deliberately seeded self-approval defect -> VIOLATED / NOT_READY;
  target rejects all approvals -> INSUFFICIENT / INDETERMINATE.
  Each completed record contains 12 captured observations and a checked evidence digest. These use actual SQLite and HTTP, not mocked service responses.
- Tests additionally cover authorization, optimistic plan decisions, stale scope, multiple mandatory obligations, idempotency, competing claims, cancellation, queue/lease expiry, corrupted evidence, preserved counterexamples, revision history, missing target credentials, malformed responses and redirect/address restrictions.
- Offline Chromium component checks: 12 PASS. They render the real frontend with captured local execution records and stubbed fetch. Screens inspected at 1440px and 390px; overflow checks also at 1366px. NOT native browser/API E2E and NOT screenshots of the live Vercel application.

## Package application verification
Ten guarded-helper checks passed in a disposable local Git reconstruction. The helper refused deployed branches, a dirty worktree, a wrong HEAD and committed prerequisite drift; dry run wrote nothing. Applying all 45 source changes reproduced 221 passing tests and the same two unexecuted PostgreSQL sentinels. No commit, remote operation or deployment was performed. A targeted pattern scan found no embedded provider credential/private key/legacy default-account constants; this is not an independent secrets audit.

## Unexecuted release gates
- Clean npm ci with the retained pinned pg 8.23.1 and TypeScript dependency lock. Registry DNS was unavailable in this execution environment.
- Real PostgreSQL migration, concurrency, claim locking, non-owner worker grants, persistence, recovery and reconnection. Tests are supplied and mandatory in the proposed CI workflow.
- Native browser E2E: Chromium navigation was rejected with ERR_BLOCKED_BY_ADMINISTRATOR. No browser protection was disabled, no network policy bypass was attempted. Zero native browser journey checks completed. A test harness is supplied for an allowed engineering environment.
- HTTPS and cookie behaviour on Vercel; actual remote target/worker setup; managed-database identity and permissions; production migration and backup restore; hosted recovery and deployment configuration validation.
- Remote CI, pull request, commit, deployment and hosting expenditure. None was performed by this increment.

## Important honesty and safety boundaries
This is one bounded approval-interface verifier, not a universal verifier or automatic discovery engine. Existing applications need a reviewed mapping/adapter to the documented qivvera.approval-http/1 contract. It currently supports one executable obligation mapping per plan. Other material requirements cannot silently disappear.

The reference target is synthetic and intentionally seeded with defects. It is NOT an authentic AI-generated failure or a production payment system. The hexadecimal source reference in its traces is a fixture label, not a real repository commit. Its code digest is calculated from the reference target source; live targets must have operator-managed metadata.

Target identity is operator-pinned and target-reported before/after execution. This is not independent build/deployment attestation, exhaustive coverage, or proof that an arbitrary service never changed during execution. Content digests do not establish authorship, trustworthy timestamps or resistance to a database administrator. Separate processes do not by themselves establish secure sandboxing or organizational independence.

Only protected synthetic/test targets are allowed. Requests create test records and retain them for investigation. Cancellation cannot recall a target request already sent. Worker isolation, separate database privileges, target credentials, egress controls and resource approval remain deployment responsibilities. No public worker-completion or evidence-upload endpoint exists.

The release remains a restricted single-workspace review candidate. READY_WITH_EXCEPTIONS, universal obligation completeness, private-network target support, full IAM/multitenancy, formal verification and autonomous remediation are not implemented.

## Acceptance recommendation
GO for engineer source review and isolated integration/preview validation after Increment 2. HOLD for automatic deployment or consequential release enforcement. Preserve the increments deployment hold. Do not use the old exposed credentials, bypass review, or run disposable reset tests against live or staging customer records.
