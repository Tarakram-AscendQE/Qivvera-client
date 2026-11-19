# Increment 10 — integrity, safe actions and operational verification

Version 0.11.0. Continue from Increment 9 commit
`1e67bd6f8536c10dddd3d986ad8d816477c7446f`. Database schema remains 7.

## Purpose

Close concrete defects and executable release-verification gaps found while reviewing the current
product against the Qivvera Product Atlas. Preserve the generalized Independent Change Assurance
direction: Change → Obligations → Evidence → Gaps → scope-bound Disposition.

Increment 9's exact final CI run is now verified: run `44341084511` completed successfully on
18 November 2026. Its automated suite reported 705 passed, zero failed and zero skipped. Its seven
native browser suites, three reference commands, clean dependency installation and asset consistency
checks also completed successfully. This is the verified source baseline, not a hosted release receipt.

## 1. Assurance integrity

An approved plan must represent the full recorded declared scope. It must not become valid merely
because the stored scope-digest column still matches after its snapshot body has been damaged.
Likewise, a missing workflow or acceptance-history record must not silently remove an obligation
from the current scope.

Validate current-scope membership and immutable review provenance, recompute frozen-scope digests,
and bind a run to its approved plan at the ordinary API/read, queue, claim and completion boundaries.
Invalid state must produce an explicit integrity failure or a failed assessment with no disposition.
Do not execute a known-damaged queued plan. Do not rewrite historical records to make validation pass.
Healthy historical plans remain inspectable after subsequent requirements or decisions change.

A damaged assessment is shown as unavailable on its change; it does not prevent healthy workspace
records from loading. Direct assurance operations on the damaged inputs still fail. Final worker
claim and completion predicates use database time and recheck the queue/lease deadline at the SQL
transition. A rejected completion rolls back its evidence insert. Explicit test clocks are confined
to test construction.

These are corruption/recovery robustness fixes. The review did not establish a normal Author API
route for editing protected snapshots. Database administrators remain a declared trust boundary.
Content digests are not signatures and do not protect against an administrator consistently rewriting
every related record.

## 2. Bind actions to the displayed record

A delayed read for record A must not alter the state used by an action displayed for record B.
Guard response assignment by exact route, request generation and authenticated session. Capture
record and revision identity when preparing a mutation. Invalidate or dismiss open dialogs when
their originating route/session changes. A delayed completion must not replace a newer route or
close a newer dialog. Do not automatically retry uncertain mutations.

Apply these rules to core change/obligation/plan dialogs, resolution records and preparation reads,
and GitHub intake previews. Verify with real HTTP responses and a native browser, including a write
after the delayed response has arrived. Rendering screenshots alone do not establish correctness.

## 3. Executable operational checks

Provide an explicitly invoked, read-only audit of effective PostgreSQL runtime permissions.
Inspect ownership, role capabilities and effective privileges including inherited grants. Check
the web/worker separation required by the implemented schema. Report missing required access and
unexpected write authority. Never grant, revoke, rotate credentials or change an account.

Provide an explicitly invoked synthetic PostgreSQL backup/restore rehearsal. Restrict it to named
disposable loopback databases and a new, distinct destination. Use real PostgreSQL backup/restore
tools. Never overwrite or drop a working database. Compare the recovered schema and recorded data,
then exercise restored application reads and replay behavior in integration tests.

These checks supply engineering evidence. A synthetic restore does not establish the recoverability
of a customer's actual hosted backup. A permission audit is scoped to the declared Qivvera runtime
schema and roles; it is not a comprehensive provider-security certification.

## 4. One cumulative engineering command

`npm run check:engineering` executes package identity, mandatory PostgreSQL/regression checks,
all three reference journeys, every native browser suite and canonical-asset consistency. It saves
an explicit per-gate report and logs. Missing PostgreSQL is a blocked result, never a pass. Later
gates after a failure are recorded as not run. The report identifies the Git commit and whether
the working tree remained clean; a dirty tree must not be described as exact-commit verification.

Existing `npm run check:release` remains the compatible automated/PostgreSQL subgate. CI installs
locked dependencies and the pinned browser runtime before invoking the cumulative command.

## Preserved contracts

- Keep published verifier, transport, fixed-profile and migration bytes unchanged.
- No new evidence upload/completion endpoint, arbitrary code execution or user-selected egress.
- Every non-rejected obligation stays mandatory. Unsupported obligations remain explicit gaps.
- Keep old evidence and counterexamples; template reuse transfers no approval or evidence.
- Keep the Vercel/PostgreSQL/separate-worker architecture and all existing deployment holds.
- No live deployment, secret provisioning, live database migration or paid resource creation.
- No independent human QE, hosted acceptance or customer acceptance is claimed by engineering CI.

## Wider product scope

The current execution engine supports two bounded approval checks and two fixed adapter contracts.
This increment does not make that engine a universal verifier. The Atlas reconciliation in
`product-completion-status.md` records both completed bounded capabilities and remaining product
development. A first invited-user release and the complete long-term platform are distinct milestones.
