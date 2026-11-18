import { readFileSync } from 'node:fs';
import { digest } from '../assurance/contracts.mjs';
import { migrateDrafting, requireDrafting } from '../drafting/migration.mjs';

const sql = readFileSync(new URL('../../migrations/007_verification_templates.sql', import.meta.url), 'utf8');
export const templatesChecksum = digest(sql);
export async function migrateTemplates(db) {
    await migrateDrafting(db);
    return db.transaction(async c => {
        if (db.driver === 'postgres') await c.query('SELECT pg_advisory_xact_lock(78124422)');
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (rows.some(r => Number(r.version) > 7)) throw new Error('SCHEMA_NEWER_THAN_APPLICATION');
        const prior = rows.find(r => Number(r.version) === 7);
        if (prior) {
            if (prior.checksum !== templatesChecksum) throw new Error('TEMPLATES_MIGRATION_CHECKSUM_MISMATCH');
            return;
        }
        await c.exec(sql);
        await c.query('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES(7,$1,$2)', [templatesChecksum, new Date().toISOString()]);
    });
}
export async function requireTemplates(db) {
    await requireDrafting(db);
    return db.transaction(async c => {
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (!rows.some(r => Number(r.version) === 7 && r.checksum === templatesChecksum) || rows.some(r => Number(r.version) > 7))
            throw new Error('TEMPLATES_MIGRATION_REQUIRED');
    }, true);
}
