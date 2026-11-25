/**
 * Empties the PR assurance demo data (imported pull requests, runs, run events) so a demo starts fresh.
 *
 *   npm run demo:reset            shows what would be removed; changes nothing
 *   npm run demo:reset -- --yes   removes it
 *
 * Uses DATABASE_URL from .env.local. Nothing else in the database is touched: not the schema, accounts,
 * applications or changes. The app itself never deletes runs; this is a deliberate database-owner action.
 */
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { openDatabase } from '../server/workflow-store.mjs';
import { countDemoData, resetDemoData } from '../server/pr-assurance/reset.mjs';

// As in scripts/dev.mjs: a remote database (for example Neon) can need more than 250 ms per address.
setDefaultAutoSelectFamilyAttemptTimeout(1000);

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
const confirmed = process.argv.slice(2).includes('--yes');
const host = new URL(process.env.DATABASE_URL).hostname;
const db = await openDatabase({ connectionString: process.env.DATABASE_URL, sslMode: process.env.DATABASE_SSL_MODE ?? 'verify-full', ca: process.env.DATABASE_CA });
try {
    const before = await countDemoData(db);
    const summary = `${before.pulls} imported pull requests, ${before.runs} runs, ${before.events} run events`;
    if (!confirmed) {
        console.log(`Database ${host}: ${summary}.\nNothing was changed. Run "npm run demo:reset -- --yes" to remove them.`);
    } else {
        const removed = await resetDemoData(db);
        console.log(`Database ${host}: removed ${removed.pulls} imported pull requests, ${removed.runs} runs and ${removed.events} run events.\nThe demo starts with nothing imported. Nothing else was changed.`);
    }
} catch (error) {
    console.error(error?.message === 'PR_ASSURANCE_MIGRATION_REQUIRED'
        ? 'This database has no PR assurance tables. Run npm run migrate first.'
        : 'DEMO_RESET_FAILED: no secrets logged. Check the database connection.');
    process.exitCode = 1;
} finally {
    await db.close();
}
