# Increment 4 — engineering and deployment handoff

## Baseline and publication status
Source baseline: increment3 commit f91f10807017b3ba4f7165f5c9546b3706254234, tree be37f465bbdc3c233a0077c880845a6689c63e47. The complete downloaded snapshot was reconstructed and its Git tree matched exactly before modifications. This session's GitHub branch read returned 404; no current team changes or remote write capability were assumed. No GitHub commit, remote CI, deployment, live migration or external account change was performed.

The founder reports that Increment 3 deployment succeeded. Do not undo that deployment or restart the project. Compare the actual deployed/accepted revision against this baseline. If the team changed it, reconcile through normal review; do not force the patch or replace the repository. The complete-source snapshot is for inspection; the guarded overlay/patch is the preferred integration path.

## Integrate and test
Work on a separate review branch. Inspect docs/increment-4-contract.md, the diff, migrations and tests. The included helper checks a clean worktree and exact baseline; defaults to a dry run; never commits, pushes, deploys or touches a database. Its strict refusal on a newer revision is intentional. Commit accepted changes to increment4 through your authorized Git workflow, preserving team changes.

Use Node 22.16+ within Node 22. Run:

    npm ci --ignore-scripts
    npm run selfcheck
    npm run check
    npm run demo:assurance
    npm run demo:resolution

For release, TEST_DATABASE_URL must be an isolated loopback database named qivvera_test_<suffix>. npm run check:release requires the retained two PostgreSQL suites AND test/resolution-postgres.test.mjs. The tests reset tables and reject remote hosts; never point them at working/staging customer records. CI is configured to run these tests on an ephemeral PostgreSQL 17 service on increment4 pushes/PRs. This is a proposed workflow, not an executed remote result for the new code.

Run test/browser-workflow.py, test/browser-assurance.py and test/browser-resolution.py in a permitted engineering browser environment. New native browser navigation was blocked here by ERR_BLOCKED_BY_ADMINISTRATOR. Do not disable network/browser controls as a workaround. The separate offline component test is not a replacement. Native HTTPS/Vercel acceptance and the provider deployment remain separate from local HTTP tests.

## Migrate safely
Back up the actual database and demonstrate restoration into an isolated target. Rehearse migration 004 against a safe copy of the real schema-3 database. Run npm run migrate with the authorized migration identity; it applies 002/003/004 idempotently with checksums. Neither builds nor ordinary hosted requests run migrations.

Review ops/resolution-permissions.sql. The non-owner web role needs SELECT/INSERT/UPDATE on the new items/challenges and SELECT/INSERT on resolution_history, plus existing workflow/read permissions. It must not gain evidence writes or history-update/delete privileges. The worker needs no resolution-table writes. Verify inherited/owner grants rather than trusting the template. Deployment-side segregation is not established by local tests.

Earlier binaries reject newer schemas. Do not revert to old code writing into schema 4. Prefer roll-forward; a reviewed downgrade requires isolated restoration of the earlier database while retaining new resolution data. An application rollback alone is not database recovery.

## Enable the feature
Existing Vercel, PostgreSQL, named accounts, worker and target configuration are retained. Add QIVVERA_RESOLUTION_ENABLED=true after migration and preview checks. This requires QIVVERA_ASSURANCE_ENABLED=true. With the resolution feature disabled, retained workflows and assurance still operate; new routes and navigation are absent. Named authorities/authors come from existing secure account configuration; no new password defaults exist.

Source-controlled Git deployment holds remain for increments, increment2, increment3 and the new increment4 review branch. These do not prove that every external hook is disabled. Your team may enable the approved deployment path after the migration, configuration and release checks; the package must not trigger an unreviewed rollout.

## Founder/QE acceptance
1. Use an actual synthetic failing assessment to create a resolution, with a named owner and action plan.
2. Start work; optionally challenge the finding and get a different authority's recorded response. Original evidence remains unchanged.
3. Register the corrected revision with copied obligations; obtain fresh requirement acceptance and a plan. Link that exact correction to the resolution BEFORE requesting its reassessment.
4. Run assurance through the existing worker. Link its run. Confirm that queued/failed/cancelled or stale results cannot verify the resolution.
5. A different Policy Authority verifies a supported correction with a reason. Inspect the original NOT_READY and corrected assessment side by side.
6. Show an individual correction can be resolved while another obligation still prevents overall READY.
7. Change inputs/new revision or collect a later assessment; current resolution becomes REASSESSMENT_REQUIRED without rewriting history. Reopen when further work is needed.
8. Export/reload/cold-start the case. Test revocation, origin and CSRF checks, concurrency, exact deployed SHA and recovery. Do failure/altered-evidence tests only in disposable isolated environments.

The baseline 253-case QE suite remains applicable except where the new capability adds routes/screens. The Increment 4 supplement adds focused positive/negative cases; Actual Result and Pass/Fail stay blank for QE execution. Do not reuse past green results as evidence for this new deployed revision.

## Intentional limitations
No requirement-supersession or exception/waiver workflow. A changed requirement or verifier cannot be declared a verified fix of the original claim. No external ticket write, notification or automatic remediation. No new infrastructure was provisioned. The founder should receive the preview link, deployed revision, release note and a short acceptance journey—not installation commands.
