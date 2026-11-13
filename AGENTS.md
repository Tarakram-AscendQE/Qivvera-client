# Qivvera engineering rules — increment 2 (0.3.0 review candidate)

The founder is the product owner, not the programmer. Deliver working, tested increments.
Preserve the existing Vercel/PostgreSQL deployment direction. Do not restart the product.

## Product
Independent Change Assurance: Change → Obligations → Evidence → Gaps → scope-bound Disposition.
This increment establishes human acceptance of requirements and revision history. Acceptance is
NOT evidence that software satisfies a requirement. No verifier or disposition endpoint is enabled.

## Current implementation
The application has a role-protected obligation-review workflow, per-change revisions, decision history,
shared sessions, and a shared SQL adapter for PostgreSQL and explicit local SQLite. PostgreSQL and
hosted browser acceptance have not yet been run for this candidate. See docs/increment-2-release.md.
The prior internal TypeScript policy kernel remains provisional and is not wired to the public API.

## Rules
- Candidates never become authoritative without a named policy-authority decision and rationale.
- Require a different recorded content contributor/reviewer in default independent mode.
- Explicit founder-review mode records same-actor decisions without claiming independence.
- Historical revisions are read-only through the API. Copying requirements to a new revision creates
  new candidates, never inherited acceptance, evidence or readiness.
- An accepted source is a human attestation, not automatically verified source authenticity.
- Preserve prior obligation text, source version, actors and decisions.
- Do not invent an author for migrated data; legacy-import candidates require named adoption.
- No credentials, default accounts, database URLs or raw initialization errors in source/public assets.
- Hosted storage must fail closed without PostgreSQL; SQLite is explicit local development only.
- Keep hosted origins exact and cookies secure. Do not restore broad *.vercel.app trust.
- Database sessions are checked on every request; do not cache authentication across instances.
- A skipped required suite is NOT release success. Run npm run check:release against a disposable
  local PostgreSQL database and complete native hosted browser checks before deployment acceptance.

## Publication
Base: increments at fe5e15f8ae4b1caf58b52b19fed22913ef879a56. This delivery is a local reviewed-source
candidate, not a remote commit or deployment. An engineer must review it on a separate branch,
rotate the credentials found in the base, and run the release gates. Do not disable safeguards.
Do not apply migrations to customer data without the migration/backup review.
