# Increment 3 — bounded assurance contract (0.4.0 review candidate)

## Product outcome
A named Policy Authority maps one accepted obligation to the versioned approval-separation verifier and an operator-registered synthetic test target. An author or authority queues an assessment. A separate worker executes actual HTTP calls, records selected observations, and completes a scope-bound assurance case. The web request does not run the verifier. This is a reusable contract-based mechanism, not automatic understanding of arbitrary applications.

## Boundaries and states
- Requirement review state remains separate from evidence state and assessment lifecycle.
- Runs: QUEUED → RUNNING → COMPLETED, or FAILED/CANCELLED. Non-completed runs have no disposition.
- Completed observations: SUPPORTED, VIOLATED, INSUFFICIENT. CONFLICTED and governed exceptions are not manufactured by this one-verifier profile.
- Derived dispositions: READY only if every non-rejected declared obligation is supported; NOT_READY if a mandatory obligation has a valid counterexample; otherwise INDETERMINATE.
- All non-rejected obligations on the revision stay mandatory. An unmapped or unaccepted obligation prevents READY. Rejected obligations remain in the snapshot with the actual decision reference, actor and rationale.
- A later pass does not erase a valid prior counterexample for the same target, verifier, profile and obligation version/acceptance. Referenced counterevidence remains in the case. Missing or corrupted related evidence removes the accepted disposition.
- One mapping per plan is supported. This intentionally limits initial coverage; it does not silently shrink scope to the mapped obligation.
- A new revision never inherits a run. Scope, policy-review or target changes invalidate current applicability, not historical records. No evidence-validity extrapolation or indefinite claim about a changing external service is made.

## Authority and plan
POST /api/changes/:id/assurance-plan accepts revisionId, scopeDigest, expectedPlanVersion, obligationId, targetId, rationale, acknowledgeLimits. Only POLICY_AUTHORITY can approve. The referenced obligation must have a current recorded ACCEPT decision. The target must be from protected configuration, match the saved application's ID, and match the full 40/64-character source revision. The rationale explains why this particular oracle supports the statement. Short user-supplied source refs are insufficient for this execution path.

The plan snapshots the scope, profile version and digest, accepted mapping, authority decision, target identity and executable-source digest. Plan revisions append; they do not rewrite a prior assessment. Scope completeness outside the declared registry is not guaranteed.

## Run API
- GET /api/changes/:id/assurance-context?revision=UUID — applicable targets, profile, scope and latest plan.
- POST /api/changes/:id/assessments — revisionId, planId, requestKey UUID; returns 202 with durable QUEUED record.
- GET /api/changes/:id/assessments?revision=UUID — latest 50 runs, with per-run applicability. Older records remain addressable by ID.
- GET /api/assessments/:id — case, snapshot and evidence.
- GET /api/assessments/:id/export — same record as JSON download.
- POST /api/assessments/:id/cancel — authenticated cancellation. Already-sent target actions may complete; cancelled worker output is rejected.

Every route requires a valid workspace session. Mutations require exact origin and CSRF checks. VIEWER cannot approve, enqueue or cancel. No HTTP endpoint uploads evidence, completes jobs, changes a verdict, executes arbitrary scripts, or supplies arbitrary target URLs.

## Execution and evidence
Worker identity and a random lease fence completion. Queued work expires after 10 minutes; active ownership expires after 2 minutes. There is no automatic re-execution after timeout, because target writes may have happened. An operator/user can inspect and explicitly start a new assessment. One active run per change; requests are idempotent by key and input identity. Database transactions serialize queue claims and conflicting state changes.

The worker checks the protected catalogue and current snapshot before executing. Configuration drift or input changes before claim cause FAILED with no verdict. Changes while execution is underway do not rewrite the snapshot; completed evidence then appears stale for the current context.

Evidence records the run, target, scope, verifier digest, worker, expected/observed values and completion time. Headers, tokens and arbitrary response fields are never stored. SHA-256 checks are verified on read. Evidence is append-only through application operations, not cryptographically signed, remotely attested, or resistant to a database administrator.

Target binding is explicit: operator-pinned expected identity matched to target-reported identity before and after execution. It does NOT independently establish that a production artifact came from a source commit or remained unchanged throughout the entire run. READY is qualified accordingly. Before using this for consequential release enforcement, add trusted build/deployment attestations and stronger worker isolation.

## Supported target interface: qivvera.approval-http/1
Authenticated JSON HTTP API at a protected configured origin:
- GET /identity → contract, sourceRevision, artifactDigest, environmentDigest, instanceId.
- GET /me → subject (the authenticated principal).
- POST /requests with correlationId and purpose → 201; id, requesterId, approverId=null, status=PENDING, correlationId.
- GET /requests/:id → current record with the same fields.
- POST /requests/:id/approve with an authenticated actor → accepted response or 403/SELF_APPROVAL_NOT_ALLOWED.

The requester test identity must legitimately have initiation and approval capabilities; the rule concerns approving its own transaction. A different configured eligible identity supplies the positive control. Existing applications may need a reviewed adapter. Do not replace their normal authentication/authorization with a verifier-only bypass.

The verifier independently checks initial and resulting state, not merely HTTP status. A 403 followed by APPROVED under the requester is still a violation. Rejecting every request cannot produce SUPPORTED. Unknown identity, identity mismatch, malformed response, missing credentials, unavailable service or failed positive control produces INSUFFICIENT, not a pass.

The synthetic reference app deliberately contains fault modes. These are labelled test fixtures, NOT an authentic AI-generated defect, a real payment, or proof of enterprise generalization.

## Network restrictions
Target origins are protected operator configuration, never browser input. Only configured fixed paths are used. Credentials are worker-only environment references. HTTPS verification is mandatory outside explicitly enabled local loopback tests. DNS addresses are checked and pinned per connection; redirects, private/reserved destinations, IPv6, oversized bodies and arbitrary paths are rejected in this bounded adapter. Private-network customer targets are not supported yet. Deployment egress policy remains an additional control.
