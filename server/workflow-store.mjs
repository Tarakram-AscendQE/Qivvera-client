/** Shared parameterized adapter. No network connection is made without an explicit URL. */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const here = new URL('../', import.meta.url);
const legacySql = `
CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY,name TEXT NOT NULL,normalized_name TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',repository_url TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS changes (id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),title TEXT NOT NULL,intent TEXT NOT NULL DEFAULT '',source_revision TEXT NOT NULL DEFAULT '',producer TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS obligations (id TEXT PRIMARY KEY,change_id TEXT NOT NULL REFERENCES changes(id),statement TEXT NOT NULL,source_reference TEXT NOT NULL DEFAULT '',criticality TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS changes_application ON changes(application_id);
CREATE INDEX IF NOT EXISTS obligations_change ON obligations(change_id);
`;
const workflowSql = readFileSync(new URL('migrations/002_authority_revisions.sql', here), 'utf8');
export const migrationChecksum = createHash('sha256').update(legacySql + '\n' + workflowSql + '\nbackfill-v2.1').digest('hex');
export function postgresOptions(raw, { sslMode = 'verify-full', ca, max = 3 } = {}) {
    if (typeof raw !== 'string' || !raw)
        throw new Error('DATABASE_URL_REQUIRED');
    if (raw.trim() !== raw || /[\u0000-\u0020\u007f]/u.test(raw))
        throw new Error('INVALID_DATABASE_URL');
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        throw new Error('INVALID_DATABASE_URL');
    }
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname || u.hash)
        throw new Error('INVALID_DATABASE_URL');
    // pg-connection-string lets query keys replace host, port, database and credentials.
    // Accept only known TLS compatibility options, then remove them before passing the URL on.
    const allowedOptions = new Set(['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'channel_binding']);
    const seenOptions = new Set();
    for (const [key] of u.searchParams) {
        if (!allowedOptions.has(key) || seenOptions.has(key)) throw new Error('UNSUPPORTED_DATABASE_URL_OPTION');
        seenOptions.add(key);
    }
    if (!['verify-full', 'disable'].includes(sslMode))
        throw new Error('UNSUPPORTED_DATABASE_SSL_MODE');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (sslMode === 'disable' && !local)
        throw new Error('PLAINTEXT_DATABASE_MUST_BE_LOCAL');
    if (u.searchParams.get('sslmode') === 'disable' && sslMode !== 'disable')
        throw new Error('DATABASE_TLS_REQUIRED');
    for (const k of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
        u.searchParams.delete(k);
    const channelBinding = u.searchParams.get('channel_binding');
    if (channelBinding && !['require', 'prefer', 'disable'].includes(channelBinding))
        throw new Error('INVALID_CHANNEL_BINDING');
    u.searchParams.delete('channel_binding');
    if (!Number.isInteger(max) || max < 1 || max > 5)
        throw new Error('INVALID_POOL_SIZE');
    return { connectionString: u.toString(), ssl: sslMode === 'disable' ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, enableChannelBinding: channelBinding === 'require' || channelBinding === 'prefer', max, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, query_timeout: 15000, statement_timeout: 15000 };
}
export async function openDatabase({ driver = 'sqlite', path = ':memory:', connectionString, sslMode, ca } = {}) {
    if (driver === 'postgres') {
        const { default: pg } = await import('pg');
        const pool = new pg.Pool(postgresOptions(connectionString, { sslMode: sslMode ?? 'verify-full', ca }));
        pool.on('error', () => console.error('DATABASE_POOL_ERROR'));
        return { driver, lock: ' FOR UPDATE', async transaction(fn, readOnly = false) { const c = await pool.connect(); try {
                await c.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
                const v = await fn({ query: (q, p = []) => c.query(q, p), exec: q => c.query(q) });
                await c.query('COMMIT');
                return v;
            }
            catch (e) {
                try {
                    await c.query('ROLLBACK');
                }
                catch { }
                throw e;
            }
            finally {
                c.release();
            } }, async healthy() { return (await pool.query('SELECT 1 AS ok')).rows[0].ok === 1; }, close: () => pool.end() };
    }
    if (driver !== 'sqlite')
        throw new Error('UNSUPPORTED_DATABASE');
    const { DatabaseSync } = await import('node:sqlite');
    if (path !== ':memory:')
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const d = new DatabaseSync(path);
    d.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const query = async (q, params = []) => { const values = []; const sql = q.replace(/\$(\d+)/g, (_, i) => { values.push(params[Number(i) - 1]); return '?'; }); const st = d.prepare(sql); if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql))
        return { rows: st.all(...values) }; const r = st.run(...values); return { rows: [], rowCount: Number(r.changes) }; };
    let queue = Promise.resolve();
    return { driver, lock: '', transaction(fn, readOnly = false) { const work = queue.then(async () => { d.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE'); try {
            const v = await fn({ query, exec: async (q) => d.exec(q) });
            d.exec('COMMIT');
            return v;
        }
        catch (e) {
            try {
                d.exec('ROLLBACK');
            }
            catch { }
            throw e;
        } }); queue = work.catch(() => { }); return work; }, async healthy() { await queue; return d.prepare('SELECT 1 AS ok').get().ok === 1; }, async close() { await queue; d.close(); } };
}
export async function migrateDatabase(db) {
    return db.transaction(async (c) => {
        if (db.driver === 'postgres')
            await c.query('SELECT pg_advisory_xact_lock(78124422)');
        await c.exec(legacySql);
        await c.exec(workflowSql);
        const versions = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows;
        if (versions.some(v => Number(v.version) > 8))
            throw new Error('SCHEMA_NEWER_THAN_APPLICATION');
        const old = versions.find(v => Number(v.version) === 2);
        if (old) {
            if (old.checksum !== migrationChecksum)
                throw new Error('MIGRATION_CHECKSUM_MISMATCH');
            return;
        }
        const changes = (await c.query('SELECT * FROM changes')).rows;
        for (const change of changes) {
            let rev = (await c.query('SELECT * FROM change_revisions WHERE change_id=$1 ORDER BY revision_number DESC', [change.id])).rows[0];
            if (!rev) {
                rev = { id: randomUUID() };
                await c.query('INSERT INTO change_revisions (id,change_id,revision_number,parent_revision_id,source_revision,intent,producer,reason,created_by,created_at) VALUES ($1,$2,1,NULL,$3,$4,$5,$6,$7,$8)', [rev.id, change.id, change.source_revision ?? '', change.intent ?? '', change.producer, 'Imported existing registry; previous revision history is unavailable.', 'legacy-import', new Date(change.created_at).toISOString()]);
            }
            const obligations = (await c.query('SELECT o.* FROM obligations o LEFT JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.change_id=$1 AND w.obligation_id IS NULL', [change.id])).rows;
            for (const o of obligations) {
                await c.query('INSERT INTO obligation_workflow (obligation_id,revision_id,source_version,review_state,proposed_by,last_edited_by,imported) VALUES ($1,$2,$3,$4,$5,$5,1)', [o.id, rev.id, '', 'DRAFT', 'legacy-import']);
                await c.query('INSERT INTO obligation_history (id,obligation_id,version,revision_id,action,actor,rationale,independent_actor,snapshot,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9)', [randomUUID(), o.id, o.version, rev.id, 'IMPORTED', 'migration', 'Existing candidate imported without an invented author or approval.', JSON.stringify({ statement: o.statement, sourceReference: o.source_reference, criticality: o.criticality, reviewStatus: 'DRAFT', sourceVersion: '', imported: true }), new Date().toISOString()]);
            }
        }
        await c.query('INSERT INTO qivvera_migrations (version,checksum,applied_at) VALUES (2,$1,$2)', [migrationChecksum, new Date().toISOString()]);
    });
}
export async function requireSchema(db) { return db.transaction(async (c) => { const r = (await c.query('SELECT * FROM qivvera_migrations ORDER BY version')).rows; const v = r.find(x => Number(x.version) === 2); if (!v || r.some(x => Number(x.version) > 8) || v.checksum !== migrationChecksum)
    throw new Error('WORKFLOW_MIGRATION_REQUIRED'); }, true); }
