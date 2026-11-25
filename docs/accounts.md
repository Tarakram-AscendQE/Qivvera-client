# Workspace accounts (schema 8)

Sign-in reads named accounts from the database on every login and every session check.
Accounts are no longer read from `QIVVERA_ACCOUNTS_JSON` / `OWNER_*` at runtime.

## Tables

- `workspace_users`: email (lower case, unique), optional display name, scrypt password hash,
  `ACTIVE`/`DISABLED` status, who created it and when, password-change and last sign-in time.
- `workspace_user_roles`: one row per role (`AUTHOR`, `POLICY_AUTHORITY`, `VIEWER`).

Migration `008_workspace_accounts.sql` is additive. Builds before schema 8 reject a schema-8 database,
so deploy the schema-8 application before (or together with) recording migration 8.

## Rules

- Passwords are stored only as `scrypt:<salt>:<key>` hashes. New passwords must be 12–256 characters.
- Accounts are disabled, never deleted, so the audit history keeps resolving to a real identity.
- Disabling an account, changing its password or changing its roles signs it out immediately.
- The last active account cannot be disabled.
- Unknown emails and wrong passwords return the same response and take the same time.
- Every account change writes an `activity` row (`ACCOUNT_CREATED`, `ACCOUNT_PASSWORD_CHANGED`,
  `ACCOUNT_ROLES_CHANGED`, `ACCOUNT_DISABLED`, `ACCOUNT_ENABLED`) naming the operator.
- The web runtime only reads accounts and updates `last_login_at` (see `backend/ops/accounts-permissions.sql`).
- A runtime with no active account refuses to start (`NAMED_ACCOUNTS_REQUIRED`). No default account exists.

## Operator commands

```
npm run accounts:local -- list                                   # local (.env.local)
npm run accounts:local -- add jane@example.com --roles AUTHOR --name "Jane Doe"
npm run accounts:local -- set-password jane@example.com
npm run accounts:local -- set-roles jane@example.com --roles AUTHOR,POLICY_AUTHORITY
npm run accounts:local -- disable jane@example.com
npm run accounts:local -- enable jane@example.com
```

Use `npm run accounts -- …` with `DATABASE_URL` set to administer PostgreSQL directly.
Passwords are typed at a hidden prompt; `QIVVERA_ACCOUNT_PASSWORD` exists only for automation.

When the database cannot be reached directly (for example a hosted console only), print reviewed SQL
and paste it into the provider's SQL editor. No database connection is made:

```
npm run accounts -- sql add jane@example.com --roles AUTHOR
npm run accounts -- sql set-password jane@example.com
npm run accounts -- sql import-env      # converts QIVVERA_ACCOUNTS_JSON / OWNER_* to INSERTs
```

## Moving an existing deployment to database accounts

Steps 1–2 are safe at any time: earlier builds ignore these tables.

1. Create the two tables (`backend/migrations/008_workspace_accounts.sql`) if they do not exist yet.
2. Insert the existing accounts (`npm run accounts -- sql import-env`, run with the current account
   settings) and at least one Policy Authority distinct from each Author for independent review.
   Check them with `SELECT email,status FROM workspace_users;`.

Steps 3–4 must happen together. An earlier build refuses schema 8, and the schema-8 build refuses
a database without migration 8, so the workspace is unavailable between the two. Keep that gap short,
for example by deploying without automatic promotion and promoting immediately after step 4.

3. Deploy the schema-8 application build.
4. Record migration 8: `npm run migrate`, or insert version 8 with the checksum exported as
   `accountsChecksum` from `backend/server/accounts/migration.mjs`.
5. Sign in, then optionally remove `QIVVERA_ACCOUNTS_JSON` / `OWNER_*`; the runtime logs
   `ACCOUNT_CONFIGURATION_IGNORED` while they remain set.

Local review storage (`QIVVERA_MIGRATE_LOCAL=true`) applies migration 8 automatically and copies the
configured accounts into an empty table once at start-up.
