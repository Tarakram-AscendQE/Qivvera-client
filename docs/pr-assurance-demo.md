# PR assurance demo: deployment and demo notes

For: the deployer (Vercel + Neon) and the presenter on Friday 2026-11-27.
Spec: [spec/SPEC-pr-assurance-demo.md](../spec/SPEC-pr-assurance-demo.md).

Qivvera imports VendorPay pull requests #6, #7 and #8 from GitHub. When you click **Evaluate**,
GitHub Actions runs Qivvera's 14 checks against that pull request's exact commit, and Qivvera
shows the result. The expected outcome is **2 broken rules → 1 → 0**.

## 1. Before the demo (once)

| # | Step | Who | Done when |
|---|---|---|---|
| 1 | The workflow and its reporter are on `main` in `prcheck-live/prcheck-verifiers` (`.github/workflows/qivvera-pr-assessment.yml`, `reporters/check-run-reporter.ts`). | Someone with write access to that repository | The **Actions** tab lists "Qivvera PR assessment" |
| 2 | Create a **fine-grained token**. Resource owner: `prcheck-live`. Repositories: `vendorpay-app` and `prcheck-verifiers` only. Permissions: vendorpay-app → Contents **read**, Pull requests **read**; prcheck-verifiers → Actions **read and write**, Checks **read**, Contents **read**. | Deployer | Token created and stored somewhere safe |
| 3 | In Vercel → Project → Settings → Environment Variables, add `QIVVERA_PR_ASSURANCE_ENABLED` = `true` and `QIVVERA_PR_ASSURANCE_GITHUB_TOKEN` = the token. Redeploy. | Deployer | The navigation shows **PR assurance** |
| 4 | Run the migration against Neon from this repository: `DATABASE_URL=<Neon connection string> npm run migrate` | Deployer | It prints "Schema 8 is current, and so are the PR assurance add-on tables." |
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
the team's own tests → done) and each of the 14 checks as it finishes. One run takes about 2–3 minutes.

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
- Nothing is written to `vendorpay-app`: no comments, statuses or merge blocking.
- The demo tables keep their own version record and are not covered by the operations backup and
  permission-audit tools yet. Demo runs can always be repeated.
