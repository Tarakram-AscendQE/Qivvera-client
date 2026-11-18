# Qivvera engineering rules — Increment 8 (0.9.0)

The founder is product owner/end user, not programmer or deployment operator. Preserve the working
Vercel/PostgreSQL direction. Continue from published Increment 7 commit 12042ab; do not rebuild the product.

Independent Change Assurance: Change → Obligations → Evidence → Gaps → scope-bound Disposition.
Acceptance of a requirement is not evidence that software satisfies it. One bounded approval-separation
HTTP verifier now runs in a separate process with an operator-pinned target catalogue. No arbitrary code,
user-provided URL, universal obligation discovery, or production release certification is implemented.

## Invariants
- Every plan/run snapshots the revision, obligation versions and authority, profile, target and verifier.
- No old revision's disposition transfers. Changed inputs make previous evidence stale, not deleted.
- All non-rejected obligations stay mandatory. Unaccepted/unmapped requirements are gaps, not passes.
- A later passing run does not erase a valid prior counterexample for the same target/obligation context.
- Queued/running/failed/cancelled assessments have no disposition. Expired leases cannot accept results.
- Only a protected worker stores evidence; there is no client-facing completion or evidence-upload route.
- Candidate acceptance, proposer/reviewer separation, source version and immutable-through-API history
  from Increment 2 remain. Founder-review mode never claims independent human approval.
- Network egress is operator-configured and fixed-path. No redirects, arbitrary destinations or TLS bypass.
- Target identity matching is operator-pinned + target-reported, not an independently trusted attestation.
- SHA-256 identity is not a signature, trusted timestamp, or protection from database administrators.
- Synthetic reference faults are deliberate tests, not authentic AI-generated defects.
- No secrets/default accounts in Git or assets. Hosted storage cannot fall back to SQLite.
- Preserve deployment holds and require all mandatory PostgreSQL/browser/recovery checks before release.

## Delivery
Read docs/increment-8-contract.md and docs/increment-8-engineer.md alongside the earlier invariants.
Run npm run check and all three demo commands. npm run check:release requires a disposable real local
PostgreSQL database. Run the native browser suites with the pinned test-only tools. Native HTTPS/Vercel
browser acceptance, clean install and recovery are separate mandatory gates.
Do not equate skipped suites or screenshots with deployed verification. Do not alter live resources,
credentials, databases, account settings or costs without the appropriate authorization.

## Resolution invariants
- Original observations/dispositions never change when a task is updated, challenged or resolved.
- A violation requires a new declared source/artifact plus fresh evidence of the related requirement.
- Closing an item is a separate reviewed decision, not a release acceptance or a waiver.
- Changed requirements/verifiers cannot silently substitute for proof of the original correction.
- History, contributor checks, challenge freshness, and current applicability must remain visible.
- Prefer the Increment 4 contract and handoff for new work; older release reports remain historical.

## Increment 5 invariants
- Preserve legacy executor/profile bytes and prior plan/report semantics. Version 2 mappings are explicit.
- Support only the declared separation/finality contracts and fixed approved adapters. No arbitrary scripts.
- Missing/corrupt earlier completed evidence cannot make a new pass admissible.
- GitHub source metadata is untrusted context, not authority, code execution, artifact attestation or readiness.
- Preview is actor-bound, short-lived and revalidated; import/copy is atomic and candidate-only.
- No outbound GitHub writes, deploy, database reset or secret provisioning through these endpoints.
- All four PostgreSQL suites and hosted/live-integration/QE gates are mandatory before release.
- Read docs/increment-5-contract.md and docs/increment-5-engineer.md. A local Git commit is not remote publication.

## Increment 6 invariants
- Guidance and support are read-only explanations. They cannot create authority, evidence or a disposition.
- Support diagnostics are authenticated and allowlisted: no credentials, account lists, target/repository
  configuration or business records. No provider/target probes or migrations from the support endpoint.
- Reported configuration is not observed worker availability, verified deployment or release approval.
- A lost mutation response has an uncertain outcome. Do not automatically repeat the action.
- Session expiry and sign-out clear the authenticated view; old-session responses cannot restore it.
- Native local browser tests must fail when blocked or unavailable; do not substitute stubbed rendering.
- Increment 6 retained schema 5. Preserve published verification executables, prior migrations and evidence.
- External release gates and independent QE must be explicitly evidenced before early access is approved.

## Increment 7 invariants
- Publish on increment7 from the exact Increment 6 baseline; preserve other branches and deployment holds.
- Source-grounded drafts are preparation records. Explicit candidate creation uses the existing workflow.
- Every created candidate is DRAFT / CANDIDATE / NOT_ASSESSED; independent authority review remains required.
- Source, generator identity, exact quotation and human decisions are durable and inspectable.
- A quote match is not semantic correctness, authenticity, completeness, authority or software evidence.
- Built-in explicit clauses are rule-based. Optional AI suggestions require configured access and explicit
  source-processing confirmation. No tools, arbitrary destinations, automatic retries or hidden fallback.
- Source/model text cannot supply roles, authority, criticality, evidence, mappings or dispositions.
- Case, Unicode form and internal spacing can be significant; do not normalize distinct requirements away.
- Persist generation reservations before provider work. Decision receipts and candidate creation are atomic.
- Schema 6 is additive. Older published binaries reject it; application rollback is not database rollback.
- All five PostgreSQL and five native browser suites are mandatory. Live AI quality and hosted acceptance
  are separate gates; protocol fixtures or a configured feature do not establish successful live integration.

## Increment 8 invariants
- Publish on increment8 from the exact Increment 7 baseline; preserve earlier branches and deployment holds.
- Impact is an authenticated read-only explanation of recorded declarations and assurance context.
  No code/dependency analysis, semantic equivalence, universal completeness or release approval is implied.
- Compare only the selected revision and its recorded direct parent. Pair obligations only by valid
  copied_from lineage. Exact case, Unicode and internal whitespace remain significant.
- Missing copied obligations are not proved resolved or inapplicable. Keep previous declarations visible.
- Read comparison and assurance context in one database snapshot. Report reads and exports never expire
  leases, create activity, call providers, alter plans, approve requirements or queue assessments.
- Every non-rejected obligation stays mandatory. Prior mapping hints require fresh human review;
  no reduced execution scope, inherited approval or transferred supporting evidence is created.
- Use the latest recorded assessment, preserve integrity failures and distinguish historical recorded
  dispositions from currently applicable evidence. Never select an older pass to hide a later failure.
- Schema 6 and published verification executables remain unchanged. This increment needs no new migration.
- All six PostgreSQL and six native browser suites are mandatory for the cumulative engineering gate.
  Hosted acceptance, actual runtime permissions, recovery and independent QE remain separate evidence.
