# Qivvera engineering rules — Increment 4 (0.5.0 review candidate)

The founder is product owner/end user, not programmer or deployment operator. Preserve the working
Vercel/PostgreSQL direction. Continue from the verified Increment 3 source; do not rebuild the product.

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
Read docs/increment-3-contract.md and docs/increment-3-engineer.md. Run npm run check and
npm run demo:assurance. npm run check:release requires a disposable real local PostgreSQL database.
Native HTTPS/Vercel browser acceptance, clean install and recovery are separate mandatory gates.
Do not equate skipped suites or screenshots with deployed verification. Do not alter live resources,
credentials, databases, account settings or costs without the appropriate authorization.

## Resolution invariants
- Original observations/dispositions never change when a task is updated, challenged or resolved.
- A violation requires a new declared source/artifact plus fresh evidence of the related requirement.
- Closing an item is a separate reviewed decision, not a release acceptance or a waiver.
- Changed requirements/verifiers cannot silently substitute for proof of the original correction.
- History, contributor checks, challenge freshness, and current applicability must remain visible.
- Prefer the Increment 4 contract and handoff for new work; older release reports remain historical.
