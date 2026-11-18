# Increment 6 — first-release functional QE supplement

**Authored for execution by QE. Actual Result and Pass/Fail are deliberately blank.**

This supplement validates first-use guidance, understandable workflow states, and protected support information in the cumulative Increment 6 build. It extends the Increment 1–3 suite and the Increment 4 and 5 supplements. It does not replace their assurance, authority, integrity, resolution, or GitHub-intake cases.

## Execution record

Build / full commit:

Environment / URL:

QE owner:

Execution date:

Browser / version / device:

Independent QE sign-off:

Deployment owner:

Outstanding defects / approved release decision:

## Preparation and product vocabulary

The deployment owner supplies an isolated, authorized test workspace on the exact candidate commit, schema 5, and separate named AUTHOR, POLICY_AUTHORITY, and VIEWER accounts. The AUTHOR proposes changes and obligations. The POLICY_AUTHORITY reviews applicability and approves supported verification mappings. The VIEWER reads records. An acceptance decision says a requirement applies; it does not prove the software meets it.

The operator supplies a supported synthetic approval or expense target, a separately running worker, and an explicitly authorized test GitHub repository if live intake is enabled for this release. Use a working database with synthetic data only. Capability-disabled, storage-failure, evidence-corruption, expiry, and concurrency scenarios require separate disposable fixtures. QE must not alter production records or secrets to manufacture an error.

The product supports the declared separation and finality contracts, at most two mappings, and configured adapters. Finality requires rejection of repeated approval under the accepted contract; an API whose accepted contract explicitly permits idempotent success is a different scope. A READY disposition concerns only its recorded scope. It is not deployment approval or universal software correctness.

Support information describes the current web process and its recorded configuration. It does not observe worker liveness, probe GitHub, or certify release readiness. A healthy database connection alone does not establish successful worker execution or complete data integrity.

For each case, record observable behavior and evidence before choosing Pass or Fail. If a prerequisite is missing, record BLOCKED with an owner in the execution log and leave Pass/Fail blank. Record defect references separately. Do not fill expected text into Actual Result.

## Techniques and order

The cases use role and capability decision combinations, valid/invalid input classes, state transitions, historical/current revision separation, session expiry and replay, and end-to-end user journeys. Run the basic guidance and role cases first, then workflow transitions, then failure and hosted acceptance cases. For keyboard and mobile cases, report observations; passing them does not claim complete accessibility conformance.

## I6-QE-001 — First sign-in explains the author's starting point

Priority: P1 | Type: Positive | Technique: Persona journey

Prerequisites / data: Empty test workspace; AUTHOR account; approved application name and description.

Steps: Sign in using the supplied account. Read “Start with your role.” Open “Read the product guide,” then return to Workspace. Register the supplied application through the visible action.

Expected result: The author receives a meaningful first action and can find the guide without product knowledge. The new application appears. Opening guidance itself creates no application, change, obligation, or assessment.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-002 — Guide teaches the complete supported workflow

Priority: P1 | Type: Positive | Technique: End-to-end comprehension

Prerequisites / data: Any signed-in test role.

Steps: Open Guide. Follow its stages from change through obligations, review, verification, evidence/gaps, and resolution/reassessment. Read Supported scope and the status definitions.

Expected result: The guide distinguishes human acceptance from execution evidence, describes role responsibilities and declared limits, and explains why a correction requires fresh evidence. It identifies the two supported approval checks and does not imply universal obligation discovery or production release certification.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-003 — Policy Authority receives the correct responsibilities

Priority: P1 | Type: Positive | Technique: Role decision table

Prerequisites / data: POLICY_AUTHORITY-only account; submitted candidate authored by another identity.

Steps: Sign in as the policy identity. Inspect starting guidance and Support actions. Open the submitted candidate and its review history.

Expected result: Review and mapping responsibilities are explained. The identity can perform permitted policy decisions but is not represented as an AUTHOR. Actual record eligibility still governs individual actions.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-004 — Viewer guidance does not grant write authority

Priority: P0 | Type: Negative | Technique: Authorization equivalence class

Prerequisites / data: VIEWER-only account and an existing change.

Steps: Read Workspace, Guide, and Support. Inspect create/edit/review/run/import/resolution actions. With an approved API test client, attempt one create action using the viewer session and correct origin/CSRF.

Expected result: The viewer can read the permitted product information. Write controls are absent or disabled, support action flags do not grant writes, and the server denies the attempted mutation. No new record appears.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-005 — No obligations produces a concrete next step

Priority: P1 | Type: Positive | Technique: Empty-state transition

Prerequisites / data: AUTHOR; a current change with no obligations.

Steps: Open the change and read “What to do next.” Open the obligation form and save a sourced candidate.

Expected result: The page explains how to declare what must be true. The saved requirement starts as a candidate; no passing finding or disposition is fabricated. Guidance advances to the relevant review action.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-006 — Submitted candidate waits for an eligible reviewer

Priority: P0 | Type: Negative | Technique: State and role combination

Prerequisites / data: AUTHOR who created and submitted a candidate; independent-review mode.

Steps: Read the next-step guidance. Attempt to accept the requirement with the same author identity through allowed test means.

Expected result: Guidance explains the review wait. The candidate is not automatically accepted; the server preserves reviewer-separation rules. Submission does not generate software evidence.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-007 — Accepted requirement still needs mapping and execution

Priority: P0 | Type: Positive | Technique: State transition

Prerequisites / data: Eligible Policy Authority; candidate submitted by another identity; configured matching target.

Steps: Accept the requirement with a reason. Inspect the assessment banner and next step. Approve a supported mapping, then inspect the page before requesting a run.

Expected result: Acceptance and mapping are recorded separately. Until actual execution completes, the change remains unassessed. Guidance directs the user toward the next permitted step without asserting READY.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-008 — Missing matching target remains an explicit setup gap

Priority: P0 | Type: Negative | Technique: Configuration equivalence class

Prerequisites / data: Isolated change whose application/source revision has no configured matching target.

Steps: Open Assurance and attempt to configure/run a plan. Read the setup guidance and Support.

Expected result: The page explains that the deployment owner must configure the appropriate test target. No arbitrary target URL is requested and no assessment is invented. A catalogue having other targets does not prove a match for this change.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-009 — Queued assessment does not imply a healthy worker

Priority: P0 | Type: Negative | Technique: State transition

Prerequisites / data: Disposable environment with an approved plan and its worker intentionally stopped by the operator.

Steps: Request an assessment. Read the queued state, next-step guidance, and Support. Refresh once.

Expected result: The run is queued without a disposition. Guidance identifies the separate worker as the relevant dependency. Support explicitly leaves worker status unobserved; queue configuration is not shown as proof that the worker is running.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-010 — READY is explained with its scope

Priority: P0 | Type: Positive | Technique: Valid outcome class

Prerequisites / data: Correct synthetic target, complete accepted/mapped scope, configured worker.

Steps: Complete a real assessment. Read its banner, guidance, assurance case, and evidence.

Expected result: READY appears only after a completed accepted result. The user can inspect the recorded scope, target, mappings and observations. Guidance does not treat the result as production deployment approval or proof about undeclared requirements.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-011 — NOT READY guides investigation and correction

Priority: P0 | Type: Negative | Technique: Invalid outcome class

Prerequisites / data: Synthetic self-approval or repeated-approval defect target.

Steps: Complete an assessment with a real violation. Read the next step, inspect expected/observed evidence, and open the relevant resolution action.

Expected result: The violation and NOT READY disposition remain visible. Guidance directs the user to the specific evidence and accountable correction. Opening or updating a resolution does not erase the original violation.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-012 — INDETERMINATE and unmapped scope are explained as gaps

Priority: P0 | Type: Negative | Technique: Incomplete-evidence class

Prerequisites / data: Reject-all synthetic target or an additional required unmapped obligation.

Steps: Execute the supported plan. Inspect the gap and next step.

Expected result: Missing positive-control evidence or unmapped required scope prevents READY. The page explains what is missing and does not convert the gap into a pass or hide the requirement.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-013 — Historical revision remains readable and isolated

Priority: P0 | Type: Positive | Technique: Historical/current state transition

Prerequisites / data: Accepted obligation and completed result on revision 1; later revision 2.

Steps: Open revision 1 through Revisions. Read its banner, next-step guidance and history. Open current revision 2 using the provided navigation.

Expected result: Earlier records are labelled historical/read-only and remain intact. Guidance leads to the current revision for new work. Revision 2 does not inherit authority or readiness from revision 1.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-014 — Stale inputs call for renewed review and reassessment

Priority: P0 | Type: Negative | Technique: Staleness transition

Prerequisites / data: Existing completed result; authorized current-scope edit.

Steps: Change a required obligation or applicable plan input. Reopen the change and earlier evidence.

Expected result: The old evidence remains accessible but cannot establish current readiness. The guidance identifies reassessment/review needs and does not silently use the prior pass.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-015 — Support information matches the observed web configuration

Priority: P1 | Type: Positive | Technique: Configuration decision table

Prerequisites / data: Operator-provided expected release SHA, version, schema and enabled capability list.

Steps: Open Support as AUTHOR, POLICY_AUTHORITY and VIEWER. Compare reported values against the operator record.

Expected result: Version/revision and safe storage/configuration facts agree with the running candidate. Available actions reflect each role. Support explicitly says worker status, live GitHub connection and release clearance are not evaluated by this view.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-016 — Support does not disclose secrets or business records

Priority: P0 | Type: Negative | Technique: Data-disclosure boundary

Prerequisites / data: Synthetic credential/configuration marker values known only to the operator; existing synthetic business records.

Steps: Inspect the Support page, its JSON response, and any offered diagnostic export. Search for the operator's synthetic secret markers, database URL, target URL/token variable names, account directory, cookies, CSRF token and record contents.

Expected result: None of those values is returned by Support. Only the documented fixed diagnostic fields, role/capability booleans and safe guidance appear. Do not paste real secrets into a defect report.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-017 — Unauthenticated support access is denied

Priority: P0 | Type: Negative | Technique: Authentication boundary

Prerequisites / data: Signed-out browser or separate fresh browser profile.

Steps: Open the Support route and request GET /api/support-info without a session.

Expected result: The UI requires sign-in; the API returns 401 with no protected support data. Browser navigation does not reveal a previously signed-in user's information.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-018 — Support cannot be used as a write or probe endpoint

Priority: P0 | Type: Negative | Technique: Method/input equivalence classes

Prerequisites / data: Authorized API test client, valid test session and CSRF.

Steps: Request /api/support-info with an unexpected query parameter. Attempt POST with the correct origin and CSRF. Compare workspace records before and after.

Expected result: Unexpected query input and unsupported mutation methods are rejected; no diagnostics-triggered external target/provider request or workspace mutation occurs. Support does not accept a user-supplied URL to probe.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-019 — Disabled capabilities give useful guidance

Priority: P1 | Type: Negative | Technique: Capability decision table

Prerequisites / data: Separate operator-prepared deployment with assurance, resolution or intake intentionally disabled.

Steps: Open the corresponding area and Support. Compare messages to the operator's disabled capability record.

Expected result: The user can distinguish unavailable setup from an empty result list. Guidance identifies the deployment owner/action needed. Disabled features do not appear operational, and the existing registry/review workflow remains usable.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-020 — Support storage failure remains safe and explicit

Priority: P0 | Type: Negative | Technique: Fault recovery

Prerequisites / data: Isolated operator-controlled storage-health fault fixture; no customer database.

Steps: Request Support while the fixture reports a storage health problem. Inspect the response/UI and the recorded error reference. Restore the fixture and refresh.

Expected result: Storage is not reported healthy during the fault. The response contains safe actionable guidance without raw SQL/credentials/stack traces. Recovery is visible after refresh; an earlier successful response is not presented as a current check.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-021 — Expired session requires fresh sign-in

Priority: P0 | Type: Negative | Technique: Session lifecycle

Prerequisites / data: Signed-in test session; operator-supported expiry/revocation fixture or an expired session.

Steps: Leave a change open, expire/revoke the session through the approved fixture, then request Support or submit a permitted form. Repeat with a fresh revoked session and choose Sign out; include a previously opened and closed history dialog.

Expected result: The user sees a meaningful sign-in/retry message. The denied action is not reported saved. Old role state does not authorize a new write and protected response data is not returned. Sign out after expiry also clears the authenticated view and hidden dialog content rather than leaving stale records on screen.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-022 — Network failure and malformed service response do not look successful

Priority: P1 | Type: Negative | Technique: Transport equivalence classes

Prerequisites / data: Disposable browser/test gateway capable of simulating a disconnected request and a non-JSON error response.

Steps: Cause each failure separately while refreshing Support or an open read view. Restore connectivity and use the offered retry or reload action.

Expected result: Clear recovery guidance appears. No technical parsing exception is exposed as a successful result, no operation is silently replayed, and normal display returns after a successful read.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-023 — Untrusted labels remain inert text

Priority: P0 | Type: Negative | Technique: Input equivalence class

Prerequisites / data: Synthetic application/change/obligation text containing a harmless HTML test string such as <img src=x onerror=window.qeInjected=true>.

Steps: Save the text through permitted forms. Open Workspace, change detail, history, and guidance near those records.

Expected result: Text is displayed as text or safely rejected by a documented field rule. No injected image/script appears and no authority, evidence, or readiness is created by the text.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-024 — Keyboard navigation and narrow screen remain usable

Priority: P1 | Type: Positive | Technique: Accessibility and viewport boundaries

Prerequisites / data: Desktop browser and 390px-wide viewport; any permitted role.

Steps: Use keyboard navigation to reach Guide and Support, follow a guide link, open/close a form, and return to the workspace. Repeat at 390px and 200% browser zoom.

Expected result: Essential controls have meaningful names and visible focus; no required action is obscured by horizontal page overflow. Dialogs and content remain readable. Report actual accessibility issues rather than claiming full compliance from this sample.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-025 — Read-only guidance does not change workspace history

Priority: P1 | Type: Positive | Technique: Side-effect observation

Prerequisites / data: Stable synthetic workspace; no concurrent operators.

Steps: Record application/change/obligation/assessment counts and activity. Open Guide and Support repeatedly, refresh, and follow read-only next-step links. Compare records again.

Expected result: The same domain records and audit history remain. Read-only guidance/support does not create evidence, accept a requirement, approve a plan, contact GitHub, or send a message to anyone.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-026 — Hosted deep links and sign-out remain safe

Priority: P0 | Type: Positive | Technique: Navigation/session journey

Prerequisites / data: Authorized HTTPS hosted candidate; saved Guide, Support and change URLs.

Steps: Open each deep link in a fresh browser profile, sign in, navigate, reload, then sign out and revisit the links using Back/Forward.

Expected result: Navigation works on the deployed assets and current revision. Sign-out revokes protected access. A stale visual shell cannot fetch protected data or submit writes with the revoked session.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-027 — Restart and redeployment preserve accepted records

Priority: P0 | Type: Positive | Technique: Persistence/recovery

Prerequisites / data: Operator-approved hosted validation; recorded synthetic application, review history and evidence on schema 5.

Steps: Record the running SHA and diagnostic snapshot. The operator restarts the worker and redeploys the same candidate. Reopen the records and Support through native HTTPS browser navigation.

Expected result: Stored records, provenance and permissions persist. Support identifies the actual candidate. No automatic migration, assessment completion or release approval is inferred from the restart. Record cold-start and asset loading failures as defects.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I6-QE-028 — An unfamiliar invited user completes the release journey

Priority: P0 | Type: Positive | Technique: Independent acceptance

Prerequisites / data: QE participant unfamiliar with Qivvera; operator-prepared supported synthetic target; separate policy reviewer; approved onboarding instructions only.

Steps: Ask the participant to register or select an application, create a change, propose a sourced requirement, obtain review, configure a supported mapping with the policy reviewer, request execution, inspect the evidence/disposition and explain any gap. Then ask the participant to identify the product's scope and collect safe support information without an engineer narrating each click.

Expected result: The participant completes the permitted journey and can distinguish requirement acceptance, supported evidence, gaps, scope-bound readiness and release approval. Confusion, unexplained errors and required engineer intervention are recorded as usability defects. Passing this case does not replace separate hosted migration, restoration, live GitHub and cumulative QE gates.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## Exit evidence

Attach the exact commit and deployment SHA, executed cumulative test results, these filled cases, browser evidence, defect disposition, actual live GitHub verification if enabled, migration/grant and isolated restoration records, and deployment/support ownership. Leave unexecuted gates open with an owner. Product guidance and support configuration cannot close those gates automatically.
