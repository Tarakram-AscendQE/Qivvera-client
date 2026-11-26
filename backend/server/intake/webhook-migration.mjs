import { readFileSync } from 'node:fs';
import { digest } from '../assurance/contracts.mjs';
import { migrateAccounts, requireAccounts } from '../accounts/migration.mjs';
import { MAX_SUPPORTED_SCHEMA_VERSION } from '../release.mjs';

/** Schema 9: signed GitHub webhook receipts and pull-request activity. Additive; earlier bytes unchanged. */
const sql = readFileSync(new URL('../../migrations/009_github_webhooks.sql', import.meta.url), 'utf8');
export const webhooksChecksum = digest(sql);
export const WEBHOOKS_SCHEMA_VERSION = 9;

export async function migrateWebhooks(db) {
    await migrateAccounts(db);
    return db.transaction(async c => {
        if (db.driver === 'postgres') await c.query('SELECT pg_advisory_xact_lock(78124422)');
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (rows.some(r => Number(r.version) > MAX_SUPPORTED_SCHEMA_VERSION)) throw new Error('SCHEMA_NEWER_THAN_APPLICATION');
        const prior = rows.find(r => Number(r.version) === WEBHOOKS_SCHEMA_VERSION);
        if (prior) {
            if (prior.checksum !== webhooksChecksum) throw new Error('WEBHOOKS_MIGRATION_CHECKSUM_MISMATCH');
            return;
        }
        await c.exec(sql);
        await c.query('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES($1,$2,$3)', [WEBHOOKS_SCHEMA_VERSION, webhooksChecksum, new Date().toISOString()]);
    });
}

export async function requireWebhooks(db) {
    await requireAccounts(db);
    return db.transaction(async c => {
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (!rows.some(r => Number(r.version) === WEBHOOKS_SCHEMA_VERSION && r.checksum === webhooksChecksum) || rows.some(r => Number(r.version) > MAX_SUPPORTED_SCHEMA_VERSION))
            throw new Error('WEBHOOKS_MIGRATION_REQUIRED');
    }, true);
}
