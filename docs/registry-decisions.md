# Registry decisions — 2026-10-31

These decisions supplement docs/decisions.md without renumbering its prior foundation decisions.

## R-001 — A usable registry before assurance execution
Implement application and change records plus candidate obligations. No prepopulated outcomes, authority approvals, evidence-ingestion judgments or public kernel endpoint. The owner can try meaningful product interactions without mistaking registration for evaluation.

## R-002 — Local persistence is not hosted persistence
Use SQLite as an explicit local-review adapter because the current execution environment has Node's SQLite API but no provisioned managed database. Do not silently deploy a file database to ephemeral cloud storage. Hosted PostgreSQL implementation, migration and recovery are separate release gates. Startup refuses public/production binding.

## R-003 — Small dependency-free product shell
Use native browser modules and Node HTTP for the first bounded registry, keeping the TypeScript assurance core. This avoids adding unverified dependencies in a container without package-registry DNS. Framework selection remains revisitable as the product grows; this is not a claim that the shell is the completed enterprise frontend architecture.

## R-004 — Single-owner review identity
Require explicit owner email and a salted scrypt password hash. Use server-side expiring sessions, strict cookies, origin/CSRF checks and bounded sign-in throttling. Do not represent this as enterprise IAM or multi-tenancy. Never put deployment credentials in the repository or chat.

## R-005 — Draft edits preserve a prior value
Candidate obligations have optimistic version checks. Conflicting writes fail rather than overwrite a later draft. Working activity retains the before/after values, but is not advertised as immutable assurance evidence.

## R-006 — Separate test layers honestly
Node tests execute real database operations and local HTTP requests. Chromium UI tests use the real HTML/CSS/JS with a test-only transport to the same local API because managed browser native navigation was blocked. Do not call that a native hosted-browser end-to-end test. Test hosted cookies, TLS, headers, persistence and recovery after deployment approval.
