/** Only explicitly disposable loopback PostgreSQL may execute these destructive tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setupDrafting, draftingAssuranceJourney, author, otherAuthor, modelResult } from './drafting-helpers.mjs';
import { openWorkflowRepository } from '../server/workflow-repository.mjs';
import { openDatabase } from '../server/workflow-store.mjs';
import { migrateDrafting, draftingChecksum } from '../server/drafting/migration.mjs';
import { generateDrafts } from '../server/drafting/generator.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) test('DRAFTING POSTGRES NOT EXECUTED: disposable database required', { skip: process.env.REQUIRE_POSTGRES !== 'true' }, () => {
    throw new Error('Mandatory drafting PostgreSQL suite did not execute.');
});
else {
    const u = new URL(url);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || !/^\/qivvera_test_[a-z0-9_]+$/.test(u.pathname))
        throw new Error('Only disposable LOOPBACK qivvera_test_* databases are allowed.');
    const { default: pg } = await import('pg');
    const reset = async () => {
        const p = new pg.Pool({ connectionString: url });
        try { await p.query('DROP TABLE IF EXISTS drafting_suggestions,drafting_runs,source_previews,source_imports,source_backoff,resolution_challenges,resolution_history,resolution_items,assurance_evidence,assurance_runs,assurance_plans,obligation_history,obligation_workflow,change_revisions,workspace_sessions,auth_buckets,qivvera_migrations,activity,obligations,changes,applications CASCADE'); }
        finally { await p.end(); }
    };
    test('POSTGRES drafting / durable source and decisions are readable from a fresh connection', async t => {
        await reset(); const h = await setupDrafting(t, { postgresURL: url });
        const run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
        const saved = await h.drafting.act(run.id, s.id, h.createDecision(s), author);
        const reopened = await openWorkflowRepository({ ...h.options, migrate: false });
        try { assert.deepEqual(await reopened.drafting.get(run.id), Object.fromEntries(Object.entries(saved).filter(([k]) => k !== 'replayed'))); }
        finally { await reopened.close(); }
    });
    test('POSTGRES drafting / identical concurrent decisions create exactly one obligation across connections', async t => {
        await reset(); const h = await setupDrafting(t, { postgresURL: url });
        const run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0], input = h.createDecision(s);
        const other = await openWorkflowRepository({ ...h.options, migrate: false });
        try {
            const values = await Promise.all([h.drafting.act(run.id, s.id, input, author), other.drafting.act(run.id, s.id, input, author)]);
            assert.equal(values[0].suggestions[0].decision.obligationId, values[1].suggestions[0].decision.obligationId);
            assert.equal((await other.getChange(h.change.id)).obligations.length, 1);
            assert.equal(values.filter(v => v.replayed).length, 1);
        } finally { await other.close(); }
    });
    test('POSTGRES drafting / concurrent candidates from different runs cannot duplicate declared scope', async t => {
        await reset(); const h = await setupDrafting(t, { postgresURL: url });
        const a = await h.drafting.generate(h.change.id, h.input(), author), b = await h.drafting.generate(h.change.id, h.input(), author);
        const other = await openWorkflowRepository({ ...h.options, migrate: false });
        try {
            const results = await Promise.allSettled([h.drafting.act(a.id, a.suggestions[0].id, h.createDecision(a.suggestions[0]), author),
                other.drafting.act(b.id, b.suggestions[0].id, h.createDecision(b.suggestions[0]), author)]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            assert.equal(results.find(r => r.status === 'rejected').reason.code, 'DRAFTING_DUPLICATE_OBLIGATION');
            assert.equal((await other.getChange(h.change.id)).obligations.length, 1);
        } finally { await other.close(); }
    });
    test('POSTGRES drafting / global reservation lock blocks concurrent actor requests on different changes', async t => {
        await reset(); let release, entered, calls = 0;
        const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
        const h = await setupDrafting(t, { postgresURL: url, drafting: { generateDrafts: async (...args) => { calls++; entered(); await gate; return generateDrafts(...args); } } });
        const change = await h.workflow.createChange({ applicationId: h.app.id, title: 'Another change', sourceRevision: 'c'.repeat(40) }, author);
        const other = await openWorkflowRepository({ ...h.options, migrate: false });
        const input = h.input(), pending = h.drafting.generate(h.change.id, input, author); await started;
        try {
            const replay = await other.drafting.generate(h.change.id, input, author); assert.equal(replay.status, 'GENERATING');
            await assert.rejects(other.drafting.generate(change.id, h.input({ revisionId: change.revision.id }), author), e => e.code === 'DRAFTING_GENERATION_ACTIVE');
            assert.equal(calls, 1);
        } finally { release(); await pending; await other.close(); }
    });
    test('POSTGRES drafting / workspace provider cap is atomic across processes and identities', async t => {
        await reset(); const time = Date.now();
        const h = await setupDrafting(t, { postgresURL: url, drafting: { now: () => time, openaiEnabled: true, model: 'test-drafting-model', generateDrafts: modelResult } });
        for (let i = 0; i < 29; i++) await h.drafting.generate(h.change.id, h.input({ method: 'openai', externalProcessingConfirmed: true }),
            { email: `cap-${Math.floor(i / 10)}@example.test`, roles: ['AUTHOR'] });
        const other = await openWorkflowRepository({ ...h.options, migrate: false });
        try {
            const values = await Promise.allSettled([h.drafting.generate(h.change.id, h.input({ method: 'openai', externalProcessingConfirmed: true }), author),
                other.drafting.generate(h.change.id, h.input({ method: 'openai', externalProcessingConfirmed: true }), otherAuthor)]);
            assert.equal(values.filter(v => v.status === 'fulfilled').length, 1);
            assert.equal(values.find(v => v.status === 'rejected').reason.code, 'DRAFTING_RATE_LIMITED');
            assert.equal((await h.drafting.getContext(h.change.id)).total, 30);
        } finally { await other.close(); }
    });
    test('POSTGRES drafting / schema5 upgrade preserves assurance and new candidate remains a scope gap', async t => {
        await reset(); const h = await draftingAssuranceJourney(t, { postgresURL: url });
        assert.equal(h.schemaVersion, 6); assert.equal(h.original.disposition, 'READY');
        assert.equal(h.afterPreparation.applicability, 'CURRENT'); assert.equal(h.afterDismissal.applicability, 'CURRENT');
        assert.equal(h.afterAdoption.applicability, 'STALE_INPUTS'); assert.equal(h.context.plan.current, false);
        assert.equal(h.reassessment.disposition, 'INDETERMINATE');
        assert.deepEqual(h.preserved.case, h.original.case); assert.equal(h.preserved.evidenceDigest, h.original.evidenceDigest);
    });
    test('POSTGRES drafting / migration is idempotent and damaged checksum blocks startup', async t => {
        await reset(); const h = await setupDrafting(t, { postgresURL: url }), db = await openDatabase(h.db);
        try {
            const before = await db.transaction(async c => (await c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version')).rows, true);
            await migrateDrafting(db); await migrateDrafting(db);
            const after = await db.transaction(async c => (await c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version')).rows, true);
            assert.deepEqual(after, before); assert.equal(after.find(r => Number(r.version) === 6).checksum, draftingChecksum);
            await db.transaction(c => c.query("UPDATE qivvera_migrations SET checksum='damaged' WHERE version=6"));
            await assert.rejects(openWorkflowRepository({ ...h.options, migrate: false }), /DRAFTING_MIGRATION_REQUIRED/);
            await assert.rejects(migrateDrafting(db), /DRAFTING_MIGRATION_CHECKSUM_MISMATCH/);
        } finally { await db.close(); }
    });
    test('POSTGRES drafting / narrow runtime grants allow drafting but protect source, evidence and history', async t => {
        await reset(); const h = await setupDrafting(t, { postgresURL: url }), owner = new pg.Pool({ connectionString: url });
        const role = 'qivvera_drafting_' + randomUUID().replaceAll('-', ''), password = randomUUID() + randomUUID();
        let limited, pool, created = false;
        try {
            await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`); created = true;
            await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
            await owner.query(`GRANT SELECT ON qivvera_migrations,applications,changes,change_revisions,obligations,obligation_workflow,obligation_history TO ${role}`);
            await owner.query(`GRANT INSERT ON obligations,obligation_workflow,obligation_history,activity TO ${role}`);
            await owner.query(`GRANT UPDATE(id) ON changes TO ${role}`);
            await owner.query(readFileSync(new URL('../ops/drafting-permissions.sql', import.meta.url), 'utf8').replaceAll('qivvera_web', role));
            const connection = new URL(url); connection.username = role; connection.password = password;
            limited = await openWorkflowRepository({ ...h.options, connectionString: connection.toString(), migrate: false });
            pool = new pg.Pool({ connectionString: connection.toString() });
            const run = await limited.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
            const saved = await limited.drafting.act(run.id, s.id, h.createDecision(s), author);
            assert.equal(saved.suggestions[0].status, 'CANDIDATE_CREATED');
            for (const sql of ["UPDATE drafting_runs SET source_snapshot='{}'", "UPDATE drafting_runs SET created_by='changed@example.test'",
                "UPDATE drafting_suggestions SET id='changed'", 'DELETE FROM drafting_runs', 'DELETE FROM drafting_suggestions',
                'DELETE FROM obligation_history', "UPDATE obligation_history SET snapshot='{}'", 'DELETE FROM assurance_evidence', 'INSERT INTO assurance_evidence DEFAULT VALUES'])
                await assert.rejects(pool.query(sql), e => e.code === '42501');
            // Failure after candidate/history inserts must roll the whole decision back.
            await owner.query(`REVOKE INSERT ON activity FROM ${role}`);
            await assert.rejects(limited.drafting.act(run.id, run.suggestions[1].id, h.createDecision(run.suggestions[1]), author), e => e.code === '42501');
            assert.equal((await h.workflow.getChange(h.change.id)).obligations.length, 1);
            assert.equal((await limited.drafting.get(run.id)).suggestions[1].status, 'PROPOSED');
        } finally {
            await pool?.end(); await limited?.close();
            if (created) { await owner.query(`DROP OWNED BY ${role}`); await owner.query(`DROP ROLE ${role}`); }
            await owner.end();
        }
    });
}
