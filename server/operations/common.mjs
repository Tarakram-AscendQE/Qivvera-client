/** Explicit operator tools. No connection, migration or mutation occurs on import. */
import { createHash } from 'node:crypto';
import { postgresOptions, migrationChecksum } from '../workflow-store.mjs';
import { assuranceChecksum } from '../assurance/migration.mjs';
import { resolutionChecksum } from '../resolution/migration.mjs';
import { intakeChecksum } from '../intake/migration.mjs';
import { draftingChecksum } from '../drafting/migration.mjs';
import { templatesChecksum } from '../templates/migration.mjs';

export const TABLE_KEYS = Object.freeze({
    applications: ['id'], changes: ['id'], obligations: ['id'], activity: ['id'],
    qivvera_migrations: ['version'], change_revisions: ['id'], obligation_workflow: ['obligation_id'],
    obligation_history: ['id'], workspace_sessions: ['token_hash'], auth_buckets: ['bucket_key'],
    assurance_plans: ['id'], assurance_runs: ['id'], assurance_evidence: ['run_id'],
    resolution_items: ['id'], resolution_history: ['id'], resolution_challenges: ['id'],
    source_previews: ['id'], source_imports: ['id'], source_backoff: ['repository_key'],
    drafting_runs: ['id'], drafting_suggestions: ['id'], verification_templates: ['id'],
    verification_template_versions: ['id'], verification_template_mutations: ['id'],
    verification_template_uses: ['plan_id']
});
export const TABLES = Object.freeze(Object.keys(TABLE_KEYS).sort());
export const EXPECTED_MIGRATIONS = Object.freeze([
    { version: 2, checksum: migrationChecksum }, { version: 3, checksum: assuranceChecksum },
    { version: 4, checksum: resolutionChecksum }, { version: 5, checksum: intakeChecksum },
    { version: 6, checksum: draftingChecksum }, { version: 7, checksum: templatesChecksum }
]);
export class OperationsError extends Error {
    constructor(code, receipt) { super(code); this.code = code; if (receipt) this.receipt = receipt; }
}
export const fail = code => { throw new OperationsError(code); };
export function safeFailure(error, fallback = 'OPERATIONS_FAILED') {
    return error instanceof OperationsError ? error.code : fallback;
}
export function releaseIdentity(value) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value)) fail('INVALID_RELEASE_REVISION');
    return value.toLowerCase();
}
export function quoteIdentifier(value) { return '"' + value.replaceAll('"', '""') + '"'; }

/** Reconstruct from explicit components: URL query options cannot override the checked host/user. */
export function databaseConfig(raw, { sslMode = 'verify-full', ca, kind = 'runtime' } = {}) {
    if (typeof raw !== 'string' || raw.trim() !== raw || !raw || /[\u0000-\u0020\u007f]/u.test(raw)) fail('INVALID_DATABASE_CONFIGURATION');
    let u, database, username, password;
    try {
        u = new URL(raw); database = decodeURIComponent(u.pathname.slice(1));
        username = decodeURIComponent(u.username); password = decodeURIComponent(u.password);
    } catch { fail('INVALID_DATABASE_CONFIGURATION'); }
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !u.hostname || u.hash || !username ||
        !database || /[\/\u0000-\u001f\u007f]/u.test(database + username + password)) fail('INVALID_DATABASE_CONFIGURATION');
    if (!['verify-full', 'disable'].includes(sslMode)) fail('INVALID_DATABASE_TLS_MODE');
    const params = [...u.searchParams.entries()];
    if (params.length > 1 || params.some(([k, v]) => k !== 'sslmode' || v !== sslMode)) fail('DATABASE_QUERY_OPTIONS_NOT_ALLOWED');
    const hostname = u.hostname.toLowerCase(), loopback = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    if (kind !== 'runtime' && (!loopback || sslMode !== 'disable')) fail('RECOVERY_REQUIRES_PLAINTEXT_LOOPBACK_TEST_DATABASE');
    if (sslMode === 'disable' && !loopback) fail('DATABASE_TLS_REQUIRED');
    if (kind === 'source' && !/^qivvera_test_[a-z0-9_]+$/.test(database)) fail('RECOVERY_SOURCE_NOT_DISPOSABLE');
    if (kind === 'admin' && database !== 'postgres' && !/^qivvera_test_[a-z0-9_]+$/.test(database)) fail('RECOVERY_ADMIN_DATABASE_NOT_ALLOWED');
    if (Buffer.byteLength(database, 'utf8') > 63 || Buffer.byteLength(username, 'utf8') > 63) fail('DATABASE_IDENTIFIER_TOO_LONG');
    u.search = ''; u.hash = '';
    // Recovery never relies on hostname resolution or URI options to choose its destination.
    if (kind !== 'runtime' && hostname === 'localhost') u.hostname = '127.0.0.1';
    const port = u.port || '5432';
    return { connectionString: u.toString(), sslMode, ca, database, username, password, hostname: u.hostname.toLowerCase(), port,
        endpoint: `${u.hostname}:${port}`, identity: `${u.hostname}:${port}/${database}`, loopback };
}
export async function connectDatabase(config) {
    const { default: pg } = await import('pg');
    const client = new pg.Client(postgresOptions(config.connectionString, { sslMode: config.sslMode, ca: config.ca }));
    client.on('error', () => {}); // Callers emit fixed codes; driver events must never print credentials.
    try { await client.connect(); return client; } catch (error) { await client.end().catch(() => {}); throw error; }
}
export async function beginReadSnapshot(client) {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL search_path = pg_catalog");
    await client.query("SET LOCAL timezone = 'UTC'");
}
export async function databaseIdentity(client) {
    return (await client.query(`SELECT current_database() AS database, current_user AS role, session_user AS login,
        inet_server_addr()::text AS address, inet_server_port() AS port,
        current_setting('server_version_num')::integer AS version`)).rows[0];
}
export async function databaseProperties(client, name = null) {
    const row = (await client.query(`SELECT pg_catalog.pg_encoding_to_char(d.encoding) AS encoding,
        d.datlocprovider AS provider,d.datcollate AS collate,d.datctype AS ctype,
        COALESCE(to_jsonb(d)->>'datlocale',to_jsonb(d)->>'daticulocale') AS locale,
        d.daticurules AS icu_rules,d.datcollversion AS collation_version,
        pg_catalog.pg_database_collation_actual_version(d.oid) AS actual_collation_version,
        EXISTS(SELECT 1 FROM pg_catalog.pg_db_role_setting s WHERE s.setdatabase=d.oid AND s.setrole=0
            AND cardinality(s.setconfig)>0) AS has_database_settings
        FROM pg_catalog.pg_database d WHERE d.datname=COALESCE($1,current_database())`, [name])).rows[0];
    if (!row) fail('RECOVERY_DATABASE_PROPERTIES_UNAVAILABLE');
    return row;
}
export async function requireCurrentSchema(client) {
    const found = (await client.query(`SELECT c.relname AS name, c.relkind AS kind FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname COLLATE "C"`)).rows;
    if (JSON.stringify(found) !== JSON.stringify(TABLES.map(name => ({ name, kind: 'r' })))) fail('OPERATIONS_SCHEMA_SHAPE_MISMATCH');
    const migrations = (await client.query('SELECT version,checksum FROM public.qivvera_migrations ORDER BY version')).rows
        .map(row => ({ version: Number(row.version), checksum: row.checksum }));
    if (JSON.stringify(migrations) !== JSON.stringify(EXPECTED_MIGRATIONS)) fail('OPERATIONS_MIGRATION_MISMATCH');
    return migrations;
}
export const digestJSON = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Bounded-memory row fingerprints from the caller's one repeatable-read snapshot. No row values leave this function. */
export async function databaseFingerprint(client) {
    const migrations = await requireCurrentSchema(client);
    const properties = await databaseProperties(client);
    const columns = (await client.query(`SELECT c.relname AS table_name,a.attname AS name,
        pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,
        pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_value,
        cn.nspname AS collation_schema,co.collname AS collation_name
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
        LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
        LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=co.collnamespace
        WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname COLLATE "C",a.attnum`)).rows;
    const constraints = (await client.query(`SELECT c.relname AS table_name,k.conname AS name,
        pg_catalog.pg_get_constraintdef(k.oid,true) AS definition
        FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
        ORDER BY c.relname COLLATE "C",k.conname COLLATE "C"`)).rows;
    const indexes = (await client.query(`SELECT tablename AS table_name,indexname AS name,indexdef AS definition
        FROM pg_catalog.pg_indexes WHERE schemaname='public' ORDER BY tablename COLLATE "C",indexname COLLATE "C"`)).rows;
    const tables = []; let bytes = 0, totalRows = 0;
    for (const table of TABLES) {
        const hash = createHash('sha256'); let rows = 0;
        await client.query(`DECLARE recovery_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS value
            FROM public.${quoteIdentifier(table)} t ORDER BY ${TABLE_KEYS[table].map(key => quoteIdentifier(key) + '::text COLLATE "C"').join(',')}`);
        try {
            while (true) {
                const batch = (await client.query('FETCH FORWARD 256 FROM recovery_rows')).rows;
                if (!batch.length) break;
                for (const row of batch) {
                    bytes += Buffer.byteLength(row.value, 'utf8'); totalRows++; rows++;
                    if (bytes > 512 * 1024 * 1024 || totalRows > 1000000) fail('RECOVERY_SNAPSHOT_LIMIT_EXCEEDED');
                    hash.update(row.value).update('\n');
                }
            }
        } finally { await client.query('CLOSE recovery_rows').catch(() => {}); }
        tables.push({ table, rows, digest: hash.digest('hex') });
    }
    return { schemaVersion: 7, migrations, properties, schemaDigest: digestJSON({ properties, columns, constraints, indexes }), tables,
        totalRows, contentDigest: digestJSON(tables) };
}
