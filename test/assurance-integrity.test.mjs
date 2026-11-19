/** Corruption/recovery regressions. No public API or database-admin tamper resistance is implied. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setup, author, authority } from './assurance-helpers.mjs';
import { setupMulti } from './generalization-helpers.mjs';
import { openDatabase } from '../server/workflow-store.mjs';

const integrity = error => error?.code === 'ASSURANCE_INTEGRITY_FAILED';
const supported = { outcome: 'SUPPORTED', reason: 'CONTROL_CHECKS_PASSED', observations: [] };
async function sql(h, fn) {
    const db = await openDatabase(h.db);
    try { return await db.transaction(fn); } finally { await db.close(); }
}
async function damagedSnapshot(h, table, id, change) {
    // These fixture writes simulate damaged stored records, never normal author actions.
    assert.ok(['assurance_plans', 'assurance_runs'].includes(table));
    return sql(h, async c => {
        const row = (await c.query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0];
        const snapshot = JSON.parse(row.snapshot); change(snapshot);
        await c.query(`UPDATE ${table} SET snapshot=$1 WHERE id=$2`, [JSON.stringify(snapshot), id]);
        return row;
    });
}
const queueInput = (h, plan) => ({ revisionId: h.change.revision.id, planId: plan.id, requestKey: randomUUID() });

test('integrity / an omitted mandatory obligation in an approved snapshot cannot become a current READY plan', async t => {
    const h = await setup(t, { extraObligation: true }), plan = await h.plan();
    assert.equal(plan.snapshot.scope.obligations.length, 2);
    await damagedSnapshot(h, 'assurance_plans', plan.id, s => {
        s.scope.obligations = s.scope.obligations.filter(o => o.id === h.obligation.id);
    });
    await assert.rejects(h.service.getContext(h.change.id, h.change.revision.id), integrity);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, plan), author), integrity);
    assert.equal(await sql(h, async c => Number((await c.query('SELECT COUNT(*) AS n FROM assurance_runs')).rows[0].n)), 0);
});

test('integrity / version 2 plans also retain every declared mandatory obligation', async t => {
    const h = await setupMulti(t), plan = await h.plan([h.mappings[0]]);
    await damagedSnapshot(h, 'assurance_plans', plan.id, s => {
        s.scope.obligations = s.scope.obligations.filter(o => o.id === h.obligations[0].id);
    });
    await assert.rejects(h.service.getContext(h.change.id, h.change.revision.id), integrity);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, plan), author), integrity);
});

test('integrity / a queued run cannot replace its approved frozen scope before execution', async t => {
    const h = await setup(t, { extraObligation: true }), run = await h.queue();
    await damagedSnapshot(h, 'assurance_runs', run.id, s => {
        s.scope.obligations = s.scope.obligations.filter(o => o.id === h.obligation.id);
    });
    assert.equal(await h.worker.claim('integrity-test-worker'), null);
    const row = await sql(h, async c => (await c.query('SELECT * FROM assurance_runs WHERE id=$1', [run.id])).rows[0]);
    assert.equal(row.status, 'FAILED'); assert.equal(row.failure_code, 'INPUT_INTEGRITY_FAILED');
    assert.equal(row.lease_hash, null);
    assert.equal(await sql(h, async c => Number((await c.query('SELECT COUNT(*) AS n FROM assurance_evidence')).rows[0].n)), 0);
    await assert.rejects(h.service.getRun(run.id), integrity);
});

test('integrity / damage to an already queued source plan is rejected before granting a worker lease', async t => {
    const h = await setup(t), plan = await h.plan(), run = await h.queue(plan);
    await damagedSnapshot(h, 'assurance_plans', plan.id, s => { s.mapping.acceptedBy = 'unrelated@example.test'; });
    assert.equal(await h.worker.claim('integrity-test-worker'), null);
    const row = await sql(h, async c => (await c.query('SELECT status,failure_code FROM assurance_runs WHERE id=$1', [run.id])).rows[0]);
    assert.equal(row.status, 'FAILED'); assert.equal(row.failure_code, 'INPUT_INTEGRITY_FAILED');
});

test('integrity / result acceptance rechecks the persisted approved plan after a worker has claimed', async t => {
    const h = await setup(t), plan = await h.plan(), run = await h.queue(plan);
    const job = await h.worker.claim('integrity-test-worker');
    await damagedSnapshot(h, 'assurance_plans', plan.id, s => { s.mapping.acceptedBy = 'unrelated@example.test'; });
    await assert.rejects(h.worker.complete(job, supported), integrity);
    const saved = await sql(h, async c => ({
        evidence: Number((await c.query('SELECT COUNT(*) AS n FROM assurance_evidence WHERE run_id=$1', [run.id])).rows[0].n),
        status: (await c.query('SELECT status FROM assurance_runs WHERE id=$1', [run.id])).rows[0].status,
    }));
    assert.equal(saved.evidence, 0); assert.equal(saved.status, 'RUNNING');
});

test('integrity / a missing workflow membership cannot silently reduce a fresh ordinary plan scope', async t => {
    const h = await setup(t, { extraObligation: true }), plan = await h.plan();
    const extra = plan.snapshot.scope.obligations.find(o => o.id !== h.obligation.id);
    await sql(h, c => c.query('DELETE FROM obligation_workflow WHERE obligation_id=$1', [extra.id]));
    await assert.rejects(h.service.getContext(h.change.id, h.change.revision.id), integrity);
    await assert.rejects(h.plan(), integrity);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, plan), author), integrity);
});

test('integrity / moving membership to another revision cannot silently remove a mandatory requirement', async t => {
    const h = await setup(t, { extraObligation: true }), plan = await h.plan();
    const other = await h.workflow.createChange({ applicationId: h.app.id, title: 'Other change', sourceRevision: 'b'.repeat(40) }, author);
    const extra = plan.snapshot.scope.obligations.find(o => o.id !== h.obligation.id);
    await sql(h, c => c.query('UPDATE obligation_workflow SET revision_id=$1 WHERE obligation_id=$2', [other.revision.id, extra.id]));
    await assert.rejects(h.service.getContext(h.change.id, h.change.revision.id), integrity);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, plan), author), integrity);
});

test('integrity / current accepted wording must agree with its recorded authority decision', async t => {
    const h = await setup(t), plan = await h.plan();
    await sql(h, c => c.query('UPDATE obligations SET statement=$1 WHERE id=$2', ['A different, unreviewed requirement.', h.obligation.id]));
    await assert.rejects(h.service.getContext(h.change.id, h.change.revision.id), integrity);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, plan), author), integrity);
});

test('integrity / a missing current authority history record cannot be treated as accepted scope', async t => {
    const h = await setup(t), plan = await h.plan();
    await sql(h, c => c.query('DELETE FROM obligation_history WHERE obligation_id=$1 AND version=$2', [h.obligation.id, h.obligation.version]));
    await assert.rejects(h.service.getContext(h.change.id, h.change.revision.id), integrity);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, plan), author), integrity);
});

test('integrity / malformed frozen input produces a defined integrity error and leaves evidence untouched', async t => {
    const h = await setup(t), run = await h.run();
    await sql(h, c => c.query("UPDATE assurance_plans SET snapshot='not-json' WHERE id=$1", [run.planId]));
    await assert.rejects(h.service.getRun(run.id), integrity);
    const row = await sql(h, async c => (await c.query('SELECT digest FROM assurance_evidence WHERE run_id=$1', [run.id])).rows[0]);
    assert.equal(row.digest, run.evidenceDigest);
});

test('integrity / damage to an earlier counterexample snapshot cannot let a later supported report become READY', async t => {
    const h = await setup(t, { mode: 'intermittent' }), first = await h.run();
    assert.equal(first.disposition, 'NOT_READY');
    const next = await h.queue(), job = await h.worker.claim('integrity-test-worker');
    await damagedSnapshot(h, 'assurance_runs', first.id, s => { s.mapping.obligationId = randomUUID(); });
    await assert.rejects(h.worker.complete(job, supported), integrity);
    const records = await sql(h, async c => ({
        first: (await c.query('SELECT digest FROM assurance_evidence WHERE run_id=$1', [first.id])).rows[0],
        next: (await c.query('SELECT digest FROM assurance_evidence WHERE run_id=$1', [next.id])).rows,
    }));
    assert.equal(records.first.digest, first.evidenceDigest); assert.equal(records.next.length, 0);
});

test('integrity / a saved counterexample reference loses applicability when its originating inputs are damaged', async t => {
    const h = await setup(t, { mode: 'intermittent' }), first = await h.run(), second = await h.run();
    assert.equal(second.disposition, 'NOT_READY');
    await damagedSnapshot(h, 'assurance_runs', first.id, s => { s.mapping.obligationId = randomUUID(); });
    const report = await h.service.getRun(second.id);
    assert.equal(report.disposition, null); assert.equal(report.evidenceIntegrity, 'COUNTEREVIDENCE_UNAVAILABLE');
    assert.equal(await sql(h, async c => Number((await c.query('SELECT COUNT(*) AS n FROM assurance_evidence')).rows[0].n)), 2);
});

test('integrity / legitimate later requirement review preserves the original result as explicitly stale history', async t => {
    const h = await setup(t), original = await h.run();
    let revised = await h.workflow.editObligation(h.obligation.id, {
        revisionId: h.change.revision.id, version: h.obligation.version,
        statement: 'Requesters must never approve their own requests; independent approvers may approve.',
        sourceReference: 'Updated approval policy', sourceVersion: '2', criticality: 'CRITICAL',
    }, author);
    revised = await h.workflow.transitionObligation(revised.id, h.action(revised, 'SUBMIT'), author);
    await h.workflow.transitionObligation(revised.id, h.action(revised, 'ACCEPT'), authority);
    const context = await h.service.getContext(h.change.id, h.change.revision.id);
    const history = await h.service.getRun(original.id);
    assert.equal(context.plan.current, false); assert.equal(history.applicability, 'STALE_INPUTS');
    assert.equal(history.disposition, 'READY'); assert.equal(history.evidenceDigest, original.evidenceDigest);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, { id: original.planId }), author), error => error.code === 'CURRENT_APPROVED_PLAN_REQUIRED');
});

test('integrity / a changed current source declaration leaves frozen evidence inspectable but not current', async t => {
    const h = await setup(t), original = await h.run();
    await sql(h, c => c.query('UPDATE change_revisions SET source_revision=$1 WHERE id=$2', ['b'.repeat(40), h.change.revision.id]));
    const context = await h.service.getContext(h.change.id, h.change.revision.id);
    const history = await h.service.getRun(original.id);
    assert.equal(context.plan.current, false); assert.equal(history.applicability, 'STALE_INPUTS');
    assert.equal(history.snapshot.scope.sourceRevision, 'a'.repeat(40));
    assert.equal(history.disposition, original.disposition); assert.equal(history.evidenceDigest, original.evidenceDigest);
    await assert.rejects(h.service.requestRun(h.change.id, queueInput(h, { id: original.planId }), author), error => error.code === 'CURRENT_APPROVED_PLAN_REQUIRED');
});

for (const boundary of ['during integrity validation', 'at the final terminal write']) {
    test(`integrity / lease expiry ${boundary} rejects acceptance and rolls back evidence`, async t => {
        const base = Date.now();
        let completing = false, calls = 0, leaseUntil;
        const beforeExpiryCalls = boundary === 'during integrity validation' ? 1 : 2;
        const h = await setup(t, { clock: () => !completing ? base :
            ++calls <= beforeExpiryCalls ? leaseUntil - 1 : leaseUntil });
        const run = await h.queue(), job = await h.worker.claim('expiry-boundary-worker');
        leaseUntil = job.leaseUntil;
        completing = true;
        await assert.rejects(h.worker.complete(job, supported), error => error.code === 'LEASE_REJECTED');
        const stored = await sql(h, async c => ({
            run: (await c.query('SELECT * FROM assurance_runs WHERE id=$1', [run.id])).rows[0],
            evidence: Number((await c.query('SELECT COUNT(*) AS n FROM assurance_evidence WHERE run_id=$1', [run.id])).rows[0].n),
            completions: Number((await c.query("SELECT COUNT(*) AS n FROM activity WHERE action='ASSURANCE_COMPLETED' AND entity_id=$1", [h.change.id])).rows[0].n),
        }));
        assert.equal(stored.run.status, 'RUNNING');
        assert.equal(stored.run.finished_at, null);
        assert.notEqual(stored.run.lease_hash, null);
        assert.equal(stored.evidence, 0);
        assert.equal(stored.completions, 0);
        // The ordinary expiry sweep subsequently records failure; it cannot revive the output.
        assert.equal((await h.service.getRun(run.id)).status, 'FAILED');
        assert.equal((await h.service.getRun(run.id)).disposition, null);
    });
}

for (const boundary of ['during integrity validation', 'at the final claim write']) {
    test(`integrity / queue expiry ${boundary} grants no worker lease`, async t => {
        const base = Date.now(), deadline = base + 600000;
        let claiming = false, calls = 0;
        const beforeExpiryCalls = boundary === 'during integrity validation' ? 1 : 2;
        const h = await setup(t, { clock: () => !claiming ? base :
            ++calls <= beforeExpiryCalls ? deadline - 1 : deadline });
        const run = await h.queue();
        claiming = true;
        assert.equal(await h.worker.claim('expiry-boundary-worker'), null);
        const stored = await sql(h, async c => ({
            run: (await c.query('SELECT * FROM assurance_runs WHERE id=$1', [run.id])).rows[0],
            evidence: Number((await c.query('SELECT COUNT(*) AS n FROM assurance_evidence WHERE run_id=$1', [run.id])).rows[0].n),
        }));
        assert.equal(stored.run.status, 'FAILED');
        assert.equal(stored.run.failure_code, 'QUEUE_DEADLINE_EXCEEDED');
        assert.equal(stored.run.started_at, null);
        assert.equal(stored.run.lease_hash, null);
        assert.equal(stored.run.lease_until, null);
        assert.equal(stored.run.worker_id, null);
        assert.equal(stored.evidence, 0);
    });
}
