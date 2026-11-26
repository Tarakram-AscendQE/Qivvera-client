/**
 * Applies ONLY the PR assurance add-on tables (its own pr_assurance_migrations ledger), never a
 * workspace migration.
 *
 *   npm run migrate:pr-assurance             shows which add-on versions are applied; changes nothing
 *   npm run migrate:pr-assurance -- --yes    applies the missing add-on versions
 *
 * Uses DATABASE_URL from .env.local. This exists because `npm run migrate` also applies workspace
 * migrations, and a database whose workspace schema is newer than a deployed build takes that build
 * down. The add-on ledger is not checked by builds that do not have the add-on, so this is safe to run
 * on a shared database. Builds with add-on version 1 refuse to start PR assurance once version 2 is applied.
 */
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { openDatabase } from '../server/workflow-store.mjs';
import { PR_ASSURANCE_SCHEMA_VERSION, migratePrAssurance } from '../server/pr-assurance/migration.mjs';

setDefaultAutoSelectFamilyAttemptTimeout(1000);

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const confirmed = process.argv.slice(2).includes('--yes');
const host = new URL(process.env.DATABASE_URL).hostname;
const db = await openDatabase({ connectionString: process.env.DATABASE_URL, sslMode: process.env.DATABASE_SSL_MODE ?? 'verify-full', ca: process.env.DATABASE_CA });
const applied = () => db.transaction(async c => (await c.query("SELECT to_regclass('pr_assurance_migrations') AS ledger")).rows[0].ledger
    ? (await c.query('SELECT version FROM pr_assurance_migrations ORDER BY version')).rows.map(r => Number(r.version)) : [], true);
try {
    const before = await applied();
    if (!confirmed) {
        console.log(`Database ${host}: PR assurance add-on versions applied: ${before.join(', ') || 'none'}; this build needs 1–${PR_ASSURANCE_SCHEMA_VERSION}.\nNothing was changed. Run "npm run migrate:pr-assurance -- --yes" to apply the missing versions (workspace schema untouched).`);
    } else {
        await migratePrAssurance(db);
        console.log(`Database ${host}: PR assurance add-on versions now applied: ${(await applied()).join(', ')}. The workspace schema was not touched.`);
    }
} catch {
    console.error('PR_ASSURANCE_MIGRATION_FAILED: no secrets logged. Ask the database owner to inspect the failure.');
    process.exitCode = 1;
} finally {
    await db.close();
}
