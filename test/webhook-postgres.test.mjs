import { requireDisposablePostgresURL } from './postgres-safety.mjs';
/** Destructive tests run only against explicitly disposable loopback PostgreSQL. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setupIntake, author } from './intake-helpers.mjs';
import { openIntakeRepository } from '../server/intake/repository.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) test('WEBHOOK POSTGRES NOT EXECUTED: disposable database required', { skip: process.env.REQUIRE_POSTGRES !== 'true' }, () => { throw new Error('Mandatory webhook PostgreSQL suite did not execute.'); });
else {
    requireDisposablePostgresURL(url);
    const { default: pg } = await import('pg');
    async function reset() {
        const p = new pg.Pool({ connectionString: url });
        try {
            const tables = (await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r => '"' + r.tablename.replaceAll('"', '""') + '"');
            if (tables.length) await p.query(`DROP TABLE IF EXISTS ${tables.join(',')} CASCADE`);
        } finally { await p.end(); }
    }
    const secret = 'pg-webhook-secret-' + 'w'.repeat(32);
    const payload = (sha = 'a'.repeat(40), action = 'opened') => ({ action, number: 12,
        pull_request: { number: 12, state: 'open', draft: false, title: 'Approval correction', head: { sha, ref: 'fix' }, base: { ref: 'main', repo: { id: 12345, full_name: 'example/testrepo' } } },
        repository: { id: 12345, full_name: 'example/testrepo' }, sender: { login: 'dev' } });
    async function setup(t) {
        await reset();
        const h = await setupIntake(t, { postgresURL: url });
        const hooks = await openIntakeRepository({ ...h.opts, webhook: { enabled: true, secret } }); t.after(() => hooks.close());
        return { ...h, hooks };
    }

    test('POSTGRES webhook / concurrent redeliveries across instances store exactly one receipt', async t => {
        const h = await setup(t), other = await openIntakeRepository({ ...h.opts, migrate: false, webhook: { enabled: true, secret } }); t.after(() => other.close());
        const id = randomUUID();
        const results = await Promise.all([h.hooks, other, h.hooks, other].map(r => r.receiveWebhook({ deliveryId: id, event: 'pull_request', payload: payload() })));
        assert.equal(results.filter(r => !r.duplicate).length, 1);
        const pull = (await h.hooks.listSourceEvents(h.app.id, author)).pulls[0];
        assert.equal(pull.deliveries, 1);
    });

    test('POSTGRES webhook / activity and import state survive a separate runtime instance', async t => {
        const h = await setup(t);
        await h.hooks.receiveWebhook({ deliveryId: randomUUID(), event: 'pull_request', payload: payload() });
        const imported = await h.intake.importPreview(h.request(await h.preview()), author);
        await h.hooks.receiveWebhook({ deliveryId: randomUUID(), event: 'pull_request', payload: payload('f'.repeat(40), 'synchronize') });
        const fresh = await openIntakeRepository({ ...h.opts, migrate: false, webhook: { enabled: true, secret } }); t.after(() => fresh.close());
        const pull = (await fresh.listSourceEvents(h.app.id, author)).pulls[0];
        assert.equal(pull.deliveries, 2); assert.equal(pull.imported.changeId, imported.changeId); assert.equal(pull.imported.currentHead, false);
    });

    test('POSTGRES webhook / a runtime without schema 9 refuses to enable webhooks', async t => {
        const h = await setup(t);
        const p = new pg.Pool({ connectionString: url });
        try { await p.query('DELETE FROM qivvera_migrations WHERE version=9'); } finally { await p.end(); }
        await assert.rejects(openIntakeRepository({ ...h.opts, migrate: false, webhook: { enabled: true, secret } }), /WEBHOOKS_MIGRATION_REQUIRED/);
    });
}
