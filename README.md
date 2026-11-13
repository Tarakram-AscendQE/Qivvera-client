# Qivvera — Increment 3

**Change → Obligations → Evidence → Gaps → Scope-bound Disposition**

Publication baseline and current release status: see `docs/increment-3-publication.md`.

Version 0.4.0 is an engineering review candidate built on Increment 2 (0.3.0), not a hosted release.
It adds authority-approved verification mapping, durable assessment requests, a separate worker,
actual approval-workflow HTTP verification, evidence manifests, current-versus-historical applicability,
visible gaps, and explainable scoped results. No live application or database was modified by this package.

## Useful commands (engineers, not the founder)
- `npm ci --ignore-scripts` — clean dependency installation; use the lockfile.
- `npm run selfcheck` — metadata/pin checks, not installation evidence.
- `npm run check` — regression, domain, API and local verifier tests; skipped PostgreSQL suites are reported.
- `npm run check:release` — fail closed unless the mandatory real database suites can run.
- `npm run demo:assurance` — actual local HTTP app + separate target and worker processes, synthetic data.
- `npm run migrate` — explicitly authorized database migration; never part of hosted build/start.
- `npm run worker:once` / `npm run worker:run` — separate worker, approved config and credentials required.

Read `docs/increment-3-contract.md`, `docs/increment-3-engineer.md`, and `docs/increment-3-release.md`.
The current supported target API is `qivvera.approval-http/1`. Existing applications need a compatible
interface or reviewed adapter; registration does not automatically make them verifiable.

The profile keeps every non-rejected obligation in scope. Only one explicit mapping is executable in this
increment. Other material obligations remain gaps. READY never means universally safe. Target-reported
identity is not an independently attested source/build chain, and database history is not immutable against
administrators. A later pass cannot erase an earlier valid counterexample for identical inputs.

Vercel serves the product API/UI. An authorized separately supervised process executes the worker.
No worker hosting, extra paid service, public deployment or infrastructure account is created here.
