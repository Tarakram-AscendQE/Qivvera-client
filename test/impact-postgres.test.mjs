/** Read-only reporting is checked on an explicitly disposable real PostgreSQL database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setupImpact, author } from './impact-helpers.mjs';
import { openWorkflowRepository } from '../server/workflow-repository.mjs';
import { openDatabase } from '../server/workflow-store.mjs';
import { createImpactReader } from '../server/impact/reader.mjs';
import { migrateDrafting } from '../server/drafting/migration.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) test('IMPACT POSTGRES NOT EXECUTED: disposable database required', { skip: process.env.REQUIRE_POSTGRES !== 'true' }, () => {
    throw new Error('Mandatory impact PostgreSQL suite did not execute.');
});
else {
    const u = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || !/^\/qivvera_test_[a-z0-9_]+$/.test(u.pathname)) throw new Error('Only disposable LOOPBACK qivvera_test_* databases are allowed.');
    const { default: pg } = await import('pg');
    const reset = async () => {
        const p = new pg.Pool({ connectionString: url });
        try { await p.query('DROP TABLE IF EXISTS drafting_suggestions,drafting_runs,source_previews,source_imports,source_backoff,resolution_challenges,resolution_history,resolution_items,assurance_evidence,assurance_runs,assurance_plans,obligation_history,obligation_workflow,change_revisions,workspace_sessions,auth_buckets,qivvera_migrations,activity,obligations,changes,applications CASCADE'); }
        finally { await p.end(); }
    };
    test('POSTGRES impact / exact parent comparison and prior evidence remain durable across connections', async t => {
        await reset(); const h = await setupImpact(t, { postgresURL: url, assurance: true }), evidence = await h.run(), next = await h.revise();
        const fresh = await openWorkflowRepository(h.readerOptions);
        try {
            const r = await fresh.impact.get(h.change.id, next.revision.id);
            assert.equal(r.obligations[0].comparison, 'COPIED_UNCHANGED'); assert.equal(r.obligations[0].current.reviewStatus, 'DRAFT');
            assert.equal(r.assurance.latestRun, null); assert.equal(r.obligations[0].priorMappingHint.checkId, 'separation');
            const old = await fresh.impact.get(h.change.id, h.change.revision.id);
            assert.equal(old.assurance.latestRun.evidenceDigest, evidence.evidenceDigest); assert.equal(old.assurance.latestRun.recordedDisposition, 'READY');
            assert.equal(old.assurance.latestRun.currentDisposition, null);
        } finally { await fresh.close(); }
    });
    test('POSTGRES impact / a SELECT-only role can inspect expired queue work without write privileges', async t => {
        await reset(); let time = Date.now(); const h = await setupImpact(t, { postgresURL: url, assurance: true, clock: () => time }), queued = await h.queue(); time += 600001;
        const owner = new pg.Pool({ connectionString: url }), role = 'qivvera_impact_' + randomUUID().replaceAll('-', ''), password = randomUUID() + randomUUID();
        let limited, check, created = false;
        try {
            await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`); created = true;
            await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
            await owner.query(`GRANT SELECT ON qivvera_migrations,applications,changes,change_revisions,obligations,obligation_workflow,obligation_history,assurance_plans,assurance_runs,assurance_evidence TO ${role}`);
            const connection = new URL(url); connection.username = role; connection.password = password;
            check = new pg.Pool({ connectionString: connection.toString() });
            await assert.rejects(check.query("UPDATE assurance_runs SET status='FAILED' WHERE id=$1", [queued.id]), e => e.code === '42501');
            limited = await openWorkflowRepository({ ...h.readerOptions, connectionString: connection.toString() });
            const report = await limited.impact.get(h.change.id, h.change.revision.id);
            assert.equal(report.assurance.latestRun.observedStatus, 'QUEUE_DEADLINE_EXCEEDED');
            assert.equal(report.assurance.latestRun.status, 'QUEUED'); assert.equal(report.assurance.latestRun.currentDisposition, null);
            assert.equal((await owner.query('SELECT status FROM assurance_runs WHERE id=$1', [queued.id])).rows[0].status, 'QUEUED');
        } finally {
            await limited?.close(); await check?.end();
            if (created) { await owner.query(`DROP OWNED BY ${role}`); await owner.query(`DROP ROLE ${role}`); }
            await owner.end();
        }
    });
    test('POSTGRES impact / concurrent scope mutation cannot mix inputs inside a repeatable-read report', async t => {
        await reset(); const h = await setupImpact(t, { postgresURL: url, assurance: true }); await h.run();
        const db = await openDatabase(h.db); let injected = false, readOnlyObserved = false;
        try {
            const wrapped = { ...db, transaction: (fn, readOnly) => { readOnlyObserved = readOnly; return db.transaction(c => fn({ ...c, query: async (q, p) => {
                const result = await c.query(q, p);
                if (!injected && q.startsWith('SELECT * FROM changes WHERE id=')) { injected = true; await h.add(undefined, { statement: 'A concurrently declared requirement must remain visible on refresh.' }); }
                return result;
            } }), readOnly); } };
            const reader = createImpactReader(wrapped, h.readerOptions.impact), before = await reader.get(h.change.id, h.change.revision.id);
            assert.equal(injected, true); assert.equal(readOnlyObserved, true);
            assert.equal(before.summary.mandatory, 1); assert.equal(before.assurance.latestRun.currentDisposition, 'READY');
            const after = await h.report(); assert.equal(after.summary.mandatory, 2); assert.equal(after.assurance.latestRun.currentDisposition, null);
            assert.equal(after.assurance.latestRun.applicability, 'STALE_INPUTS'); assert.notEqual(after.snapshotDigest, before.snapshotDigest);
        } finally { await db.close(); }
    });
    test('POSTGRES impact / identical unlinked requirements do not hide omitted parent scope', async t => {
        await reset(); const h = await setupImpact(t, { postgresURL: url }), prior = await h.add(), next = await h.revise(undefined, { copyObligations: false });
        await h.add(next.revision.id); const r = await h.report(next.revision.id);
        assert.equal(r.obligations[0].comparison, 'NEW'); assert.equal(r.notCarriedForward[0].id, prior.id); assert.equal(r.summary.mandatory, 1);
    });
    test('POSTGRES impact / missing latest evidence stays an investigation gap after new scope arrives', async t => {
        await reset(); const h = await setupImpact(t, { postgresURL: url, assurance: true }), run = await h.run(); await h.add();
        await h.sql(c => c.query('DELETE FROM assurance_evidence WHERE run_id=$1', [run.id]));
        const r = await h.report(); assert.equal(r.assurance.latestRun.evidenceIntegrity, 'NOT_COLLECTED'); assert.equal(r.assurance.latestRun.currentDisposition, null);
        assert.equal(r.obligations.find(row => row.current.id === h.obligation.id).guidance[0].code, 'EVIDENCE_INTEGRITY_REVIEW');
    });
    test('POSTGRES impact / schema6 and multi-check evidence are preserved without applying a report migration', async t => {
        await reset(); const h = await setupImpact(t, { postgresURL: url, assurance: true, generalization: true }); const run = await h.run();
        const db = await openDatabase(h.db); try { await migrateDrafting(db); } finally { await db.close(); }
        const before = await h.sql(c => c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version'));
        const r = await h.report(), after = await h.sql(c => c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version'));
        assert.equal(r.assurance.checks.length, 2); assert.equal(r.assurance.latestRun.evidenceDigest, run.evidenceDigest); assert.equal(r.assurance.latestRun.currentDisposition, 'READY');
        assert.deepEqual(after.rows, before.rows); assert.equal(Number(after.rows.at(-1).version), 6);
    });
    test('POSTGRES impact / damaged copy creation history cannot establish a clean lineage report', async t => {
        await reset(); const h = await setupImpact(t, { postgresURL: url }); await h.add(); const next = await h.revise();
        await h.sql(c => c.query("UPDATE obligation_history SET snapshot='{}' WHERE obligation_id=$1 AND version=1", [next.obligations[0].id]));
        await assert.rejects(h.report(next.revision.id), e => e.code === 'IMPACT_RECORD_INTEGRITY');
    });
}
