# Operational verification

These tools add executable checks for runtime database permissions and a genuine isolated
PostgreSQL backup/restore rehearsal. They preserve the existing Vercel/PostgreSQL/separate-worker
architecture and schema 7. They do not deploy, migrate an existing database, provision credentials,
change runtime grants, fill in independent QE results or approve early access.

The commands require Node 22 and the locked project dependencies. Supply configuration through
the deployment owner's protected environment. Do not put connection strings or passwords in
command arguments, screenshots, shell transcripts or reports. The founder remains product owner;
an authorized operator supplies and interprets operational configuration.

## Runtime permission audit

Run `node backend/scripts/audit-permissions.mjs` with these explicit environment variables:

- `QIVVERA_AUDIT_WEB_DATABASE_URL`: the actual non-owner web runtime login.
- `QIVVERA_AUDIT_WORKER_DATABASE_URL`: the actual distinct worker runtime login.
- `QIVVERA_RELEASE_SHA`: the full 40-character reviewed commit; CI can supply `GITHUB_SHA` instead.
- `DATABASE_SSL_MODE`: `verify-full` for hosted connections, which is the default. `disable` is
  accepted only for explicit loopback connections. `DATABASE_CA` can supply the reviewed CA.
- `QIVVERA_TEST_OUTPUT`: optional directory for a safe JSON report. Without it, JSON is printed only.

Both runtime URLs must explicitly name different users at the same configured host, port and
database. The tool verifies actual login identities and observed backend database/address/port.
Use direct connections to the same database; alternate aliases or differently routed pool endpoints
are intentionally not assumed equivalent. URI query routing/session overrides are rejected.

The audit opens read-only, repeatable-read transactions using those actual runtime credentials.
It makes no application mutation and creates no grants, roles, schemas or migrations. It inspects
the cumulative schema-7 public tables and migration checksums, including:

- Required SELECT, INSERT, DELETE and individual UPDATE-column grants.
- Prohibited evidence/history/receipt mutations and worker access to preparation or authority data.
- Effective PUBLIC/inherited grants, and additional privileges reachable through `SET ROLE`.
- Grant options on every table/column operation, including otherwise allowed operations. For example,
  a worker's evidence INSERT must not carry permission to delegate evidence writes to the web role.
- Runtime table/database/schema ownership, powerful role attributes, role-administration options,
  schema creation and unreviewed public routines, triggers or row-security policies.

The supported profile is intentionally narrow. For example, the web role can update an assessment's
status and failure fields, but cannot insert or alter stored evidence. The worker can insert evidence
and update execution fields, but cannot create plans, review requirements or write template records.

**Existing grant templates need review against this cumulative profile.** In particular, the older
resolution example grants table-wide UPDATE on `resolution_items` and `resolution_challenges`.
The new profile allows only the columns the current application changes and protects original source
and identity fields. Likewise, source previews require updates only to `import_id` and `request_digest`.
Do not blindly apply a broad table-wide UPDATE merely to satisfy a missing-column finding. The
reviewed profile is declared in `backend/server/operations/permissions.mjs`; existing direct, inherited,
owner and PUBLIC privileges must be considered together by the database owner.

The profile covers all current features in schema 7. It is not a minimal-grants calculator for an
older deployment or a partially enabled feature set. Such a deployment may correctly fail a missing
grant check; this does not authorize enabling a feature or expanding permissions automatically.

Success produces `passed: true` with inspection counts, the reported release revision and an identity
digest. Failed findings use role labels, table/column names and fixed error codes. Reports omit login
names, account lists, hostnames, passwords, connection strings and application row content. A failed
audit exits nonzero. Inspection errors also fail closed; a connection error is not an audit pass.

This is a bounded runtime privilege check, not comprehensive database-security certification.
Provider administration, external schemas, network controls, password policy, backup access and
later changes to permissions remain separate controls. A successful observation cannot prevent
an administrator from changing grants afterwards.

## Synthetic backup and isolated restore

Run `node backend/scripts/rehearse-recovery.mjs` with:

- `QIVVERA_RECOVERY_SOURCE_DATABASE_URL`: an explicit disposable loopback source whose database
  name starts `qivvera_test_`, containing the complete reviewed schema 7.
- `QIVVERA_RECOVERY_ADMIN_DATABASE_URL`: a separately explicit loopback administrator connection
  to `postgres` or another `qivvera_test_*` database. It needs permission to create a database.
  The source reader and destination administrator can be different roles or local clusters.
- `QIVVERA_RECOVERY_DESTINATION`: a **new**, unique name starting `qivvera_test_restore_`.
- `QIVVERA_RELEASE_SHA` (or `GITHUB_SHA` in CI): the full reviewed commit.
- `QIVVERA_PG_BIN_DIR`: optional absolute directory containing `pg_dump` and `pg_restore`.
  Otherwise the operator's PATH is used. Source, destination and both clients must use the same
  PostgreSQL major version. The implemented audit/rehearsal requires PostgreSQL 16 or later;
  the cumulative CI service and matching clients use PostgreSQL 17.
- `QIVVERA_TEST_OUTPUT`: optional safe-report directory.

Safety validation precedes any database connection or client invocation. Remote URLs, arbitrary
source databases, destination names outside the test prefix, source/admin-as-destination names,
URI routing overrides and existing destinations are rejected. `localhost` is reconstructed as
numeric loopback. A Docker backend may report a private container address behind its loopback
published port; that does not redirect the checked client endpoint.

The command performs this exact sequence:

1. Open a read-only source transaction and verify the schema/table inventory and migration checksums.
   Verify encoding, locale provider, locale/rules and recorded/actual collation version against the
   destination's `template0` defaults. Incompatible text semantics, stale source collation metadata
   or unhandled database-level configuration defaults fail before creating the destination. The
   command does not silently substitute a different locale or copy arbitrary server settings.
2. Export that repeatable-read snapshot and compute schema and per-table row fingerprints within it.
3. Execute genuine `pg_dump` with the **same exported snapshot**, while the source transaction remains
   open. Concurrent later writes therefore cannot make the archive and source fingerprints describe
   different moments. Only the 25 current Qivvera tables and their required table objects are dumped.
4. Create the explicitly named destination using `template0`. Recheck that it is the new database and
   empty. A name collision fails; no existing database is reused, cleaned, reset or overwritten.
5. Execute genuine `pg_restore` in one transaction, with errors stopping the restore.
6. Open a fresh read-only destination snapshot and compare schema definitions, migration records and
   every table's row fingerprint with the source snapshot. A difference fails the rehearsal.
   Database encoding/locale/collation properties and each column's collation identity are part of
   the schema fingerprint. Fingerprint row ordering uses the explicit C collation.

The fingerprint reader uses bounded batches. It rejects a source over one million rows or 512 MiB
of serialized row content; the rehearsal is not a general large-database backup product. Client
commands have deadlines and their raw stdout/stderr are not included in failures.

Passwords go only through the child process environment, not command arguments. Unrelated `PG*`
environment settings are not inherited. The intermediate archive lives in a private temporary
directory and is removed when the command finishes. The destination database is retained for
inspection on success **or failure**. This command never drops any database. Cleanup of a confirmed
disposable destination is a separate operator action.

Owners and ACLs are deliberately omitted from the archive. The destination is not ready to serve the
application until its actual runtime roles and reviewed grants have been applied and audited. The
report therefore records `runtimeGrantsRestored: false` and `applicationAcceptance: not-evaluated`.
It contains counts, hashes, timing and the safe test destination name, with no row contents or secrets.

This closes a synthetic recovery-engineering check. It does **not** prove restoration of the actual
hosted database, a provider's backup mechanism, a recovery-time target, credential restoration or
reconciliation of records written after the snapshot. The existing hosted recovery acceptance gate
remains mandatory.

## Automated verification and retained evidence

`test/operations.test.mjs` covers safety/identity rejection before client work, complete table inventory,
TLS/query-option constraints and CLI error redaction. These checks need no PostgreSQL server.

`test/operations-postgres.test.mjs` creates independent disposable databases and temporary runtime
roles. It uses real PostgreSQL catalog queries, real narrow-role plan approval/worker claim, genuine
`pg_dump`/`pg_restore`, and fresh repositories after restoration. It verifies inherited and PUBLIC
grants, ownership, missing permissions, immutable history protection, source preservation, a refused
existing destination, coherent read snapshots and corrupt-migration rejection. The recovery case
contains real executed verifier evidence, immutable template versions, plan-use receipts, obligation
history, drafted-candidate decisions and persisted session/rate-limit rows. Replaying a restored plan
request returns its original receipt without changing the restored rows.

When `TEST_DATABASE_URL` is absent, this integration suite reports a visible missing-execution sentinel.
With `REQUIRE_POSTGRES=true`, missing execution fails. A release run must use a genuinely disposable
loopback test database and matching PostgreSQL client tools; it must never use a hosted workspace.
The **test harness** removes only the fresh databases and roles it created, after checking the results.
That cleanup is separate from the recovery command, which never drops a database.

Safe observed reports are retained under `QIVVERA_TEST_OUTPUT`, or `review-test-results/` for direct
integration runs. They supplement cumulative engineering evidence and do not populate hosted or
independent human acceptance fields.

## PostgreSQL references

- [PostgreSQL privilege inquiry functions](https://www.postgresql.org/docs/17/functions-info.html)
  document effective table/column privileges and the distinction between membership, current access
  and the ability to use `SET ROLE`.
- [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html) documents the synchronized snapshot
  option used to bind the archive to the source fingerprints.
- [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html) documents transaction-scoped
  restoration and omission of original ownership and ACLs.
