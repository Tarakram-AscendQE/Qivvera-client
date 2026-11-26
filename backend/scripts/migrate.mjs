import {migrateIntake} from '../server/intake/migration.mjs';
import {migrateDrafting} from '../server/drafting/migration.mjs';
import {migrateTemplates} from '../server/templates/migration.mjs';
import {migrateAccounts} from '../server/accounts/migration.mjs';
import { migratePrAssurance } from '../server/pr-assurance/migration.mjs';
import {migrateWebhooks} from '../server/intake/webhook-migration.mjs';
import { migrateResolution } from '../server/resolution/migration.mjs';
import { migrateAssurance } from '../server/assurance/migration.mjs';
import { openDatabase, migrateDatabase } from '../server/workflow-store.mjs';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

// As in scripts/dev.mjs: a remote database (for example Neon in the US) can take longer than Node's
// default 250 ms per address to accept a connection, so every address fails with ETIMEDOUT.
setDefaultAutoSelectFamilyAttemptTimeout(1000);

try { process.loadEnvFile('.env'); } catch {}

if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL_REQUIRED');
const db = await openDatabase({ driver: 'postgres', connectionString: process.env.DATABASE_URL, sslMode: process.env.DATABASE_SSL_MODE ?? 'verify-full', ca: process.env.DATABASE_CA });
try {
    await migrateDatabase(db);
    await migrateAssurance(db);
    await migrateResolution(db);
    await migrateIntake(db);
    await migrateDrafting(db);
    await migrateTemplates(db);
    await migrateAccounts(db);
    await migrateWebhooks(db);
    // The PR assurance add-on keeps its own version ledger, independent of the workspace schema.
    await migratePrAssurance(db);
    console.log('Schema 9 is current, and so are the PR assurance add-on tables. Existing evidence, resolution history, source receipts, drafting records, accounts and webhook receipts retained.');
}
catch {
    console.error('MIGRATION_FAILED: no secrets logged. Ask the database owner to inspect the failure.');
    process.exitCode = 1;
}
finally {
    await db.close();
}
