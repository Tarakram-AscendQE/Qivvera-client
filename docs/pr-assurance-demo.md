# PR assurance demo: deployment and demo notes

For: the deployer (Vercel + Neon) and the presenter on Friday 2026-11-27.
Spec: [spec/SPEC-pr-assurance-demo.md](../spec/SPEC-pr-assurance-demo.md).

Qivvera imports VendorPay pull requests #6, #7 and #8 from GitHub. When you click **Evaluate**,
GitHub Actions runs Qivvera's 14 checks against that pull request's exact commit, and Qivvera
shows the result. The expected outcome is **2 broken rules → 1 → 0**.

## 0. Local demo (internal team demo, before deployment)

Runs Qivvera on this laptop against the **Neon database** in `.env.local`. The checks run for real on
GitHub Actions, and imports and runs stay in Neon's history.

Already done on 2026-11-26:
- `npm run migrate` was run against Neon. It added only the `pr_assurance_*` tables; schema 8, the four
  accounts and the existing data were unchanged.
- `.env.local` contains `QIVVERA_PR_ASSURANCE_ENABLED=true` and `QIVVERA_PR_ASSURANCE_GITHUB_TOKEN`.

**Do not run `npm run migrate` against Neon before the demo.** Since the `tarak-local` merge it would also
apply migration 9 (GitHub webhooks), after which any older build using Neon refuses to start. The demo does
not need it: webhooks are off (`QIVVERA_GITHUB_INTAKE_ENABLED=false`, no webhook secret), and with them off
the merged code runs on Neon's schema 8. Move Neon to schema 9 only when webhooks are switched on, as part
of a planned deployment (see `docs/github-webhooks.md`).

To run it:
1. Stop any dev server that was started before these changes (old code does not have the feature).
2. **Start from a clean slate:** `npm run demo:reset` shows what demo data exists (changes nothing);
   `npm run demo:reset -- --yes` empties only the demo tables (imported PRs, runs, run events). Neon's
   schema, accounts, applications and changes are never touched. Do this after every rehearsal and right
   before each demo, so the audience sees nothing imported and results appear live.
3. `npm run dev` (Node 22), then open **http://127.0.0.1:3000**.
4. Sign in with a Neon account: `admin@qivvera.com` (Author and Policy Authority) or `author@qivvera.com`
   can import and evaluate; `viewer@qivvera.com` can only watch. (`OWNER_*` in `.env.local` is not used
   for sign-in since schema 8.)
5. Follow section 3. Each evaluation takes about a minute.

Fallback if Neon cannot be reached: `npm run dev:temporary-db` starts a throwaway local database on
http://127.0.0.1:3100 (Docker must be running). It starts empty; sign in with `OWNER_EMAIL` and its password
from `.env.local`.

Rehearsed on 2026-11-25 against real GitHub: PR #6 NOT READY (2 rules broken) in 53 s, PR #7 NOT READY
(1 rule broken) in 48 s, PR #8 READY in 57 s; timeline 2 → 1 → 0; no page errors.

Optional polish: GitHub's titles for PRs #7 and #8 are auto-generated ("Feature/vp 184 v2 partial fix").
Someone with write access to vendorpay-app can rename them; **Re-import from GitHub** then shows the new titles.

## 1. Before the demo (once)

| # | Step | Who | Done when |
|---|---|---|---|
| 1 | The workflow and its reporter are on `main` in `prcheck-live/prcheck-verifiers` (`.github/workflows/qivvera-pr-assessment.yml`, `reporters/check-run-reporter.ts`). | Someone with write access to that repository | The **Actions** tab lists "Qivvera PR assessment" |
| 2 | Create a **fine-grained token**. Resource owner: `prcheck-live`. Repositories: `vendorpay-app` and `prcheck-verifiers` only. Permissions: vendorpay-app → Contents **read**, Pull requests **read**; prcheck-verifiers → Actions **read and write**, Checks **read**, Contents **read**. | Deployer | Token created and stored somewhere safe |
| 3 | In Vercel → Project → Settings → Environment Variables, add `QIVVERA_PR_ASSURANCE_ENABLED` = `true` and `QIVVERA_PR_ASSURANCE_GITHUB_TOKEN` = the token. Redeploy. | Deployer | The navigation shows **PR assurance** |
| 4 | Run the migration against the deployment's database: `DATABASE_URL=<connection string> npm run migrate` (already done for the Neon database in `.env.local` on 2026-11-26) | Deployer | It prints "Schema 8 is current, and so are the PR assurance add-on tables." |
| 4b | *Optional: notify the developer and block merging.* (1) Give the token two more permissions on vendorpay-app: Commit statuses **read and write**, Pull requests **read and write**. (2) Add `QIVVERA_PR_ASSURANCE_GITHUB_WRITE` = `true` and redeploy. (3) In vendorpay-app → Settings → Branches, protect `main`: **Require status checks to pass**, add the check **Qivvera** (it appears in the list after Qivvera's first evaluation). | Repository admin + deployer | Evaluating PR #6 shows a ❌ **Qivvera** check and a Qivvera comment on the PR; its Merge button is blocked |
| 5 | **Do not merge or close PRs #6, #7 or #8.** Only open pull requests can be imported. | Everyone | All three stay open |
| 6 | Rehearse once on the deployed URL (section 3) and write the times in section 5. | Presenter | Three results match the table below |

Never put the token in Git, in chat or in a screenshot. The app never shows it; it only says whether one is configured.

## 2. What the screens show

| Screen | Address | What you see |
|---|---|---|
| PR assurance | `#/pr-assurance` | The three PRs in order, each with its number of broken rules. Below them: the rules (6 rules, 14 obligations, from vendorpay-policies at `e408884`), the line "2 → 1 → 0 rules broken" and a table of every obligation across the PRs |
| One PR | `#/pr-assurance/pulls/6` | Title, branch and exact commit; **Evaluate with Qivvera**; the latest run (live while it runs); earlier runs |
| One run | `#/pr-assurance/runs/<id>` | The same run panel, by its own link |

While a run is going, the panel shows the stages (waiting for GitHub → starting VendorPay → Qivvera's checks →
the team's own tests → done) and each of the 14 checks as it finishes. One run takes about 1 minute
(53–56 s measured on GitHub on 2026-11-25).

## 3. The demo, click by click

1. Sign in, then choose **PR assurance** in the navigation.
2. If a PR shows **Import from GitHub**, click it (Author or Policy Authority only).
3. Open **PR #6** → **Evaluate with Qivvera**. While it runs, explain that this is Qivvera's own check
   suite, running against the exact commit of the pull request.
4. When it finishes, it shows **NOT READY · 2 rules broken · 11 of 14 obligations supported**.
   - Point to "The team's own tests all passed, yet 2 business rules are broken."
   - Open the **FIN-001** card. It shows what the rule requires, which check caught it, and what
     happened: "Expected 403, received 200" (the requester approved their own bank change).
5. Go back to the PR list and open **PR #7** → **Evaluate**. Result: **1 rule broken**.
   "Since PR #6" shows **FIN-001 fixed** and **FIN-002 still broken**.
6. Open **PR #8** → **Evaluate**. Result: **READY**, with every obligation supported.
7. Go back to **PR assurance**. It now shows **2 → 1 → 0 rules broken**, and the table marks FIN-001.1
   and FIN-002.1 as "Now supported".

## 4. If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "No GitHub token is configured." | The Vercel variable is missing | Add the token (section 1, step 3) and redeploy |
| "GitHub refused this request. The token needs …" | The token lacks that permission | Edit the token's permissions on GitHub, then try again |
| "GitHub rejected the token …" | The token expired or was revoked | Create a new one and replace it in Vercel |
| "Only an open pull request can be imported" | The PR was merged or closed | Reopen it on GitHub |
| Stuck at "Waiting for GitHub" | GitHub Actions has not started a machine yet | Wait. After 15 minutes the run ends as "timed out" with no verdict |
| "No result: …" | The run ended without evidence Qivvera could verify | Open the GitHub run link from the panel to see why, then evaluate again |
| GitHub is slow during the demo | — | Open the PR's earlier run from **Earlier runs** (for example the rehearsal). It is a real run and shows its real date |

## 5. Rehearsal record (fill in)

| PR | Expected | Result on the deployed URL | Time (start → result) | Date / by |
|---|---|---|---|---|
| #6 | NOT READY · 2 rules broken | | | |
| #7 | NOT READY · 1 rule broken (FIN-001 fixed) | | | |
| #8 | READY · 0 rules broken | | | |

## 6. What this demo does not claim

- Only the 14 obligations in the rules snapshot are checked. The result is not a release approval.
- The SHA-256 shows that stored evidence is unchanged since Qivvera verified it. It is not a signature.
- The pull request's code runs on the same GitHub machine as the checks. That is acceptable for these
  reference PRs, but untrusted customer code must be isolated first.
- Nothing is written to `vendorpay-app` unless `QIVVERA_PR_ASSURANCE_GITHUB_WRITE=true`. Then Qivvera
  sets only the **Qivvera** commit status (pending → success for READY, failure otherwise, error when a
  run ends without a result) and keeps one comment per PR up to date. Merging is blocked only by the
  repository's own branch protection rule, which repository admins can bypass. A new push has no
  Qivvera status until it is evaluated, so a required check keeps it blocked. A refused GitHub write
  never changes the result; the run page says so and the next evaluation tries again.
- The demo tables keep their own version record and are not covered by the operations backup and
  permission-audit tools yet. Demo runs can always be repeated.
