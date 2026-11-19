# Increment 9 — functional QE execution suite

Version 0.10.0. Baseline: published Increment 8 `60153c7`. Feature: **Verification templates**.
This document contains **62 cases: 27 positive and 35 negative**. All Actual Result and Pass/Fail
fields are intentionally blank. This is an execution document, not a claim that the QE team has run it.

## What the tester needs to understand

An obligation says what a change must satisfy. A Policy Authority accepts its applicability. A
verification plan explicitly maps supported checks to accepted obligations and a configured target.
A separate worker executes that plan and stores evidence. Acceptance and plan approval do not prove
that the software behaves correctly.

A verification template is a saved example of an earlier approved plan's check choices, source
requirements and rationale. It is preparation material. It never transfers accepted requirements,
evidence, a passing assessment or a readiness decision into another change. For every new use, a
Policy Authority selects new accepted obligations, writes fresh mapping reasons, chooses a current
target and approves a new plan. Every non-rejected obligation remains mandatory, even if the template
does not contain a check for it.

Templates have immutable numbered versions. Only the latest active version may be used for a new
plan. Archiving stops new use and new versions. It does not delete history or revoke an earlier plan.
There is no restore, arbitrary verifier upload, custom disposition policy or cross-adapter reuse in
this increment. A recorded source example is not a claim of semantic equivalence or complete coverage.

## Setup and test data

The deployment owner supplies an isolated QE workspace and records its exact commit, URL, database
schema and enabled features. Use the final Increment 9 commit after its engineering gate passes.
Templates require schema 7 and the protected assurance, generalization and templates configuration.
Use named test accounts: **Author A**, **Policy Authority P**, **Viewer V**, and **Policy Authority Q**
for concurrent-review cases. Use a separate founder-review workspace only for Q9-023.

Prepare these synthetic records through the ordinary workflow unless a case specifically requires
an operator-controlled database or transport fixture:

- **Source S:** one current revision with a full declared source identifier, two separately accepted
  obligations and a current version-2 plan. Map requester–approver separation and approval finality to
  distinct obligations. Record its revision, plan and scope identities before testing. A successful
  assessment is not required merely to save a template.
- **Destination D:** another current change, preferably in a second registered application, with two
  separately accepted obligations and a configured target using the same adapter as Source S.
  It begins with no approved plan or assessment. Requirements should be meaningful for D; copying
  wording is never a substitute for applicability review.
- **Gap destination G:** equivalent to D, plus an additional non-rejected obligation that has no
  supported mapping. Keep this obligation unaccepted for the designated gap case.
- **Alternative adapter X:** a separate synthetic target using the other supported adapter. It is
  deliberately incompatible with S's template for this increment.
- **History H:** a genuine completed assessment, including at least one saved valid counterexample
  for the later evidence-preservation case. The operator must retain the original evidence digest.

The operator configures disposable targets and the separate worker. QE must not place credentials
in template text or edit evidence to manufacture a result. Operator-only corruption, role-grant,
migration, limit and transport tests use a disposable copy. Restore the clean fixture afterwards.
Never run a destructive setup against the working staging or customer database.

## Execution rules and evidence

Run the source/save/reuse journey first. Then use fresh records or the stated prerequisites for
negative cases; a failure in one case must not silently contaminate another. Retain the exact request
and response for API cases, omitting session cookies, CSRF tokens and passwords from shared evidence.
For browser cases record the account role, change/revision, template family/version, expected result,
actual result and any defect reference. A blocked case is not a pass.

The suite combines equivalence partitioning, boundary values, state transitions, decision-table
conditions, concurrency/replay checks and error guessing. Role, current revision, active/latest
template, accepted destination obligation, supported check set and compatible target are separate
conditions; satisfying one cannot substitute for another.

The API routes used below are `/api/verification-templates`, its `/:id`, `/:id/export`,
`/:id/versions` and `/:id/archive` routes, and the existing
`/api/changes/:changeId/assurance-plan` route. The contract lists exact fields. An authenticated API
client must use its real session, configured Origin and CSRF token. Do not bypass those controls.

## Positive journeys

### Q9-001 — Empty catalogue explains how to begin

Type: Positive. Technique: equivalence partitioning.
Precondition: clean workspace with templates enabled and no saved templates.
Steps:
1. Sign in as P and open **Verification templates**.
2. Read the empty state and the scope explanation.
3. Return to Source S and its **Assurance** section.
Expected Result: the catalogue is empty without a failure or an invented template. The instructions
direct the tester to a current approved plan. No requirement, plan, assessment or evidence is created.
Actual Result:

Pass/Fail:

### Q9-002 — Save a current approved plan as a template

Type: Positive. Technique: end-to-end state transition.
Precondition: Source S; signed in as P.
Steps:
1. Open S → **Assurance** → **Save as template**.
2. Inspect both original checks, requirements and mapping reasons.
3. Enter a unique **Template name**, a meaningful purpose and **Why save this approach?**.
4. Acknowledge the limits and choose **Save template**.
Expected Result: one active family and version 1 are saved. The detail shows the source plan and
decision provenance. Saving does not execute a check or grant readiness to any change.
Actual Result:

Pass/Fail:

### Q9-003 — All workspace roles may inspect a template

Type: Positive. Technique: role equivalence partitions.
Precondition: one saved template.
Steps:
1. Open its detail as A, P and V in separate sessions.
2. Inspect the same numbered version and source trail.
3. Compare displayed version identity and content digest.
Expected Result: all three roles can inspect the same saved business record. Mutation controls
remain restricted to the applicable role. Viewing does not change the version or its history.
Actual Result:

Pass/Fail:

### Q9-004 — Source provenance is exact and qualified

Type: Positive. Technique: traceability inspection.
Precondition: template saved from S.
Steps:
1. Open **What this approach checks** and each original mapping rationale.
2. Compare exact statement, source reference/version, criticality and obligation version with S's saved plan.
3. Inspect **Source and decision trail**, its saved plan ID/version/digest and **Open source revision**.
Expected Result: the source identity, original reasons and check definitions match the captured
plan. Original requirements are labelled historical references. Prior acceptance is not presented as
acceptance of a destination requirement or proof that the source software passed. The source link is
qualified: that revision's latest plan may differ from the original plan frozen in this template.
Actual Result:

Pass/Fail:

### Q9-005 — Download the displayed version

Type: Positive. Technique: output consistency.
Precondition: saved template detail is displayed.
Steps:
1. Record the displayed version identity and digest.
2. Choose **Download template version** and inspect the JSON.
3. Compare its snapshot with the displayed source and check records.
Expected Result: the downloaded record is the displayed version. It contains business provenance
and limitations, without target origins, execution identities, token references, credentials or raw
evidence. Its digest is a content identifier, not a signature or release approval.
Actual Result:

Pass/Fail:

### Q9-006 — Saved records survive a new session and process

Type: Positive. Technique: persistence transition.
Precondition: saved template and operator-controlled QE deployment.
Steps:
1. Record family/version identities, digest and source wording; sign out.
2. Have the operator perform an ordinary application restart or redeployment without resetting storage.
3. Sign in again and open the version from its history link.
Expected Result: the same version and provenance are present. The restart creates no duplicate,
invented approval or new evidence. Record actual hosted persistence separately from local CI.
Actual Result:

Pass/Fail:

### Q9-007 — Publish a new immutable version

Type: Positive. Technique: state transition.
Precondition: active template version 1 and an eligible current source plan.
Steps:
1. As P open the latest template detail.
2. Select **Change containing the current approved plan** and **Prepare new template version**.
3. Review the source, enter a revised purpose and **Why is this new version needed?**, then save.
Expected Result: version 2 is added to the same family with its immediate parent recorded. Version 1
is retained unchanged. The new source and saving decision are inspectable.
Actual Result:

Pass/Fail:

### Q9-008 — Inspect an earlier version without mistaking it for the latest

Type: Positive. Technique: historical-state partition.
Precondition: a family with versions 1 and 2.
Steps:
1. Open version 1 from **Version history**.
2. Compare its original downloaded snapshot/digest.
3. Follow **Inspect the latest version**.
Expected Result: version 1 remains unchanged and is visibly historical; it cannot start a new reuse.
The latest link opens version 2. History is not rewritten to the latest wording.
Actual Result:

Pass/Fail:

### Q9-009 — Archive with an accountable reason

Type: Positive. Technique: state transition.
Precondition: an unused active template; signed in as P.
Steps:
1. Open the latest version and select **Archive template**.
2. Enter a meaningful **Reason for archiving** and choose **Confirm archive**.
3. Refresh the detail.
Expected Result: the family is archived with named actor, time and reason. Its versions remain
available. New-version and new-use actions are unavailable. No delete or restore action is invented.
Actual Result:

Pass/Fail:

### Q9-010 — Archived history remains discoverable

Type: Positive. Technique: catalogue-state partition.
Precondition: at least one active and one archived family.
Steps:
1. Open **Verification templates** and inspect the active list.
2. Select **Include archived templates**.
3. Open the archived family, then return using **Show active templates**.
Expected Result: the default list excludes archived families; the history view includes them with
their actual state. Counts and navigation reflect the selected view. Archived history can be inspected.
Actual Result:

Pass/Fail:

### Q9-011 — Begin reuse with deliberate blank selections

Type: Positive. Technique: authority decision boundary.
Precondition: active template and Destination D; signed in as P.
Steps:
1. Open D → **Assurance** → **Use a template**.
2. Choose the template and **Review new mappings**.
3. Inspect every obligation selector, rationale and target field before entering values.
Expected Result: destination mappings, target and fresh reasons start unselected/blank. The original
requirement and check rule are available for comparison. No choice is inferred from similar text.
Actual Result:

Pass/Fail:

### Q9-012 — Reuse across applications with the same adapter

Type: Positive. Technique: supported-domain partition.
Precondition: S and D belong to different applications; targets use the same adapter.
Steps:
1. From D open the latest active template's mapping review.
2. Select D's distinct accepted requirements, write new reasons and choose D's configured target.
3. Enter the new plan reason, acknowledge scope and choose **Approve new plan**.
Expected Result: the approved plan belongs to D, freezes D's full scope and uses D's target. S's
obligation identifiers and target are not copied into destination mappings. The exact template version
is recorded as preparation provenance.
Actual Result:

Pass/Fail:

### Q9-013 — Plan approval is separate from execution

Type: Positive. Technique: state transition separation.
Precondition: newly approved template-backed plan on a destination with no assessment.
Steps:
1. Return to **Assurance** and inspect the plan and assessment list.
2. Open the destination's evidence view.
3. Refresh before requesting any assessment.
Expected Result: a plan exists, but no assessment has been queued and no evidence or disposition was
created by approval. The product continues to say the revision is not assessed.
Actual Result:

Pass/Fail:

### Q9-014 — Fresh execution can establish a bounded result

Type: Positive. Technique: complete assurance journey.
Precondition: D's two mapped mandatory obligations, actual healthy synthetic target and separate worker.
Steps:
1. Explicitly request an assessment of the new plan.
2. Wait for the worker's actual completion and inspect expected versus observed results.
3. Compare run revision, target, mappings and evidence identities with D's approved plan.
Expected Result: genuine fresh observations determine the result. On the known-correct fixture both
checks support the declared scope and READY is qualified by that boundary. The source template's
existence is not listed as execution evidence.
Actual Result:

Pass/Fail:

### Q9-015 — Additional mandatory scope remains a visible gap

Type: Positive. Technique: decision-table completeness condition.
Precondition: Gap destination G has an extra non-rejected, unaccepted audit obligation.
Steps:
1. Reuse the two-check template for G's two accepted requirements and approve the plan.
2. Inspect the entire frozen scope, including the extra obligation.
3. Execute against the known-correct target and inspect the case.
Expected Result: all three obligations remain in scope. Passing the two mapped checks does not
justify READY; the unresolved additional obligation remains a gap and yields INDETERMINATE absent a
separate valid counterexample. The template cannot exclude that obligation.
Actual Result:

Pass/Fail:

### Q9-016 — Fresh rationales remain distinct from source examples

Type: Positive. Technique: decision provenance.
Precondition: eligible D and active template.
Steps:
1. Inspect the old mapping reason but write a distinctly worded reason for each destination mapping.
2. Approve the new plan and reopen it.
3. Reopen the original template version.
Expected Result: the destination plan stores the newly entered reasons and named approver. The
template preserves the old reasons. Neither history is overwritten or presented as the other decision.
Actual Result:

Pass/Fail:

### Q9-017 — A used plan links back to its exact template version

Type: Positive. Technique: traceability and persistence.
Precondition: approved template-backed plan.
Steps:
1. Inspect the plan's template reference and follow its version link.
2. Sign out, sign in again and reopen the plan.
3. Compare family, version and digest with the original approval receipt.
Expected Result: the exact preparation record remains traceable after a fresh session. The template
reference does not change the published plan snapshot or evidence format.
Actual Result:

Pass/Fail:

### Q9-018 — Later template archive preserves an earlier plan and evidence

Type: Positive. Technique: independent lifecycle transitions.
Precondition: current approved plan and genuine completed evidence created using a template.
Steps:
1. Record the plan, run, evidence digest and current applicability.
2. Archive the template with a reason.
3. Reopen the plan and completed assessment without changing any destination inputs.
Expected Result: the old plan and evidence are unchanged and retain their existing applicability.
Archiving blocks future use; it does not revoke a plan, erase evidence or rewrite a disposition.
Actual Result:

Pass/Fail:

### Q9-019 — Advancing the source does not rewrite a saved example

Type: Positive. Technique: history preservation.
Precondition: saved template from S; its original snapshot/digest retained.
Steps:
1. As A create a new source revision using the ordinary workflow.
2. Open the saved template and its original source link.
3. Compare with the original exported version.
Expected Result: the saved example stays exact and its source is historical. Later source edits are
not silently substituted. New destination approval still requires fresh applicability review.
Actual Result:

Pass/Fail:

### Q9-020 — Catalogue pagination exposes all eligible records

Type: Positive. Technique: boundary transition.
Precondition: operator-created disposable catalogue with 21 active families, all uniquely named.
Steps:
1. Open the first catalogue page and record its range/count.
2. Select **Next templates**, then **Previous templates**.
3. Compare displayed records with the prepared inventory.
Expected Result: the normal 20-item page and remaining item are accessible without duplication,
silent truncation or a false total. Archived filtering retains its intended meaning.
Actual Result:

Pass/Fail:

### Q9-021 — Mobile source, history and mapping screens remain usable

Type: Positive. Technique: viewport partition.
Precondition: browser viewport 390 × 844 pixels; a template with long source text.
Steps:
1. Navigate catalogue, detail, source trail and version history.
2. Open the save and destination-mapping forms; inspect every field and action.
3. Scroll vertically and check for horizontal page overflow or obscured actions.
Expected Result: text wraps, labels and controls remain readable, required actions are reachable,
and the page does not require horizontal scrolling. Warnings remain visible.
Actual Result:

Pass/Fail:

### Q9-022 — Keyboard navigation supports the complete preparation flow

Type: Positive. Technique: interaction partition.
Precondition: desktop browser; signed in as P.
Steps:
1. Use keyboard navigation to open a template and expand original rationale/source details.
2. Open a destination mapping form and move through selectors, reasons and acknowledgement.
3. Submit a valid plan using the keyboard.
Expected Result: focus follows a meaningful order, labels identify their controls, expanded details
are accessible, and no mouse-only action blocks the ordinary flow. Retain any accessibility defect.
Actual Result:

Pass/Fail:

### Q9-023 — Founder-review qualifications remain visible

Type: Positive. Technique: protected-mode partition.
Precondition: separate founder-review workspace; eligible source and destination.
Steps:
1. Create and inspect a template under that protected review mode.
2. Download its version and open destination mapping review.
3. Compare the mode qualification in the UI and JSON.
Expected Result: founder-review is recorded and visibly qualified. The product does not claim
independent human approval where the mode permits the same person to contribute and approve.
Actual Result:

Pass/Fail:

### Q9-024 — Schema 6 to 7 upgrade preserves earlier business and evidence records

Type: Positive. Technique: migration transition; deployment owner required.
Precondition: isolated restored schema-6 database with known obligations, drafting, plans, evidence and resolutions.
Steps:
1. Record identities, checksums, counts and representative evidence digests.
2. Apply the reviewed schema-7 migration/grants through the documented operator process.
3. Start the new application and worker, inspect old records, then save and reuse one template.
Expected Result: earlier records and migration checksums are preserved; template operations work
under effective runtime permissions. No startup or build silently performs the upgrade. Retain the
actual migration and regression evidence for release acceptance.
Actual Result:

Pass/Fail:

### Q9-025 — Feature disabled preserves the existing workflow

Type: Positive. Technique: configuration partition.
Precondition: Increment 9 code with templates disabled and a compatible earlier schema/configuration.
Steps:
1. Sign in and inspect navigation and safe Support capabilities.
2. Complete ordinary obligation review and a normal explicit plan without a template.
3. Inspect the template API with the same authenticated session.
Expected Result: ordinary functionality remains available. Templates are not advertised as enabled;
their routes are unavailable. Upgrading code alone does not force schema 7 merely for disabled templates.
Actual Result:

Pass/Fail:

### Q9-026 — Identical request replay returns the original save

Type: Positive. Technique: idempotency transition.
Precondition: authenticated API client; capture one complete valid create or approval request with its request key.
Steps:
1. Submit the request and retain the returned family/version or plan identity.
2. Repeat the exact request with the same account and key.
3. Read the saved catalogue or destination plan history.
Expected Result: the replay returns the original receipt with the same identity; exactly one
record was created. No duplicate approval or template version appears.
Actual Result:

Pass/Fail:

## Negative journeys and boundaries

### Q9-027 — Unauthenticated access is denied

Type: Negative. Technique: authentication partition.
Precondition: known saved template link; no valid session.
Steps:
1. Open catalogue, detail and export API URLs without signing in.
2. Submit a valid-looking template mutation without a session.
Expected Result: API access requires authentication and does not disclose source business records.
The browser shows the sign-in path; no mutation is accepted.
Actual Result:

Pass/Fail:

### Q9-028 — Author-only accounts cannot manage templates

Type: Negative. Technique: role decision table.
Precondition: signed in as A without Policy Authority.
Steps:
1. Inspect a saved template and an eligible source plan.
2. Attempt create, new-version and archive requests using A's genuine session.
Expected Result: inspection is allowed, but all three mutations are denied by the server. Hiding
controls alone is insufficient. No new family, version or archive event is saved.
Actual Result:

Pass/Fail:

### Q9-029 — Viewer and Author cannot approve through a template

Type: Negative. Technique: role decision table.
Precondition: eligible D and saved template; A and V accounts.
Steps:
1. Inspect D's template selection flow as A and V.
2. Submit an otherwise valid template-backed plan request under each account.
Expected Result: both approvals are denied. A reusable example does not confer Policy Authority.
The destination remains without the attempted new plan.
Actual Result:

Pass/Fail:

### Q9-030 — Origin and CSRF controls remain enforced

Type: Negative. Technique: security equivalence partitions.
Precondition: valid P session and disposable API client.
Steps:
1. Attempt create, new-version, archive and plan approval with a missing or incorrect CSRF token.
2. Repeat with a foreign or missing Origin header.
Expected Result: each mutation is rejected before it changes storage. A valid role or template ID
does not bypass either session protection.
Actual Result:

Pass/Fail:

### Q9-031 — Required decisions cannot be omitted

Type: Negative. Technique: required-field partitions.
Precondition: eligible source/save form.
Steps:
1. Try a blank name, blank purpose, blank reason and unchecked acknowledgement individually.
2. Use a reason shorter than the documented minimum.
3. Repeat invalid values through the API to exercise server validation.
Expected Result: validation is clear and no partial template is created. Client controls are
supplementary; the server also rejects incomplete decisions.
Actual Result:

Pass/Fail:

### Q9-032 — Field and body boundaries distinguish valid Unicode from oversized input

Type: Negative. Technique: boundary-value analysis.
Precondition: disposable API client and eligible source/destination.
Steps:
1. Save legal 120-character name and 2,000-character purpose/reason values, including multibyte text.
2. Submit 121-character name or 2,001-character purpose/reason values separately.
3. Submit a JSON body larger than 32 KiB and malformed/non-JSON bodies.
Expected Result: legal field lengths fit the bounded envelope; excessive fields are rejected,
over-limit bodies receive an explicit size error, and malformed/wrong-media bodies are rejected.
No truncation or partial save occurs.
Actual Result:

Pass/Fail:

### Q9-033 — Unrelated source identifiers cannot be combined

Type: Negative. Technique: identity-binding decision table.
Precondition: two eligible source changes and one recorded save request.
Steps:
1. Substitute the other change's revision or plan identifier into the request.
2. Substitute a different scope digest or an absent plan ID.
Expected Result: the source mismatch is rejected. The product does not combine a plan from one
change with requirements or provenance from another.
Actual Result:

Pass/Fail:

### Q9-034 — Source scope changed after opening the save form

Type: Negative. Technique: stale-input transition.
Precondition: P has opened **Save verification template** for S.
Steps:
1. In A's separate session add or edit a mandatory source obligation.
2. Return to P's old form and submit without reloading.
3. Reload the source plan as instructed.
Expected Result: the stale save conflicts; it does not capture a mismatched plan or quietly omit
the new obligation. A current source mapping decision is needed before capture.
Actual Result:

Pass/Fail:

### Q9-035 — Historical revisions cannot supply a new template

Type: Negative. Technique: revision-state partition.
Precondition: S has a newer current revision while an old save form is open.
Steps:
1. Submit the old form or use its historical revision/plan IDs through the API.
2. Open the old revision directly and inspect its controls.
Expected Result: new capture is blocked for the historical revision. Prior saved templates and
historical plans remain inspectable; the old record is not relabelled current.
Actual Result:

Pass/Fail:

### Q9-036 — Legacy or unsupported plans are not silently converted

Type: Negative. Technique: supported-contract partition.
Precondition: an existing version-1 assurance plan and a source without an approved plan.
Steps:
1. Try to save each as a template.
2. Submit their identities through the authenticated API.
Expected Result: capture requires a current version-2 approved plan. No legacy verifier, profile
or evidence snapshot is rewritten to fit the new feature.
Actual Result:

Pass/Fail:

### Q9-037 — Version selectors and query parameters are unambiguous

Type: Negative. Technique: input partitions and boundary values.
Precondition: two saved families; authenticated API client.
Steps:
1. Request one family's detail/export with the other family's version, an absent version, or an invalid ID.
2. Send repeated/empty/unknown query parameters; test negative/fractional offsets and limits outside 1–50.
3. Append a query parameter to create, revise or archive.
Expected Result: invalid or unrelated references fail explicitly. Only supported singular query
parameters are accepted; mutation queries are rejected. No fallback version is guessed.
Actual Result:

Pass/Fail:

### Q9-038 — Corrupt source or saved-template integrity blocks use

Type: Negative. Technique: controlled integrity fault; operator required.
Precondition: disposable database copy with a captured clean backup.
Steps:
1. Have the operator damage one source-plan snapshot or one immutable template snapshot/digest.
2. Attempt capture, detail/export and new reuse as applicable to that fault.
3. Restore the clean fixture and confirm normal reads again.
Expected Result: affected operations fail with an explicit integrity error. No guessed template,
old-pass fallback, partial plan or SQL/credential disclosure is returned.
Actual Result:

Pass/Fail:

### Q9-039 — Concurrent version publishing cannot overwrite history

Type: Negative. Technique: concurrency and optimistic locking.
Precondition: P and Q have opened new-version forms from the same latest version/state.
Steps:
1. Submit P's valid new version.
2. Submit Q's stale form with a different request key.
3. Refresh the family history.
Expected Result: one next version is created; the stale attempt conflicts and requires reload.
Neither decision overwrites an immutable version or produces two versions with the same number.
Actual Result:

Pass/Fail:

### Q9-040 — An archived family cannot receive another version

Type: Negative. Technique: terminal-state transition.
Precondition: archived family and a previously open version form.
Steps:
1. Try its version-save action and a direct revise request.
2. Try an archive request with stale expected state/version values.
Expected Result: new-version and stale-state operations are rejected. Archive is not a hidden
delete/restore mechanism, and historical snapshots remain unchanged.
Actual Result:

Pass/Fail:

### Q9-041 — A superseded version cannot start new reuse

Type: Negative. Technique: latest-version race.
Precondition: P's destination form references version 1; Q publishes version 2.
Steps:
1. Submit P's previously opened version-1 approval form.
2. Open the old version directly and inspect its status.
Expected Result: new approval conflicts because the selected version is superseded. Historical
inspection remains available. The server does not silently substitute version 2 under P's decision.
Actual Result:

Pass/Fail:

### Q9-042 — Archive while approval is open blocks new use

Type: Negative. Technique: lifecycle race.
Precondition: P has completed but not submitted a destination mapping form.
Steps:
1. As Q archive that template family.
2. Submit P's old form.
3. Inspect destination plan history and family state.
Expected Result: the stale new use is rejected, with no partial plan or use receipt. If a genuinely
concurrent approval completed before archive, its committed ordering must be traceable and it remains
a valid historical decision; there must be no use recorded after the archive decision.
Actual Result:

Pass/Fail:

### Q9-043 — A different adapter is not an equivalent execution contract

Type: Negative. Technique: contract compatibility partition.
Precondition: source template uses one adapter; destination has only Alternative adapter X.
Steps:
1. Open **Use a template** on the incompatible destination.
2. Attempt an otherwise valid plan request using X's target ID.
Expected Result: the UI explains the incompatibility and the server rejects it. Matching check
names do not authorize a different adapter automatically.
Actual Result:

Pass/Fail:

### Q9-044 — Wrong application or revision target is rejected

Type: Negative. Technique: target-binding decision table.
Precondition: D's template mapping form; operator has configured several synthetic targets.
Steps:
1. Attempt approval using S's target, an older destination revision's target or an unknown target.
2. Ask the operator to remove the selected target after opening a form, then submit it.
Expected Result: approval rechecks current configuration and rejects each mismatch. No arbitrary
URL or old target is accepted, and source target credentials are never copied from the template.
Actual Result:

Pass/Fail:

### Q9-045 — Unaccepted or unrelated obligations cannot be mapped

Type: Negative. Technique: authority and membership partitions.
Precondition: a destination with draft/review-pending/rejected obligations and another change's accepted obligation.
Steps:
1. Inspect available destination selectors.
2. Through the API attempt to map each ineligible obligation to a template check.
Expected Result: only accepted obligations belonging to the selected current revision can be
mapped. The template does not grant acceptance or move an obligation between revisions.
Actual Result:

Pass/Fail:

### Q9-046 — One obligation cannot silently stand for two distinct checks

Type: Negative. Technique: uniqueness boundary.
Precondition: two-check template and eligible destination.
Steps:
1. Select the same destination obligation for both checks.
2. Attempt submit in the UI and through the API.
Expected Result: duplicate mappings are rejected. The user must choose distinct accepted
obligations; no duplicate, merged or inferred requirement is created.
Actual Result:

Pass/Fail:

### Q9-047 — The selected template's exact supported check set is enforced

Type: Negative. Technique: set-membership partitions.
Precondition: valid two-check template-backed approval request.
Steps:
1. Remove one mapping, duplicate a check, or replace a check with an unsupported identifier.
2. Attempt to add an arbitrary script, verifier definition or disposition override.
Expected Result: changed or unsupported check sets and unknown executable fields are rejected.
A caller cannot use the template label to approve different execution behavior.
Actual Result:

Pass/Fail:

### Q9-048 — Tampered template identity or digest cannot authorize a plan

Type: Negative. Technique: integrity and identity binding.
Precondition: valid destination approval payload.
Steps:
1. Change templateDigest, versionId or templateId individually.
2. Try a version belonging to another family and an unknown field in templateUse.
Expected Result: the server validates the exact saved identity and content; each mismatch fails
without inserting a plan, receipt or false provenance.
Actual Result:

Pass/Fail:

### Q9-049 — Destination scope changes invalidate an open approval

Type: Negative. Technique: optimistic scope race.
Precondition: P has a completed mapping form for D.
Steps:
1. In A's session change a destination obligation or add a mandatory obligation.
2. Submit P's unchanged form.
3. Reload and inspect the now-current declared scope.
Expected Result: the old scope digest conflicts. The product does not approve the old scope or
silently omit the new requirement. Fresh review is required.
Actual Result:

Pass/Fail:

### Q9-050 — A newer destination revision or plan rejects stale approval

Type: Negative. Technique: revision/plan race.
Precondition: separate open template-mapping forms on D.
Steps:
1. For one fresh fixture, advance D to a new revision before submitting the old form.
2. For another fixture, let Q approve a different current plan before P submits.
Expected Result: each stale request conflicts on the correct revision or expected plan version.
No extra plan is created from stale inputs, and the newer record remains intact.
Actual Result:

Pass/Fail:

### Q9-051 — Reusing a request key for changed content is rejected

Type: Negative. Technique: replay conflict.
Precondition: retained successful create/revise/archive or template-backed plan request.
Steps:
1. Repeat its key with a changed name, reason, target or mapping as appropriate.
2. Inspect catalogue/version/plan history after the rejected request.
Expected Result: the changed replay conflicts instead of overwriting the original receipt or
creating another result. Original actor, payload and saved identity remain traceable.
Actual Result:

Pass/Fail:

### Q9-052 — A lost successful mutation reply remains uncertain to the browser

Type: Negative. Technique: controlled transport fault; operator fixture required.
Precondition: a test transport drops exactly one response after the real template or plan transaction commits.
Steps:
1. Submit the valid mutation and observe the dropped reply.
2. Read the uncertainty message; use **Check saved templates** or **Check saved verification plan**.
3. Inspect the committed record and, with the same captured key, replay the exact request once.
Expected Result: the browser does not automatically resubmit or claim failure proves no save.
The saved record is recoverable and exact replay returns the same identity, with no duplicate.
Actual Result:

Pass/Fail:

### Q9-053 — Delayed reads cannot restore an old route or identity

Type: Negative. Technique: navigation/session race.
Precondition: controlled transport delays a genuine template detail response body.
Steps:
1. Start loading a template, then navigate to Guide before the delayed body finishes.
2. Repeat, signing out and signing in as V before completion.
3. Let the original response finish and inspect the current page and available actions.
Expected Result: the old response cannot replace the new route, reveal an old session's view, or
restore Policy Authority mutation controls. The new identity remains authoritative.
Actual Result:

Pass/Fail:

### Q9-054 — Revocation and expiry remove authenticated template content

Type: Negative. Technique: session lifecycle.
Precondition: a template page open under a session the operator can revoke in the test environment.
Steps:
1. Revoke or expire the actual session.
2. Refresh detail, try an export, and attempt a pending mutation.
Expected Result: the UI returns to sign-in and authenticated APIs refuse access. Old template
content or successful-state messages do not return through delayed callbacks.
Actual Result:

Pass/Fail:

### Q9-055 — Untrusted text remains inert business text

Type: Negative. Technique: error guessing / script injection.
Precondition: isolated source/template with literal HTML-like text, quotes and Unicode distinctions.
Steps:
1. Save a permitted name/purpose/source statement containing `<img src=x onerror=alert(1)>` as text.
2. Inspect catalogue, detail, mapping review, history and downloaded JSON.
3. Compare case, internal spaces and Unicode form with the saved values.
Expected Result: text is escaped in the UI and does not execute markup or script. Exact wording
distinctions are retained; no keyword or visual similarity creates an inferred match or authority.
Actual Result:

Pass/Fail:

### Q9-056 — Catalogue and version limits fail visibly

Type: Negative. Technique: boundary-value analysis; disposable operator fixture required.
Precondition: 100 saved families, and separately one family with 50 valid versions.
Steps:
1. Attempt a 101st family with a fresh request key.
2. Attempt version 51 with correct current state/version values.
3. Reopen the catalogue/history and verify earlier records.
Expected Result: each limit is explicitly rejected without truncation, overwriting or partial
history. Existing entries remain accessible and exact replay of an earlier valid request is not a new save.
Actual Result:

Pass/Fail:

### Q9-057 — Incomplete configuration or migration cannot enable a partial feature

Type: Negative. Technique: deployment decision table; operator required.
Precondition: isolated deployment copies.
Steps:
1. Enable templates while assurance or generalization is disabled.
2. Enable templates against missing schema 7 or a deliberately mismatched migration checksum.
3. Restore valid configuration and migration, then repeat startup.
Expected Result: invalid combinations fail explicitly; there is no in-memory fallback, startup
migration or false enabled state. Corrected configuration uses the reviewed persistent schema.
Actual Result:

Pass/Fail:

### Q9-058 — Runtime permissions prevent rewriting snapshots and worker access

Type: Negative. Technique: least-privilege partition; operator required.
Precondition: actual non-owner web and worker roles on an isolated migrated database.
Steps:
1. Verify normal template save/version/archive/use through the web role.
2. Attempt direct edits/deletes of immutable version content and use receipts using that role.
3. Attempt template writes using the verifier worker's actual role.
Expected Result: required normal operations work, immutable history edits/deletes are denied, and
the worker has no template write authority. Record effective/inherited grants, not just a SQL template.
Actual Result:

Pass/Fail:

### Q9-059 — Older binaries and incomplete recovery are not accepted as a rollback

Type: Negative. Technique: compatibility/recovery transition; operator required.
Precondition: isolated schema-7 backup and known older published application binary.
Steps:
1. Attempt to open schema 7 with the older binary in isolation.
2. Restore the schema-7 backup to a separate database and use the compatible new binary.
3. Check template version/use links and representative earlier evidence after restoration.
Expected Result: the older binary rejects the newer schema. A valid restore preserves both new
provenance and earlier records. Switching application code alone is not treated as database rollback,
and a backup command alone is not evidence that restore succeeded.
Actual Result:

Pass/Fail:

### Q9-060 — Template reuse cannot erase an earlier counterexample

Type: Negative. Technique: evidence regression / decision table.
Precondition: History H contains a valid unresolved counterexample for the same destination
obligation/version, target and verification context; preserve its evidence digest.
Steps:
1. Approve a template-backed plan with those same relevant identities and a fresh request key.
2. Execute a later passing observation on the controlled fixture without using the resolution workflow.
3. Inspect current findings, prior counterevidence and original exported evidence.
Expected Result: the prior valid counterexample remains visible and prevents an unjustified READY.
The template, plan version or later pass does not resolve it. Original evidence and its digest remain unchanged.
Actual Result:

Pass/Fail:

## Record-size boundaries

### Q9-061 — A large catalogue remains reachable through smaller pages

Type: Positive. Technique: response-size boundary; operator fixture required.
Precondition: a disposable catalogue with individually readable families whose combined source-plan
and version records exceed the 16 MiB read budget for a normal 20-item page.
Steps:
1. Open **Verification templates** and observe the catalogue's size-limit recovery.
2. Read the smaller-page notice, returned item range and total.
3. Use **Next templates** until every prepared family has been reached, then navigate backwards.
Expected Result: only the read-only catalogue request is retried with a smaller page, first five
items and then one if necessary. The change is explained. Pagination uses the actual returned page
size, every family remains reachable, and no record is silently dropped or replaced by an empty
success. No mutation is retried by this behavior.
Actual Result:

Pass/Fail:

### Q9-062 — Oversized family preparation rolls back atomically

Type: Negative. Technique: aggregate-size boundary; operator fixture required.
Precondition: a disposable active family near the 16 MiB combined version, referenced-source-plan
and archive-receipt read budget; an eligible source plan would put the next version over that budget.
Steps:
1. Record the family state, complete version history and latest digest.
2. Attempt the otherwise valid new version with a fresh request key.
3. Reload the family and compare its version history and source provenance with the recorded baseline.
Expected Result: an explicit size-limit response rejects the new version. Its transaction leaves
no partial version, mutation receipt or activity entry. The preceding family remains readable and
unchanged. Increasing count limits or silently truncating source/history is not used to hide the limit.
Actual Result:

Pass/Fail:

## Release evidence to retain

Record the exact code commit, automated run, hosted deployment identity, migration/grants evidence,
observed case outcomes, defect/fix/retest references and recovery result in the Increment 9 release
acceptance record. Execute the cumulative earlier suites as well as this supplement. Hosted HTTPS,
actual PostgreSQL runtime permissions, cold starts, real worker operation and independent QE are
separate from native local-browser and disposable database CI results. Optional live drafting AI
remains its own existing acceptance gate if that feature is enabled.
