import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';
import { testDatabase } from './postgres-test-database.mjs';

const author = { email: 'author@example.test', roles: ['AUTHOR'] };
const authority = { email: 'policy@example.test', roles: ['POLICY_AUTHORITY'] };
const viewer = { email: 'viewer@example.test', roles: ['VIEWER'] };

async function setup(t) {
    const repo = await openWorkflowRepository({ ...await testDatabase(), migrate: true });
    t.after(() => repo.close());
    const app = await repo.createApplication({ name: 'Archive me ' + randomUUID().slice(0, 8) }, author);
    return { repo, app };
}

test('application archive / hides, blocks new changes and keeps every record', async t => {
    const { repo, app } = await setup(t);
    const change = await repo.createChange({ applicationId: app.id, title: 'Existing change', intent: 'Stays in history.', sourceRevision: 'a'.repeat(40) }, author);
    const archived = await repo.archiveApplication(app.id, { reason: 'Rehearsal test data' }, author);
    assert.deepEqual([archived.archived, archived.archivedBy], [true, author.email]);
    const listed = (await repo.listApplications()).find(a => a.id === app.id);
    assert.equal(listed.archived, true, 'still listed by the API, marked archived');
    assert.ok(await repo.getChange(change.id), 'its change is not deleted');
    assert.equal((await repo.listChanges()).filter(c => c.applicationId === app.id).length, 1);
    await assert.rejects(repo.createChange({ applicationId: app.id, title: 'New', intent: 'Blocked', sourceRevision: 'b'.repeat(40) }, author), e => e.code === 'APPLICATION_ARCHIVED' && e.status === 409);
    const activity = (await repo.listActivity()).find(a => a.action === 'APPLICATION_ARCHIVED');
    assert.equal(activity.entityId, app.id);
    assert.match(activity.detail, /Rehearsal test data/);
});

test('application archive / restore makes it usable again; repeats are refused', async t => {
    const { repo, app } = await setup(t);
    await assert.rejects(repo.restoreApplication(app.id, {}, authority), e => e.code === 'APPLICATION_NOT_ARCHIVED' && e.status === 409);
    await repo.archiveApplication(app.id, {}, authority);
    await assert.rejects(repo.archiveApplication(app.id, {}, author), e => e.code === 'APPLICATION_ALREADY_ARCHIVED');
    const restored = await repo.restoreApplication(app.id, { reason: '' }, author);
    assert.equal(restored.archived, false);
    assert.equal((await repo.getApplication(app.id)).archived, false);
    assert.ok(await repo.createChange({ applicationId: app.id, title: 'Allowed again', intent: 'Restored', sourceRevision: 'c'.repeat(40) }, author));
});

test('application archive / only Authors and Policy Authorities; input is checked', async t => {
    const { repo, app } = await setup(t);
    await assert.rejects(repo.archiveApplication(app.id, {}, viewer), e => e.code === 'FORBIDDEN' && e.status === 403);
    await assert.rejects(repo.archiveApplication(app.id, {}, null), e => e.code === 'AUTH_REQUIRED');
    await assert.rejects(repo.archiveApplication(randomUUID(), {}, author), e => e.code === 'APPLICATION_NOT_FOUND' && e.status === 404);
    await assert.rejects(repo.archiveApplication(app.id, { reason: 'x', extra: 1 }, author), e => e.status === 400);
    await assert.rejects(repo.archiveApplication(app.id, { reason: 'x'.repeat(501) }, author), e => e.code === 'INVALID_FIELD');
    assert.equal((await repo.getApplication(app.id)).archived, false);
});

test('application archive HTTP / session, origin and CSRF are required; the workspace marks archived apps', async t => {
    const { repo, app } = await setup(t);
    const password = randomUUID() + randomUUID(), origin = 'http://127.0.0.1:3031';
    const server = createApplicationServer({ repository: repo, publicOrigin: origin, accounts: [author, viewer].map(a => ({ ...a, passwordHash: hashPassword(password) })) });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(r => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async email => { const r = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); return { cookie: r.headers.get('set-cookie').split(';')[0], csrf: (await r.json()).csrfToken }; };
    const post = (path, s, extra = {}) => fetch(base + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(s ? { Cookie: s.cookie, 'X-CSRF-Token': s.csrf } : {}), ...extra }, body: '{}' });
    const path = `/api/applications/${app.id}/archive`;
    assert.equal((await post(path)).status, 401);
    const viewerSession = await login(viewer.email);
    assert.equal((await post(path, viewerSession)).status, 403);
    const session = await login(author.email);
    assert.equal((await post(path, session, { 'X-CSRF-Token': 'bad' })).status, 403);
    assert.equal((await post(path, session, { Origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await post(path, session)).status, 200);
    const workspace = await (await fetch(base + '/api/workspace', { headers: { Cookie: session.cookie } })).json();
    assert.equal(workspace.applications.find(a => a.id === app.id).archived, true);
    assert.equal((await post(`/api/applications/${app.id}/restore`, session)).status, 200);
});
