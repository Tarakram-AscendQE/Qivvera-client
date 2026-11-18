# Qivvera — Independent Change Assurance

**Change → Obligations → Evidence → Gaps → scope-bound Disposition**

## Increment 6 · version 0.7.0

Cumulative implementation on published Increment 5, with guided first use, contextual next steps,
a product guide, clearer session/error handling and authenticated support diagnostics. It prepares
controlled early access within the declared supported scope.

Start with the [contract](docs/increment-6-contract.md),
[verification record](docs/increment-6-verification.md),
[operator handoff](docs/increment-6-engineer.md) and
[unfilled release acceptance record](docs/increment-6-release-acceptance.md).

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
All four database suites must execute; missing execution fails the gate. Never reset working data.

For genuine local HTTP browser journeys:

```sh
python3 -m venv .venv-browser
.venv-browser/bin/python3 -m pip install -r test/requirements-browser.txt
.venv-browser/bin/python3 -m playwright install --with-deps chromium
.venv-browser/bin/python3 test/run-browser-suites.py
```

CI runs these browser checks alongside cumulative regression/reference tests. Hosted HTTPS,
actual provider grants/migration, cold starts, persistence, isolated restore and independent QE
remain separate checks. The [QE supplement](docs/increment-6-qe.md) leaves Actual Result and
Pass/Fail blank for the executing team.

## Deployment and compatibility

Keep the existing Vercel/PostgreSQL/worker architecture and team-controlled deployment method.
Increment 6 adds no SQL migration; schema 5 remains current. Earlier deployment baselines still
need the reviewed cumulative migration/grants sequence. Hosted startup and builds do not migrate.

Automatic Git deployment for `increment6` remains held in `vercel.json`; prior flags are preserved.
Source publication performs no live migration, secret provisioning, paid resource creation or
deployment. Exact current verification/publication status belongs in the delivery record.
Earlier increment contracts and handoffs remain in `docs/` as historical records.
