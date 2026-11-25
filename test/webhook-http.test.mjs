import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac, randomUUID } from 'node:crypto';
import { setupIntake, author, viewer } from './intake-helpers.mjs';
import { openIntakeRepository } from '../backend/server/intake/repository.mjs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';

const secret = 'http-webhook-secret-' + 'z'.repeat(32), password = randomUUID() + randomUUID(), origin = 'http://127.0.0.1:3023';
const prPayload = (over = {}) => ({ action: 'opened', number: 12,
    pull_request: { number: 12, state: 'open', draft: false, title: 'Approval correction', head: { sha: 'a'.repeat(40), ref: 'fix' }, base: { ref: 'main', repo: { id: 12345, full_name: 'example/testrepo' } } },
    repository: { id: 12345, full_name: 'example/testrepo' }, sender: { login: 'dev' }, ...over });

async function fixture(t, { webhooks = true } = {}) {
    const h = await setupIntake(t);
    const intake = webhooks ? await openIntakeRepository({ ...h.opts, webhook: { enabled: true, secret } }) : h.intake;
    if (webhooks) t.after(() => intake.close());
    const server = createApplicationServer({ repository: h.workflow, intake, publicOrigin: origin, accounts: [author, viewer].map(a => ({ ...a, passwordHash: hashPassword(password) })) });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(r => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}`;
    /** Delivers like GitHub: no Origin, no cookie, signed raw body. */
    const deliver = async ({ body = JSON.stringify(prPayload()), event = 'pull_request', id = randomUUID(), key = secret, signature, type = 'application/json', method = 'POST' } = {}) => {
        const headers = { 'content-type': type, 'x-github-event': event, 'x-github-delivery': id };
        const sig = signature === undefined ? 'sha256=' + createHmac('sha256', key).update(body).digest('hex') : signature;
        if (sig !== null) headers['x-hub-signature-256'] = sig;
        const r = await fetch(base + '/api/github/webhook', { method, headers, ...(method === 'POST' ? { body } : {}) });
        return { status: r.status, body: await r.json() };
    };
    const login = async email => {
        const r = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        return r.headers.get('set-cookie').split(';')[0];
    };
    const get = async (path, cookie) => { const r = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} }); return { status: r.status, body: await r.json() }; };
    return { ...h, intake, deliver, login, get };
}

test('webhook HTTP / disabled workspace has no webhook route', async t => {
    const f = await fixture(t, { webhooks: false });
    assert.equal((await f.deliver()).status, 404);
});

test('webhook HTTP / signed delivery is accepted without session or Origin and recorded', async t => {
    const f = await fixture(t);
    const r = await f.deliver();
    assert.equal(r.status, 202); assert.equal(r.body.outcome, 'RECORDED');
    const cookie = await f.login(viewer.email), list = await f.get(`/api/applications/${f.app.id}/source-events`, cookie);
    assert.equal(list.status, 200); assert.equal(list.body.pulls[0].pullNumber, 12);
    assert.equal((await f.workflow.listChanges()).length, 0);
});

test('webhook HTTP / missing, wrong or forged signatures are rejected before anything is stored', async t => {
    const f = await fixture(t);
    for (const attempt of [{ signature: null }, { key: 'wrong-secret-' + 'q'.repeat(32) }, { signature: 'sha256=' + 'a'.repeat(64) }, { signature: 'sha1=' + 'a'.repeat(40) }]) {
        const r = await f.deliver(attempt);
        assert.equal(r.status, 401); assert.equal(r.body.error, 'INVALID_SIGNATURE'); assert.ok(!JSON.stringify(r.body).includes(secret));
    }
    const cookie = await f.login(author.email);
    assert.deepEqual((await f.get(`/api/applications/${f.app.id}/source-events`, cookie)).body.pulls, []);
});

test('webhook HTTP / ping is acknowledged and redelivery is idempotent', async t => {
    const f = await fixture(t), id = randomUUID();
    assert.equal((await f.deliver({ event: 'ping', body: '{"zen":"x"}' })).status, 200);
    assert.equal((await f.deliver({ id })).status, 202);
    const again = await f.deliver({ id });
    assert.equal(again.status, 200); assert.equal(again.body.outcome, 'DUPLICATE');
});

test('webhook HTTP / malformed signed deliveries fail with explicit errors', async t => {
    const f = await fixture(t);
    assert.equal((await f.deliver({ id: 'not-a-guid' })).status, 400);
    assert.equal((await f.deliver({ body: '{bad json' })).body.error, 'INVALID_JSON');
    assert.equal((await f.deliver({ type: 'application/x-www-form-urlencoded' })).status, 415);
    assert.equal((await f.deliver({ body: JSON.stringify({ pad: 'x'.repeat(1048577) }) })).status, 413);
    assert.equal((await f.deliver({ method: 'GET' })).status, 405);
});

test('webhook HTTP / ignored events are acknowledged with a reason', async t => {
    const f = await fixture(t);
    const r = await f.deliver({ body: JSON.stringify(prPayload({ action: 'closed' })) });
    assert.equal(r.status, 202); assert.deepEqual([r.body.outcome, r.body.reason], ['IGNORED', 'UNSUPPORTED_ACTION']);
});

test('webhook HTTP / activity listing requires a session and accepts no query', async t => {
    const f = await fixture(t), path = `/api/applications/${f.app.id}/source-events`;
    assert.equal((await f.get(path)).status, 401);
    const cookie = await f.login(author.email);
    assert.equal((await f.get(path + '?all=1', cookie)).status, 400);
});
