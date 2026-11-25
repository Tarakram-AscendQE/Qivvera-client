import { readFileSync } from 'node:fs';
import { digest } from '../assurance/contracts.mjs';

/**
 * The PR assurance add-on keeps its own version ledger, so the workspace schema (8) and every
 * existing module's schema check stay unchanged. Additive: nothing outside pr_assurance_* is touched.
 */
const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
export const prAssuranceChecksum = digest(sql);
export const PR_ASSURANCE_SCHEMA_VERSION = 1;
const LEDGER = `CREATE TABLE IF NOT EXISTS pr_assurance_migrations (
  version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`;

export async function migratePrAssurance(db) {
    return db.transaction(async c => {
        // The same lock as the workspace migrations, so DDL never runs concurrently with them.
        await c.query('SELECT pg_advisory_xact_lock(78124422)');
        await c.exec(LEDGER);
        const rows = (await c.query('SELECT version, checksum FROM pr_assurance_migrations ORDER BY version')).rows;
        if (rows.some(r => Number(r.version) > PR_ASSURANCE_SCHEMA_VERSION)) throw new Error('PR_ASSURANCE_SCHEMA_NEWER_THAN_APPLICATION');
        const prior = rows.find(r => Number(r.version) === PR_ASSURANCE_SCHEMA_VERSION);
        if (prior) {
            if (prior.checksum !== prAssuranceChecksum) throw new Error('PR_ASSURANCE_MIGRATION_CHECKSUM_MISMATCH');
            return;
        }
        await c.exec(sql);
        await c.query('INSERT INTO pr_assurance_migrations(version, checksum, applied_at) VALUES ($1, $2, $3)',
            [PR_ASSURANCE_SCHEMA_VERSION, prAssuranceChecksum, new Date().toISOString()]);
    });
}

/** Read-only: fails unless exactly this version of the add-on tables is applied. */
export async function requirePrAssurance(db) {
    return db.transaction(async c => {
        const exists = (await c.query("SELECT to_regclass('pr_assurance_migrations') AS ledger")).rows[0]?.ledger;
        if (!exists) throw new Error('PR_ASSURANCE_MIGRATION_REQUIRED');
        const rows = (await c.query('SELECT version, checksum FROM pr_assurance_migrations ORDER BY version')).rows;
        if (!rows.some(r => Number(r.version) === PR_ASSURANCE_SCHEMA_VERSION && r.checksum === prAssuranceChecksum) ||
            rows.some(r => Number(r.version) > PR_ASSURANCE_SCHEMA_VERSION))
            throw new Error('PR_ASSURANCE_MIGRATION_REQUIRED');
    }, true);
}
