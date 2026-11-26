import { readFileSync } from 'node:fs';
import { digest } from '../assurance/contracts.mjs';
import { migrateTemplates, requireTemplates } from '../templates/migration.mjs';
import { MAX_SUPPORTED_SCHEMA_VERSION } from '../release.mjs';

/** Schema 8: database-held workspace accounts. Additive; earlier migration bytes are unchanged. */
const sql = readFileSync(new URL('../../migrations/008_workspace_accounts.sql', import.meta.url), 'utf8');
export const accountsChecksum = digest(sql);
export const ACCOUNTS_SCHEMA_VERSION = 8;

export async function migrateAccounts(db) {
    await migrateTemplates(db);
    return db.transaction(async c => {
        await c.query('SELECT pg_advisory_xact_lock(78124422)');
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (rows.some(r => Number(r.version) > MAX_SUPPORTED_SCHEMA_VERSION)) throw new Error('SCHEMA_NEWER_THAN_APPLICATION');
        const prior = rows.find(r => Number(r.version) === ACCOUNTS_SCHEMA_VERSION);
        if (prior) {
            if (prior.checksum !== accountsChecksum) throw new Error('ACCOUNTS_MIGRATION_CHECKSUM_MISMATCH');
            return;
        }
        await c.exec(sql);
        await c.query('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES($1,$2,$3)', [ACCOUNTS_SCHEMA_VERSION, accountsChecksum, new Date().toISOString()]);
    });
}

export async function requireAccounts(db) {
    await requireTemplates(db);
    return db.transaction(async c => {
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (!rows.some(r => Number(r.version) === ACCOUNTS_SCHEMA_VERSION && r.checksum === accountsChecksum) || rows.some(r => Number(r.version) > MAX_SUPPORTED_SCHEMA_VERSION))
            throw new Error('ACCOUNTS_MIGRATION_REQUIRED');
    }, true);
}
