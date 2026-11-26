import { readFileSync } from 'node:fs';
import { digest } from '../assurance/contracts.mjs';

/**
 * The PR assurance add-on keeps its own version ledger, so the workspace schema and every existing
 * module's schema check stay unchanged. Additive: nothing outside pr_assurance_* is changed.
 *
 *   1  imported pulls, runs and run events (the single VendorPay demo)
 *   2  one GitHub connection per application (encrypted token), rules snapshots, pulls and runs per application
 *
 * A released version's SQL never changes: its checksum is verified on every start.
 */
const MIGRATIONS = Object.freeze([1, 2].map(version => {
    const sql = readFileSync(new URL(version === 1 ? './schema.sql' : `./schema-v${version}.sql`, import.meta.url), 'utf8');
    return Object.freeze({ version, sql, checksum: digest(sql) });
}));
export const prAssuranceChecksum = MIGRATIONS[0].checksum;
export const prAssuranceChecksums = Object.freeze(Object.fromEntries(MIGRATIONS.map(m => [m.version, m.checksum])));
export const PR_ASSURANCE_SCHEMA_VERSION = MIGRATIONS.at(-1).version;
const LEDGER = `CREATE TABLE IF NOT EXISTS pr_assurance_migrations (
  version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`;

function checkLedger(rows) {
    if (rows.some(r => Number(r.version) > PR_ASSURANCE_SCHEMA_VERSION)) throw new Error('PR_ASSURANCE_SCHEMA_NEWER_THAN_APPLICATION');
    for (const r of rows) {
        if (r.checksum !== prAssuranceChecksums[Number(r.version)]) throw new Error('PR_ASSURANCE_MIGRATION_CHECKSUM_MISMATCH');
    }
}

export async function migratePrAssurance(db) {
    return db.transaction(async c => {
        // The same lock as the workspace migrations, so DDL never runs concurrently with them.
        await c.query('SELECT pg_advisory_xact_lock(78124422)');
        await c.exec(LEDGER);
        const rows = (await c.query('SELECT version, checksum FROM pr_assurance_migrations ORDER BY version')).rows;
        checkLedger(rows);
        for (const migration of MIGRATIONS) {
            if (rows.some(r => Number(r.version) === migration.version)) continue;
            await c.exec(migration.sql);
            await c.query('INSERT INTO pr_assurance_migrations(version, checksum, applied_at) VALUES ($1, $2, $3)',
                [migration.version, migration.checksum, new Date().toISOString()]);
        }
    });
}

/** Read-only: fails unless exactly these versions of the add-on tables are applied. */
export async function requirePrAssurance(db) {
    return db.transaction(async c => {
        const exists = (await c.query("SELECT to_regclass('pr_assurance_migrations') AS ledger")).rows[0]?.ledger;
        if (!exists) throw new Error('PR_ASSURANCE_MIGRATION_REQUIRED');
        const rows = (await c.query('SELECT version, checksum FROM pr_assurance_migrations ORDER BY version')).rows;
        const current = MIGRATIONS.every(m => rows.some(r => Number(r.version) === m.version && r.checksum === m.checksum));
        if (!current || rows.some(r => Number(r.version) > PR_ASSURANCE_SCHEMA_VERSION)) throw new Error('PR_ASSURANCE_MIGRATION_REQUIRED');
    }, true);
}
