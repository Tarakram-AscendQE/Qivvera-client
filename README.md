# Qivvera — Increment 5 review candidate (0.6.0)

Cumulative application on published Increment 4. Adds two bounded approval-control mappings,
a fixed adapter for an independently implemented synthetic Python/SQLite expense application,
and reviewed GitHub pull-request metadata intake.

Start with [Increment 5 contract](docs/increment-5-contract.md),
[engineering handoff](docs/increment-5-engineer.md), and [verification](docs/increment-5-verification.md).
No claim of automatic obligation discovery, customer validation, deployment, universal coverage or
source-to-running-binary attestation. Source publication status is in the delivery receipt.

## Previous release context (historical)

# Qivvera — Independent Change Assurance

**Change → Obligations → Evidence → Gaps → scope-bound Disposition**

## Increment 4 · 0.5.0 engineering review candidate
This cumulative source adds accountable finding resolution, correction lineage, challenge responses,
and evidence-backed resolution review to the registry, authority/revision workflow and bounded
assurance execution implemented through Increment 3.

A resolution item does not change a software disposition. It preserves the original finding and evidence,
links a correction and fresh reassessment, and records a separate Policy Authority's decision.
Later input/evidence changes invalidate current resolution without erasing earlier history.

Read `docs/increment-4-contract.md`, `docs/increment-4-engineer.md` and
`docs/increment-4-verification.md`. Previous increment documents are historical records.

### Verification
Use Node 22.16+ within Node 22 and the locked dependency versions.

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run check
npm run demo:assurance
npm run demo:resolution
```

`npm run check:release` requires real disposable PostgreSQL; missing required suites fail the gate.
Do not run resettable tests against working data. Native hosted-browser and recovery acceptance are
separate release checks. A screenshot or an unexecuted test is not a pass.

### Deployment
Keep the existing Vercel/PostgreSQL/worker deployment. Migration 004 is explicit, additive and
checksummed. After validation, enable `QIVVERA_RESOLUTION_ENABLED=true` alongside assurance.
No deployment defaults, target credentials or secrets belong in Git. Source-controlled automatic
Git-deployment holds remain until the team's controlled rollout.

### Boundaries
One workspace and one bounded approval-interface verifier; operator-pinned/target-reported identity,
not independent source/build attestation. The verifier uses real HTTP operations and a positive control.
Synthetic seeded faults are reference tests, not authentic AI-generated defects. No universal assurance,
full IAM, arbitrary code execution, autonomous remediation, governed exceptions or certified safety.

The founder steers the product as an end user. The engineer/deployment owner runs the authorized
integration pipeline, migrations, hosted checks and recovery. Do not make the founder the programmer.
