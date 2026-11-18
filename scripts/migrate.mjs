import {migrateIntake} from '../server/intake/migration.mjs';
import {migrateDrafting} from '../server/drafting/migration.mjs';
import { migrateResolution } from '../server/resolution/migration.mjs';
import { migrateAssurance } from '../server/assurance/migration.mjs';
import { openDatabase, migrateDatabase } from '../server/workflow-store.mjs';
if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL_REQUIRED');
const db = await openDatabase({ driver: 'postgres', connectionString: process.env.DATABASE_URL, sslMode: process.env.DATABASE_SSL_MODE ?? 'verify-full', ca: process.env.DATABASE_CA });
try {
    await migrateDatabase(db);
    await migrateAssurance(db);
    await migrateResolution(db);
    await migrateIntake(db);
    await migrateDrafting(db);
    console.log('Schema 6 is current. Existing evidence, resolution history and source receipts retained.');
}
catch {
    console.error('MIGRATION_FAILED: no secrets logged. Ask the database owner to inspect the failure.');
    process.exitCode = 1;
}
finally {
    await db.close();
}
