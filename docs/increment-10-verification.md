# Increment 10 — engineering verification record

Version 0.11.0, schema 7. Starting commit:
`1e67bd6f8536c10dddd3d986ad8d816477c7446f`.

## Verified starting point

The final Increment 9 [CI run 44341084511](https://github.com/mmronanki/qivvera/actions/runs/44341084511)
completed successfully for that exact commit. Its retained log reports 705 automated tests passed,
zero failed and zero skipped, with all seven native browser suites, three reference commands,
clean dependency installation and canonical public assets passing. The earlier pending-CI handover
is superseded by this observed result. Hosted acceptance and independent human QE were not supplied.

## Defects reproduced and addressed

1. **Omitted mandatory scope in a damaged frozen plan.** Two declared obligations could become one
   in the stored snapshot while its original digest column remained. The ordinary path could then
   return a current READY assessment. Shared validation now detects inconsistent membership/history,
   frozen scope and run/plan binding before reliance or execution.
2. **Expired work accepted after validation.** A clock crossing the queue deadline or worker lease
   during input validation could still reach the old final write. Conditional final SQL transitions
   now check the database clock; rejected evidence acceptance rolls back the insert.
3. **Wrong-record UI action after delayed reads.** An older resolution response could overwrite shared
   state after another record rendered. Dialogs could survive navigation and consult a later change.
   Route/session/generation guards and captured mutation identities now prevent that transfer.
4. **Test connection routing override.** The installed PostgreSQL URL parser honors query keys such
   as host even when the authority appears loopback. Every destructive suite and both release entry
   points now reject query options/fragments before connecting. Runtime connections accept only
   reviewed TLS compatibility parameters and remove them before passing the URL to the driver.

The damaged-record cases are corruption/recovery tests. No ordinary Author HTTP route was found
that can edit protected plan or evidence snapshots. Administrator tamper resistance is not claimed.

## New verification coverage

- Eighteen focused assurance integrity/lifecycle regressions, including healthy historical behavior.
- An authenticated HTTP case showing damaged assurance as unavailable while healthy changes remain
  usable, original evidence stays stored and strict assurance endpoints still reject the damage.
- PostgreSQL URL safety tests against the installed parser and actual release-command entry points.
- Operational preflight/redaction tests plus eleven mandatory real PostgreSQL cases covering narrow
  runtime roles, inherited/PUBLIC/SET-role/grant-option hazards, ownership, missing privileges,
  source-preserving restore, retained records/replay, coherent snapshots, database locale identity,
  refused existing destinations and corrupted migration history.
- A native navigation suite with nine checks. Actual response bodies remain held behind explicit
  fixture controls until the competing view/form/session is established. A same-document nonce and
  pending-response assertions prevent timing or accidental reloads from creating a false pass.

The operational checks use real PostgreSQL clients and application repositories. They do not
simulate successful backups or replace database acceptance with stubs. Browser fetch is not mocked.
The GitHub metadata used by the navigation fixture is synthetic and labelled as such.

## Pre-publication local evidence

The managed local runtime used Node 22.23.5 and pinned Playwright 1.62.0. The integrated local
automated run recorded 675 tests: **667 passed, zero failed, eight PostgreSQL sentinels skipped**.
Those skips mean local PostgreSQL verification was not performed; they are not database passes.
Targeted integrity, HTTP, configuration and operational-safety checks passed. Build/type checking,
canonical-asset generation, Python compilation and diff checks also passed.

Native Chromium launch on this computer was blocked by an OS socket restriction before assertions.
The local navigation report correctly records failure with zero browser checks. It is not a browser
acceptance result. No component rendering, screenshot or mock was substituted for the mandatory gate.

## Exact published-commit gate

The final branch is `increment10`, with automatic Vercel deployment held. Publication triggers CI,
which installs the locked dependencies, matching PostgreSQL 17 clients and pinned browser runtime,
then runs `npm run check:engineering` against that exact commit.

The authoritative result is the matching GitHub Actions run and its artifact:

- `engineering-verification.json`: per-gate outcomes and exact source/clean-tree qualification.
- `engineering-automated-and-postgresql.log`: executed totals; all eight database suites required.
- `browser-suites-report.json`: all eight native suite outcomes.
- `navigation-browser-report.json`: all nine deterministic navigation/race checks.
- `operations-permissions-report.json`: genuine narrow-role audit and exercised plan/claim.
- `operations-recovery-report.json`: genuine dump/restore, source preservation and reopened records.
- Existing reference, browser and synthetic evidence reports.

This source document does not predeclare a future CI result. Use the run matching the final commit,
and require `passed: true` together with `source.exactCommitVerified: true` in its engineering report.
A failed, blocked or omitted gate remains failed, blocked or unperformed.

## Boundaries and open acceptance

Published migrations, fixed profile/verification contracts and executable verifier bytes are unchanged.
Schema remains 7. Current branches and deployment holds are preserved. Source publication supplies
no live migration, secrets, paid resources or hosted deployment.

The synthetic recovery report excludes ownership/ACL restoration and actual hosted backup acceptance.
Its inspected locale/encoding must match the destination; incompatible defaults fail before creation.
Actual deployment credentials/permissions, HTTPS and persistence, hosted backup recovery, independent
human QE and customer acceptance remain in `increment-10-release-acceptance.md`. The broader product
capabilities still open in the Atlas remain explicit in `product-completion-status.md`.
