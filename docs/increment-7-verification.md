# Increment 7 — implementation and verification record

Date: 18 November 2026. Version 0.8.0. Base: published Increment 6 commit
`0351da4c35de3de0c2c9ce4b1b36f4e5154f7015`. Additive schema 6.

This record describes source preparation and locally observed results. The GitHub Actions run
attached to the exact published final commit is authoritative for PostgreSQL and native-browser
execution. A previous successful run does not establish a later commit's result. Hosted acceptance,
live AI evaluation and independent QE remain separate from these engineering checks.

## Implementation

- Source-grounded drafting workbench with built-in explicit-clause extraction and an optional
  OpenAI Responses adapter. The built-in method is labelled rule-based, not AI discovery.
- Immutable-through-API source snapshots, generation identities, exact quotations and original
  suggestions, with separate human-edited decisions and linked candidate creation history.
- Actor-bound generation reservations and request replay; persisted expiry/failure recovery;
  bounded request rates; one active generation per actor; no automatic model retries or fallback.
- Atomic individual candidate creation, duplicate/replay handling, historical-revision checks,
  integrity validation and the existing independent authority-review workflow.
- Source-only provider payloads, explicit external-processing confirmation, fixed HTTPS endpoint,
  no tools or redirects, strict output/quote validation and sanitized failure handling.
- Guide, configuration-only Support diagnostics, safe diagnostic export and manual QE supplement.

Existing verification executables, evidence contracts and earlier SQL migration files are unchanged.
No new runtime dependency is introduced. Database maximum-schema guards now permit schema 6;
older published binaries reject it. Builds and hosted startup still do not migrate a database.

## Locally observed verification

On supported Node 22:

- `npm run selfcheck`: passed (package, lock and release identities agree).
- `npm run check`: **473 tests reported; 468 passed, 0 failed, 5 skipped**. The five skips are
  explicit missing-PostgreSQL suite sentinels. They are not treated as passed database tests.
- `npm run demo:assurance`: all three real local HTTP/separate-worker outcomes matched expected
  READY, NOT_READY and INDETERMINATE behaviour.
- `npm run demo:resolution`: nine real local HTTP/separate-worker journey checks passed.
- `npm run demo:generalization`: eight scenarios across the Node approval and Python/SQLite
  expense applications, plus the second-obligation correction journey, passed.
- New browser fixture JavaScript and browser/runner Python syntax checks passed. Native browser
  execution is required in CI; local restrictions were not bypassed or replaced with fetch mocks.

New focused coverage includes 26 generator/provider-contract tests, 34 persistence/workflow tests,
19 real HTTP tests, eight real PostgreSQL scenarios for CI, and 18 new native browser checks.
Provider fixtures are controlled protocol responses. No live provider account/model quality was
verified during source preparation. Synthetic reference faults remain explicitly synthetic.

The assurance integration test exercises an actual worker: generation and dismissal leave an
existing READY assessment current; creating a new candidate makes it STALE_INPUTS; reassessment
returns INDETERMINATE for the new unresolved scope. The original case and evidence digest remain
unchanged. This tests the new workflow's effect on assurance, not only its record shapes.

## Independent review findings resolved

1. A valid source at both the character and UTF-8 limits could exceed the shared 16 KiB JSON body
   limit after escaping and metadata. Generation now has a bounded 32 KiB envelope; source limits
   still apply and earlier mutation routes retain 16 KiB. Actual HTTP boundary tests cover both.
2. Case folding, Unicode compatibility normalization and internal whitespace collapsing could
   conflate materially different requirements, including password/identifier literals. Draft and
   candidate duplicate comparison now preserves exact statement text after outer trimming.
3. Provenance reads now verify the candidate's original PROPOSED history against its drafting
   decision while allowing normal later edits. Missing or damaged creation history fails integrity.

## Required CI and release gates

CI must execute all five PostgreSQL suites with `REQUIRE_POSTGRES=true`, the cumulative unit/HTTP
suite, all three reference commands, and all five genuine native browser suites. It must also
confirm generated public assets match canonical `web/` files. The new PostgreSQL suite covers
fresh connections, concurrent decision replay, duplicate scope, atomic actor/workspace limits,
migration preservation, genuine assurance invalidation, narrow grants and transaction rollback.

Use `increment-7-release-acceptance.md` for actual hosted migration/grants, HTTPS, cold starts,
persistence, worker compatibility, isolated restore and independent QE evidence. If AI is enabled,
record its actual model/provider validation and human evaluation of meaning and omissions.
Configuration and matching quotations alone do not establish those results.

The manual QE supplement contains **57 cases: 22 positive and 35 negative**. Actual Result and
Pass/Fail fields are intentionally blank. This document does not manufacture their execution.
