# Increment 6 — implementation and verification record

Prepared on 18 November 2026 for version 0.7.0, from published Increment 5 commit
`c54e83ac506746bce7233520a2c40d76cece720b`. Source implementation and release acceptance are
recorded separately. The CI run attached to the published commit is authoritative for that run's
outcome; this preparation record does not predeclare a passing remote pipeline.

## Source baseline

The saved Increment 5 package was recovered and all 145 tracked source files were checked against
its SHA-256/blob manifest. Its tree `af0b423f5fcac77b1cfcfcb76abe6aaf2f00b364` matches the
published Increment 5 commit. The exact published commit object was reconstructed and verified
for the isolated checkout. Its earlier ancestry was not reconstructed; the checkout is shallow at
that known commit. Publication must use that actual published commit as parent, not the earlier
local-package commit `5b361f7`.

The repository's existing branch heads were read before work. The prior Increment 5 pipeline was
observed successful; those results establish only its baseline, not this increment's outcome.

## Implementation

- Role-aware first-use guidance and contextual next steps without mutation or assurance shortcuts.
- Product Guide with the supported two-control boundary, roles, terminology, history and recovery.
- Safe authenticated Support diagnostics with a local allowlisted JSON download and request reference.
- Clear network, conflicting-save, lost-response and session-expiry handling. Prior-session responses
  and hidden dialogs are discarded. Viewer controls agree with server write restrictions.
- Shared product version 0.7.0, required guide asset copying/serving, and current operator documentation.
- Native browser journeys added to CI with a non-skippable runner and pinned test-only dependencies.

Schema remains 5; existing SQL migration and verification executable bytes are unchanged. No new
runtime dependency, provider credential, paid resource, live migration or deployment is introduced.

## Local execution evidence

The supported Node 22.23.5 runtime was used for the product checks. A fresh `npm ci --ignore-scripts`
completed using the lockfile. Manifest/version consistency, syntax, TypeScript checking and builds
completed successfully.

The cumulative `npm run check` run reported **393 tests: 389 passed, 0 failed, 4 skipped**. The four
skips are the explicit PostgreSQL-suite sentinels because this local execution environment has no
disposable PostgreSQL service. They are not database passes. The remote release gate requires all
four real PostgreSQL suites and includes one new SELECT-only-role diagnostic test.

The new support suite contributes **22 passing real-HTTP tests**, including unauthenticated and
forged-session denial, role hints, secret/configuration exclusion, no provider calls, no stored-record
writes, fixed error messages, schema conditions, query/mutation denial, logout and version consistency.
These are included in the 389; they are not additional tests to add again.

All retained executable reference journeys completed:

- Three approval-separation outcomes through actual HTTP and a separate worker process.
- Nine resolution journey checks, including fresh correction evidence and preserved original results.
- Eight two-check scenarios across the Node approval and independent Python/SQLite expense targets,
  plus the correction journey for the specifically mapped second obligation.

These are synthetic local test applications and SQLite stores. GitHub provider contract tests use
controlled responses. They do not establish a live product GitHub connection or customer validation.

## Browser execution

The new first-use browser suite starts the real schema-5 fixture, but the local Chromium process is
blocked by the environment's socket permission restriction. It exits nonzero and records the blocked
phase; **zero native browser assertions are claimed from that local attempt**. No browser/network
protection was disabled. The CI browser gate runs in the repository's normal test environment.

`test/run-browser-suites.py` runs retained registry/review, assurance and resolution journeys, followed
by `first-release-browser.py`. The latter covers real authentication and writes, Guide, native Support
download, roles, escaping, current/history semantics, mobile width, actual revoked sessions and delayed
responses across logout/login. Test-server transport delays and malformed error bodies are explicitly
labelled; no browser-side fetch stubs replace the application. Missing execution or failure blocks CI.

CI's native local HTTP/SQLite journeys are separate from native hosted HTTPS/PostgreSQL acceptance.
The exact commit's workflow and retained synthetic reports provide its result after publication.

## Independent review and manual execution

The first published candidate, `351c4f06a01c32e3da5cb1da49f49b3582a4a671`, ran in
[CI 44311596399](https://github.com/mmronanki/qivvera/actions/runs/44311596399).
Its cumulative release gate passed **450 tests, 0 failures, 0 skips**, including the new
SELECT-only PostgreSQL support check; all reference journeys passed. Native registry/review
(12 checks) and assurance (4 checks) passed. The retained resolution browser test then failed at
its exact sign-in-button selector, which did not include the visible arrow. This was a failing
pipeline, not completed browser acceptance. The selector was corrected, the browser runner now
reports every journey independently, and CI pins Python 3.12 to the documented browser runtime.
The subsequent exact-commit pipeline must establish the final cumulative outcome.

An independent source review identified invalid-body 401 handling and delayed-response/session
races. Those findings were fixed before publication; regression cases are in the native suite.
The review also found an expired-session Sign out path and delayed module navigation handling,
which received focused fixes and coverage.

`increment-6-qe.md` contains **28 new manual cases: 13 positive and 15 negative**, with Actual Result
and Pass/Fail left empty. They supplement the prior increment suites. Authored cases are not executed
QE results. Hosted acceptance and user onboarding evidence are captured using the separate unfilled
release acceptance record.

## Remaining release evidence

Required before controlled early access: exact hosted commit and configuration, actual migration and
effective grants where needed, worker compatibility/operation, live authorized GitHub product checks
where included, hosted HTTPS/mobile/cold-start/persistence behavior, isolated restore/recovery,
independent QE and named release decisions. Support explicitly leaves these checks unevaluated.

Remote source publication is verified by reading the new branch and comparing its tree to the local
reviewed tree. Preserve all existing branch heads and `increment3`'s deployment setting. The new
`increment6` automatic Git-deployment flag remains false for the team's controlled rollout.
