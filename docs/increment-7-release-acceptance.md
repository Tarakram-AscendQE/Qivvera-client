# Increment 7 — release acceptance record

Version 0.8.0 / schema 6. Complete this record against the exact hosted commit.
Source completion and successful CI do not fill in these release outcomes automatically.

## Release identity

- Exact Git commit:
- CI run and conclusion:
- Hosted URL and environment:
- Deployment owner:
- Database migration/grants owner:
- QE owner:
- Product acceptance owner:
- Execution dates/timezone:
- Enabled drafting methods (built-in / optional AI):
- Provider/model identity, if AI is in release scope:

## Required checks

### 1. Migration and compatibility

Rehearse schema 5 → 6 (or the actual earlier starting schema) on an isolated restored copy.
Verify checksums, unchanged source receipts, obligation history, plans, evidence and resolutions.
Confirm enabled feature startup rejects an absent/mismatched migration. Verify actual non-owner
web grants and continued worker restrictions. Older binaries must not be used against schema 6.

Evidence / Actual Result:

Pass/Fail:

### 2. Hosted application and persistence

Verify exact version/commit, HTTPS/session behaviour, assets, cold starts and normal redeployment.
Saved source records and decisions must persist across separate API invocations and restarts.
Verify generation → source review → candidate creation → independent authority review through
native browser navigation on the hosted deployment, including mobile and negative cases.

Evidence / Actual Result:

Pass/Fail:

### 3. Existing assurance and resolution

Run the established valid/invalid approval scenarios through the actual worker. Adding a drafted
candidate must make the prior assessment non-current for changed declared scope. Earlier evidence
and counterexamples remain available. Drafts cannot create authority, mappings or passing results.

Evidence / Actual Result:

Pass/Fail:

### 4. Optional live AI acceptance

If enabled, validate the actual separately provisioned model/key, approved data handling, explicit
source-processing confirmation, error handling, quotas, latency and key rotation. Human-review
representative synthetic cases for correct meaning, omissions, conditions/negation, conflicts,
literal case/spacing and prompt-like input. Record output and model identity. A matching quote is
not proof of semantic correctness. If disabled, record that AI is outside this deployment's scope.

Evidence / Actual Result:

Pass/Fail:

### 5. Independent QE and unfamiliar-user task

Execute cumulative QE plus `increment-7-qe.md`. Retain defects, severity, owner, fix commit and
retest evidence. Ask an invited user unfamiliar with implementation to complete the founder task
using the Guide. Do not prepopulate accepted obligations or fabricated assurance outcomes.

Evidence / Actual Result:

Pass/Fail:

### 6. Recovery

Demonstrate restoration to a separate database, preserve newer records for reconciliation, and
revalidate source/decision/history links. Record observed recovery results and rollback/roll-forward
ownership. A completed backup command alone is not a successful restore test.

Evidence / Actual Result:

Pass/Fail:

## Release decision

- Blocking defects and open limitations:
- Evidence reviewed:
- Decision (approved / held):
- Approved feature scope:
- Decision owner:
- Decision time:
- Rationale:

An empty field is not approval. Keep the earlier Increment 6 hosted/QE acceptance traceable when
the cumulative Increment 7 deployment supersedes it.
