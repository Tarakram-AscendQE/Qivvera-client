# Increment 8 — implementation and verification record

Date: 18 November 2026. Version 0.9.0. Base: published Increment 7
`12042abb6d1f372a51c829aa12ff52655508d9c1`. Maximum supported database schema remains 6.

This record describes source preparation and locally observed results. The GitHub Actions run for
the exact published final commit is authoritative for the cumulative PostgreSQL and native-browser
gate. A previous successful commit does not establish a later commit's result. Hosted acceptance,
actual runtime permissions, recovery and independent QE remain separate evidence.

## Delivered implementation

- Authenticated **Impact & next checks** workbench and JSON read/export endpoints.
- Direct-parent revision comparison, exact content differences, validated copied-obligation lineage,
  complete selected scope and explicit declarations not carried forward.
- Read-only, explained authority/plan/target/assessment guidance and qualified historical mapping hints.
- Latest-assessment context with separate recorded and currently applicable dispositions, evidence
  integrity handling, observed expiry and explanations of changed assessment inputs.
- One shared database snapshot; no writes, worker calls, external requests or additional database pool.
- Protected review-mode qualification, safe target projection, session/navigation guards, exact displayed
  snapshot download, Guide and allowlisted Support capability.
- No new migration, runtime dependency, provider credential or hashed verifier/assurance contract changes.

## Locally observed results

On supported Node 22:

- `npm run selfcheck`: passed; package, lock and release identities agree.
- `npm run check`: **542 tests reported; 536 passed, 0 failed, 6 skipped**. The six skips are explicit
  missing-PostgreSQL suite sentinels, not successful database tests.
- `npm run demo:assurance`: all three real local HTTP/separate-worker outcomes matched READY,
  NOT_READY and INDETERMINATE expectations.
- `npm run demo:resolution`: nine real local HTTP/separate-worker journey checks passed.
- `npm run demo:generalization`: eight scenarios across the Node approval and Python/SQLite expense
  applications plus the second-obligation correction journey passed.
- New browser fixture starts at schema 6 with genuine completed worker evidence. JavaScript/Python
  syntax checks passed. Native browser execution remains a mandatory CI gate; local restrictions were
  not bypassed or replaced with simulated rendering.
- Canonical public assets match `web/` sources, and whitespace/diff checks passed.

New focused coverage comprises 47 backend regressions, 21 real HTTP tests, seven real PostgreSQL cases
and 17 native browser checks. After the last reader integrity change, the final focused suite reported
**69 tests: 68 passed, 0 failed, one explicit missing-PostgreSQL sentinel skipped**. Exact-commit CI
must execute the seven database cases that replace that sentinel.

The new PostgreSQL cases include a genuine SELECT-only database role and an intervening committed
scope change during a repeatable-read report. Native checks include genuine authenticated navigation,
copied/new/omitted declarations, no inherited pass, exact displayed export after a concurrent edit,
Viewer access, mobile layout, navigation/session races and actual revocation.

## Independent review findings resolved

1. **Missing scope membership:** counting and joining only workflow rows could silently omit an
   obligation if its workflow link was damaged. The reader now checks primary-record orphans and
   history-anchored revision membership, including the parent, and fails explicitly on inconsistency.
2. **Evidence investigation priority:** corrupt or missing completed evidence remains an investigation
   item even when scope has also changed. A generic recommendation to rerun cannot conceal it.
3. **Source identity explanation:** the exact source-reference field is included in assessment input
   differences. Recorded identity changes cannot disappear through a default comparison field list.
4. **Founder-review qualification:** the protected mode is included in the report, digest, UI and
   exported limitations. Guidance cannot imply independent approval in a mode that permits founder review.
5. **Large-report query count:** current and creation-history reads are batched. The supported 500-item
   boundary no longer produces approximately 1,500 serial history queries. A 501st item fails explicitly.
6. **Historical mapping wording:** a hint can differ from its originally mapped scope even when the
   latest parent and copied statements match. UI wording preserves those separate comparisons.

Additional checks validate plan/run identities, actual acceptance-history links, malformed snapshots,
target binding and database cleanup after invalid configuration. Earlier evidence, migration checksums
and published verification executable bytes remain unchanged.

## First CI observation and native-test correction

Run `44324194201` on commit `5739c82` executed **612 automated tests, all passed, zero skipped**, including
all six PostgreSQL suites. All three reference commands and five existing browser suites also passed.
The new impact browser suite completed its first 12 checks, then timed out in its mobile setup because
the helper waited for a new response while navigating to the already active hash URL.

The test now uses the real **Refresh impact report** control when revisiting that same URL. All original
response and product assertions remain; no timeout was relaxed and no application code was changed.
The amended commit requires a complete new CI run before engineering clearance. The first run alone
does not establish the remaining mobile, navigation-race or session-race outcomes.

## Publication and team acceptance

The source is prepared for branch `increment8`, preserving earlier branch heads and deployment holds.
CI must execute all six real PostgreSQL and all six native browser suites, the cumulative check, three
reference commands and canonical-asset verification. The run for the final published SHA supplies the
actual complete counts and downloadable evidence. This document does not predeclare its outcome.

The manual QE supplement contains **54 cases: 25 positive and 29 negative**. All Actual Result and
Pass/Fail fields are blank. Use `increment-8-release-acceptance.md` for the actual hosted release,
effective permissions, recovery and independent QE outcomes. This source publication does not deploy
the product or fill in those acceptance results.
