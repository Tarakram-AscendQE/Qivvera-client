# Increment 5 — focused functional QE supplement

AUTHORED, NOT EXECUTED. Run on the exact accepted Increment 5 commit after operator setup. Retain and rerun the existing Inc1–3 suite and Inc4 supplement. These 40 cases add new behaviour, not replacement coverage.

Roles: AUTHOR imports/proposes; POLICY_AUTHORITY accepts obligations and mappings; VIEWER reads only. Independent resolution uses a different authorized person. Use separate synthetic applications/test identities. Negative database, target, provider and credential fault cases require an isolated operator-prepared fixture, never working/customer data. Missing prerequisites are BLOCKED in the execution log with an owner; keep Pass/Fail blank. Expected contract results are not prefilled Actual Results.

Techniques: equivalence classes, boundaries, role/decision combinations, state transitions, concurrency, replay/idempotency, integrity and end-to-end scenarios. Select exact values from approved fixture configuration. Do not reuse old disclosed credentials.

## I5-QE-001 — Two accepted obligations mapped

Priority: P0 | Type: Positive

Prerequisites / data: Two independently accepted requirements; correct synthetic target; authorized policy identity.

Steps: Approve a plan mapping separation and finality to distinct requirements with rationales. Request assessment; run the configured worker.

Expected result: Two findings are SUPPORTED, evidence is attributed per obligation, and disposition is READY only within declared scope.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-002 — Finality violation despite separation pass

Priority: P0 | Type: Negative

Prerequisites / data: Repeat-approval-defect target; two accepted mapped requirements.

Steps: Run the same two-check plan. Inspect both findings and selected state observations.

Expected result: Separation is SUPPORTED, finality VIOLATED, overall NOT READY; no borrowing of passing evidence.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-003 — Self-approval violation despite finality pass

Priority: P0 | Type: Negative

Prerequisites / data: Self-approval-defect target.

Steps: Run both checks and inspect each finding.

Expected result: Separation VIOLATED, finality SUPPORTED, overall NOT READY.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-004 — Reject-all positive control

Priority: P0 | Type: Negative

Prerequisites / data: Target rejects every approval.

Steps: Execute both mapped checks.

Expected result: Both are INSUFFICIENT; overall INDETERMINATE, never READY.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-005 — Unmapped accepted requirement

Priority: P0 | Type: Negative

Prerequisites / data: Two accepted obligations; map only separation.

Steps: Run the one-mapping version 2 plan.

Expected result: Unmapped requirement stays a visible gap and prevents READY.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-006 — Additional candidate remains in scope

Priority: P0 | Type: Negative

Prerequisites / data: Valid mappings plus another unaccepted candidate.

Steps: Approve current scope and run.

Expected result: Candidate remains an authority gap, not silently omitted or supported.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-007 — Expense application reuse

Priority: P1 | Type: Positive

Prerequisites / data: Operator runs Python expense target with matching registered binding and expense-v1 adapter.

Steps: Repeat the correct two-check journey against the expense application.

Expected result: Same core gives separate supporting findings without application-specific disposition rules.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-008 — Wrong adapter or target identity

Priority: P0 | Type: Negative

Prerequisites / data: Disposable target uses a mismatched approved adapter/identity.

Steps: Attempt execution and inspect outcome.

Expected result: No supporting readiness; insufficient/failed execution is visible; do not weaken identity/TLS rules.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-009 — AUTHOR cannot approve coverage

Priority: P0 | Type: Negative

Prerequisites / data: AUTHOR identity.

Steps: Attempt the plan action via UI and authorized test API.

Expected result: 403 or disabled control; no saved unauthorized plan.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-010 — Duplicate requirement mapping

Priority: P0 | Type: Negative

Prerequisites / data: POLICY_AUTHORITY; two checks selecting the same requirement.

Steps: Submit both mappings.

Expected result: Rejected explicitly; no partial new plan.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-011 — Empty or excessive plan

Priority: P1 | Type: Negative

Prerequisites / data: Authorized API test client.

Steps: Submit zero or more than two mappings and unknown check IDs.

Expected result: Invalid mappings rejected; previous plan preserved.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-012 — Historical version 1 read

Priority: P0 | Type: Positive

Prerequisites / data: Saved pre-upgrade plan and actual assessment; schema-5 migration rehearsed.

Steps: Open/export the prior case after upgrade.

Expected result: Original profile, findings and evidence identity retained; no relabeling as a new multi-check run.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-013 — Changed scope stales result

Priority: P0 | Type: Negative

Prerequisites / data: Existing successful result.

Steps: Edit an accepted obligation or create a new revision.

Expected result: Old case retained but cannot establish current readiness.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-014 — Later pass preserves counterexample

Priority: P0 | Type: Negative

Prerequisites / data: Operator-controlled intermittent target in isolated test environment.

Steps: Capture a separation violation; rerun after a passing behaviour without changing accepted context.

Expected result: Prior contrary evidence remains linked to the affected obligation; NOT READY persists.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-015 — Missing earlier evidence before rerun

Priority: P0 | Type: Negative

Prerequisites / data: Disposable database only; operator retains backup and removes earlier completed evidence.

Steps: Attempt a later passing run.

Expected result: No new accepted readiness. Evidence absence blocks completion; report operational failure, not a pass.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-016 — Missing referenced evidence on read

Priority: P0 | Type: Negative

Prerequisites / data: Disposable database only; current case references earlier evidence.

Steps: Operator removes referenced evidence; reopen current case.

Expected result: Disposition is suppressed and unavailable counterevidence is exposed.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-017 — Correction of second mapped finding

Priority: P0 | Type: Positive

Prerequisites / data: Original finality violation; new source/artifact with materially same copied requirements.

Steps: Propose correction before reassessment; map/check it; different authority verifies linked support.

Expected result: Specific resolution becomes verified; original evidence remains; other gaps still affect overall readiness.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-018 — Wrong finding cannot close correction

Priority: P0 | Type: Negative

Prerequisites / data: Finality resolution with unrelated supporting separation evidence.

Steps: Attempt to link/verify unrelated or earlier assessment.

Expected result: Rejected or ineligible; no verified closure.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-019 — Repository catalogue

Priority: P1 | Type: Positive

Prerequisites / data: Operator configured exact repo ID and application; AUTHOR.

Steps: Open GitHub intake.

Expected result: Only authorized configured repositories appear; tokens and token variable names are absent.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-020 — Preview exact source

Priority: P0 | Type: Positive

Prerequisites / data: Open authorized PR and separately provisioned read credential.

Steps: Preview metadata; compare head/base/fork/title with source repository.

Expected result: Actor-bound expiring preview saved; no change, obligation or assurance result created.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-021 — Import new change

Priority: P0 | Type: Positive

Prerequisites / data: Current preview; valid human rationale.

Steps: Import to a new change; open source receipt and change.

Expected result: Exact observed head recorded, source provenance retained, change unassessed with no fabricated requirements/results.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-022 — PR head changes after preview

Priority: P0 | Type: Negative

Prerequisites / data: Authorized test repository; valid preview.

Steps: Advance PR head, then import the old preview.

Expected result: SOURCE_CHANGED; no partial imported change. A new preview is required.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-023 — Metadata/base/fork changes

Priority: P1 | Type: Negative

Prerequisites / data: Authorized isolated provider fixture or test repository.

Steps: Change selected metadata after preview and import.

Expected result: Changed fingerprint rejected rather than importing unreviewed context.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-024 — Expired preview

Priority: P1 | Type: Negative

Prerequisites / data: Five-minute preview expiry; controlled test clock only in fixtures.

Steps: Import after expiry.

Expected result: PREVIEW_EXPIRED; no workspace mutation.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-025 — Another author uses preview

Priority: P0 | Type: Negative

Prerequisites / data: Two named AUTHOR identities.

Steps: Author B submits Author A preview ID.

Expected result: Preview not accessible to B; no import.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-026 — Viewer/policy-only attempts intake

Priority: P0 | Type: Negative

Prerequisites / data: VIEWER or policy-only role.

Steps: Attempt preview/import via UI and authorized API client.

Expected result: Write denied; no provider request or workspace mutation by unauthorized role.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-027 — Unauthenticated/cross-origin import

Priority: P0 | Type: Negative

Prerequisites / data: Valid test session then missing session, wrong origin or CSRF.

Steps: Exercise protected intake mutation endpoints.

Expected result: 401/403; no import or privilege escalation.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-028 — Replay after uncertain response

Priority: P1 | Type: Positive

Prerequisites / data: Successfully imported preview; simulate lost response.

Steps: Repeat exact same request with same identity and choices.

Expected result: Same import/change/revision returned; no duplicate records.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-029 — Replay with different choices

Priority: P1 | Type: Negative

Prerequisites / data: Consumed preview.

Steps: Change target/copy/rationale on replay.

Expected result: IMPORT_CONFLICT; original receipt unaffected.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-030 — New PR head as new revision

Priority: P0 | Type: Positive

Prerequisites / data: Existing linked change with accepted obligations; later PR head; explicit latest revision selected.

Steps: Preview/import to same change with copying enabled.

Expected result: New revision created; copied non-rejected obligations are drafts; old acceptance/history remains only on prior revision.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-031 — Stale destination revision

Priority: P0 | Type: Negative

Prerequisites / data: Two operators; preview then another revision created.

Steps: Attempt import with earlier expectedRevisionId.

Expected result: REVISION_CONFLICT without overwriting newer work.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-032 — Different application/PR target

Priority: P0 | Type: Negative

Prerequisites / data: Existing change belongs to another app or is linked to a different PR.

Steps: Attempt to append imported revision.

Expected result: Binding conflict; no cross-application or cross-PR overwrite.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-033 — Untrusted PR text

Priority: P0 | Type: Negative

Prerequisites / data: PR title/body contain HTML and text requesting READY or executing code.

Steps: Preview/import/inspect receipt using protected test data.

Expected result: Text is escaped/context-only; no scripts run, requirements accepted, or readiness generated.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-034 — Provider denial, rate limit or malformed reply

Priority: P1 | Type: Negative

Prerequisites / data: Operator-controlled provider fixtures; do not deliberately overload GitHub.

Steps: Exercise inaccessible PR, invalid JSON, over-limit response, 429 and rate-limit 403.

Expected result: Safe errors; no import; persisted cooldown prevents immediate retries; no secret leakage.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-035 — Provider redirect

Priority: P0 | Type: Negative

Prerequisites / data: Controlled fixture returns redirect to another host/location.

Steps: Preview.

Expected result: Redirect refused for operator reauthorization; credential is not forwarded.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-036 — Tampered source receipt

Priority: P0 | Type: Negative

Prerequisites / data: Disposable DB only, operator backup.

Steps: Modify stored import snapshot without matching digest; read/replay.

Expected result: Integrity failure, not a trusted source receipt.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-037 — Cold-start persistence

Priority: P1 | Type: Positive

Prerequisites / data: Protected hosted preview and accepted new records.

Steps: Sign out/in, restart worker/application, retrieve receipts/assessments.

Expected result: Records persist; account revocation and permissions still apply across instances.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-038 — Permission segregation

Priority: P0 | Type: Negative

Prerequisites / data: Non-owner web/worker roles in isolated PostgreSQL.

Steps: Operator tests permitted import and prohibited evidence/history/source-receipt rewrite.

Expected result: Permitted actions succeed; prohibited writes denied; no owner-role shortcut.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-039 — Small-screen and keyboard workflow

Priority: P1 | Type: Positive

Prerequisites / data: Protected preview at 390px and desktop.

Steps: Navigate intake, mapping dialogs, evidence and resolution with keyboard; inspect errors.

Expected result: Readable layout, labelled controls, visible focus and no obscured essential actions; log accessibility defects rather than assume compliance.

Actual Result:

Pass/Fail:

Evidence / defect reference:

## I5-QE-040 — Migration and recovery

Priority: P0 | Type: Positive

Prerequisites / data: Authorized operator, isolated restored schema-4 database, valid backup.

Steps: Rehearse 005 twice; inspect earlier cases and restore to isolated recovery target.

Expected result: No loss or reinterpretation of earlier history; repeat migration safe; recovery demonstrated. No live reset or blind old-code downgrade.

Actual Result:

Pass/Fail:

Evidence / defect reference:

