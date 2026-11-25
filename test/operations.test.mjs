import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { TABLES, databaseConfig, safeFailure, releaseIdentity } from '../backend/server/operations/common.mjs';
import { validatePermissionInputs } from '../backend/server/operations/permissions.mjs';
import { validateRecoveryInputs, rehearseRecovery } from '../backend/server/operations/recovery.mjs';

const revision = 'a'.repeat(40);
const recovery = overrides => ({ sourceConnectionString: 'postgresql://reader:private-synthetic@127.0.0.1:5432/qivvera_test_source',
    destinationAdminConnectionString: 'postgresql://operator:another-synthetic@127.0.0.1:5433/postgres',
    destinationDatabase: 'qivvera_test_restore_copy', releaseRevision: revision, ...overrides });
const expectCode = (fn, code) => assert.throws(fn, error => error.code === code && error.message === code);

test('operations / backup inventory covers every currently created application table', () => {
    const texts = [readFileSync('backend/server/workflow-store.mjs', 'utf8'), ...readdirSync('backend/migrations').filter(n => n.endsWith('.sql')).map(n => readFileSync(join('backend/migrations', n), 'utf8'))];
    const found = [...new Set(texts.flatMap(text => [...text.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(match => match[1])))].sort();
    assert.deepEqual(TABLES, found);
});
test('operations / recovery accepts separate explicit source and destination administrator endpoints', () => {
    const v = validateRecoveryInputs(recovery());
    assert.equal(v.source.port, '5432'); assert.equal(v.admin.port, '5433');
    assert.equal(v.source.username, 'reader'); assert.equal(v.destination.username, 'operator');
    assert.equal(v.destination.database, 'qivvera_test_restore_copy');
});
test('operations / recovery refuses remote sources and administrators before any client work', async () => {
    for (const field of ['sourceConnectionString', 'destinationAdminConnectionString']) {
        const value = recovery(); value[field] = value[field].replace('127.0.0.1', 'database.example.test');
        await assert.rejects(rehearseRecovery({ ...value, binaryDirectory: '/intentionally-unavailable-clients' }),
            error => error.code === 'RECOVERY_REQUIRES_PLAINTEXT_LOOPBACK_TEST_DATABASE');
    }
});
test('operations / recovery refuses a non-disposable source and arbitrary administrative database', () => {
    expectCode(() => validateRecoveryInputs(recovery({ sourceConnectionString: recovery().sourceConnectionString.replace('qivvera_test_source', 'production') })), 'RECOVERY_SOURCE_NOT_DISPOSABLE');
    expectCode(() => validateRecoveryInputs(recovery({ destinationAdminConnectionString: recovery().destinationAdminConnectionString.replace('/postgres', '/working_data') })), 'RECOVERY_ADMIN_DATABASE_NOT_ALLOWED');
});
test('operations / recovery refuses source-as-destination, SQL identifiers and truncated names', () => {
    expectCode(() => validateRecoveryInputs(recovery({ sourceConnectionString: recovery().sourceConnectionString.replace('qivvera_test_source', 'qivvera_test_restore_copy') })), 'RECOVERY_DESTINATION_IS_SOURCE_OR_ADMIN');
    for (const destinationDatabase of ['working_copy', 'qivvera_test_restore_a;DROP DATABASE other', 'qivvera_test_restore_' + 'a'.repeat(50)])
        expectCode(() => validateRecoveryInputs(recovery({ destinationDatabase })), 'RECOVERY_DESTINATION_NOT_DISPOSABLE');
});
test('operations / URI query options cannot change a checked host, user, database or session', () => {
    for (const query of ['host=remote.example.test', 'hostaddr=1.2.3.4', 'user=other', 'options=-c%20role=owner', 'sslmode=disable&sslmode=disable'])
        expectCode(() => validateRecoveryInputs(recovery({ sourceConnectionString: recovery().sourceConnectionString + '?' + query })), 'DATABASE_QUERY_OPTIONS_NOT_ALLOWED');
});
test('operations / localhost recovery is reconstructed as a numeric loopback connection', () => {
    const v = validateRecoveryInputs(recovery({ sourceConnectionString: recovery().sourceConnectionString.replace('127.0.0.1', 'localhost') }));
    assert.equal(v.source.hostname, '127.0.0.1'); assert.equal(new URL(v.source.connectionString).hostname, '127.0.0.1');
});
test('operations / explicit local TLS option is stripped and unsupported TLS policy fails', () => {
    const v = validateRecoveryInputs(recovery({ sourceConnectionString: recovery().sourceConnectionString + '?sslmode=disable' }));
    assert.equal(new URL(v.source.connectionString).search, '');
    expectCode(() => databaseConfig('postgresql://web:secret@host.example.test/database', { sslMode: 'disable' }), 'DATABASE_TLS_REQUIRED');
});
test('operations / fragments, credentials with controls and missing explicit identities fail safely', () => {
    for (const url of ['postgresql://u:secret@127.0.0.1/qivvera_test_a#other', 'postgresql://u:secret%00@127.0.0.1/qivvera_test_a',
        'postgresql://127.0.0.1/qivvera_test_a', 'postgresql://u:secret@127.0.0.1/'])
        expectCode(() => databaseConfig(url, { sslMode: 'disable' }), 'INVALID_DATABASE_CONFIGURATION');
});
test('operations / permission audit requires separate roles on the exact same configured database', () => {
    const webConnectionString = 'postgresql://web:secret@127.0.0.1/qivvera_test_a';
    const workerConnectionString = 'postgresql://worker:secret@127.0.0.1/qivvera_test_a';
    assert.equal(validatePermissionInputs({ webConnectionString, workerConnectionString, sslMode: 'disable' }).webConfig.database, 'qivvera_test_a');
    expectCode(() => validatePermissionInputs({ webConnectionString, workerConnectionString: webConnectionString, sslMode: 'disable' }), 'RUNTIME_ROLES_MUST_BE_DISTINCT');
    expectCode(() => validatePermissionInputs({ webConnectionString, workerConnectionString: workerConnectionString.replace('qivvera_test_a', 'qivvera_test_b'), sslMode: 'disable' }), 'RUNTIME_DATABASE_IDENTITY_MISMATCH');
});
test('operations / identity and error helpers never promote truncated revisions or raw provider errors', () => {
    assert.equal(releaseIdentity(revision), revision); assert.equal(releaseIdentity(undefined), null);
    expectCode(() => releaseIdentity('1e67bd6'), 'INVALID_RELEASE_REVISION');
    assert.equal(safeFailure(new Error('postgresql://private-user:private-password@private-host/database')), 'OPERATIONS_FAILED');
});
test('operations / CLI safety rejection emits a failed record without exposing connection secrets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qivvera-operations-output-'));
    try {
        const result = spawnSync(process.execPath, ['backend/scripts/rehearse-recovery.mjs'], { encoding: 'utf8', env: {
            PATH: process.env.PATH, QIVVERA_RELEASE_SHA: revision, QIVVERA_TEST_OUTPUT: dir,
            QIVVERA_RECOVERY_SOURCE_DATABASE_URL: 'postgresql://private-user:private-password@remote-secret.example.test/qivvera_test_a',
            QIVVERA_RECOVERY_ADMIN_DATABASE_URL: recovery().destinationAdminConnectionString,
            QIVVERA_RECOVERY_DESTINATION: 'qivvera_test_restore_a'
        } });
        assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).passed, false);
        const saved = readFileSync(join(dir, 'recovery-rehearsal-report.json'), 'utf8');
        for (const secret of ['private-user', 'private-password', 'remote-secret', 'another-synthetic'])
            assert.equal((result.stdout + result.stderr + saved).includes(secret), false);
        assert.equal(JSON.parse(saved).error, 'RECOVERY_REQUIRES_PLAINTEXT_LOOPBACK_TEST_DATABASE');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
