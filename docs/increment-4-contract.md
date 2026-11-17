# Increment 4 — finding resolution and reassessment (0.5.0)

## Intended user outcome
A user can turn an actual violation, gap or execution failure into an accountable resolution item; record who is responsible and what must happen; challenge the finding without rewriting it; link a correction and a fresh reassessment; and obtain a reasoned resolution decision from a different Policy Authority.

This is not a waiver engine, an issue-tracker integration, or a new source of software readiness. Original assessments, observations and dispositions are never updated by resolution operations.

## Scope
Resolution items originate from a COMPLETED assessment with digest-checked VIOLATED or INSUFFICIENT findings, or a FAILED assessment for its mapped requirement. They cannot originate from a supported finding, arbitrary user text, a QUEUED/RUNNING run, or a cancelled run. Missing/corrupt original evidence is an investigation/restoration prerequisite, not grounds for inventing a reliable finding. One item per source run + obligation prevents duplicate tracking. Similar findings from other runs remain distinct; automatic clustering is not implemented.

Kinds: VIOLATION, AUTHORITY_GAP, VERIFICATION_GAP, EVIDENCE_GAP, EXECUTION_FAILURE. Source requirement, finding, snapshot digest and evidence digest are frozen on creation. Their current underlying integrity is rechecked during verification and reads. An item can be opened from a historical assessment, but correction must use the current revision of that same change.

## Identities and permissions
Configured AUTHOR and POLICY_AUTHORITY accounts can create items, record action plans, assign an eligible configured owner, start work, propose corrections, link assessments, add notes, challenge a finding and reopen a resolution. VIEWER can read/export but cannot mutate. All HTTP access requires the existing workspace session, with exact origin and CSRF on mutations.

Only POLICY_AUTHORITY may respond to a challenge or verify resolution. In independent review mode, the verifier cannot be the current owner or any recorded creator/correction proposer. Changing ownership does not erase contributor history. A challenge cannot be answered by its own raiser. Explicit founder-review mode permits same-person decisions and records/displays their non-independent nature. Distinct configured identities do not establish that different humans or organizations control them.

Ownership is local accountability only: it does not create/invite users, grant access, or send notifications. External ticket references are stored as text; no external service is contacted.

## States and actions
Stored states: OPEN -> IN_PROGRESS -> AWAITING_REASSESSMENT -> RESOLVED. Proposing a correction may move an OPEN item directly to AWAITING_REASSESSMENT. Updating the proposal resets the linked assessment. Reopening a RESOLVED item returns it to OPEN and preserves the prior verification in append-only-through-API history. Every mutation uses an expected version and adds a numbered history record. Stale edits return an explicit conflict.

Read-time effective state: a stored RESOLVED item displays REASSESSMENT_REQUIRED if its proof is no longer eligible (new revision, scope/plan/target changes, a newer assessment, missing evidence, open challenge, or unavailable accountable owner). This does not rewrite historical confirmation and does not copy it to another revision.

A task cannot be closed by posting RESOLVED or READY. There is no waiver, deletion, direct proof-upload, or verdict-edit endpoint.

## Correction and comparison rules
The linked requirement must be the original obligation or a descendant explicitly copied through the existing revision workflow. A newly created unrelated requirement with matching text is insufficient. Source revision references must be full 40/64-character values for a correction proposal.

For a VIOLATION, verification requires a different declared source revision AND artifact digest. Merely rerunning, changing task status, changing environment metadata, or changing the requirement cannot establish an implementation fix. Existing source/build binding remains operator-pinned and target-reported, not independent attestation.

The accepted wording, source reference, source version and criticality must remain equal. For an AUTHORITY_GAP, the originally unresolved source details may be supplied/accepted, but the statement and criticality must remain the same. A material specification change cannot be labelled a verified correction of the old claim. Governed requirement supersession, exception acceptance and invalidation of a faulty verifier are intentionally outside this increment; the old item stays visible until that governance exists.

Freshness uses both proposal timestamp and a saved maximum run number. A reassessment requested before the proposal cannot become fresh merely because clocks have the same millisecond. The run must be linked to the exact change, correction revision and mapped obligation. Queued, running, failed and cancelled runs may be linked for investigation but cannot satisfy resolution.

To verify: the new run must be COMPLETED, digest-valid, CURRENT and the latest run for the correction revision, with no active assessment for the change. The linked finding must be SUPPORTED, without unresolved counterevidence. The verifier executable digest and profile digest must match the original verification contract. The original evidence must remain intact. An open challenge blocks verification. All checks are repeated server-side in the decision transaction; client eligibility is not authority.

The entire new assessment need not be READY: an individual correction can be verified while OTHER material obligations remain gaps. The UI and export show both original and new overall dispositions so item closure is not confused with release acceptance.

## Challenges
A challenge preserves its raiser, explanation, time, response and response identity. Responses are FINDING_UPHELD or REASSESSMENT_REQUIRED. Neither deletes evidence, changes a finding or grants an exception. A reassessment-required response clears the linked run and resets the freshness floor on an awaiting item; a previously resolved item is reopened. The old linked pass cannot satisfy the new request.

## APIs
- GET /api/resolution-assignees: authenticated directory of eligible email/roles, never hashes.
- GET /api/resolutions?offset=0&limit=50: paged workspace list. Limit 1–100; offset non-negative.
- GET /api/changes/:id/resolutions: same paging, including historical revisions of the selected change.
- POST /api/assessments/:id/resolutions: obligationId, assignedTo, actionPlan, optional externalReference. Create 201; exact duplicate returns existing item 200; different duplicate conflicts.
- GET /api/resolutions/:id: source snapshot, current comparison/blockers, history and challenges.
- POST /api/resolutions/:id/actions: action, version, rationale plus only action-specific fields.
  START / NOTE / CHALLENGE / VERIFY / REOPEN: no additional fields.
  UPDATE: assignedTo, actionPlan, optional externalReference.
  PROPOSE_CORRECTION: revisionId, obligationId.
  LINK_ASSESSMENT: runId.
  RESPOND_CHALLENGE: challengeId, response.
- GET /api/resolutions/:id/export: resolution record and original/new assessment records as JSON.

Reasons/action plans: 10–2000 trimmed readable characters; external reference: 0–500. Unknown fields are rejected. All SQL values are parameterized. The action API has no authority to modify evidence, runs, plans or obligations. Existing role/session protections remain.

## Persistence and limits
Migration 004 adds resolution_items, resolution_history and resolution_challenges. It is additive, checksummed, repeatable, and preserves schema-3 evidence. No destructive down migration or automatic production migration is supplied. The shared assessment read model was extracted without changing the existing verifier/profile digest or assessment semantics.

Single workspace, existing account configuration and bounded approval verifier remain. No multi-tenant isolation, arbitrary-verifier execution, autonomous remediation, issue-system synchronization, notifications, cryptographic audit signing or resistance to database administrators is claimed. History and digest checks are application controls. Reference defects and corrections are deliberate synthetic fixtures, not authentic AI-generated failures. Customer/provider configuration and recovery still need independent verification.
