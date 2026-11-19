# Increment 9 — implementation and verification record

Date: 18 November 2026. Version 0.10.0. Base: verified Increment 8
`60153c714cf0b97794166c069dd59f1ff284ff62`. Maximum supported database schema: 7.

This record describes the implementation, review and locally observed results. The GitHub Actions
run for the exact published final commit supplies the cumulative PostgreSQL and native-browser
result. A successful predecessor does not establish a later commit's result. Hosted acceptance,
actual deployment permissions, recovery and independent QE remain separate evidence.

## Delivered functionality

- An authenticated **Verification templates** catalogue, immutable version inspection, exact displayed
  snapshot download and archive lifecycle.
- Policy Authority capture from a current approved version-2 verification plan, preserving the source
  plan identity/digest, exact mapped requirements, original acceptance decisions, mapping reasons,
  supported check/profile/verifier identities and review-mode qualification.
- Fresh use on a current destination revision, requiring deliberate distinct accepted-obligation
  mappings, an appropriate current target using the same adapter, new reasons and approval.
- Atomic template-use provenance alongside the new plan and activity. All non-rejected obligations
  stay mandatory; no source approval, evidence, passing result or counterexample resolution transfers.
- Latest-active-version restrictions for new use; older versions and archived preparation remain
  inspectable without rewriting already approved plans or their evidence.
- Actor-bound retry receipts, stale-input rejection, shared request-key conflict checks, transactional
  rollback, session/navigation guards and explicit uncertain-response recovery.
- Additive schema 7, reviewed narrow web grants, protected default-off enablement and no new worker
  privilege, external provider, credential or runtime dependency.

This is a bounded preparation-reuse slice of the roadmap. It does not implement arbitrary editable
assurance profiles, a new verification language, automatic semantic matching or reduced mandatory
execution scope. The two existing supported check types and fixed adapters remain the boundary.

## Local verification observed

On supported Node 22:

- `npm run selfcheck`: passed; package, lock and release identities agree.
- `npm run check`: **626 tests reported; 619 passed, 0 failed, 7 skipped**. The seven skipped tests
  are explicit missing-PostgreSQL suite sentinels. They are not successful database executions.
- `npm run demo:assurance`: all three real HTTP/separate-worker outcomes matched READY,
  NOT_READY and INDETERMINATE expectations.
- `npm run demo:resolution`: nine real HTTP/separate-worker journey checks passed.
- `npm run demo:generalization`: eight scenarios across the Node approval and Python/SQLite expense
  applications plus the second-obligation correction journey passed.
- The schema-7 browser fixture starts with genuine authenticated HTTP, approved plans and durable
  records. JavaScript/Python syntax checks pass. Native execution remains a mandatory CI gate;
  local browser restrictions were not bypassed or replaced with simulated rendering.
- Canonical public assets were synchronized after the final Support integration change. Earlier
  migrations, published verifiers and hash-bearing assurance contracts remain unchanged.

New focused coverage comprises **49 backend tests, 31 real HTTP cases, 3 configuration cases,
10 real PostgreSQL cases and 18 native browser checks**. Local cumulative execution includes the
83 non-PostgreSQL automated cases. CI must execute the 10 new PostgreSQL cases and all earlier
database suites, as well as the complete native journeys.

The initial cumulative run found two old exact-object Support expectations missing the new
`manageVerificationTemplates` field. Those expectations now require its explicit false value when
the feature is disabled. The authenticated template HTTP case also checks enabled capability,
required schema 7 and exact role permission. The repeated full run produced the green totals above.

## Material behaviors tested

Backend cases execute a template-approved plan through the real HTTP verifier and preserve earlier
counterexamples. A separate worker process executes against schema 7 with template access disabled.
An additional unresolved mandatory requirement still yields INDETERMINATE; original evidence is
unchanged by saving, using or archiving templates.

Negative cases cover role/Origin/CSRF restrictions, malformed and oversized bodies, Unicode limits,
unsupported or duplicate queries, current source/target/scope binding, exact supported check sets,
original acceptance history, corrupt snapshots/membership, missing receipt anchors, stale template
versions, archived families, and request-key replay conflicts across management and plan approval.

Resource tests use a real 500-obligation source and successive distinct approved source plans. A
version that would exceed the 16 MiB aggregate context budget rolls back completely; the surviving
family remains readable and can be archived. An oversized corrupt body is rejected before loading
its full contents. Catalogue provenance reads use at most 11 batched database calls within the
supported bounds, instead of a query per source mapping/version.

The PostgreSQL cases require genuine persistence across connections, concurrent save/version/use/
archive operations, coherent reads across an intervening commit, cumulative migration preservation,
real non-owner privileges, rollback on denied audit insertion, worker isolation and corrupt receipts.
The source review of these cases is complete; their actual execution is established only by CI.

The new native journey uses real authentication and disposable schema-7 persistence. It covers
Support export, empty catalogue, save/inspect/download, literal hostile-looking text, blank fresh
mapping inputs, distinct obligations, a genuinely lost successful reply, exact replay, full mandatory
scope, version history, archive, concurrent Author changes, historical revisions, Viewer restrictions,
390px layout, navigation/session races and real session revocation. It does not fabricate fetch
responses, execute a browser-side verifier or claim hosted acceptance.

## Review findings resolved

1. **History query fan-out:** source plans, revisions, decisions and memberships are now batch loaded.
   Full history is checked rather than truncated.
2. **History memory bounds:** the database checks aggregate serialized byte sizes before loading
   version/source/archive bodies. Large catalogue reads retry only read operations with page sizes
   20, 5 and 1 and visible pagination. Creation/versioning reserve archive-receipt headroom; a final
   archive size check rolls back the entire archive if necessary.
3. **Source integrity classification:** malformed saved source snapshots fail as provenance integrity
   errors, while a well-formed legacy version-1 plan is explicitly unsupported for template capture.
4. **Cross-action retries:** management and use receipts share actor/request-key conflict detection
   under the template lock. A request identifier cannot silently identify a different action.
5. **Original decision visibility:** source acceptance records show their actual reviewer, reason and
   recorded separation qualification. The current workspace mode cannot invent earlier independence.
6. **Source-link precision:** the UI names its link **Open source revision** and explains that the
   revision may now have a different latest plan. The exact captured plan ID/version/digest remain
   visible; the link does not claim to open an arbitrary original historical plan screen.
7. **Worker separation:** shared template enablement cannot grant the standalone worker template
   functionality. Its repository explicitly disables preparation access.
8. **Support integration:** capability, role action and safe export allowlists include the new feature.

Five delayed-response waits in existing browser tests now wait for the genuine response body rather
than the pinned Playwright response-finished cleanup path. Navigation/session assertions and delays
remain intact. The earlier successful CI runs contained cleanup `Target closed` noise; disappearance
of that noise must be observed in the new native CI logs, not assumed from this code change.

## First CI observation and native navigation correction

Run `44338008690` on commit `263a424` executed **705 automated tests, all passed, zero skipped**.
All seven PostgreSQL suites genuinely executed, comprising 86 cases, including the 10 new template
cases. All three reference commands and the six earlier native browser suites also passed; those
earlier native suites completed 84 checks. Their modified delayed-response tests produced none of
the earlier response-finished cleanup warnings.

The new template browser suite completed its first 11 checks, then failed the historical-revision
assertion. After a genuine second user created a revision, the helper navigated to the already
active hash URL. That did not request a fresh mapping view; the assertion still inspected the
previous scope-conflict form. The real **Reload approval inputs** control was present on that form.

The helper now clicks that existing control when revisiting the same URL, waits for the genuine
template response, verifies its exact version identity and consumes the response body before the
existing UI assertions. Different-URL navigation is preserved. No application code, assertion or
timeout was relaxed. The remaining seven native checks and canonical-asset check were not established
by the first run. Its final log also contained runner shutdown warnings; the outer runner's lifecycle
was subsequently isolated as described below. The corrected commit required a complete new CI run.

## Complete second CI result and runner lifecycle correction

Run `44339521210` on commit `4c3e2e4` completed successfully: **705 automated tests passed, zero
failed, zero skipped**, including all seven PostgreSQL suites and their 86 cases. All three reference
commands passed. All seven native browser suites completed **102 checks**, including all 18 template
checks, and the canonical-asset check passed. The retained artifact digest was verified, and its
desktop and 390px mobile template screenshots were inspected.

Every individual browser-suite runner log was free of target-close or unfinished-task warnings.
The final job log still reported a pending initialization task after the outer runner printed its
successful aggregate report. The outer runner had opened a short synchronous Playwright connection
only to read the cached Chromium executable path, then stopped it before initialization completed.
This warning was test-tool cleanup, not an application-page error or a failed product assertion.

An isolated local reproduction with the pinned Playwright version produced the same warning in
three of three synchronous path probes. Three equivalent asynchronous probes returned the same
executable path with empty stderr. The runner now obtains that path with `async_playwright` under
`asyncio.run`, allowing initialization and shutdown to complete. Its existing executable override,
bundled/system fallback, child suites, timeouts and assertions are unchanged. Syntax verification
and an isolated subprocess running the exact final resolver also passed with empty stderr. No
browser was launched for this resolver-only check.

The lifecycle correction requires a new full CI run on its final commit. The run associated with
that exact SHA remains authoritative; the successful second run alone does not certify a later tree.

## Publication and acceptance

Publish to `increment9` directly from the verified Increment 8 baseline and preserve earlier branch
heads and deployment holds. CI must run the clean install, cumulative release check with all seven
PostgreSQL suites, all three reference commands, all seven native browser suites and asset sync check.
Use the run for the final exact commit and its retained synthetic reports/screenshots as evidence.
This document does not predeclare that future run's outcome.

The manual QE supplement contains **62 cases: 27 positive and 35 negative**. All Actual Result and
Pass/Fail fields are blank. Use `increment-9-engineer.md` for migration/configuration/recovery handoff
and `increment-9-release-acceptance.md` for exact hosted identity, actual effective grants, HTTPS,
separate-worker execution, persistence, recovery and independent acceptance.

Source publication does not deploy, migrate a live database, provision secrets or fill in QE results.
Optional live AI drafting quality from Increment 7 remains a separate acceptance gate if enabled.
