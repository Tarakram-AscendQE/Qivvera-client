/** Synthetic recovery rehearsal only: explicit loopback source, newly created destination, no reset/drop. */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { TABLES, databaseConfig, connectDatabase, beginReadSnapshot, databaseIdentity, databaseProperties, databaseFingerprint,
    quoteIdentifier, releaseIdentity, OperationsError, safeFailure, fail } from './common.mjs';

export function validateRecoveryInputs({ sourceConnectionString, destinationAdminConnectionString,
    destinationDatabase, releaseRevision, binaryDirectory } = {}) {
    const source = databaseConfig(sourceConnectionString, { sslMode: 'disable', kind: 'source' });
    const admin = databaseConfig(destinationAdminConnectionString, { sslMode: 'disable', kind: 'admin' });
    if (typeof destinationDatabase !== 'string' || !/^qivvera_test_restore_[a-z0-9_]+$/.test(destinationDatabase) ||
        Buffer.byteLength(destinationDatabase) > 63) fail('RECOVERY_DESTINATION_NOT_DISPOSABLE');
    // Refuse the source name even across aliases/clusters: an operator must deliberately name a new copy.
    if ([source.database, admin.database].includes(destinationDatabase)) fail('RECOVERY_DESTINATION_IS_SOURCE_OR_ADMIN');
    if (binaryDirectory !== undefined && (typeof binaryDirectory !== 'string' || !isAbsolute(binaryDirectory) || /[\u0000\r\n]/.test(binaryDirectory)))
        fail('INVALID_POSTGRES_BINARY_DIRECTORY');
    const destinationURL = new URL(admin.connectionString); destinationURL.pathname = '/' + destinationDatabase;
    return { source, admin, destination: databaseConfig(destinationURL.toString(), { sslMode: 'disable', kind: 'source' }),
        destinationDatabase, releaseRevision: releaseIdentity(releaseRevision), binaryDirectory };
}

function commandEnvironment(config, readOnly) {
    // Intentionally do not inherit PGHOSTADDR, PGSERVICE, PGOPTIONS or unrelated secrets.
    return { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
        PGHOST: config.hostname.replace(/^\[|\]$/g, ''), PGPORT: config.port, PGDATABASE: config.database,
        PGUSER: config.username, PGPASSWORD: config.password, PGSSLMODE: 'disable',
        PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null', PGCONNECT_TIMEOUT: '5',
        PGAPPNAME: 'qivvera-isolated-recovery',
        PGOPTIONS: '-c statement_timeout=60000 -c lock_timeout=10000 -c timezone=UTC' + (readOnly ? ' -c default_transaction_read_only=on' : '') };
}
function runTool(executable, args, env, code, timeout = 65000) {
    return new Promise((resolve, reject) => {
        let output = '', outputBytes = 0, settled = false;
        const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
        const finish = error => {
            if (settled) return; settled = true; clearTimeout(timer);
            if (error) reject(new OperationsError(code)); else resolve(output);
        };
        const timer = setTimeout(() => { child.kill('SIGKILL'); finish(true); }, timeout);
        child.on('error', () => finish(true));
        child.stdout.on('data', value => { outputBytes += value.length; if (outputBytes > 65536) { child.kill('SIGKILL'); finish(true); } else output += value.toString(); });
        child.stderr.on('data', value => { outputBytes += value.length; if (outputBytes > 65536) { child.kill('SIGKILL'); finish(true); } });
        child.on('close', status => finish(status !== 0));
    });
}
async function toolMajor(binary, environment) {
    const text = await runTool(binary, ['--version'], environment, 'RECOVERY_POSTGRES_CLIENT_UNAVAILABLE', 10000);
    const match = /\(PostgreSQL\)\s+(\d+)\./.exec(text);
    if (!match) fail('RECOVERY_POSTGRES_CLIENT_VERSION_UNKNOWN');
    return Number(match[1]);
}
function requireLoopbackIdentity(identity, config) {
    // A Docker port published on loopback can report a container-private backend address/port.
    // The checked/reconstructed connection URL binds the client endpoint; verify database/login here.
    if (identity.database !== config.database || identity.role !== config.username || identity.login !== config.username)
        fail('RECOVERY_CONNECTED_IDENTITY_MISMATCH');
    if (identity.version < 160000) fail('RECOVERY_REQUIRES_POSTGRES_16_OR_LATER');
}
async function fileDigest(path) {
    const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex');
}

export async function rehearseRecovery(input = {}) {
    // This runs before importing a database driver, launching a client tool or opening a connection.
    const config = validateRecoveryInputs(input);
    const started = Date.now(), beganAt = new Date(started).toISOString();
    let sourceClient, adminClient, destinationClient, directory, destinationCreated = false;
    const safeReceipt = () => ({ schema: 'qivvera.recovery-rehearsal/1', startedAt: beganAt,
        releaseRevision: config.releaseRevision, destinationDatabase: config.destinationDatabase, destinationCreated,
        sourceModified: false, sourceReset: false, destinationDropped: false, releaseAcceptance: 'not-evaluated' });
    try {
        const dump = config.binaryDirectory ? join(config.binaryDirectory, 'pg_dump') : 'pg_dump';
        const restore = config.binaryDirectory ? join(config.binaryDirectory, 'pg_restore') : 'pg_restore';
        const dumpMajor = await toolMajor(dump, commandEnvironment(config.source, true));
        const restoreMajor = await toolMajor(restore, commandEnvironment(config.destination, false));
        sourceClient = await connectDatabase(config.source); adminClient = await connectDatabase(config.admin);
        await beginReadSnapshot(sourceClient);
        const sourceIdentity = await databaseIdentity(sourceClient), adminIdentity = await databaseIdentity(adminClient);
        requireLoopbackIdentity(sourceIdentity, config.source); requireLoopbackIdentity(adminIdentity, config.admin);
        const serverMajor = Math.floor(sourceIdentity.version / 10000);
        if (serverMajor !== Math.floor(adminIdentity.version / 10000) || serverMajor !== dumpMajor || serverMajor !== restoreMajor)
            fail('RECOVERY_POSTGRES_MAJOR_VERSION_MISMATCH');
        const sourceProperties = await databaseProperties(sourceClient), templateProperties = await databaseProperties(adminClient, 'template0');
        if (sourceProperties.has_database_settings || templateProperties.has_database_settings) fail('RECOVERY_DATABASE_SETTINGS_UNSUPPORTED');
        if (sourceProperties.collation_version !== sourceProperties.actual_collation_version) fail('RECOVERY_COLLATION_VERSION_MISMATCH');
        // template0 may intentionally have no recorded collation version. A freshly created database
        // records the destination provider's actual version, which must match the source's verified version.
        const destinationDefaults = { ...templateProperties, collation_version: templateProperties.actual_collation_version };
        if (JSON.stringify(sourceProperties) !== JSON.stringify(destinationDefaults)) fail('RECOVERY_DATABASE_PROPERTIES_MISMATCH');
        const existing = await adminClient.query('SELECT oid FROM pg_catalog.pg_database WHERE datname=$1', [config.destinationDatabase]);
        if (existing.rows.length) fail('RECOVERY_DESTINATION_ALREADY_EXISTS');

        const snapshot = (await sourceClient.query('SELECT pg_catalog.pg_export_snapshot() AS id')).rows[0].id;
        if (!/^[A-Fa-f0-9-]+$/.test(snapshot)) fail('RECOVERY_SNAPSHOT_ID_INVALID');
        const before = await databaseFingerprint(sourceClient);
        directory = await mkdtemp(join(tmpdir(), 'qivvera-recovery-')); await chmod(directory, 0o700);
        const archive = join(directory, 'schema7.dump');
        await runTool(dump, ['--format=custom', '--no-owner', '--no-privileges', '--no-password', '--strict-names',
            '--snapshot=' + snapshot, '--file=' + archive, ...TABLES.map(table => '--table=public.' + table)],
        commandEnvironment(config.source, true), 'RECOVERY_DUMP_FAILED');
        await chmod(archive, 0o600);
        const archiveDigest = await fileDigest(archive);
        // The exported source snapshot stays alive until pg_dump is finished. Hashes and archive describe that same snapshot.
        await sourceClient.query('ROLLBACK'); await sourceClient.end(); sourceClient = null;

        // CREATE DATABASE fails atomically if another process took this name; we never reuse, clean or overwrite it.
        if ((await adminClient.query('SELECT oid FROM pg_catalog.pg_database WHERE datname=$1', [config.destinationDatabase])).rows.length)
            fail('RECOVERY_DESTINATION_ALREADY_EXISTS');
        try { await adminClient.query(`CREATE DATABASE ${quoteIdentifier(config.destinationDatabase)} TEMPLATE template0`); }
        catch (error) { if (error.code === '42P04') fail('RECOVERY_DESTINATION_ALREADY_EXISTS'); throw error; }
        destinationCreated = true;
        const created = (await adminClient.query('SELECT oid,datdba FROM pg_catalog.pg_database WHERE datname=$1', [config.destinationDatabase])).rows[0];
        if (!created) fail('RECOVERY_CREATED_DATABASE_MISSING');
        destinationClient = await connectDatabase(config.destination);
        const destinationIdentity = await databaseIdentity(destinationClient); requireLoopbackIdentity(destinationIdentity, config.destination);
        if (JSON.stringify(await databaseProperties(destinationClient)) !== JSON.stringify(sourceProperties))
            fail('RECOVERY_DATABASE_PROPERTIES_MISMATCH');
        const actual = (await destinationClient.query('SELECT oid,datdba FROM pg_catalog.pg_database WHERE datname=current_database()')).rows[0];
        if (String(actual.oid) !== String(created.oid) || String(actual.datdba) !== String(created.datdba)) fail('RECOVERY_DESTINATION_IDENTITY_CHANGED');
        const relations = (await destinationClient.query(`SELECT COUNT(*)::integer AS count FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')`)).rows[0].count;
        if (relations !== 0) fail('RECOVERY_NEW_DESTINATION_NOT_EMPTY');
        await destinationClient.end(); destinationClient = null;
        await runTool(restore, ['--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '--no-password',
            '--dbname=' + config.destinationDatabase, archive], commandEnvironment(config.destination, false), 'RECOVERY_RESTORE_FAILED');
        destinationClient = await connectDatabase(config.destination); await beginReadSnapshot(destinationClient);
        const after = await databaseFingerprint(destinationClient);
        if (JSON.stringify(before) !== JSON.stringify(after)) fail('RECOVERY_RESTORED_CONTENT_MISMATCH');
        return { ...safeReceipt(), passed: true, completedAt: new Date().toISOString(), durationMs: Date.now() - started,
            postgresMajor: serverMajor, snapshotMethod: 'repeatable-read source snapshot shared with pg_dump',
            archiveDigest, schemaDigest: after.schemaDigest, contentDigest: after.contentDigest, databaseProperties: after.properties,
            schemaVersion: after.schemaVersion, totalRows: after.totalRows, tables: after.tables,
            runtimeGrantsRestored: false, applicationAcceptance: 'not-evaluated',
            limitations: ['Synthetic loopback database rehearsal; no hosted backup or provider recovery was tested.',
                'Owners and ACLs are intentionally omitted. Apply reviewed runtime grants to the separate copy before any application use.',
                'Concurrent source writes after the snapshot are excluded and require separate reconciliation.',
                'The destination is retained for inspection on success or failure; this command never drops a database.'] };
    } catch (error) {
        throw new OperationsError(safeFailure(error, 'RECOVERY_REHEARSAL_FAILED'), { ...safeReceipt(), passed: false,
            completedAt: new Date().toISOString(), durationMs: Date.now() - started });
    } finally {
        for (const client of [destinationClient, sourceClient, adminClient]) if (client) {
            await client.query('ROLLBACK').catch(() => {}); await client.end().catch(() => {});
        }
        if (directory) await rm(directory, { recursive: true, force: true });
    }
}
