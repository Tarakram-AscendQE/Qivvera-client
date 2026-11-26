# GitHub pull-request webhooks (schema 9)

GitHub notifies Qivvera when a pull request in an operator-connected repository is opened, receives
new commits, is reopened or is marked ready for review. Qivvera records that activity and shows it on
the application page. **Receipt never imports anything**: an Author still previews and imports the PR
through the existing reviewed flow, which creates the change or a new revision.

Phase 1 (this document) is receipt only. It makes no GitHub API call, posts no status or comment,
creates no change, revision, requirement or assessment, and executes nothing from the repository.

## How a delivery is handled

`POST /api/github/webhook` (no session or Origin; authenticated only by the signature):

1. 404 when webhooks are not enabled; 405 for other methods; 415 unless `application/json`;
   413 above 1 MiB.
2. The exact raw body must match `X-Hub-Signature-256` (HMAC SHA-256 with the shared secret,
   constant-time comparison). Otherwise 401 and nothing is stored.
3. `X-GitHub-Delivery` (GUID) and `X-GitHub-Event` must be present (400 otherwise).
4. Each verified delivery is stored once in `github_webhook_deliveries`. A redelivery of the same
   delivery ID returns 200 `DUPLICATE` and changes nothing, also across concurrent instances.
5. `ping` returns 200. Other events, and `pull_request` actions other than `opened`, `synchronize`,
   `reopened` and `ready_for_review`, are acknowledged with 202 `IGNORED` and a reason.
6. The repository must match an entry in `QIVVERA_GITHUB_REPOSITORIES_JSON` by **both** GitHub's
   numeric repository ID and its `owner/name`, and the PR's base repository must be that repository.
7. For each matching application, one `source_events` row and one `activity` record
   (`GITHUB_PR_EVENT_RECORDED`, actor `github-webhook`) are written; 202 `RECORDED`.

Title, refs and sender are untrusted provider text: bounded, rejected if they contain control
characters, stored as data and always rendered escaped. Nothing in a payload can accept, pass, skip
or import anything.

`GET /api/applications/:id/source-events` (any signed-in role) returns the latest event per pull
request (up to 30), how many deliveries it had, and whether the PR's latest head is already imported.

## Configuration

| Setting | Value |
|---|---|
| `QIVVERA_GITHUB_INTAKE_ENABLED` | `true` (webhooks require intake) |
| `QIVVERA_GITHUB_REPOSITORIES_JSON` | Repository bindings (`id`, `owner`, `repo`, numeric `repositoryId`, `applicationId`, `tokenEnv`) |
| `QIVVERA_GITHUB_WEBHOOK_SECRET` | Shared secret, 32–256 characters, no spaces (`openssl rand -hex 32`). Setting it enables webhooks. |

The numeric repository ID is shown by `gh api repos/<owner>/<repo> --jq .id`.

## GitHub setup

On the repository being assured (not the Qivvera repository): **Settings → Webhooks → Add webhook**

- Payload URL: `https://<workspace host>/api/github/webhook`
- Content type: `application/json`
- Secret: the same value as `QIVVERA_GITHUB_WEBHOOK_SECRET`
- SSL verification: enabled
- Events: **Let me select individual events → Pull requests** only

GitHub sends a `ping` immediately; **Recent deliveries** should show response 200.

## Database

Migration `009_github_webhooks.sql` is additive. Builds before schema 9 reject a schema-9 database,
and a webhook-enabled schema-9 build refuses a database without migration 9, so deploy the build and
record migration 9 together (see `docs/accounts.md` for the same procedure). Runtime grants:
`ops/webhooks-permissions.sql` (SELECT and INSERT only; receipts are append-only).

## Local testing

```
npm run webhook:local -- ping
npm run webhook:local -- pull_request --repo owner/name --repo-id 123 --pr 7 --sha <40-hex commit> --action synchronize
```

The script signs deliveries with `QIVVERA_GITHUB_WEBHOOK_SECRET` from `.env.local`, exactly as GitHub
does. To receive real GitHub deliveries on a laptop, point the webhook at a relay (for example a
`cloudflared` quick tunnel) for the local port.

## Not in this phase

- Automatic change/revision creation from a delivery.
- Commit statuses or PR comments back to GitHub (an outbound write; needs product approval and a
  running assessment worker before it can be a required check).
