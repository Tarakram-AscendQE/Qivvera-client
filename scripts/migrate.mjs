import { migrateAssurance } from '../server/assurance/migration.mjs';
import { openDatabase, migrateDatabase } from '../server/workflow-store.mjs';

try { process.loadEnvFile('.env'); } catch {}

if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL_REQUIRED');
const db = await openDatabase({ driver: 'postgres', connectionString: process.env.DATABASE_URL, sslMode: process.env.DATABASE_SSL_MODE ?? 'verify-full', ca: process.env.DATABASE_CA });
try {
    await migrateDatabase(db);
    await migrateAssurance(db);
    console.log('Workflow and assurance schema 3 are current. Existing records retained.');
}
catch {
    console.error('MIGRATION_FAILED: no secrets logged. Ask the database owner to inspect the failure.');
    process.exitCode = 1;
}
finally {
    await db.close();
}
