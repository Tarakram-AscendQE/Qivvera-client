# Qivvera — Independent Change Assurance

## Increment 2 / 0.3.0 review candidate

This increment adds requirement acceptance and revision history to the Vercel-deployed registry.
It preserves the product boundary: **accepting an obligation is not verifying the software**.

Users can propose sourced obligations, submit them for review, accept/reject/request clarification,
inspect prior wording and decision rationale, and register a new change revision. Old revisions remain
read-only; copied obligations become fresh candidates. Every revision remains NOT ASSESSED with no
disposition because independent verification is a later increment.

### Start here
- `docs/increment-2-release.md`: scope, actual test results, and limitations.
- `docs/increment-2-engineer.md`: security prerequisites, migration and preview acceptance.
- `docs/increment-2-contract.md`: routes, state transitions, roles and concurrency rules.

### Engineering checks
Use Node 22 and the lockfile. In an environment with package-registry access:

```sh
npm ci --ignore-scripts
npm run selfcheck
npm run check
```
`npm run check` can explicitly skip the PostgreSQL suite if no test database is configured. It is a
local development check, NOT a release approval. The required release command is:

```sh
npm run check:release
```
It fails without `TEST_DATABASE_URL`; use a disposable loopback PostgreSQL database named
`qivvera_test_*`. That suite intentionally resets test tables. Never provide a customer database.

### Data and authentication
Hosted execution requires PostgreSQL, an exact HTTPS origin, and explicitly configured named accounts.
Run `npm run migrate` with approved database secrets before starting the hosted application. Migration
is not performed implicitly on every function startup. SQLite is available only in explicit local mode.

Preferred account configuration is `QIVVERA_ACCOUNTS_JSON`, an array of email/passwordHash/roles,
held in secret settings. Valid roles: AUTHOR, POLICY_AUTHORITY, VIEWER. The default review mode requires
a different recorded reviewer identity. There are no shipped default accounts or passwords.

`npm start` starts the real registry. `web/` is canonical; `npm run build` copies its assets into `public/`.
The Dockerfile is an alternative deployment path and is not certified by the Vercel/local test results.

### Status
Local regression and workflow tests passed; real PostgreSQL, a clean dependency install, native browser
E2E, Vercel deployment and recovery acceptance remain required. Do not label this a hosted release yet.
