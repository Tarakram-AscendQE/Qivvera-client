import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parse } from 'pg-connection-string';
import { requireDisposablePostgresURL } from './postgres-safety.mjs';
import { postgresOptions } from '../server/workflow-store.mjs';

const safe = 'postgresql://tester:synthetic-password@127.0.0.1:5432/qivvera_test_guard';

test('PostgreSQL safety / explicit loopback disposable URLs preserve their actual connection identity', () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
        const checked = requireDisposablePostgresURL(safe.replace('127.0.0.1', host));
        const parsed = parse(checked);
        assert.equal(parsed.database, 'qivvera_test_guard');
        assert.equal(parsed.user, 'tester');
        assert.ok(['127.0.0.1', 'localhost', '::1'].includes(parsed.host));
    }
});

test('PostgreSQL safety / reject routing overrides that the actual installed driver would otherwise honor', () => {
    const poisoned = safe + '?host=remote.example.test&dbname=customer';
    assert.equal(parse(poisoned).host, 'remote.example.test');
    assert.throws(() => requireDisposablePostgresURL(poisoned), /without query options/);
    assert.throws(() => postgresOptions(poisoned, { sslMode: 'disable' }), /UNSUPPORTED_DATABASE_URL_OPTION/);
});

for (const query of ['host=remote.example.test', 'hostaddr=192.0.2.2', 'port=5433', 'database=customer',
    'dbname=customer', 'user=someone', 'password=secret', 'options=-csearch_path%3Dother',
    'service=unknown', 'sslmode=disable', '%68ost=remote.example.test', 'host=/tmp/postgres']) {
    test('PostgreSQL safety / destructive fixtures reject ' + query.split('=')[0] + ' query options before connecting', () => {
        assert.throws(() => requireDisposablePostgresURL(safe + '?' + query), /without query options/);
    });
}

test('PostgreSQL safety / reject remote, unnamed, ambiguous and non-disposable connections', () => {
    for (const bad of [undefined, '', safe + '#ignored', safe + '#', safe + '?', ' ' + safe,
        safe.replace('127.0.0.1', 'remote.example.test'), safe.replace('qivvera_test_guard', 'customer'),
        safe.replace('qivvera_test_guard', '%71ivvera_test_guard'), safe.replace('postgresql:', 'https:'),
        safe.replace('tester:synthetic-password@', ''), safe.replace('tester:', 'test%0aer:'),
        safe.replace('qivvera_test_guard', 'qivvera_test_' + 'a'.repeat(60))]) {
        assert.throws(() => requireDisposablePostgresURL(bad), /TEST_DATABASE_URL/);
    }
});

test('PostgreSQL safety / runtime keeps reviewed TLS compatibility but rejects duplicate or injected routing keys', () => {
    const target = 'postgresql://u:synthetic-password@db.example.test/app';
    const configured = postgresOptions(target + '?sslmode=require&channel_binding=require');
    assert.equal(configured.connectionString, target);
    assert.equal(configured.ssl.rejectUnauthorized, true);
    assert.equal(configured.enableChannelBinding, true);
    for (const query of ['host=other.example.test', 'user=other', 'database=other', 'options=-cstatement_timeout%3D0',
        'sslmode=require&sslmode=disable', 'channel_binding=require&channel_binding=disable'])
        assert.throws(() => postgresOptions(target + '?' + query), /UNSUPPORTED_DATABASE_URL_OPTION/);
    assert.throws(() => postgresOptions(target + '#other'), /INVALID_DATABASE_URL/);
});

test('PostgreSQL safety / both verification entry points block unsafe connection before running checks and redact it', t => {
    const out = mkdtempSync(join(tmpdir(), 'qivvera-database-guard-'));
    t.after(() => rmSync(out, { recursive: true, force: true }));
    const poisoned = safe + '?host=remote.example.test';
    for (const entry of ['scripts/verify-release.mjs', 'scripts/verify-engineering.mjs']) {
        const result = spawnSync(process.execPath, [entry], {
            cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 10_000,
            env: { ...process.env, TEST_DATABASE_URL: poisoned, QIVVERA_TEST_OUTPUT: out }
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /BLOCKED/);
        assert.equal((result.stdout + result.stderr).includes('synthetic-password'), false);
        assert.equal((result.stdout + result.stderr).includes('remote.example.test'), false);
    }
    const report = JSON.parse(readFileSync(join(out, 'engineering-verification.json'), 'utf8'));
    assert.equal(report.passed, false);
    assert.equal(report.gates.length, 1);
    assert.equal(report.gates[0].reason, 'TEST_DATABASE_URL_UNSAFE');
});
