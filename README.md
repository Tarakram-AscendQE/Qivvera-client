# Qivvera — Independent Change Assurance

**Change → Obligations → Evidence → Gaps → scope-bound Disposition**

## Increment 10 · version 0.11.0

Cumulative implementation on verified Increment 9 commit `1e67bd6`, strengthening **assurance
integrity, record-bound user actions and operational verification**. Damaged scope or plan/run
records cannot silently omit obligations and produce a result. Delayed responses cannot change
the target of a visible action. Explicit operator tools audit effective runtime permissions and
rehearse a genuine PostgreSQL backup/restore into a new disposable database.

Start with the [contract](docs/increment-10-contract.md),
[Product Atlas reconciliation](docs/product-completion-status.md),
[operational verification](docs/operations-verification.md),
[verification record](docs/increment-10-verification.md) and
[unfilled release acceptance record](docs/increment-10-release-acceptance.md).

## What the product supports

- Register applications and source-bound revisions, propose sourced obligations, and record named
  authority review with contributor separation and preserved history.
- Approve a supported mapping and request execution by a separate worker. Up to two distinct
  obligations can map to approval separation and the declared approval-finality contract. Every
  non-rejected declared obligation remains mandatory; unsupported ones stay gaps.
- Inspect expected/observed behavior, frozen assessment scope, evidence and a reasoned READY,
  NOT_READY or INDETERMINATE disposition when the completed result is admissible.
- Track findings, challenges, ownership and corrections; link fresh reassessment and separately
  review a resolution while preserving the original evidence.
- Preview and explicitly import GitHub PR metadata from an operator-configured repository as
  source context, using a separately provisioned product read credential.
- Follow role-aware guidance, read the product Guide and download a safe Support summary.
- Prepare source-grounded drafts with durable source, generator and human-decision provenance.
  Retry receipts prevent duplicate candidates; source quotations do not establish policy authority.
- Inspect declared revision impact, exact copied-obligation differences and current assurance context.
  Follow reasoned next steps while preserving every mandatory obligation and prior evidence record.
- Save, version, inspect and archive verification templates; reuse their supported check choices through
  explicit fresh mappings and a new plan decision with atomic, inspectable preparation provenance.

The two fixed adapters and synthetic reference applications demonstrate bounded reuse in one
workspace. Qivvera does not discover all requirements, execute arbitrary uploaded checks, attest a
running binary, publish GitHub checks, block merges, grant waivers or certify a release.
Requirement acceptance is a human applicability decision; it is not software verification.

## For invited users

Sign in with the named account supplied by the workspace owner. Start at **Workspace**, open
**Guide** for the first-review journey and terminology, and follow **What to do next** on a change.
Your displayed role controls available actions, with record-specific checks on the server.
Use **Support** to inspect configuration and gather a reference. It does not send a ticket or
establish that a worker is running.

There is no public signup or account administration screen. The founder steers the product as an
end user; the deployment owner provisions accounts, protected configuration, targets and operations.

## Engineering checks

Use Node 22.16 or later within Node 22 and the locked dependencies:

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run check
npm run demo:assurance
npm run demo:resolution
npm run demo:generalization
```

`npm run check:release` requires a disposable, explicitly named loopback PostgreSQL database.
All eight database suites must execute; missing execution fails the gate. Never reset working data.
The operations suite also requires PostgreSQL 17-compatible `pg_dump` and `pg_restore` tools.

For genuine local HTTP browser journeys:

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python3 -m pip install -r test/requirements-browser.txt
.venv-browser/bin/python3 -m playwright install --with-deps chromium
.venv-browser/bin/python3 test/run-browser-suites.py
```

After configuring the disposable database and pinned browser runtime, run the whole cumulative gate:

```sh
npm run check:engineering
```

This writes `review-test-results/engineering-verification.json` with the source commit, clean-tree
status, actual gate results and retained logs. All eight native browser suites are mandatory.

CI runs these browser checks alongside cumulative regression/reference tests. Hosted HTTPS,
actual provider grants/migration, cold starts, persistence, actual hosted-backup restore and
independent human QE remain separate checks. The cumulative [QE supplement](docs/increment-9-qe.md)
and [release record](docs/increment-10-release-acceptance.md) do not predeclare those outcomes.

## Deployment and compatibility

Keep the existing Vercel/PostgreSQL/worker architecture and team-controlled deployment method.
Increment 10 retains schema 7 and all published migration/profile/verifier bytes. The protected feature switch
`QIVVERA_TEMPLATES_ENABLED` defaults off; enabling it requires assurance and generalization enabled.
Templates share the existing assurance database and introduce no external provider or credentials.
Earlier deployment baselines need the reviewed cumulative migration/grants sequence. Hosted startup
and builds do not migrate. Older published binaries reject schema 7; switching application code back
does not reverse a database upgrade. Optional drafting AI remains separately configured and requires
live evaluation. See the operator handoff for the isolated migration/recovery rehearsal.

Automatic Git deployment for `increment10` remains held in `vercel.json`; prior flags are preserved.
Source publication performs no live migration, secret provisioning, paid resource creation or
deployment. Exact current verification/publication status belongs in the delivery record.
Earlier increment contracts and handoffs remain in `docs/` as historical records.
