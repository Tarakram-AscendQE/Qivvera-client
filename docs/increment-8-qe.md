# Increment 8 — functional QE supplement

Version 0.9.0. Scope: declared revision impact and explained next checks.

This supplement accompanies the cumulative Qivvera QE suites. It teaches the new workflow while validating positive and negative behavior. **Actual Result and Pass/Fail are intentionally blank.** Test authorship and automated engineering checks do not mean these manual cases have been executed.

## Product orientation

Open a change and choose **Impact & next checks**. The page compares the selected revision with its direct parent using saved declarations and explicit copied-obligation links. It explains the existing authority, plan and evidence context and points to ordinary follow-up workflows. This is a read-only report. A copied statement may be unchanged while its authority and evidence still require fresh work for the new revision.

A source reference remains declared. The report does not read repository code, infer a complete dependency graph, approve requirements, select mappings, run checks, waive gaps or transfer a pass across revisions. All non-rejected obligations remain in mandatory declared scope. Missing or corrupt evidence cannot establish support.

## Roles, environment and preparation

Use the reviewed Increment 8 commit in an isolated QE workspace with named **Author**, separate **Policy Authority**, and **Viewer** accounts. Obtain credentials through the team's approved channel. Record the exact commit, hosted URL, enabled capabilities, browser, database backend, time and fixture identity with the execution evidence. Keep the earlier functional suites in scope.

Prepare these reusable fixtures through real product workflows:

- **S0 — initial declaration:** a newly registered application and change, with no obligations or assessments.
- **S1 — baseline assurance:** revision 1 with the explicit approval-separation obligation, a source/version, independent acceptance, an approved supported mapping and a genuine worker assessment against the synthetic target. Use a correct target for READY and the deliberate defect for NOT_READY. Preserve run ID and evidence digest.
- **S2 — copied revision:** register revision 2 with a different declared commit and copy the non-rejected obligations as new candidates. Do not accept them or run assurance unless the case specifically requests it.
- **S3 — no-copy revision:** register a new revision with Start with no obligations. The parent records stay intact.
- **S4 — controlled failure fixtures:** the engineer prepares separate disposable records for queued/expired/cancelled/failed runs, configuration drift, missing/damaged evidence and delayed genuine HTTP responses. QE must not alter a live database or infer these conditions from an unrelated network failure.

API cases use the normal authenticated session. Report: `GET /api/changes/<change-id>/impact?revision=<revision-id>`. Export: `GET /api/changes/<change-id>/impact/export?revision=<revision-id>`. Exactly one `revision` parameter is required. Mutation attempts must include valid normal Origin/CSRF context when the case intends to reach route validation.

## Execution guidance

For each case, retain relevant screenshots or downloaded report, observed error, selected revision, run identity and defect reference. Never copy real credentials into evidence. Use the report's own explanations and normal Guide when learning the flow. If a prerequisite is unavailable, record the case as blocked in the team's execution system; do not mark it passed. Boundary-value, equivalence-partition, decision-table, state-transition and error-guessing techniques are applied below.

This supplement contains **54 cases: 25 positive and 29 negative**.

## I8-QE-001 — Inspect the first revision with no obligations

**Type:** Positive

**Technique:** Equivalence partitioning

**Preconditions:** S0; Author or Viewer.

**Steps:** Open the change, select its first revision, then open Impact & next checks. Read Revision comparison and Selected revision obligations.

**Expected Result:** The selected revision is identified, No earlier revision is explained, and the empty declaration is visible. No READY result, complete-coverage claim, or previous obligation is invented.

**Actual Result:**

**Pass/Fail:**

## I8-QE-002 — Inspect a newly proposed obligation

**Type:** Positive

**Technique:** State transition

**Preconditions:** S0; Author.

**Steps:** Create one obligation through the ordinary change workflow. Open or refresh Impact & next checks.

**Expected Result:** The obligation appears as a new declaration with no recorded copy link. Its draft/candidate status remains visible and the next step requires human review; no evidence is created.

**Actual Result:**

**Pass/Fail:**

## I8-QE-003 — Compare copied declarations with their direct parent

**Type:** Positive

**Technique:** State transition

**Preconditions:** S1 followed by S2; Author.

**Steps:** Open revision 2 and Impact & next checks. Compare its source reference and one copied obligation with revision 1.

**Expected Result:** Revision 1 is the explicit parent. The source declaration differs. The copied obligation is linked to its parent and marked as recorded fields unchanged, while its fresh candidate status remains visible.

**Actual Result:**

**Pass/Fail:**

## I8-QE-004 — Unchanged wording cannot inherit authority or a pass

**Type:** Negative

**Technique:** State transition

**Preconditions:** S1 with a real passing assessment, followed by S2.

**Steps:** Inspect the unchanged copied obligation, its review status, and Assessment & verification context. Open the original assessment separately.

**Expected Result:** The new obligation still requires review and current-revision assurance. The earlier pass remains bound to revision 1 and is not displayed as support for revision 2.

**Actual Result:**

**Pass/Fail:**

## I8-QE-005 — Identify an edited copied statement

**Type:** Positive

**Technique:** Equivalence partitioning

**Preconditions:** S2; Author.

**Steps:** Edit one copied obligation through the normal workflow, changing its statement. Refresh the impact report. Expand or read the field differences.

**Expected Result:** The row remains linked through its recorded copy relationship and is marked as recorded fields changed. The exact before/after statement values are inspectable.

**Actual Result:**

**Pass/Fail:**

## I8-QE-006 — Preserve case-sensitive literals in comparison

**Type:** Negative

**Technique:** Boundary value analysis

**Preconditions:** S2 with a copied requirement containing the literal Secret; Author.

**Steps:** Change only Secret to secret in the copied statement. Refresh the impact report.

**Expected Result:** The changed statement is reported. Case folding must not conceal the difference or present these literal values as equivalent.

**Actual Result:**

**Pass/Fail:**

## I8-QE-007 — Preserve significant spacing and Unicode differences

**Type:** Negative

**Technique:** Boundary value analysis

**Preconditions:** S2 with a controlled literal requirement; Author.

**Steps:** Change only an internal double space to one space, or one visibly similar but different Unicode character. Save through the normal workflow and refresh.

**Expected Result:** The exact stored values remain distinguishable and the statement is marked changed. Visual similarity is not treated as semantic equivalence.

**Actual Result:**

**Pass/Fail:**

## I8-QE-008 — Identify source-reference and source-version changes

**Type:** Positive

**Technique:** Equivalence partitioning

**Preconditions:** S2; Author.

**Steps:** Edit the copied obligation source reference and declared source version while retaining its statement. Refresh the impact report.

**Expected Result:** Each changed source field is shown with its before/after value. The source remains a declaration; neither the comparison nor the source label establishes authenticity.

**Actual Result:**

**Pass/Fail:**

## I8-QE-009 — Identify criticality changes

**Type:** Positive

**Technique:** Equivalence partitioning

**Preconditions:** S2; Author.

**Steps:** Change the copied obligation from HIGH to CRITICAL through the normal workflow, then refresh.

**Expected Result:** The criticality change is visible, with the original and current values. It does not automatically approve the obligation or select verification.

**Actual Result:**

**Pass/Fail:**

## I8-QE-010 — Explain declared revision-context changes

**Type:** Positive

**Technique:** Equivalence partitioning

**Preconditions:** S1; Author.

**Steps:** Register the next revision with a different declared commit, business intent and a meaningful revision reason. Open its impact report.

**Expected Result:** The report identifies the selected revision and its parent and shows the changed declared context. It makes no claim to have fetched or analyzed the underlying source code.

**Actual Result:**

**Pass/Fail:**

## I8-QE-011 — Identical manually added wording is not a copy link

**Type:** Negative

**Technique:** Equivalence partitioning

**Preconditions:** S1 followed by a revision created without copying; Author.

**Steps:** Manually add an obligation with exactly the same wording as a parent obligation. Open the new revision impact report.

**Expected Result:** The new obligation has no recorded copy link. The earlier obligation remains in Not carried forward. Text similarity must not invent lineage or transfer decisions.

**Actual Result:**

**Pass/Fail:**

## I8-QE-012 — Show obligations omitted from the next declaration

**Type:** Positive

**Technique:** State transition

**Preconditions:** S1 followed by S3.

**Steps:** Open revision 2 impact and read Not carried forward, then open revision 1.

**Expected Result:** Earlier obligations absent from revision 2 remain visible as not carried forward. The old records remain inspectable. Their absence is not described as a verified correction or proof that the obligation no longer applies.

**Actual Result:**

**Pass/Fail:**

## I8-QE-013 — Do not hide previously rejected declarations

**Type:** Negative

**Technique:** Decision table

**Preconditions:** S1 with a separately rejected obligation, followed by a normal copied revision.

**Steps:** Open Not carried forward and inspect the earlier rejected item. Compare with its original review history.

**Expected Result:** The earlier rejection is distinguished from other omitted declarations. It is preserved as a prior human decision; the impact report creates no new rejection, waiver or resolution.

**Actual Result:**

**Pass/Fail:**

## I8-QE-014 — Inspect a historical revision against its own parent

**Type:** Positive

**Technique:** State transition

**Preconditions:** Create revisions 1, 2 and 3 in one change.

**Steps:** Open revision 2 explicitly and then Impact & next checks. Read the selected-revision notice and comparison identities.

**Expected Result:** The page clearly marks revision 2 historical and compares it with revision 1, not revision 3. The report cannot present revision 2 evidence as a current-revision disposition.

**Actual Result:**

**Pass/Fail:**

## I8-QE-015 — Reject another change’s revision

**Type:** Negative

**Technique:** Equivalence partitioning

**Preconditions:** S0 plus a second change; an authenticated user and API client.

**Steps:** Request GET /api/changes/<first-change>/impact?revision=<second-change-revision>. Repeat for /impact/export.

**Expected Result:** The request is rejected as a revision/change mismatch or not found. No report combines business records from unrelated changes.

**Actual Result:**

**Pass/Fail:**

## I8-QE-016 — Require one explicit revision parameter

**Type:** Negative

**Technique:** Boundary value analysis

**Preconditions:** Authenticated API client; any existing change.

**Steps:** Call the report and export URLs with no revision, an empty revision, a malformed identifier, and duplicate revision parameters.

**Expected Result:** Each invalid request is rejected. The server must not silently substitute the current revision, choose between duplicate values, or return a partial report.

**Actual Result:**

**Pass/Fail:**

## I8-QE-017 — Reject unsupported query instructions

**Type:** Negative

**Technique:** Equivalence partitioning

**Preconditions:** Authenticated API client; any existing change.

**Steps:** Append base, target, actor, disposition or format query parameters to an otherwise valid impact URL.

**Expected Result:** Unsupported parameters are rejected. Query data cannot alter comparison ancestry, authority, target configuration, result interpretation or response format.

**Actual Result:**

**Pass/Fail:**

## I8-QE-018 — Protect report and export before sign-in

**Type:** Negative

**Technique:** Equivalence partitioning

**Preconditions:** Signed-out browser/API client.

**Steps:** Open the impact report URL and the corresponding export endpoint for a known change and revision.

**Expected Result:** Authentication is required. Business text and report content are not returned to the signed-out client.

**Actual Result:**

**Pass/Fail:**

## I8-QE-019 — Allow a Viewer to inspect useful guidance

**Type:** Positive

**Technique:** Decision table

**Preconditions:** S2; Viewer account.

**Steps:** Sign in as Viewer, open the change, then Impact & next checks. Inspect comparison, next steps and export.

**Expected Result:** The Viewer can read the report and download it. Role-restricted authoring, authority decisions and run requests are not performed by the report.

**Actual Result:**

**Pass/Fail:**

## I8-QE-020 — Allow Policy Authority to inspect the same scope

**Type:** Positive

**Technique:** Decision table

**Preconditions:** S2; separate Policy Authority account.

**Steps:** Open the same selected revision as the Author and read its impact report.

**Expected Result:** The report contains the same declared comparison and assessment context for that revision. Merely opening it does not record an approval or change contributor/reviewer separation.

**Actual Result:**

**Pass/Fail:**

## I8-QE-021 — Report reads do not change business or assurance records

**Type:** Negative

**Technique:** State transition

**Preconditions:** Engineer-prepared S4 snapshot, authenticated user.

**Steps:** Record business-record, plan, run, evidence and activity identities before the test. Open, refresh and export the report several times. Compare the records afterward.

**Expected Result:** The business records, audit activity, plans, run states and evidence are unchanged. No approval, assessment request, expiry update or hidden workflow event is caused by report reads.

**Actual Result:**

**Pass/Fail:**

## I8-QE-022 — Reject forged report mutations

**Type:** Negative

**Technique:** Decision table

**Preconditions:** Authenticated API client with a valid Origin and CSRF token.

**Steps:** Send POST, PUT, PATCH and DELETE to the impact route with claimed approval, mapping, candidate or READY fields.

**Expected Result:** No mutation endpoint is available for these actions. The ordinary role-controlled workflows remain the only routes for those decisions, and no business record changes.

**Actual Result:**

**Pass/Fail:**

## I8-QE-023 — Download the displayed report with its identity

**Type:** Positive

**Technique:** Equivalence partitioning

**Preconditions:** S2; any authenticated workspace role.

**Steps:** Read the visible report digest, selected revision and parent. Use Download impact report. Open the downloaded JSON.

**Expected Result:** The browser download contains the exact displayed report and matching identities/digest. It is a contextual report, not a new evidence manifest or release certificate.

**Actual Result:**

**Pass/Fail:**

## I8-QE-024 — Keep runtime endpoints and secrets out of exports

**Type:** Negative

**Technique:** Equivalence partitioning

**Preconditions:** S1 with operator-configured synthetic target; engineer-provided forbidden-value list.

**Steps:** Download through the UI and authenticated /impact/export endpoint. Inspect the JSON for the test credential, password, CSRF token, target origin and secret environment-variable names.

**Expected Result:** None of those runtime endpoints or secrets appears. Required business text and safe evidence identifiers remain available; the export is not falsely advertised as free of business information.

**Actual Result:**

**Pass/Fail:**

## I8-QE-025 — Render hostile-looking business text as inert text

**Type:** Negative

**Technique:** Error guessing

**Preconditions:** A disposable change containing an obligation with <img src=x onerror=window.impactInjected=true>; Author.

**Steps:** Open its impact report, review the statement and download the report. Inspect whether an image or script action occurred.

**Expected Result:** The supplied text is displayed/exported as data. No image load, script execution, role change, approved mapping or disposition is caused by the text.

**Actual Result:**

**Pass/Fail:**

## I8-QE-026 — Provide comparison when assurance is disabled

**Type:** Positive

**Technique:** Decision table

**Preconditions:** Workspace with normal revision records and assurance disabled.

**Steps:** Open Impact & next checks for the selected revision. Read its declaration comparison and assurance section.

**Expected Result:** The comparison remains useful. Assurance unavailability is explicitly explained. There is no invented target, plan, worker result or evidence claim.

**Actual Result:**

**Pass/Fail:**

## I8-QE-027 — Explain an unavailable matching target

**Type:** Negative

**Technique:** Decision table

**Preconditions:** Workspace with assurance enabled but no approved target matching the selected application and full source revision.

**Steps:** Inspect Assessment & verification context and next steps. Follow the normal assurance link without approving anything.

**Expected Result:** The guidance identifies missing configuration or eligibility. It does not substitute a target from another application/revision or perform network discovery.

**Actual Result:**

**Pass/Fail:**

## I8-QE-028 — Explain accepted but unmapped obligations

**Type:** Positive

**Technique:** Decision table

**Preconditions:** Current revision with an independently accepted obligation and no current approved mapping.

**Steps:** Open Impact & next checks and inspect the obligation guidance and available checks.

**Expected Result:** The guidance explains that an explicit supported mapping is needed. Available check descriptions do not imply that their semantics match this obligation; a Policy Authority must decide through the normal workflow.

**Actual Result:**

**Pass/Fail:**

## I8-QE-029 — Guide candidates toward the existing review workflow

**Type:** Positive

**Technique:** State transition

**Preconditions:** Current revision with a sourced draft candidate; Author.

**Steps:** Open the report, follow its obligation/review link, and inspect the normal candidate. Return without submitting.

**Expected Result:** The link opens the appropriate change and revision. The record remains a candidate. The report does not submit, accept or modify the obligation automatically.

**Actual Result:**

**Pass/Fail:**

## I8-QE-030 — Explain clarification and in-review states

**Type:** Positive

**Technique:** Decision table

**Preconditions:** Current revision with one IN_REVIEW and one CLARIFICATION_REQUIRED obligation.

**Steps:** Open the report and inspect each item’s next step.

**Expected Result:** The guidance distinguishes waiting for the recorded authority workflow from responding to clarification. Neither item is treated as authoritative support or a pass.

**Actual Result:**

**Pass/Fail:**

## I8-QE-031 — All-rejected or empty scope is not complete assurance

**Type:** Negative

**Technique:** Decision table

**Preconditions:** An isolated current revision with no non-rejected obligations.

**Steps:** Open the report and inspect the scope summary, guidance and assessment context.

**Expected Result:** The page explains the lack of declared mandatory scope. It does not manufacture READY merely because nothing remains to test or assert that discovery is complete.

**Actual Result:**

**Pass/Fail:**

## I8-QE-032 — Explain a current approved plan without running it

**Type:** Positive

**Technique:** State transition

**Preconditions:** Current accepted obligations, matching target and current approved plan; no run requested.

**Steps:** Open the report and inspect plan identity, mapping context and next steps.

**Expected Result:** The plan is shown as current for its declared inputs. The report may direct the authorized user to assurance, but it does not queue a run or label planned verification as evidence.

**Actual Result:**

**Pass/Fail:**

## I8-QE-033 — Show genuine current supporting evidence in context

**Type:** Positive

**Technique:** State transition

**Preconditions:** S1 with a genuine current completed READY assessment.

**Steps:** Open the report and compare its latest run ID and evidence digest with the existing assurance case.

**Expected Result:** The same latest run and digest are shown with current applicability and the existing scope-bound result. The impact report itself is not presented as the source of that evidence or a broader approval.

**Actual Result:**

**Pass/Fail:**

## I8-QE-034 — New obligations invalidate current use of an earlier pass

**Type:** Negative

**Technique:** State transition

**Preconditions:** S1 with genuine READY; Author.

**Steps:** Add a new mandatory candidate on the same revision. Refresh impact and open the earlier assurance case separately.

**Expected Result:** The earlier result remains recorded but is no longer current support for the changed scope. The new candidate appears as unresolved; original evidence remains unchanged.

**Actual Result:**

**Pass/Fail:**

## I8-QE-035 — A newer queued run must not borrow an earlier pass

**Type:** Negative

**Technique:** State transition

**Preconditions:** S1 with READY followed by a newer queued assessment.

**Steps:** Open impact before the new worker run completes. Compare the run ID and displayed state with the queue.

**Expected Result:** The newest assessment is shown as unfinished with no current disposition. The earlier pass is not used to fill in the unfinished result.

**Actual Result:**

**Pass/Fail:**

## I8-QE-036 — A failed or cancelled latest run has no disposition

**Type:** Negative

**Technique:** State transition

**Preconditions:** Engineer-prepared current revision whose latest run is FAILED or CANCELLED.

**Steps:** Open the impact report for each state and inspect next steps and any older completed result.

**Expected Result:** The latest failure/cancellation remains visible, has no disposition and cannot inherit an older result. Guidance calls for appropriate investigation or an explicit new assessment.

**Actual Result:**

**Pass/Fail:**

## I8-QE-037 — Observe expiry without silently changing a run

**Type:** Negative

**Technique:** Boundary value analysis

**Preconditions:** Engineer-prepared S4 with a queued deadline or active-worker lease just exceeded.

**Steps:** Capture the stored run status. Read and refresh the report after the deadline. Recheck the stored run directly through the approved fixture inspection.

**Expected Result:** The report explains the observed deadline/lease problem without inventing a result. Reading impact alone does not update the stored run state or start another execution.

**Actual Result:**

**Pass/Fail:**

## I8-QE-038 — Damaged latest evidence cannot be treated as support

**Type:** Negative

**Technique:** Error guessing

**Preconditions:** Engineer-prepared disposable fixture with one corrupted latest evidence digest or binding.

**Steps:** Open the selected revision impact report. Inspect the evidence-integrity message and next steps.

**Expected Result:** The report fails closed for that evidence. No current or recorded trusted disposition is reconstructed from unverified content. The raw corrupted payload is not exposed as valid evidence.

**Actual Result:**

**Pass/Fail:**

## I8-QE-039 — Missing completed evidence cannot be treated as a pass

**Type:** Negative

**Technique:** Error guessing

**Preconditions:** Engineer-prepared disposable fixture whose completed run is missing its evidence record.

**Steps:** Open impact and inspect the latest run context.

**Expected Result:** The missing-evidence condition is explicit, with no trusted disposition. A run status of COMPLETED alone is insufficient to claim supporting evidence.

**Actual Result:**

**Pass/Fail:**

## I8-QE-040 — Preserve an earlier valid counterexample

**Type:** Negative

**Technique:** State transition

**Preconditions:** Engineer-prepared fixture with a valid violation followed by a later passing observation in the same mapped context.

**Steps:** Open the latest impact report and compare with the assurance case and its counterevidence references.

**Expected Result:** The unresolved prior counterexample remains effective according to the existing assurance contract. The report cannot erase it, select only the favorable observation or imply automatic resolution.

**Actual Result:**

**Pass/Fail:**

## I8-QE-041 — Explain a genuine violation and its correction path

**Type:** Positive

**Technique:** State transition

**Preconditions:** S1 configured with the deliberate synthetic self-approval defect and actual worker evidence.

**Steps:** Open impact and follow the evidence or findings link. Read the next step for the violated obligation.

**Expected Result:** The genuine bounded violation and its run identity are visible. Guidance directs review/correction through existing workflows while preserving the original finding.

**Actual Result:**

**Pass/Fail:**

## I8-QE-042 — Configuration drift prevents a stale plan being treated as current

**Type:** Negative

**Technique:** Decision table

**Preconditions:** Engineer-prepared fixture where the target identity or approved verifier configuration changed after the plan/run.

**Steps:** Open impact using the new configuration and inspect plan/run applicability and reported input differences.

**Expected Result:** The plan or run is qualified as stale/unavailable for current use. No automatic remapping, target substitution, verifier change or disposition transfer occurs.

**Actual Result:**

**Pass/Fail:**

## I8-QE-043 — Explain the available bounded checks

**Type:** Positive

**Technique:** Equivalence partitioning

**Preconditions:** Workspace with the existing approval-control capabilities enabled.

**Steps:** Read the available check descriptions and limitations in the report. Compare them with the ordinary assurance configuration view.

**Expected Result:** Only supported configured capabilities are described. Separation/finality meanings and limits remain intact; descriptions do not imply universal test generation or coverage of every obligation.

**Actual Result:**

**Pass/Fail:**

## I8-QE-044 — Guidance cannot choose a check from wording alone

**Type:** Negative

**Technique:** Decision table

**Preconditions:** Current accepted obligation with ambiguous or unrelated business wording.

**Steps:** Open impact and inspect available checks, mapping guidance and ordinary assurance plan.

**Expected Result:** The report does not turn a keyword match or displayed check description into an approved mapping. The obligation remains a gap until the proper explicit authority decision and execution exist.

**Actual Result:**

**Pass/Fail:**

## I8-QE-045 — Clear impact content after genuine session revocation

**Type:** Negative

**Technique:** State transition

**Preconditions:** Any loaded impact page; second controlled client able to sign out the same session.

**Steps:** Revoke the active session, then refresh the report or revisit its route.

**Expected Result:** The application returns to sign-in and clears protected impact content. The old report is not restored by a later failed request.

**Actual Result:**

**Pass/Fail:**

## I8-QE-046 — Ignore an impact response that arrives after sign-out

**Type:** Negative

**Technique:** State transition

**Preconditions:** Engineer-prepared fixture delaying a genuine authenticated impact response.

**Steps:** Begin loading the report, sign out while its response is delayed, and allow the delayed response to arrive.

**Expected Result:** The signed-out screen remains. Old-session source, obligation and assessment content must not reappear.

**Actual Result:**

**Pass/Fail:**

## I8-QE-047 — Ignore an old response after navigation

**Type:** Negative

**Technique:** State transition

**Preconditions:** Engineer-prepared fixture delaying a genuine impact response; at least two routes.

**Steps:** Begin loading one impact report, navigate to another change or Guide before it completes, then let the old response arrive.

**Expected Result:** The active route remains correct. Delayed content from the previous route cannot replace the new view or its links.

**Actual Result:**

**Pass/Fail:**

## I8-QE-048 — Refresh exposes newly saved declaration changes

**Type:** Positive

**Technique:** State transition

**Preconditions:** Open impact in one tab; Author editing the same current revision in a second tab.

**Steps:** Save an additional obligation in the second tab. Use Refresh impact report in the first tab.

**Expected Result:** The report refreshes from saved records, shows the new scope and updated report identity as applicable, and retains the explicitly selected revision.

**Actual Result:**

**Pass/Fail:**

## I8-QE-049 — Keep desktop and narrow-screen content usable

**Type:** Positive

**Technique:** Boundary value analysis

**Preconditions:** Representative report with long statements and field differences.

**Steps:** Inspect at desktop width and 390 CSS pixels. Expand details, scroll through comparison, use next-step links and download the report.

**Expected Result:** Text wraps readably and essential controls stay reachable without horizontal page overflow. Source/digest values do not obscure decisions or navigation.

**Actual Result:**

**Pass/Fail:**

## I8-QE-050 — Use keyboard navigation and understandable labels

**Type:** Positive

**Technique:** Error guessing

**Preconditions:** Representative report; keyboard-only navigation.

**Steps:** Navigate from the change into impact, move through links/buttons/details with Tab and activate refresh/download. Inspect headings and focus visibility.

**Expected Result:** Controls have understandable accessible names, visible focus and sensible headings. Record any accessibility defect; this sample does not establish full accessibility conformance.

**Actual Result:**

**Pass/Fail:**

## I8-QE-051 — Follow guidance without executing hidden actions

**Type:** Positive

**Technique:** State transition

**Preconditions:** Representative current report with obligation, assurance and evidence links.

**Steps:** Record plan/run/obligation counts. Follow each available guidance link and return without submitting any ordinary workflow form.

**Expected Result:** Links open the relevant existing records and selected revision. Navigation does not create a plan, accept an obligation, start a run, resolve a finding or alter evidence.

**Actual Result:**

**Pass/Fail:**

## I8-QE-052 — Keep the report’s product boundary explicit

**Type:** Negative

**Technique:** Error guessing

**Preconditions:** Any representative impact report, including one with current supporting evidence.

**Steps:** Read Report boundary and the labels around source, comparison, available checks and disposition context.

**Expected Result:** The report explains declared records, direct-parent comparison and evidence applicability. It must not claim source-code dependency analysis, complete impact discovery, automatic targeted execution, independent artifact attestation or release certification.

**Actual Result:**

**Pass/Fail:**

## I8-QE-053 — Preserve every obligation at the supported comparison limit

**Type:** Positive

**Technique:** Boundary value analysis

**Preconditions:** An engineer-prepared disposable fixture with exactly 500 obligations on each of the selected revision and its direct parent, using valid creation/history records. Prepare copied, added and rejected examples within the total.

**Steps:** Open the impact report and authenticated export. Compare obligation IDs and Not carried forward IDs with the fixture manifest; inspect the summary counts and guidance.

**Expected Result:** Every selected obligation is present and every omitted parent obligation is explicitly represented. The report handles the documented 500-per-revision boundary without silent truncation, skipped mandatory scope or an invented complete-coverage claim.

**Actual Result:**

**Pass/Fail:**

## I8-QE-054 — Refuse an oversized scope without presenting a partial report

**Type:** Negative

**Technique:** Boundary value analysis

**Preconditions:** An engineer-prepared disposable fixture with 501 valid obligations on the selected revision or its direct parent; ordinary creation/history records must remain intact.

**Steps:** Open the report and export route. Repeat once with the selected revision over the limit and once with only the parent over the limit.

**Expected Result:** The request clearly states the 500-obligation-per-revision limit and refuses the report. No partial obligation list or misleading summary is presented as complete, and no records are changed to make the report fit.

**Actual Result:**

**Pass/Fail:**
