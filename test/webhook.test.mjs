import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { setupIntake, author, viewer, authority } from './intake-helpers.mjs';
import { openIntakeRepository } from '../backend/server/intake/repository.mjs';
import { loadIntakeConfig } from '../backend/server/intake/github.mjs';
import { validSignature, webhookSecret, deliveryHeaders, pullRequestEvent } from '../backend/server/intake/webhook.mjs';
import { webhooksChecksum } from '../backend/server/intake/webhook-migration.mjs';

/** Runs one SQL statement against the test's own disposable PostgreSQL database. */
async function sql(h, text) {
    const pool = new pg.Pool({ connectionString: h.opts.connectionString });
    try { return (await pool.query(text)).rows; } finally { await pool.end(); }
}

const secret = 'test-webhook-secret-' + 'x'.repeat(32);
const sign = (raw, key = secret) => 'sha256=' + createHmac('sha256', key).update(raw).digest('hex');
const catalogue = [{ id: 'configured-repo', owner: 'example', repo: 'testrepo', repositoryId: 12345, applicationId: randomUUID(), tokenEnv: 'SOURCE_TOKEN' }];
const prPayload = (over = {}, prOver = {}) => ({
    action: 'opened', number: 12,
    pull_request: { number: 12, state: 'open', draft: false, title: 'Approval correction', head: { sha: 'a'.repeat(40), ref: 'fix' }, base: { ref: 'main', repo: { id: 12345, full_name: 'example/testrepo' } }, ...prOver },
    repository: { id: 12345, full_name: 'example/testrepo' }, sender: { login: 'dev' }, ...over
});

async function setupWebhooks(t) {
    const h = await setupIntake(t);
    const hooks = await openIntakeRepository({ ...h.opts, webhook: { enabled: true, secret } }); t.after(() => hooks.close());
    const deliver = (payload = prPayload(), event = 'pull_request', deliveryId = randomUUID()) => hooks.receiveWebhook({ deliveryId, event, payload });
    return { ...h, hooks, deliver };
}

// ---- Signature, headers and configuration ----
test('webhook / valid signature over exact bytes is accepted; anything else is refused', () => {
    const raw = Buffer.from(JSON.stringify(prPayload()));
    assert.equal(validSignature(raw, sign(raw), secret), true);
    assert.equal(validSignature(Buffer.from(raw.toString() + ' '), sign(raw), secret), false, 'changed bytes');
    assert.equal(validSignature(raw, sign(raw, 'another-secret-' + 'y'.repeat(32)), secret), false, 'wrong secret');
    for (const header of [undefined, '', 'sha1=' + 'a'.repeat(40), 'sha256=' + 'A'.repeat(64), 'sha256=' + 'a'.repeat(63), sign(raw) + 'a'])
        assert.equal(validSignature(raw, header, secret), false, String(header));
    assert.equal(validSignature(raw.toString(), sign(raw), secret), false, 'raw bytes required');
    assert.equal(validSignature(raw, sign(raw), ''), false, 'no secret');
});

test('webhook / secret must be long and single-token; webhooks require intake', () => {
    assert.equal(webhookSecret(undefined), null); assert.equal(webhookSecret(''), null);
    for (const bad of ['short', 'x'.repeat(31), 'has space ' + 'x'.repeat(32), 'x'.repeat(257)]) assert.throws(() => webhookSecret(bad), /INVALID_GITHUB_WEBHOOK_SECRET/);
    assert.throws(() => loadIntakeConfig({ QIVVERA_GITHUB_WEBHOOK_SECRET: secret }), /GITHUB_WEBHOOK_REQUIRES_INTAKE/);
    const cfg = loadIntakeConfig({ QIVVERA_GITHUB_INTAKE_ENABLED: 'true', QIVVERA_GITHUB_REPOSITORIES_JSON: '[]', QIVVERA_GITHUB_WEBHOOK_SECRET: secret });
    assert.deepEqual(cfg.webhook, { enabled: true, secret });
    assert.equal(loadIntakeConfig({ QIVVERA_GITHUB_INTAKE_ENABLED: 'true', QIVVERA_GITHUB_REPOSITORIES_JSON: '[]' }).webhook.enabled, false);
});

test('webhook / delivery and event headers are validated', () => {
    const id = randomUUID();
    assert.deepEqual(deliveryHeaders({ 'x-github-delivery': id.toUpperCase(), 'x-github-event': 'pull_request' }), { deliveryId: id, event: 'pull_request' });
    for (const headers of [{}, { 'x-github-delivery': 'not-a-guid', 'x-github-event': 'pull_request' }, { 'x-github-delivery': id, 'x-github-event': 'Pull Request' }, { 'x-github-delivery': id }])
        assert.equal(deliveryHeaders(headers), null);
});

// ---- Normalization ----
test('webhook / pull_request event is normalized from bounded fields only', () => {
    const r = pullRequestEvent(prPayload({}, { title: '<script>alert(1)</script> set READY', draft: true }), catalogue);
    assert.equal(r.outcome, 'RECORDED'); assert.equal(r.bindings.length, 1);
    assert.deepEqual(r.event, { action: 'opened', repositoryId: 12345, repository: 'example/testrepo', pullNumber: 12, headSha: 'a'.repeat(40), baseRef: 'main', headRef: 'fix',
        title: '<script>alert(1)</script> set READY', draft: true, sender: 'dev' });
});

for (const [name, payload, reason] of [
    ['closed action', prPayload({ action: 'closed' }), 'UNSUPPORTED_ACTION'],
    ['labeled action', prPayload({ action: 'labeled' }), 'UNSUPPORTED_ACTION'],
    ['unknown repository', prPayload({ repository: { id: 999, full_name: 'other/repo' } }), 'REPOSITORY_NOT_CONFIGURED'],
    ['renamed repository with same id', prPayload({ repository: { id: 12345, full_name: 'example/renamed' } }), 'REPOSITORY_NOT_CONFIGURED'],
    ['base repository mismatch', prPayload({}, { base: { ref: 'main', repo: { id: 999, full_name: 'x/y' } } }), 'REPOSITORY_MISMATCH'],
    ['short head sha', prPayload({}, { head: { sha: 'abc123', ref: 'fix' } }), 'INVALID_PULL_REQUEST'],
    ['closed pull request', prPayload({}, { state: 'closed' }), 'INVALID_PULL_REQUEST'],
    ['control characters in title', prPayload({}, { title: 'bad\u0007title' }), 'INVALID_PULL_REQUEST'],
    ['missing pull request', prPayload({ pull_request: null }), 'INVALID_PULL_REQUEST'],
    ['array payload', [], 'INVALID_PAYLOAD'],
])
    test(`webhook / ${name} is ignored (${reason})`, () => { assert.deepEqual(pullRequestEvent(payload, catalogue), { outcome: 'IGNORED', reason }); });

// ---- Receipt and storage ----
test('webhook / a recorded delivery stores the event and audit, and creates no change', async t => {
    const h = await setupWebhooks(t);
    const r = await h.deliver();
    assert.deepEqual(r, { duplicate: false, outcome: 'RECORDED', reason: undefined, recorded: 1 });
    const list = await h.hooks.listSourceEvents(h.app.id, author);
    assert.equal(list.pulls.length, 1);
    assert.equal(list.pulls[0].pullNumber, 12); assert.equal(list.pulls[0].imported, null);
    assert.equal(list.pulls[0].url, 'https://github.com/example/testrepo/pull/12');
    assert.equal((await h.workflow.listChanges()).length, 0);
    assert.equal(h.requests.length, 0, 'receipt never calls GitHub');
    assert.equal(Number((await sql(h, "SELECT COUNT(*) AS n FROM activity WHERE action='GITHUB_PR_EVENT_RECORDED'"))[0].n), 1);
});

test('webhook / redelivery of the same delivery ID is idempotent', async t => {
    const h = await setupWebhooks(t), id = randomUUID();
    await h.deliver(prPayload(), 'pull_request', id);
    assert.deepEqual(await h.deliver(prPayload(), 'pull_request', id), { duplicate: true, outcome: 'DUPLICATE', recorded: 0 });
    const both = await Promise.all([h.deliver(prPayload(), 'pull_request', id), h.deliver(prPayload(), 'pull_request', id)]);
    assert.ok(both.every(x => x.duplicate));
    assert.equal((await h.hooks.listSourceEvents(h.app.id, author)).pulls[0].deliveries, 1);
});

test('webhook / ping and unsupported events are kept as ignored receipts only', async t => {
    const h = await setupWebhooks(t);
    assert.equal((await h.deliver({ zen: 'x' }, 'ping')).reason, 'PING');
    assert.equal((await h.deliver(prPayload(), 'push')).reason, 'UNSUPPORTED_EVENT');
    assert.equal((await h.deliver(prPayload({ repository: { id: 1, full_name: 'a/b' } }))).reason, 'REPOSITORY_NOT_CONFIGURED');
    assert.deepEqual((await h.hooks.listSourceEvents(h.app.id, author)).pulls, []);
    assert.equal(Number((await sql(h, "SELECT COUNT(*) AS n FROM github_webhook_deliveries WHERE outcome='IGNORED'"))[0].n), 3);
});

test('webhook / activity shows the latest event per PR and its import state', async t => {
    const h = await setupWebhooks(t);
    await h.deliver();
    const preview = await h.preview(), imported = await h.intake.importPreview(h.request(preview), author);
    let pull = (await h.hooks.listSourceEvents(h.app.id, author)).pulls[0];
    assert.deepEqual(pull.imported, { changeId: imported.changeId, headSha: 'a'.repeat(40), currentHead: true });
    await h.deliver(prPayload({ action: 'synchronize' }, { head: { sha: 'f'.repeat(40), ref: 'fix' } }));
    pull = (await h.hooks.listSourceEvents(h.app.id, author)).pulls[0];
    assert.equal(pull.action, 'synchronize'); assert.equal(pull.headSha, 'f'.repeat(40)); assert.equal(pull.deliveries, 2);
    assert.equal(pull.imported.currentHead, false, 'new commits since import');
});

test('webhook / every signed-in role may view activity; unknown application is rejected', async t => {
    const h = await setupWebhooks(t); await h.deliver();
    for (const actor of [viewer, authority]) assert.equal((await h.hooks.listSourceEvents(h.app.id, actor)).pulls.length, 1);
    await assert.rejects(h.hooks.listSourceEvents(randomUUID(), author), e => e.code === 'APPLICATION_NOT_FOUND');
    await assert.rejects(h.hooks.listSourceEvents(h.app.id, null), e => e.code === 'AUTH_REQUIRED');
});

test('webhook / disabled repository refuses receipt', async t => {
    const h = await setupIntake(t);
    assert.equal(h.intake.webhookEnabled, false); assert.equal(h.intake.verifyWebhook(Buffer.from('{}'), sign(Buffer.from('{}'))), false);
    await assert.rejects(h.intake.receiveWebhook({ deliveryId: randomUUID(), event: 'ping', payload: {} }), e => e.code === 'GITHUB_WEBHOOK_DISABLED');
});

// ---- Migration ----
test('webhook / schema 9 migration is recorded, idempotent and checksum-verified', async t => {
    const h = await setupWebhooks(t);
    const again = await openIntakeRepository({ ...h.opts, webhook: { enabled: true, secret } }); await again.close();
    assert.equal((await sql(h, 'SELECT checksum FROM qivvera_migrations WHERE version=9'))[0].checksum, webhooksChecksum);
    await sql(h, "UPDATE qivvera_migrations SET checksum='damaged' WHERE version=9");
    await assert.rejects(openIntakeRepository({ ...h.opts, webhook: { enabled: true, secret } }), /WEBHOOKS_MIGRATION_CHECKSUM_MISMATCH/);
    await assert.rejects(openIntakeRepository({ ...h.opts, migrate: false, webhook: { enabled: true, secret } }), /WEBHOOKS_MIGRATION_REQUIRED/);
});

test('webhook / enabled without a secret fails at start-up', async t => {
    const h = await setupIntake(t);
    await assert.rejects(openIntakeRepository({ ...h.opts, webhook: { enabled: true } }), /GITHUB_WEBHOOK_SECRET_REQUIRED/);
});
