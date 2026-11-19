import {migrateIntake} from '../server/intake/migration.mjs';
import {migrateDrafting} from '../server/drafting/migration.mjs';
import {migrateTemplates} from '../server/templates/migration.mjs';
import { migrateResolution } from '../server/resolution/migration.mjs';
import { migrateAssurance } from '../server/assurance/migration.mjs';
import { openDatabase, migrateDatabase } from '../server/workflow-store.mjs';

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
    console.log('Schema 7 is current. Existing evidence, resolution history, source receipts and drafting records retained.');
}
catch {
    console.error('MIGRATION_FAILED: no secrets logged. Ask the database owner to inspect the failure.');
    process.exitCode = 1;
}
finally {
    await db.close();
}
