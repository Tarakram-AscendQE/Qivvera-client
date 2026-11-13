# Engineer handoff — increment 2

## Scope and authority
Implement against `increments` at fe5e15f8ae4b1caf58b52b19fed22913ef879a56. Work on a new
review branch, not the branch serving the founder. No remote code, database, credentials, or deployment
were changed by this implementation session. The overlay is for authorized engineering review, not for
blind upload or bypassing a platform block. Preserve the deployed base and inspect changes normally.

## Immediate security prerequisite
The retrieved base api/index.mjs contains a hardcoded database connection credential and fallback login
accounts. This package deliberately does not reproduce those values, their hashes, or deleted-line diffs.
Treat them as disclosed: rotate the database credential at its provider, remove fallback accounts, rotate
application credentials, invalidate sessions and retire old preview/function deployments that retain the
old values. Review access logs and repository exposure/history with the authorized owner. Removing a
secret from HEAD does not revoke it or erase history. No compromise was established and no disclosed
credential was used in this work. Do NOT put the replacement values in chat, Git or public assets.
Use deployment protection / restricted access while validating the new revision.

## Applying the source overlay
1. Fetch the repository and check out a NEW review branch based on the exact base commit.
2. Inspect the overlay manifest and source. The apply helper refuses a dirty working tree, a different
   base, symlinks, and direct application to main or increments. It never creates a commit or deployment.
3. Run the helper without --apply first; then with --apply after review.
4. Inspect git diff. No data, production secret, unrelated project or schema reset belongs in the commit.
5. If the repository has advanced since the recorded base, reconcile the changes in normal code review.
   Do not force the helper or overwrite newer work.

## Required local/CI verification
Node 22.16+ within Node 22; npm ci --ignore-scripts; npm run selfcheck; npm run check.
The lock retains dependency versions and integrity metadata from the retrieved base; the clean install
must run in your connected environment. @types/pg and its unused development-only transitive types
were removed because all new database code is JavaScript. pg and TypeScript are pinned.

Set TEST_DATABASE_URL to an ephemeral LOOPBACK database named qivvera_test_<suffix>, then run
npm run check:release. The integration suite intentionally drops/recreates test tables and refuses
external hosts and other database names. It covers shared contract cases, real legacy TIMESTAMPTZ
migration, idempotence, session persistence across fresh connections, and logout across instances.
The proposed CI workflow provisions an ephemeral postgres:17 service and requires that suite.
No production database or real credentials are used by CI. Review permissions and action pins normally.

`test/browser-workflow.py` is a supplied native-browser local journey and process-restart test using
Python Playwright 1.57.0 and Chromium. The fixture uses an explicitly disposable SQLite database under
/tmp/qivvera-*; its known synthetic password is never a deployment fallback. This test was blocked by
browser navigation policy here and needs execution in an allowed engineering environment. It is not a
replacement for HTTPS/Vercel/real-PostgreSQL acceptance.
`test/component-ui.py` is offline rendering with synthetic states and stubbed fetch. Its 11 checks passed.
Never describe that result as native end-to-end testing.

## Configure named identities privately
Preferred: QIVVERA_ACCOUNTS_JSON in secret settings, containing an array of objects with email,
passwordHash and roles. Use named people; roles are AUTHOR, POLICY_AUTHORITY, VIEWER. Hashes use the
existing salted scrypt format. scripts/provision-account.mjs reads a password through stdin and emits an
account object containing only the hash; route output to a secret manager or a restricted file outside Git.
Do not print or paste the plaintext. No default account exists.

Configure at least an AUTHOR and a different POLICY_AUTHORITY for the review journey. The same
human operating two identities does not establish organizational independence. For explicitly requested
single-owner experimentation only, QIVVERA_REVIEW_MODE=founder-review permits same-actor decisions
and records/displays their limitation. Default is independent. Do not silently enable founder-review.

Compatibility: OWNER_EMAIL plus OWNER_PASSWORD_HASH creates a single dual-role owner. Raw
OWNER_PASSWORD additionally needs a random, stable 32-lowercase-hex OWNER_PASSWORD_SALT in secret
configuration and a password of 16–256 characters. A stable provisioned salt avoids invalidating sessions
on each cold start. Precomputed hashes and named accounts are preferable. Retire old deployments after
rotation; they may retain old environment values even though the new code checks current credentials.

## Hosted configuration
- DATABASE_URL: actual provider connection, supplied as a secret; no code fallback.
- DATABASE_SSL_MODE: verify-full. Optional DATABASE_CA for a trusted custom CA. Do not disable
  certificate verification to make a failing connection work. disable is permitted only for loopback tests.
- PUBLIC_ORIGIN: exact approved HTTPS origin. Harmless trailing slash/missing scheme is normalized;
  paths, arbitrary forwarded hosts, all-vercel wildcard origins and non-HTTPS hosted origins are rejected.
- QIVVERA_REVIEW_MODE: independent unless founder-review is explicitly selected.
- VERCEL_GIT_COMMIT_SHA is recorded as the deployed application revision where supplied by Vercel;
  QIVVERA_RELEASE_SHA is the explicit alternative. This is deployment metadata, not artifact attestation.
Hosted startup refuses local SQLite. Local development requires QIVVERA_LOCAL_SQLITE=true and,
for a fresh local database, QIVVERA_MIGRATE_LOCAL=true.

## Migration and deployment sequence
Back up the existing database and test restoration to an isolated target first. Exercise migration 002
against a staging copy of the actual deployed schema, not only an empty database. Run `npm run migrate`
from an authorized engineering environment with database secrets. It takes an advisory transaction lock,
checks its checksum, preserves registry rows, and records historical author as unknown rather than
inventing approvals. Never run tests that reset tables against this staging copy or the live database.

The old schema.sql is the legacy registry shape; it is NOT the complete schema for this increment.
Function startup verifies schema 2 and fails closed if migration has not completed. Vercel build does
not mutate the database. web/ is canonical; build copies it to public/ including the preserved logo/CSS.
Validate the Vercel config and preview on the platform. The Docker route is separately unverified.

Do not leave older deployments with write access after adopting review/revision records. Old code does
not maintain the new review history. An additive schema does not make downgrade writes semantically
safe. Recovery to 0.1 must not write into a database containing new workflow decisions. Prefer roll-forward;
if a downgrade is required, isolate/restore the pre-migration backup with explicit approval, preserving
new data separately. No automatic destructive down migration is included.

## Hosted acceptance before founder review
Use synthetic data. Sign in as AUTHOR; create or adopt an existing candidate; enter its source/version;
request review. Show that the author cannot approve it. Sign in as POLICY_AUTHORITY; request
clarification, then accept a revised submission with a reason. The requirement becomes accepted but
remains NOT_ASSESSED and the change has no disposition. Read the exact prior snapshots.
Create revision 2 as AUTHOR with copied candidates. Check that revision 1 preserves acceptance and is
read-only; revision 2 does not inherit it. Repeat across a cold start/redeployment, then test logout from
one instance revokes access through another. Confirm exact-origin/CSRF rejection and secure cookies.

Verify real PostgreSQL concurrency, missing-database failure, rate-limiting, secret-safe errors, and record
persistence. Record actual deployed SHA, migration checksum, test result references and limitations.
Only then invite the founder to the new protected preview. There is no need for the founder to program,
install tools, type database commands, or act as the technical messenger.

## Remaining intentional limits
Single workspace; named roles configured outside the UI; no organization/user-admin interface; no
independent source authenticity or completeness analysis; no evidence runner or disposition integration;
no immutable audit guarantee. Shared account-level throttling is a small-review safeguard, not full
internet abuse prevention. List views are not yet paginated for enterprise scale. These are product
boundaries, not representations of finished capabilities.
