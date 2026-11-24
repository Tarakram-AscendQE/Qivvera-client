import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openDatabase, migrateDatabase } from '../backend/server/workflow-store.mjs';
import { openAccountRepository, openWorkspaceAccounts, accountSql, hashAccountPassword } from '../backend/server/accounts/repository.mjs';
import { migrateAccounts, requireAccounts, accountsChecksum } from '../backend/server/accounts/migration.mjs';
import { openResolutionRepository } from '../backend/server/resolution/repository.mjs';
import { createWorkspaceAuth, staticAccountDirectory } from '../backend/server/workspace-auth.mjs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';

const password = 'correct-horse-battery-2026', operator = 'operator:test';
const quietLog = { log() {}, warn() {} };
const req = cookie => ({ headers: { cookie: cookie.split(';')[0] } });

async function setup(t) {
    const dir = mkdtempSync(join(tmpdir(), 'qivvera-accounts-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'workspace.sqlite');
    const workflow = await openWorkflowRepository({ path, migrate: true }); t.after(() => workflow.close());
    const accounts = await openAccountRepository({ path, migrate: true }); t.after(() => accounts.close());
    const auth = () => createWorkspaceAuth({ directory: accounts, repository: workflow, secureCookies: false });
    return { dir, path, workflow, accounts, auth };
}
const add = (h, email, roles = ['AUTHOR']) => h.accounts.create({ email, roles, password }, operator);

test('accounts / schema 8 migration is idempotent, recorded and checksum-verified', async t => {
    const h = await setup(t);
    const again = await openAccountRepository({ path: h.path, migrate: true }); await again.close();
    const d = new DatabaseSync(h.path); t.after(() => d.close());
    assert.equal(d.prepare('SELECT checksum FROM qivvera_migrations WHERE version=8').get().checksum, accountsChecksum);
    d.prepare("UPDATE qivvera_migrations SET checksum='damaged' WHERE version=8").run();
    await assert.rejects(openAccountRepository({ path: h.path, migrate: true }), /ACCOUNTS_MIGRATION_CHECKSUM_MISMATCH/);
    await assert.rejects(openAccountRepository({ path: h.path, migrate: false }), /ACCOUNTS_MIGRATION_REQUIRED/);
});

test('accounts / runtime refuses a database without schema 8', async t => {
    const db = await openDatabase({}); t.after(() => db.close());
    await migrateDatabase(db);
    await assert.rejects(requireAccounts(db), /MIGRATION_REQUIRED/);
    await migrateAccounts(db); await requireAccounts(db);
});

test('accounts / create stores a normalized email, scrypt hash and roles but never exposes the hash', async t => {
    const h = await setup(t);
    const created = await add(h, '  New.Person@Example.TEST ', ['POLICY_AUTHORITY', 'AUTHOR', 'AUTHOR']);
    assert.equal(created.email, 'new.person@example.test');
    assert.deepEqual(created.roles, ['AUTHOR', 'POLICY_AUTHORITY']);
    assert.ok(!JSON.stringify(await h.accounts.listAll()).includes('scrypt:'));
    const found = await h.accounts.find('NEW.PERSON@example.test');
    assert.match(found.passwordHash, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.ok(!JSON.stringify(found).includes(password));
    const d = new DatabaseSync(h.path); t.after(() => d.close());
    assert.equal(d.prepare("SELECT COUNT(*) AS n FROM activity WHERE action='ACCOUNT_CREATED'").get().n, 1);
});

test('accounts / invalid input is rejected without creating anything', async t => {
    const h = await setup(t);
    for (const [input, code] of [
        [{ email: 'not-an-email', roles: ['AUTHOR'], password }, 'INVALID_EMAIL'],
        [{ email: 'a@example.test', roles: ['ROOT'], password }, 'INVALID_ROLES'],
        [{ email: 'a@example.test', roles: [], password }, 'INVALID_ROLES'],
        [{ email: 'a@example.test', roles: ['AUTHOR'], password: 'short' }, 'WEAK_PASSWORD'],
        [{ email: 'a@example.test', roles: ['AUTHOR'], password: 'line\nbreak-password' }, 'WEAK_PASSWORD']
    ]) await assert.rejects(h.accounts.create(input, operator), e => e.code === code);
    assert.equal(await h.accounts.countAll(), 0);
});

test('accounts / duplicate email is rejected regardless of case', async t => {
    const h = await setup(t); await add(h, 'dup@example.test');
    await assert.rejects(add(h, 'DUP@example.test'), e => e.code === 'ACCOUNT_EXISTS');
});

test('accounts / sign-in reads the database and records the sign-in time', async t => {
    const h = await setup(t), auth = h.auth(); await add(h, 'author@example.test');
    const l = await auth.login('Author@Example.test', password);
    assert.ok(l.session); assert.deepEqual(l.session.roles, ['AUTHOR']);
    assert.equal((await auth.session(req(l.cookie))).email, 'author@example.test');
    assert.ok((await h.accounts.listAll())[0].lastLoginAt);
});

test('accounts / unknown email and wrong password share one response', async t => {
    const h = await setup(t), auth = h.auth(); await add(h, 'author@example.test');
    assert.deepEqual(await auth.login('missing@example.test', password), await auth.login('author@example.test', 'wrong-password-value'));
});

test('accounts / an account added after start can sign in without a restart', async t => {
    const h = await setup(t), auth = h.auth(); await add(h, 'first@example.test');
    assert.equal((await auth.login('later@example.test', password)).status, 401);
    await add(h, 'later@example.test');
    assert.ok((await auth.login('later@example.test', password)).session);
});

test('accounts / disabling signs the user out and blocks sign-in; enabling restores it', async t => {
    const h = await setup(t), auth = h.auth(); await add(h, 'keep@example.test'); await add(h, 'leaver@example.test');
    const l = await auth.login('leaver@example.test', password);
    await h.accounts.setStatus('leaver@example.test', 'DISABLED', operator);
    assert.equal(await auth.session(req(l.cookie)), null);
    assert.equal((await auth.login('leaver@example.test', password)).status, 401);
    await h.accounts.setStatus('leaver@example.test', 'ACTIVE', operator);
    assert.ok((await auth.login('leaver@example.test', password)).session);
});

test('accounts / password change revokes sessions and only the new password works', async t => {
    const h = await setup(t), auth = h.auth(); await add(h, 'author@example.test');
    const l = await auth.login('author@example.test', password);
    await h.accounts.setPassword('author@example.test', 'a-brand-new-password-2026', operator);
    assert.equal(await auth.session(req(l.cookie)), null);
    assert.equal((await auth.login('author@example.test', password)).status, 401);
    assert.ok((await auth.login('author@example.test', 'a-brand-new-password-2026')).session);
});

test('accounts / role change revokes sessions and the new roles apply at next sign-in', async t => {
    const h = await setup(t), auth = h.auth(); await add(h, 'keep@example.test'); await add(h, 'person@example.test', ['VIEWER']);
    const l = await auth.login('person@example.test', password);
    await h.accounts.setRoles('person@example.test', ['POLICY_AUTHORITY'], operator);
    assert.equal(await auth.session(req(l.cookie)), null);
    assert.deepEqual((await auth.login('person@example.test', password)).session.roles, ['POLICY_AUTHORITY']);
});

test('accounts / the last active account cannot be disabled', async t => {
    const h = await setup(t); await add(h, 'only@example.test');
    await assert.rejects(h.accounts.setStatus('only@example.test', 'DISABLED', operator), e => e.code === 'LAST_ACTIVE_ACCOUNT');
    assert.equal((await h.accounts.listAll())[0].status, 'ACTIVE');
});

test('accounts / changes to a missing account report not found', async t => {
    const h = await setup(t); await add(h, 'only@example.test');
    await assert.rejects(h.accounts.setPassword('ghost@example.test', password, operator), e => e.code === 'ACCOUNT_NOT_FOUND');
});

test('accounts / configured accounts import once, keep their passwords and existing sessions', async t => {
    const h = await setup(t), configured = [{ email: 'owner@example.test', passwordHash: hashPassword('synthetic-long-test-password-2026'), roles: ['AUTHOR', 'POLICY_AUTHORITY'] }];
    const before = createWorkspaceAuth({ accounts: configured, repository: h.workflow, secureCookies: false });
    const l = await before.login('owner@example.test', 'synthetic-long-test-password-2026');
    assert.deepEqual(await h.accounts.importAccounts(configured, operator), [{ email: 'owner@example.test', roles: ['AUTHOR', 'POLICY_AUTHORITY'] }]);
    assert.equal((await h.auth().session(req(l.cookie))).email, 'owner@example.test', 'switching to database accounts must not sign users out');
    await assert.rejects(h.accounts.importAccounts(configured, operator), e => e.code === 'ACCOUNTS_ALREADY_PRESENT');
});

test('accounts / runtime wiring seeds only empty LOCAL storage and requires an active account', async t => {
    const h = await setup(t), configured = [{ email: 'owner@example.test', passwordHash: hashPassword('synthetic-long-test-password-2026'), roles: ['AUTHOR'] }];
    await assert.rejects(openWorkspaceAccounts({ database: { path: h.path, migrate: false }, accounts: configured }, { log: quietLog }), /NAMED_ACCOUNTS_REQUIRED/);
    assert.equal(await h.accounts.countAll(), 0, 'hosted/non-migrating runtime must never write accounts');
    const local = await openWorkspaceAccounts({ database: { path: h.path, migrate: true }, accounts: configured }, { log: quietLog }); await local.close();
    assert.equal(await h.accounts.countAll(), 1);
    const warnings = [];
    const later = await openWorkspaceAccounts({ database: { path: h.path, migrate: true }, accounts: configured }, { log: { log() {}, warn: m => warnings.push(m) } }); await later.close();
    assert.equal(await h.accounts.countAll(), 1); assert.match(warnings[0], /ACCOUNT_CONFIGURATION_IGNORED/);
});

test('accounts / printed SQL creates a working account, escapes text and never contains the password', async t => {
    const h = await setup(t);
    const sql = await accountSql('add', { email: 'sql@example.test', roles: ['VIEWER'], displayName: "O'Brien", password }, { actor: operator });
    assert.ok(!sql.includes(password)); assert.match(sql, /O''Brien/);
    const d = new DatabaseSync(h.path); t.after(() => d.close()); d.exec(sql);
    const auth = h.auth(), l = await auth.login('sql@example.test', password);
    assert.deepEqual(l.session.roles, ['VIEWER']);
    d.exec(await accountSql('set-password', { email: 'sql@example.test', password: 'replacement-password-2026' }, { actor: operator }));
    assert.equal(await auth.session(req(l.cookie)), null);
    assert.ok((await auth.login('sql@example.test', 'replacement-password-2026')).session);
    assert.equal(d.prepare("SELECT COUNT(*) AS n FROM activity WHERE action IN ('ACCOUNT_CREATED','ACCOUNT_PASSWORD_CHANGED')").get().n, 2);
});

test('accounts / hashes use the shared scrypt format accepted by configuration', async () => {
    const hash = await hashAccountPassword(password);
    assert.ok(staticAccountDirectory([{ email: 'x@example.test', passwordHash: hash, roles: ['AUTHOR'] }]));
});

test('accounts / resolution assignees follow the live account table', async t => {
    const h = await setup(t); await add(h, 'author@example.test'); await add(h, 'viewer@example.test', ['VIEWER']);
    const resolution = await openResolutionRepository({ path: h.path, migrate: false, directory: h.accounts, targets: [] }); t.after(() => resolution.close());
    assert.deepEqual((await resolution.listAssignees()).map(a => a.email), ['author@example.test']);
    await add(h, 'reviewer@example.test', ['POLICY_AUTHORITY']);
    assert.deepEqual((await resolution.listAssignees()).map(a => a.email).sort(), ['author@example.test', 'reviewer@example.test']);
});

test('accounts HTTP / sign-in and session use database accounts end to end', async t => {
    const h = await setup(t); await add(h, 'keep@example.test'); await add(h, 'author@example.test');
    const origin = 'http://127.0.0.1:3021';
    const server = createApplicationServer({ repository: h.workflow, accountDirectory: h.accounts, publicOrigin: origin }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(r => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'author@example.test', password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/api/session', { headers: { Cookie: cookie } })).status, 200);
    await h.accounts.setStatus('author@example.test', 'DISABLED', operator);
    assert.equal((await fetch(base + '/api/session', { headers: { Cookie: cookie } })).status, 401);
});
