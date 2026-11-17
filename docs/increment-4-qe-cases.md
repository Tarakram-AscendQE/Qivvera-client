# Increment 4 — QE execution supplement

32 focused functional cases. This supplements, rather than replaces, the 253-case suite for Increments 1–3. These manual cases are authored and unexecuted; automated test results are reported separately.

## Before execution
Record deployed SHA, URL, schema 4 checksum, browser, worker identity and execution date. Use named Author A, Policy Authority P and Viewer V with privately provisioned credentials. Independent mode is the default. Never use a shared account to claim independent review.

All data is synthetic. Operator-assisted failure, altered-evidence and configuration cases must run in a disposable isolated environment; never edit working evidence or a customer database. Missing fixtures mean BLOCKED, with an owner, not PASS. Keep Actual Result and Pass/Fail blank until actually executed.

## Suggested execution order
Run RES-001, 002, 003, 006, 007, 009 and 010 as the teaching journey, then execute the negative checks. Existing 253-case regression results do not automatically carry over to the new deployed revision.

## RES-001 — Track an actual violation with an accountable owner
**Type:** Positive | **Priority:** P0 | **Channel:** UI
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Open the failing assessment and select Track resolution.
2. Select Author A, enter a 10–2000 character action plan and optional ticket reference.
3. Save and open the resolution.

**Expected result:** One OPEN item shows original requirement/finding, assigned person, action plan and numbered CREATED history. The source assessment stays NOT READY. The ticket reference is not a connected integration.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-002 — Start work and retain action history
**Type:** Positive | **Priority:** P0 | **Channel:** UI
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. An OPEN item exists.

**Steps:**
1. Select Start work; supply a meaningful reason.
2. Reload the page and inspect history.

**Expected result:** Status is IN PROGRESS, version increments once and START retains identity/time/reason. Original evidence and disposition are unchanged.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-003 — Record and independently verify a corrected implementation
**Type:** Positive | **Priority:** P0 | **Channel:** UI / operator
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. An IN PROGRESS item exists.

**Steps:**
1. Create a new revision with explicitly copied obligations and obtain independent acceptance.
2. Operator configures the reviewed corrected synthetic target with a different source/artifact.
3. Propose correction, selecting the related requirement, before starting its new assessment.
4. Run assurance, link the new completed assessment, then sign in as a different eligible Policy Authority.
5. Select Verify resolution and record a reason.

**Expected result:** The related finding is SUPPORTED and the resolution is verified with an accountable decision, fresh run/evidence references and preserved original VIOLATED/NOT READY case. No assessment is rewritten.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-004 — Resolve an evidence gap without claiming a code fix
**Type:** Positive | **Priority:** P0 | **Channel:** UI / operator
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. Original completed assessment is INSUFFICIENT because the configured positive control was unavailable; restore the same controlled target without altering requirement or contract.

**Steps:**
1. Track the gap and propose the original/current related requirement.
2. Request and link a fresh, complete reassessment.
3. Different authority verifies after both verifier controls succeed.

**Expected result:** EVIDENCE GAP can be resolved on the same source revision when fresh valid evidence supports the unchanged accepted requirement. It is not labelled an implementation fix.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-005 — Resolve an authority gap using explicit source acceptance
**Type:** Positive | **Priority:** P0 | **Channel:** UI / operator
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed case includes an unresolved candidate requirement.

**Steps:**
1. Track its authority gap.
2. Supply source/version and obtain acceptance without changing the statement or criticality.
3. Map the accepted requirement through an approved plan, propose correction and obtain fresh supported evidence.
4. Different authority verifies.

**Expected result:** Original unresolved finding remains visible. Acceptance alone does not close the gap; valid fresh verification is required. Supplied authority details are recorded, not claimed independently authenticated.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-006 — Resolve one finding while other obligations remain unsupported
**Type:** Positive | **Priority:** P0 | **Channel:** UI / operator
**Technique:** Decision table / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge. Another non-rejected obligation is unmapped in the fresh assessment.

**Steps:**
1. Confirm the mapped correction is SUPPORTED but overall disposition is INDETERMINATE.
2. Verify that resolution as the independent authority.
3. Inspect comparison and export.

**Expected result:** The individual resolution can be verified while the overall change remains INDETERMINATE. No READY claim is introduced by task closure.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-007 — Challenge a finding and preserve the evidence
**Type:** Positive | **Priority:** P0 | **Channel:** UI
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. An item exists.

**Steps:**
1. As A select Challenge finding and supply a reason.
2. As different authority P record Finding upheld with rationale.
3. Inspect both original case and challenge history.

**Expected result:** Challenge and response remain attributable and visible. Neither action deletes evidence, changes findings, grants an exception or marks the item resolved.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-008 — A request for reassessment makes an older linked pass ineligible
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API
**Technique:** State transition / temporal boundary

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge.

**Steps:**
1. Raise a challenge.
2. A different authority responds Reassessment required.
3. Attempt to relink the old passing run.
4. Request and link a genuinely new run after the response.

**Expected result:** The former linked run is cleared; freshness floor advances. The old pass cannot satisfy the new request. A new eligible run is required before verification.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-009 — Reopen a verified resolution without deleting the earlier decision
**Type:** Positive | **Priority:** P0 | **Channel:** UI
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge. Item was independently verified.

**Steps:**
1. Select Reopen resolution and give a reason.
2. Inspect the timeline.

**Expected result:** Stored state returns to OPEN. Current correction linkage and proof are cleared, but prior verification and its evidence references remain in history.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-010 — Changed scope invalidates current resolution
**Type:** Negative | **Priority:** P0 | **Channel:** UI / operator
**Technique:** State transition / consistency

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge. Item was verified.

**Steps:**
1. Add a new candidate obligation on the correction revision.
2. Refresh the resolution and its export.

**Expected result:** Effective status becomes REASSESSMENT REQUIRED. Historical verification remains visible; it no longer establishes current resolution.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-011 — New revision invalidates old resolution currency
**Type:** Negative | **Priority:** P0 | **Channel:** UI
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge. Item was verified.

**Steps:**
1. Create another revision.
2. Open the previous resolution.

**Expected result:** The earlier correction is not current; effective status is REASSESSMENT REQUIRED. There is no automatic carry-forward to the new revision.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-012 — An unexecuted or unsuccessful run cannot verify resolution
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API / operator
**Technique:** Equivalence partitioning / state transition

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. Correction proposal exists.

**Steps:**
1. In separate isolated fixtures link a QUEUED, RUNNING, FAILED and CANCELLED mapped run.
2. Attempt VERIFY in each state.

**Expected result:** Linkage may support investigation, but every attempted verification is rejected. No state is converted into a completed supported finding.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-013 — Older or equal-timestamp reassessment cannot be treated as fresh
**Type:** Negative | **Priority:** P0 | **Channel:** API / operator
**Technique:** Boundary-value / temporal ordering

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A correction revision already has a passing run. Operator can control clock/run order in an isolated fixture.

**Steps:**
1. Propose correction after that run was requested.
2. Try linking the older run; repeat with equal millisecond timestamps.

**Expected result:** Both attempts are rejected by the saved run-number floor. Timestamp equality cannot turn earlier evidence into fresh verification.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-014 — A later assessment supersedes eligibility of an older pass
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge.

**Steps:**
1. Queue a later run for the same correction revision.
2. Try verifying with the earlier pass.
3. Repeat after the later run completes or fails.

**Expected result:** Older pass cannot hide a later run; verification is blocked until the latest appropriate evidence is reviewed. No active run may be ignored.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-015 — A confirmed violation cannot close on unchanged source/artifact
**Type:** Negative | **Priority:** P0 | **Channel:** API / operator
**Technique:** Decision table / negative scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Attempt a same-revision correction.
2. In an isolated fixture use another source reference with the original artifact digest, then attempt VERIFY.

**Expected result:** Same-revision proposal is rejected; unchanged artifact cannot establish a corrected implementation even with a passing rerun.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-016 — Weaker or different requirement cannot establish the original fix
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API
**Technique:** Equivalence partitioning

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Copy to a new revision, then change wording, criticality, source reference or source version in separate trials.
2. Obtain acceptance and fresh passing evidence for the changed requirement.
3. Attempt verification of the original item.

**Expected result:** Verification is blocked for each material contract difference. Requirement supersession is not silently treated as correction. Authority-gap source completion is a separately allowed case.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-017 — Unrelated requirement cannot launder a resolution
**Type:** Negative | **Priority:** P0 | **Channel:** API
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Create a new requirement with identical text but no copied lineage.
2. Try proposing it as the correction.
3. Repeat with a requirement or revision belonging to another change.

**Expected result:** All unrelated links are rejected. Matching words alone do not establish lineage; original/change relationships remain unchanged.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-018 — Author or contributor cannot verify their own correction
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API
**Technique:** Permission decision table

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge.

**Steps:**
1. Try VERIFY as Author A.
2. In an isolated identity fixture give A the authority role and try again.
3. Reassign the item to another person and retry as the original correction proposer.

**Expected result:** Role-only author is denied. In independent mode a creator or correction proposer remains ineligible even after role changes or reassignment.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-019 — A configured viewer cannot mutate resolution workflow
**Type:** Negative | **Priority:** P0 | **Channel:** API
**Technique:** Permission partitioning

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Sign in as Viewer V.
2. Attempt creation, start, update, proposal, linkage, note, challenge, response, verification and reopen.
3. Read and export the item.

**Expected result:** All mutations are denied without partial history changes; authenticated read/export remains available.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-020 — An open challenge blocks verification and needs another reviewer
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge.

**Steps:**
1. Raise a challenge.
2. Attempt VERIFY while it remains open.
3. Attempt RESPOND_CHALLENGE using the same challenger even when that identity has authority.

**Expected result:** Pending challenge blocks verification; same-identity response is denied in independent mode. Other eligible authority must respond.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-021 — Unknown owner and disabled owner are not accepted as accountability
**Type:** Negative | **Priority:** P0 | **Channel:** API / operator
**Technique:** Equivalence partitioning / configuration change

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Try assigning an unknown email or a Viewer-only identity.
2. Operator removes the owner from active account configuration after a resolution is verified; refresh.

**Expected result:** Invalid assignment is rejected. Removed owner prevents current verification and makes a previously verified item require reassessment until legitimate ownership is re-established.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-022 — Stale and concurrent actions do not overwrite decisions
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API
**Technique:** Concurrency / state transition

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. Existing item version N.

**Steps:**
1. Open it in two sessions.
2. Save different changes using version N from both.
3. Retry the stale version and inspect history.

**Expected result:** One action succeeds; the other conflicts. Versions/history remain contiguous; no partial update or overwritten evidence is accepted.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-023 — Repeated identical creation does not duplicate tracking
**Type:** Positive | **Priority:** P0 | **Channel:** API
**Technique:** Idempotency / decision table

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Submit the same source run, requirement, owner and action plan twice.
2. Repeat with a different action plan for the same source pair.

**Expected result:** Exact retry returns the same item. Different duplicate conflicts instead of creating a second item or silently changing ownership.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-024 — Non-actionable assessments cannot create resolution items
**Type:** Negative | **Priority:** P0 | **Channel:** API
**Technique:** Equivalence partitioning

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data.

**Steps:**
1. Attempt create from SUPPORTED finding, arbitrary text, QUEUED, RUNNING and CANCELLED run in separate fixtures.

**Expected result:** Each source is rejected; only actual completed VIOLATED/INSUFFICIENT or a FAILED assessment mapped requirement is supported.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-025 — Missing or altered original evidence cannot be silently ignored
**Type:** Negative | **Priority:** P0 | **Channel:** API / operator
**Technique:** Error guessing / integrity

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge.

**Steps:**
1. Operator prepares an isolated clone with missing/altered original evidence or source snapshot.
2. Read the resolution and attempt VERIFY.

**Expected result:** Integrity failure blocks verification; it is not converted into a pass or ordinary administrative closure. Investigate/restore original evidence.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-026 — Altered correction evidence invalidates closure
**Type:** Negative | **Priority:** P0 | **Channel:** API / operator
**Technique:** State transition / scenario

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge. Item was verified.

**Steps:**
1. Operator alters only isolated fixture correction evidence.
2. Refresh resolution and export.

**Expected result:** Effective status requires reassessment; prior confirmation remains historical, with evidence-integrity blocker. No proof is recomputed to hide alteration.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-027 — Direct status, readiness and waiver writes are rejected
**Type:** Negative | **Priority:** P0 | **Channel:** API
**Technique:** Error guessing / invalid partition

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. POST actions containing status=RESOLVED, disposition=READY or action=WAIVE; try DELETE item.
2. Try extra actor or proof fields.

**Expected result:** Unknown fields/actions/methods cannot manufacture closure, delete history, set readiness or grant a waiver. Persisted item and assessment are unchanged.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-028 — Authentication, origin and CSRF apply to resolution APIs
**Type:** Negative | **Priority:** P0 | **Channel:** API
**Technique:** Security-related functional partitions

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Call list/detail/export without a session.
2. Attempt authenticated mutation with a wrong/missing Origin or CSRF token.
3. Retry after logout.

**Expected result:** Private reads and writes require authentication; unsafe-origin/CSRF mutation rejected; logout removes access. No secret or session value is exported.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-029 — Reason and reference length boundaries
**Type:** Negative | **Priority:** P0 | **Channel:** UI / API
**Technique:** Boundary-value analysis

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding.

**Steps:**
1. Try action-plan/rationale lengths 9,10,2000,2001 trimmed readable characters.
2. Try external-reference lengths 0,500,501.
3. Repeat with whitespace-only reasons.

**Expected result:** Reasons accept 10 and 2000, reject 9/2001/whitespace. Reference accepts empty and500, rejects501. Rejection creates no partial item/history.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-030 — History, exports and persistence survive a controlled restart
**Type:** Positive | **Priority:** P0 | **Channel:** UI / operator
**Technique:** Scenario / persistence

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. A completed, digest-valid assessment has a VIOLATED approval-separation finding. A resolution has a correction on the current new revision, a copied/reaccepted equivalent obligation, a fresh mapped SUPPORTED reassessment with different source/artifact, and no open challenge. Verified item with challenge history.

**Steps:**
1. Export JSON and capture IDs.
2. Operator performs a controlled test redeploy/restart.
3. Sign in and reopen resolution, original case and corrected case.

**Expected result:** Source IDs, original findings, correction linkage, challenges and proof/history persist. Export is a resolution record, not a software-safety certificate.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-031 — Inbox navigation, paging and mobile readability
**Type:** Positive | **Priority:** P1 | **Channel:** UI / API
**Technique:** Boundary / navigation

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data. Operator-seeded resolution records spanning more than one page.

**Steps:**
1. Open workspace Resolutions and change-specific Resolutions.
2. Traverse pages without duplicate/missing IDs.
3. Try limit1,100,0,101 and negative offset via API.
4. Inspect 390px and1366px viewport and escaped text notes.

**Expected result:** Valid paging works; invalid limits/offset rejected. Text is rendered as data; no horizontal page overflow obscures controls. Change view includes its historical-revision items explicitly.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

## RES-032 — Feature-disabled baseline remains usable
**Type:** Positive | **Priority:** P0 | **Channel:** UI / operator
**Technique:** Configuration pair / regression

**Preconditions:** Isolated schema-4 test workspace; resolution and assurance enabled; distinct named Author A and Policy Authority P; Viewer V; synthetic target and worker configured. No production credentials or customer data.

**Steps:**
1. Disable resolution feature only on isolated test deployment; retain assurance.
2. Sign in and exercise existing registry/authority/assurance journeys.
3. Inspect new navigation/routes.

**Expected result:** Existing workflows continue. Resolution navigation/capability is absent and resolution endpoints are unavailable; no fake empty success suggests feature enablement.

**Actual Result:**

**Pass/Fail:**

**Evidence / defect / blocker reference:**

---

