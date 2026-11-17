# Increment 5 — engineer handoff

## Source / publication
This candidate was newly implemented on the exact published Increment 4 tree f8ac45f8e5401f3d638fb73f0d30806eb710bbb1 at commit 9823421694671253c7f01f332c93e2a4cfdd9f19. The current conversation's GitHub tool inventory exposes repository reads, not write actions; no authenticated Git terminal is configured. Therefore the supplied local commit/bundle is NOT a published GitHub branch. Consult the distribution receipt for its actual local SHA. Preserve any subsequent team edits; do not force a patch, force-push, or overwrite the running branch.

Use the verified bundle/patch on a review branch in the existing repository. Inspect the commit, run checks, and push increment5 through the team's authorized Git workflow. Do not create another product/repository. No source credentials are needed from the founder.

## Read first
Read increment-5-contract.md. The scope is two explicit approval controls, two fixed adapters and inbound source metadata. Earlier implementation reports remain historical and are not results for this increment.

## Required checks
Node 22.16+ within Node 22. Python 3 is required only for reference target tests, not the Vercel application runtime.

    npm ci --ignore-scripts
    npm run selfcheck
    npm run check
    npm run demo:assurance
    npm run demo:resolution
    npm run demo:generalization

`npm run check:release` requires TEST_DATABASE_URL and all four actual PostgreSQL suites. Only an explicitly disposable loopback qivvera_test_* database is accepted. Tests DROP test tables; NEVER point them at the founder's data, provider copy or a customer environment. CI is configured on increment5 but has NOT run for this local source.

The new suites cover separate mappings, both HTTP adapters, caller permissions, counterevidence, missing/corrupt prior evidence, exact mapped correction, source preview/import/replay/concurrency/stale metadata, copied candidates and sanitized errors. GitHub provider responses are controlled in tests; local HTTP API tests are genuine, not a live GitHub integration claim.

Offline UI checks:

    node scripts/capture-generalization-ui.mjs
    python test/generalization-component-ui.py

These use captured actual local API records plus stubbed fetch for rendering. Native retained browser suites are test/browser-workflow.py, test/browser-assurance.py, test/browser-resolution.py. Execute those and the new manual QE journeys in a permitted engineering/browser environment; do not disable browser/network safeguards. Hosted HTTPS and cold-start acceptance are separate.

## Migration and permissions
Back up and restore to an isolated database first. Rehearse migration 005 against the actual schema-4 data shape. `npm run migrate` applies 002–005 with checksums using the authorized migration role. Builds and hosted requests do NOT migrate. Existing SQL migrations are unchanged. New tables are source_previews, source_imports and source_backoff. Source import atomically creates the same workflow records as manual intake.

Review ops/intake-permissions.sql, existing workflow grants and provider restrictions. The web role must not be database owner and must not gain UPDATE/DELETE on source_imports, assurance_evidence, obligation_history or resolution_history. The separate worker needs no new source-table writes. Runtime roles need schema-version reads. Test inherited privileges; a SQL template is not evidence of actual isolation.

Earlier schema-4 binaries are not a rollback path for schema 5. Prefer roll-forward; a reviewed downgrade requires an isolated restored database with new records retained separately.

## Configuration
Preserve the existing Vercel/PostgreSQL/identity/worker settings. Set QIVVERA_GENERALIZATION_ENABLED=true on BOTH web application and worker after schema 5. Keep QIVVERA_ASSURANCE_ENABLED=true. Resolution retains QIVVERA_RESOLUTION_ENABLED=true. Old single-mapping plans remain supported. Protected target catalogue may specify adapterId=approval-v1 or expense-v1; each entry still pins application/source/artifact/environment/instance/test-only and secret-reference names. Do not change the target binding merely to make a failed assessment pass.

For source intake set QIVVERA_GITHUB_INTAKE_ENABLED=true and QIVVERA_GITHUB_REPOSITORIES_JSON using config/github-repositories.example.json as a shape only. Replace example owner, repo, numeric repository ID and registered application UUID; provision the named token in secrets, with only needed PR-read access. This is a PRODUCT credential, separate from ChatGPT's repository connection. Never place its value in Git, exports or the browser. Disable the feature if no authorized repository is available; it must not display fake successful integration.

The app only reads open PR metadata. Live acceptance must check the configured numeric repository identity, permissions, correct head/base/fork, head movement between preview/import, rate-limit messages and credential rotation. It does not execute source code or post checks/statuses.

The Node and Python reference applications are synthetic fixtures. Run only in isolated local/test conditions. Hosted use requires a reviewed controlled target exposed according to the existing allowed-network policy. No new paid infrastructure or automatic deployment is assumed.

## Founder/QE preview
A different Policy Authority accepts two relevant obligations and approves their distinct mappings. Run both; inspect separate support and violation. Show that an unmapped/candidate gap prevents READY. Repeat on the expense adapter without changing core rules. Correct the second finding on a new source/artifact and verify it with fresh evidence and a different authority. Preserve the old case.

As AUTHOR preview a real authorized GitHub PR, inspect exact source data, import context, and confirm no obligations/results are fabricated. Advance the PR head and show stale preview rejection. Import it as an explicit new revision with draft copies. Record exact deployed commit, migrations, runtime identities, native-browser results, provider checks, recovery and QE findings.

Git deployment settings preserve increment3=true and increment4=false; increment5=false prevents an unreviewed branch-triggered rollout through this file. Check external hooks separately. Enable the team's approved delivery path only after acceptance. Give the founder a link and user journey, not installation work.

## Primary integration references
GitHub REST pull metadata: https://docs.github.com/en/rest/pulls/pulls
GitHub REST best practices: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
Current implementation sends X-GitHub-Api-Version: 2026-03-10. Revalidate supported provider API/version in the deployment environment.
