# Increment 7 — engineering and operator handoff

Version 0.8.0. Cumulative source based on published Increment 6 `0351da4`.
Use the reviewed `increment7` branch and the successful CI result for its exact final commit.
The source publication does not deploy, provision a model account, send product source to a model,
or migrate a live database. Preserve the existing Vercel/PostgreSQL/separate-worker architecture.

## What users receive

On Change → Obligations, **Draft from source** opens a source-backed preparation workflow.
The Author supplies reference, version and excerpt. Built-in explicit clauses run without an AI
provider. Optional AI suggestions use the separately configured model only after explicit source
processing confirmation. Every result keeps the source, exact quotation, generator identity and
individual human decisions. Creating a candidate still requires ordinary submission and review.

Only the requesting Author can decide on that run. Other authenticated workspace roles can
inspect its records. Old revisions remain readable but cannot receive new decisions. An identical
repeated submission returns the saved result; changed choices conflict. A source reference is
declared context and is never fetched automatically.

## Installation and migration

1. Record the current deployed commit, applied schema/checksums, owners and recovery reference.
   Back up and demonstrate restoration into a separate database before migration.
2. Rehearse cumulative migration through schema 6 on the restored copy. `npm run migrate` uses
   the authorized PostgreSQL migration role. Hosted startup, builds and browser requests do not
   migrate. Earlier SQL migration bytes/checksums remain unchanged.
3. Review `ops/drafting-permissions.sql` with the team's actual non-owner web role. The new tables
   are `drafting_runs` and `drafting_suggestions`. Grant only the listed insertion, reading and
   lifecycle/decision column updates. Never grant source snapshot rewriting or DELETE as part of
   this feature. Existing workflow creation/history/activity permissions remain necessary.
4. Keep target credentials worker-only. The worker does not require drafting writes or a model key.
   Test actual effective privileges, including inherited roles; a grant template is not isolation proof.
5. Deploy matching reviewed web/API assets and compatible worker code through the team's existing
   method. `increment7` automatic deployment is held in `vercel.json`; earlier flags are preserved.
6. Enable `QIVVERA_DRAFTING_ENABLED=true` only after schema 6 and its grants are ready. Disabled
   workspaces retain manual obligation authoring. Opening a partially migrated enabled service fails
   rather than silently falling back to an in-memory implementation.

Schema 6 is additive, but published Increment 6 and earlier binaries reject it. Rolling back code
alone is not a database rollback. Prefer a reviewed roll-forward. A downgrade requires a rehearsed
isolated restore and reconciliation of records created since the backup. Do not reset production
data or delete the migration record to imitate compatibility.

## Optional AI configuration

The protected web runtime needs all three settings:

- `QIVVERA_DRAFTING_OPENAI_ENABLED=true`
- `QIVVERA_DRAFTING_OPENAI_MODEL`: an operator-approved model supporting Responses and the
  supplied structured-output schema. There is intentionally no default model choice.
- `QIVVERA_DRAFTING_OPENAI_API_KEY`: separately provisioned product credential, outside Git,
  screenshots, browser assets and reports. This is not ChatGPT's connected account.

The caller must additionally select AI suggestions and confirm external processing of the shown
excerpt. Only numbered source lines and fixed task instructions enter the provider request. Source
reference/version, account data, unrelated application records and evidence are not sent. The fixed
destination is `https://api.openai.com/v1/responses`; redirects and arbitrary endpoints are refused.
No tools, automatic retries, live web browsing or automatic fallback are used.

The request sets `store:false`; this does not guarantee zero retention. Review the provider account's
data handling, contractual terms, model approval and costs before enabling real source processing.
Use synthetic examples for initial validation. The operator owns the provider key, model, budgets
and rotation. Support reports configuration only and never tests the provider connection.

Each request permits up to 3,000 output tokens and a 15-second provider deadline, with at most
128 KiB of response data. Generations have durable request IDs and 60-second reservation expiry.
The application permits at most 10 runs per Author per 10 minutes and one active run per Author;
AI requests also have a workspace limit of 30 per 10 minutes. These request limits are safeguards,
not a monetary spending guarantee. No background retry occurs after a timeout or process exit.

Validate the selected model's compatibility and latency in the actual deployment. The hosted
function duration must allow the 15-second provider deadline plus database and response work.
A shorter host timeout can interrupt a request and leave a visibly expired reservation. A refusal,
incomplete response, unsupported output shape or quotation mismatch produces a saved failed run,
with no candidates. An expired run may have reached the provider; check its record and the
operator's provider account before explicitly starting another request.

## Verification commands

Use Node 22.16+ within Node 22 and Python 3.12 with the pinned test tools:

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run check
npm run demo:assurance
npm run demo:resolution
npm run demo:generalization
```

For the mandatory database gate, provide `TEST_DATABASE_URL` for an explicitly disposable,
loopback PostgreSQL database named `qivvera_test_*` and run `npm run check:release`. All five
PostgreSQL suites must execute. Their reset statements destroy test data; never point them at a
working staging database, a customer database, or a live hosted copy.

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python3 -m pip install -r test/requirements-browser.txt
.venv-browser/bin/python3 -m playwright install --with-deps chromium
.venv-browser/bin/python3 test/run-browser-suites.py
git diff --exit-code -- public/
```

The five browser suites use actual local HTTP servers, authentic sessions and disposable SQLite.
Provider fixtures test protocol, grounding, failure handling and state transitions. They do not
establish live model quality. Hosted HTTPS, actual PostgreSQL grants, migrations, cold starts,
persistence, restore and independent QE remain separate acceptance evidence.

## Founder and QE task

Use a synthetic source with two explicit requirements: a requester must not approve their own
request; an already approved request must not be approved again. Propose drafts, compare each
quotation with the source, edit one statement and choose criticality and rationale. Create one
candidate and dismiss the other with a reason. Confirm the candidate is unassessed and request
a different eligible Policy Authority's review. Reopen the drafting record after an ordinary
obligation edit and a new revision; its original source and decision must remain inspectable.

Also try contradictory clauses, mixed-case literal values, empty results, wrong roles, changed
revisions and a lost reply after an actual save. Follow the manual cases in `increment-7-qe.md`.

For AI mode, add an authorized live evaluation with at least: explicit rules, conditions/negation,
conflicting clauses, case-sensitive literals, irrelevant text, malicious embedded instructions,
and a source too ambiguous to justify a draft. Human reviewers judge meaning and omissions;
exact quotation checks alone cannot measure those properties. Record model/response identity,
expected behaviour, actual results and any provider/model changes requiring retest.

## Support and recovery

The source-drafting export includes the supplied source and the human decision trail. Treat it as
a business record and share it only through approved channels. The separate Support diagnostic
download remains allowlisted and excludes this content and model credentials.

After a lost save reply, use **Reload saved run** or **Check saved drafts** before resubmitting.
Identical request/decision replay is safe; altered replay choices conflict. An integrity failure
requires operator investigation and restoration from trustworthy records. Never rewrite a source
snapshot, decision digest or historical evidence merely to clear an error.

## Primary provider references

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)
- [Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create)

The adapter uses the documented `text.format` JSON-schema interface and still validates business
rules, quotations, refusals, incomplete responses and API failures within Qivvera.
