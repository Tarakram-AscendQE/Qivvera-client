import { readFileSync } from 'node:fs';
import { digest } from '../assurance/contracts.mjs';
import { migrateIntake, requireIntake } from '../intake/migration.mjs';

const sql = readFileSync(new URL('../../migrations/006_obligation_drafting.sql', import.meta.url), 'utf8');
export const draftingChecksum = digest(sql);

export async function migrateDrafting(db) {
    await migrateIntake(db);
    return db.transaction(async c => {
        if (db.driver === 'postgres') await c.query('SELECT pg_advisory_xact_lock(78124422)');
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (rows.some(r => Number(r.version) > 9)) throw new Error('SCHEMA_NEWER_THAN_APPLICATION');
        const prior = rows.find(r => Number(r.version) === 6);
        if (prior) {
            if (prior.checksum !== draftingChecksum) throw new Error('DRAFTING_MIGRATION_CHECKSUM_MISMATCH');
            return;
        }
        await c.exec(sql);
        await c.query('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES(6,$1,$2)', [draftingChecksum, new Date().toISOString()]);
    });
}

export async function requireDrafting(db) {
    await requireIntake(db);
    return db.transaction(async c => {
        const rows = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (!rows.some(r => Number(r.version) === 6 && r.checksum === draftingChecksum) || rows.some(r => Number(r.version) > 9))
            throw new Error('DRAFTING_MIGRATION_REQUIRED');
    }, true);
}
