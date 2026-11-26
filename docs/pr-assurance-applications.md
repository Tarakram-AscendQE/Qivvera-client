# PR assurance per application (GitHub access per application)

For: the deployer and anyone registering applications. Replaces the single environment-variable token
(`QIVVERA_PR_ASSURANCE_GITHUB_TOKEN`, no longer read) described in [pr-assurance-demo.md](pr-assurance-demo.md).

## The workflow

**Register application → access checked with GitHub → saved → choose it in PR assurance → import its PRs
→ evaluate them**, each step using only that application's own repositories and token.

1. **Applications → + Register application.** Name, description, and (all required while PR assurance
   is on):
   - *Application repository URL*: the repository whose pull requests are assured.
   - *Verifiers repository URL*: runs Qivvera's checks; must contain
     `.github/workflows/qivvera-pr-assessment.yml` (inputs `app_sha`, `correlation_id`; writes the
     `qivvera-evidence <run id>` check run). `prcheck-live/prcheck-verifiers` is the reference.
   - *Profiles repository URL*: the business rules (see "Rules" below).
   - *GitHub personal access token*: hidden by default, with Show/Hide.
2. Before anything is saved, Qivvera checks the token against all three repositories. If any check fails,
   the dialog explains which repository and which permission, and **nothing is saved**.
3. The application and its GitHub connection are saved in one transaction. The token is encrypted
   (AES-256-GCM, bound to the application id) and is never returned, shown or logged.
4. **PR assurance** lists the applications. Choosing one shows its imported pull requests and its rules.
   **Show open pull requests** reads the open PRs of *its* repository with *its* token; **Import** reads a
   PR's title, branches and exact head commit.
5. **Evaluate** starts the workflow in *its* verifiers repository (on that repository's default
   branch) with *its* token. Progress, the result and the 2 → 1 → 0 comparison work as before.

Existing applications (for example VendorPay registered before this change) show **Connect to GitHub** on
their page. The same dialog, **Update GitHub access**, replaces a token that expired or was revoked.

## Token permissions (fine-grained token)

| Repository | Permissions | Checked at registration |
|---|---|---|
| Application | Metadata, Pull requests: read | yes |
| Verifiers | Actions: read **and write**, Checks: read, Contents: read | read only: *write* cannot be checked without starting a run, so a missing write permission is reported on the first **Evaluate** |
| Profiles | Contents: read | yes |

**Optional: telling the pull request on GitHub.** With `QIVVERA_PR_ASSURANCE_GITHUB_WRITE=true`, Qivvera
sets the **Qivvera** commit status and keeps one comment on each evaluated PR, in that application's own
repository and with its own token. The token then also needs, on the application repository, Commit
statuses and Pull requests **read and write**. These are not checked at registration: a refused write
never changes the result, and the run page names the missing permission. To block merging, require the
**Qivvera** status check in that repository's branch protection (see step 4b in
[pr-assurance-demo.md](pr-assurance-demo.md)).

## Rules (profiles repository)

At registration Qivvera reads `.qivvera/rules-snapshot.json` from the profiles repository's default branch
(produced by `scripts/pr-assurance-snapshot.mjs`). It is accepted only if its digest matches, it names that
repository as its source, and it uses the `payments-critical` profile the decision logic implements. When
the repository publishes no snapshot, the snapshot shipped with Qivvera for that same repository is used
(today only `prcheck-live/vendorpay-policies` @ `e408884`). With neither, PRs can be imported but not
evaluated. To pick up new rules, save the application's GitHub access again.

## Deployment

1. Set `QIVVERA_CREDENTIAL_KEY` (32 random bytes, base64) in Vercel and `.env.local`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep it stable: a new
   key means every application's token must be entered again (the app says so).
2. Apply the add-on tables **only**: `npm run migrate:pr-assurance` (shows the state), then
   `npm run migrate:pr-assurance -- --yes`. This adds version 2 of the `pr_assurance_migrations` ledger
   and never touches the workspace schema, so the live site is not affected. Do **not** use
   `npm run migrate` against Neon for this: it would also apply workspace migration 9.
3. Deploy this build. A build with add-on version 1 (before this change) refuses to start PR assurance
   once version 2 is applied, so apply step 2 and run this build together.
4. Remove `QIVVERA_PR_ASSURANCE_GITHUB_TOKEN` from Vercel and `.env.local`; it is no longer read.
5. Open VendorPay → **Connect to GitHub**, enter the three repository URLs and the token.

What version 2 changes in the database (all additive, inside `pr_assurance_*`): new tables
`pr_assurance_connections` (one row per application, token ciphertext + key fingerprint) and
`pr_assurance_rule_snapshots` (by digest); `application_id` added to `pr_assurance_pulls` and
`pr_assurance_runs`, with keys `(application_id, pull_number)`. Existing imported PRs and runs are kept
and assigned to the application named VendorPay; finished runs are not modified.

## API

| Method | Path | Does |
|---|---|---|
| POST | `/api/applications` | With PR assurance on: also `testRepositoryUrl`, `profilesRepositoryUrl`, `githubToken` (required); checked with GitHub, then saved atomically |
| POST | `/api/applications/:id/github` | Connect an existing application, or replace its repositories and token |
| GET | `/api/pr-assurance` | Applications with their connection (repositories, rules), never a token |
| GET | `/api/pr-assurance/applications/:id` | One application's imported PRs, latest runs, results and rules |
| GET | `/api/pr-assurance/applications/:id/github-pulls` | Its open PRs on GitHub, read with its token |
| POST | `/api/pr-assurance/applications/:id/pulls/:n/import` | Import one PR |
| POST/GET | `/api/pr-assurance/applications/:id/pulls/:n/runs` | Start a run / list runs |
| GET, POST | `/api/pr-assurance/runs/:runId`, `…/sync` | Unchanged; a run knows its application |

`GET /api/workspace` adds `github` (connection or null) to each application and `capabilities.githubCredentials`.

## Not covered

- The separate GitHub intake/webhook feature (`QIVVERA_GITHUB_REPOSITORIES_JSON`, per-repository
  `tokenEnv`) still reads tokens from environment variables. It is switched off and unchanged.
- Rotating `QIVVERA_CREDENTIAL_KEY` without re-entering tokens (re-encryption) is not implemented.
