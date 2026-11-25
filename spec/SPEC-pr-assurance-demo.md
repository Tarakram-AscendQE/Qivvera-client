# Spec: pr-assurance-demo — V1

Status: approved by the user 2026-11-25. Amended the same day with the user's answers: the team's tests
run in the same job; Author and Policy Authority may evaluate; the user runs the migration on Neon; the
**GitHub token lives in an environment variable for now** (entering it in the UI is deferred); the
workflow goes into prcheck-verifiers; I start the spike runs with this machine's GitHub login.

## Objective

Demo on **Friday 2026-11-27** for **investors and SMEs**. A senior opens the **deployed Qivvera URL**
(Vercel + Neon PostgreSQL) and, using clicks only, shows Qivvera assessing three real pull requests of
the VendorPay reference application against fixed business rules. Qivvera finds the gaps, then
confirms the developer's fixes: **2 broken rules → 1 → 0**.

The tests **really run** on every click. The inputs are fixed ("static data"): the same three PRs, the
same rules and the same 14 tests, so every run gives the same result.

### Sources (public GitHub organisation `prcheck-live`)

| Repository | Role in the demo |
|---|---|
| `vendorpay-app` | The developer's repository. PR **#6** `af51c26` (v1-initial), PR **#7** `ae50deb` (v2-partial-fix), PR **#8** `b62db00` (v3-approved; same code as `3f6e20d`) |
| `vendorpay-policies` @ `e408884` | The rules: 6 policies, 14 obligations, profile `payments-critical`, verifier catalogue |
| `prcheck-verifiers` | Qivvera's 14 independent checks (V1–V5, Playwright). The VendorPay team cannot edit them |

### User stories

0. Before the demo, the deployer puts a GitHub fine-grained token into the Vercel environment variable
   `QIVVERA_PR_ASSURANCE_GITHUB_TOKEN`. The page shows only whether a token is configured.
1. As the presenter, I open **PR assurance** and see VendorPay, change VP-184 and its three PRs,
   imported from GitHub with the configured token (title, branch, exact head commit, link).
2. I click **Evaluate** on a PR. The 14 checks run for real on GitHub Actions against that PR's exact
   commit. While they run I see live progress: the stages, then each check turning ✅ or ❌.
   One evaluation takes about 2–3 minutes.
3. When it finishes, I see the **report** for that PR (contents below).
4. I see the **progression** across the three PRs: a timeline (`#6 🔴 2 → #7 🟠 1 → #8 🟢 0`) and a
   table of all 14 obligations × 3 PRs, with a "now supported" marker.
5. Earlier runs stay in the PR's **history** with their real date and time. A later pass never hides
   an earlier failure.

### Expected results (measured in the verifiers repo; live runs must reproduce them)

| PR | Team's own tests | Broken rules (= gaps) | Violated obligations | Disposition |
|---|---|---|---|---|
| #6 | 25/25 pass | FIN-001, FIN-002 | FIN-001.1, FIN-002.1, FIN-002.3 | NOT READY |
| #7 | 26/26 pass | FIN-002 | FIN-002.1, FIN-002.3 | NOT READY |
| #8 | 29/29 pass | none | none | READY |

**A gap is a broken rule** (a policy with at least one VIOLATED or otherwise unproven obligation). The
report always lists the obligations and checks under each broken rule, so nothing is hidden.

### Report contents (one per run)

1. **Result:** the disposition and one line, e.g. "NOT READY · 2 rules broken · 11 of 14 obligations supported".
1a. **Team's tests on this commit:** e.g. "25/25 passed", measured in the same run. Shown as context
   only; they never affect the verdict.
2. **Since the previous PR:** rules fixed, still broken, newly broken.
3. **One card per broken rule:** rule id, title, owner, severity. For each failing obligation: the
   statement, the check that produced the evidence and what it does, expected vs observed (from the
   evidence), what would resolve it, and "a violation cannot be waived by an exception".
4. **All 14 obligations** with their state (collapsed by default).
5. **Proof:** PR number and exact head commit, rules commit `e408884` and snapshot digest, verifier
   commit, evidence SHA-256, link to the GitHub Actions run, start and finish time.
6. **Scope:** "Only these 14 obligations were checked. This is not a release approval. A SHA-256 shows
   the stored record is unchanged; it is not a signature."

## How it works

```
Presenter clicks "Evaluate PR #6"            (browser → Qivvera on Vercel)
   │  Qivvera stores a QUEUED run and starts the fixed workflow in prcheck-verifiers
   │  (GitHub API, with the token from the Vercel environment variable)
   ▼
GitHub Actions (fresh machine)               (workflow: qivvera-pr-assessment.yml)
   1. checks out prcheck-verifiers and vendorpay-app at the PR's exact commit
   2. starts VendorPay with its own throwaway PostgreSQL (service container),
      GIT_SHA = the PR's short commit, application log to a file (needed by V4/logs-masked)
   3. runs the 14 checks: evidence reporter (unchanged) + a small progress reporter
   3b. runs the team's own tests from vendorpay-app against the same app (context only)
   4. writes progress and finally the evidence JSON (~9 KB) and the team-test totals into a GitHub check run
      named "qivvera-evidence <correlation id>" in prcheck-verifiers (job token, checks: write)
   ▼
While the run page is open, the browser asks Qivvera to sync every ~2 s; Qivvera asks GitHub
   (run status → check run), stores new progress, and when the run is complete:
   checks the evidence (SHA-256, kind, expected commit = PR head, environment confirmed),
   stores it, derives obligation states → rule results → disposition, and shows the report
```

Why this design (decided with the user on 2026-11-25):
- The senior uses the deployed URL, not this laptop, so tests run on GitHub Actions: no machine to host.
- **The Neon password stays only in Vercel.** GitHub never touches the database.
- The evidence is read from a check run because Qivvera never follows redirects (an artifact download
  is a redirect to a storage host). Network calls go only to `api.github.com`, with fixed paths.
- Like myVega's runner, the machine that runs the tests only runs one fixed job. The browser never
  sends a URL, repository, command or commit: Qivvera uses the head commit it imported itself.

### GitHub token (environment variable, for now)

- `QIVVERA_PR_ASSURANCE_GITHUB_TOKEN`: set in Vercel by the deployer, and in the git-ignored
  `.env.local` for local runs. Qivvera's existing GitHub import reads its token the same way.
- Fine-grained token, prcheck-live repositories only: vendorpay-app (Contents and Pull requests: read);
  prcheck-verifiers (Actions: read and write, Checks: read, Contents: read).
- No API response, log or error ever contains it. The page shows only "GitHub token: configured / not
  configured"; if a call fails for lack of permission, the message names the missing permission.
- Entering the token in the UI (stored encrypted) is deferred; see Out of Scope.

### The rules snapshot (static)

`fixtures/pr-assurance/vendorpay-policies-e408884.json`: generated once from `vendorpay-policies` at
commit `e408884` (6 policies, 14 obligations with their checks, profile `payments-critical`, verifier
catalogue), with each source file's SHA-256, the commit, and a digest of the whole snapshot. It is
checked into this repository; changing the rules means generating a new snapshot by pull request.

### Decision logic (pure functions, ported from the verifiers/policies repositories)

- Check result → obligation state, as the verifiers repository defines it: passed → SUPPORTED; failed in
  an assertion → VIOLATED; failed while arranging data or skipped → NOT_ASSESSED; any check when V1 did
  not pass → NOT_ASSESSED; an obligation with no check result → INSUFFICIENT.
- Obligation states → disposition by the `payments-critical` profile, first match wins:
  NOT_ASSESSED on a critical policy → INDETERMINATE; any VIOLATED or CONFLICTED → NOT_READY;
  INSUFFICIENT → NOT_READY (no exceptions exist in this demo); all SUPPORTED → READY.
- Rule (policy) result: broken if any of its obligations is not SUPPORTED.

## Tech Stack

Unchanged: Node `>=22.16 <23`, TypeScript 5.8 strict, Express 5 (`backend/api`), PostgreSQL 17
(Neon when hosted), React 19 + Vite + TanStack Query, Vitest, Node's test runner, native browser suites
(Python + Playwright, pinned test-only tools). **No new runtime dependencies.** Evidence arrives as text
in the check run, so no zip library is needed.

GitHub side: GitHub Actions on `ubuntu-latest`, Node 22, `postgres:16-alpine` service (as in
vendorpay-app's `ci.yml`), `@playwright/test` already pinned by prcheck-verifiers.

## Commands

```
npm run check                                      # syntax + typecheck + all tests (PostgreSQL in Docker)
npm test                                           # build + frontend + backend tests
npm run test:frontend                              # Vitest only
npm run test:postgres                              # PostgreSQL suites (the new one is added to this list)
PATH=<node22>:<.venv-browser>/bin:$PATH npm run test:browser   # native browser suites (Node 22 + .venv-browser)
npm run migrate                                    # deployer only: also applies the PR assurance add-on tables on Neon
```

## Project Structure (new and changed files)

```
backend/scripts/migrate.mjs                        # also applies the add-on tables (own ledger; workspace schema stays 8)
backend/server/pr-assurance/
  config.mjs                                       # env: enabled flag + token; fixed scenario
  github.mjs                                       # fixed-path GitHub calls: read PR, dispatch, find run, read check run
  repository.mjs                                   # PostgreSQL: import PR, create run, record progress, store evidence
  schema.sql                                       # add-on tables: pulls, runs, run events (+ history triggers)
  migration.mjs                                    # applies schema.sql, recorded in its own pr_assurance_migrations ledger
backend/core/pr-assurance.ts                       # pure: evidence check, obligation states, rules, disposition, delta
backend/api/endpoints/pr-assurance/*.ts            # one endpoint per file, listed in backend/api/routes.ts
fixtures/pr-assurance/vendorpay-policies-e408884.json   # rules snapshot (static)
fixtures/pr-assurance/evidence/{af51c26,ae50deb,3f6e20d}.json  # recorded evidence, for tests only
frontend/src/pr-assurance/                         # module: timeline, PR page, progress, report, compare table
frontend/src/app/routes.ts                         # new routes #/pr-assurance and #/pr-assurance/pulls/<n>
test/pr-assurance*.test.mjs, test/pr-assurance-browser*.{mjs,py}   # tests (see Testing Strategy)

prcheck-verifiers (pushed by me, approved by the user 2026-11-25):
  .github/workflows/qivvera-pr-assessment.yml      # workflow_dispatch: app_sha, correlation_id
  reporters/check-run-reporter.ts                  # progress + evidence into the check run
```

Endpoints (all authenticated, same origin/CSRF/session rules as today):

| Method | Path | Does |
|---|---|---|
| GET | `/api/pr-assurance` | Scenario: application, change, the three PRs (imported or not), latest run per PR, rules snapshot summary, whether a token is configured (never the token) |
| POST | `/api/pr-assurance/pulls/:number/import` | Reads PR metadata from GitHub; only #6, #7, #8 are accepted |
| POST | `/api/pr-assurance/pulls/:number/runs` | `{requestKey}` → QUEUED run for the imported head commit; dispatches the workflow (at most once per request key) |
| GET | `/api/pr-assurance/runs/:runId` | Status, progress events and, when complete, the report. Never contacts GitHub |
| POST | `/api/pr-assurance/runs/:runId/sync` | Brings an active run up to date with GitHub (progress, then verified evidence) and returns it as GET does. Any signed-in user; repeated or parallel calls are safe |
| GET | `/api/pr-assurance/pulls/:number/runs` | The PR's run history, newest first |

## Code Style

Follow the existing layout and conventions: one endpoint per file through `defineEndpoint`, services
passed in by the server, repositories in `backend/server/<area>/`, exact error codes and messages,
comments that explain why. Example (existing):

```ts
export const getWorkspace = defineEndpoint({
  async handle({ services: { repository, assurance, resolution, intake, releaseRevision } }) {
    return reply({ applications: await repository.listApplications(), /* … */ });
  }
});
```

Pure logic gets small named functions with explicit types and no I/O, for example
`obligationStates(evidence, snapshot)`, `disposition(states, profile)`, `brokenRules(states, snapshot)`,
`compareRuns(previous, current)`.

## Testing Strategy

| Level | What it proves |
|---|---|
| Unit (Node test runner) | The three recorded evidence files produce exactly the expected-results table (2 → 1 → 0). V1 not confirmed → NOT_ASSESSED → INDETERMINATE. A missing check → INSUFFICIENT. Digest mismatch, wrong `kind`, or evidence for another commit → rejected, with no disposition. |
| GitHub client (stub `fetch`) | Exact URLs and headers; dispatch; run found by correlation id; check run read; 401/404/429/5xx and any redirect → clear error, nothing stored; the PAT never appears in errors. |
| PostgreSQL | Import, request-key at-most-once, progress append, evidence stored once even with two parallel polls, history kept. |
| HTTP | Sign-in and CSRF required; feature off → disabled message; only PRs #6–#8; no token in any response. Author and Policy Authority can import and evaluate; Viewer reads only. |
| Frontend (Vitest) | Timeline, live progress, report sections, compare table, empty and error states; obsolete responses do not change a newer view (route/session binding, as AGENTS.md requires). |
| Native browser suite | The whole flow in a real browser against a local server with a stub GitHub. |
| Live rehearsal (Thursday) | All three PRs from the deployed Vercel preview: results equal the table, timings recorded. |

The first plan step is a spike: push the workflow, run it once per PR commit, measure the time and
compare the evidence with the recorded results before building the Qivvera side.

## Boundaries

- **Always:** keep the GitHub token only in an environment variable (Vercel, or the git-ignored
  `.env.local`), never in Git, logs, errors or responses; use fixed repositories, workflow and PR numbers; bind every run to the exact
  imported head commit; verify evidence before using it; keep run history; run `npm run check` (and the
  browser suites for UI changes) before every commit; commit each verified slice on the branch.
- **Ask first:** any change in `vendorpay-app` or `vendorpay-policies`; any push to prcheck-live other
  than the two files above; changes to existing assurance, intake or other features' behaviour; new
  dependencies; anything on Vercel or Neon (the user deploys and runs the migration).
- **Never:** write to `vendorpay-app` (comments, statuses, merge blocking); follow redirects or call any
  host other than `api.github.com`; accept a URL, repository, command or commit from the browser;
  present stored results as a new live run; change `backend/verifiers`, the fixed profiles or earlier
  migrations; commit secrets.

## Success Criteria

1. With the feature switched on and the token configured, an Author or Policy Authority on the deployed
   URL can import PRs #6, #7, #8 and evaluate each, with no laptop or self-hosted runner involved.
2. Each evaluation finishes within 4 minutes (target 2–3) and the page shows progress while it runs:
   the stages, then each of the 14 checks as GitHub reports it.
3. The stored results match the expected-results table exactly; the timeline reads 2 → 1 → 0.
4. Every number in the report comes from that run's stored evidence and the rules snapshot; none is
   hard-coded.
5. Evidence is stored with its SHA-256. Tampered evidence or evidence for another commit marks the run
   FAILED with no disposition. Failed, cancelled and timed-out runs show no disposition.
6. Earlier runs stay visible with their date; a later READY does not hide an earlier NOT READY.
7. Qivvera writes nothing to GitHub except starting the workflow run.
8. The token is never present in responses, logs or Git (checked by tests).
   The report's team-test line matches the team-test totals measured in that run.
9. `npm run check` and all existing suites pass, plus the new tests and browser suite.
10. Thursday rehearsal on the Vercel preview reproduces criterion 3 for all three PRs.

## Out of Scope (Deferred)

- Starting automatically from a GitHub webhook when a PR opens (the button stands in for it).
- PR comments, commit statuses and merge blocking.
- Running on myVega or a self-hosted runner (later: Qivvera's worker on the user's server).
- Reading the rules live from `vendorpay-policies`; proposing rule changes as pull requests.
- Joining PR runs into Qivvera's existing assurance kernel (plans, obligation review, resolutions).
- Other applications, other PRs, configurable scenarios.
- Exceptions and READY WITH EXCEPTIONS.
- AI-generated checks (requested → generated → proven → approved).
- Bringing the add-on tables into the workspace schema and the operations backup, restore and permission-audit
  tools (they cover the schema-8 contract). Until then demo runs are reproducible by running them again.
- Entering the GitHub token in the Qivvera UI, stored encrypted (AES-256-GCM with a key from a Vercel
  variable, as prcheck-platform's onboarding did). The environment variable stands in for now.

## Decisions (user, 2026-11-25)

| Question | Answer |
|---|---|
| Team's tests in the same run | Yes: after the checks, shown as context, never part of the verdict |
| Who may evaluate | Author and Policy Authority; Viewers watch |
| Migration on Neon | The user runs `npm run migrate` after deploying |
| Database version | The add-on keeps its own version ledger (`pr_assurance_migrations`); the workspace schema stays 8 and no existing module changes |
| GitHub token | Environment variable for now; UI entry deferred |
| Where the workflow lives | prcheck-verifiers (two new files; nothing existing changes) |
| Spike runs (before the Qivvera screens exist) | Started by me with the GitHub login on this machine |

## Open Questions

None at the time of writing.
