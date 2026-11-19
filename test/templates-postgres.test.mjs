import { requireDisposablePostgresURL } from './postgres-safety.mjs';
/** Destructive fixtures are restricted to an explicitly disposable loopback PostgreSQL database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setupTemplates, author, authority, rationale } from './templates-helpers.mjs';
import { openAssuranceRepository } from '../server/assurance/repository.mjs';
import { openDatabase } from '../server/workflow-store.mjs';
import { createAssuranceReadModel } from '../server/assurance/read-model.mjs';
import { createTemplateRepository } from '../server/templates/repository.mjs';
import { migrateTemplates, templatesChecksum } from '../server/templates/migration.mjs';
import { setupMulti } from './generalization-helpers.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) test('TEMPLATES POSTGRES NOT EXECUTED: disposable database required', { skip: process.env.REQUIRE_POSTGRES !== 'true' }, () => {
    throw new Error('Mandatory verification templates PostgreSQL suite did not execute.');
});
else {
    requireDisposablePostgresURL(url);
    const { default: pg } = await import('pg');
    const reset = async () => {
        const pool = new pg.Pool({ connectionString: url });
        try { await pool.query('DROP TABLE IF EXISTS verification_template_uses,verification_template_mutations,verification_template_versions,verification_templates,drafting_suggestions,drafting_runs,source_previews,source_imports,source_backoff,resolution_challenges,resolution_history,resolution_items,assurance_evidence,assurance_runs,assurance_plans,obligation_history,obligation_workflow,change_revisions,workspace_sessions,auth_buckets,qivvera_migrations,activity,obligations,changes,applications CASCADE'); }
        finally { await pool.end(); }
    };
    const archiveInput = t => ({ requestKey: randomUUID(), expectedVersion: t.version.number, expectedStateVersion: t.family.stateVersion, rationale });

    test('POSTGRES templates / durable versions and use provenance survive fresh connections', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), saved = await h.save();
        const plan = await h.service.approvePlan(h.destination.id, await h.useInput(saved), authority);
        const other = await openAssuranceRepository({ ...h.options, migrate: false });
        try {
            assert.deepEqual((await other.templates.get(saved.family.id)).version, saved.version);
            assert.deepEqual((await other.getContext(h.destination.id, h.destination.revision.id)).plan.templateUse, plan.templateUse);
            assert.equal((await other.templates.list()).total, 1);
        } finally { await other.close(); }
    });
    test('POSTGRES templates / concurrent identical save requests create one family and receipt', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), input = h.input();
        const other = await openAssuranceRepository({ ...h.options, migrate: false });
        try {
            const results = await Promise.all([h.templates.create(input, authority), other.templates.create(input, authority)]);
            assert.equal(results[0].family.id, results[1].family.id); assert.equal(results.filter(r => r.replayed).length, 1);
            assert.equal((await other.templates.list()).total, 1);
        } finally { await other.close(); }
    });
    test('POSTGRES templates / concurrent new versions have exactly one optimistic winner', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), first = await h.save();
        const other = await openAssuranceRepository({ ...h.options, migrate: false });
        try {
            const input = h.input({ expectedVersion: 1, expectedStateVersion: 1 });
            const results = await Promise.allSettled([h.templates.revise(first.family.id, input, authority), other.templates.revise(first.family.id, { ...input, requestKey: randomUUID(), name: 'Competing version' }, authority)]);
            assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
            assert.equal(results.find(r => r.status === 'rejected').reason.code, 'TEMPLATE_VERSION_CONFLICT');
            assert.equal((await other.templates.get(first.family.id)).history.length, 2);
        } finally { await other.close(); }
    });
    test('POSTGRES templates / concurrent use replay creates one approved plan and use receipt', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), saved = await h.save(), input = await h.useInput(saved);
        const other = await openAssuranceRepository({ ...h.options, migrate: false });
        try {
            const results = await Promise.all([h.service.approvePlan(h.destination.id, input, authority), other.approvePlan(h.destination.id, input, authority)]);
            assert.equal(results[0].id, results[1].id); assert.equal(results.filter(r => r.replayed).length, 1);
            assert.equal((await other.getContext(h.destination.id, h.destination.revision.id)).plan.version, 1);
            assert.equal(await h.sql(async c => Number((await c.query('SELECT COUNT(*) AS n FROM verification_template_uses')).rows[0].n)), 1);
        } finally { await other.close(); }
    });
    test('POSTGRES templates / concurrent archive and use serialize without retroactive invalidation', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), saved = await h.save(), input = await h.useInput(saved);
        const other = await openAssuranceRepository({ ...h.options, migrate: false });
        try {
            const results = await Promise.allSettled([h.service.approvePlan(h.destination.id, input, authority), other.templates.archive(saved.family.id, archiveInput(saved), authority)]);
            assert.equal(results[1].status, 'fulfilled'); assert.equal((await h.templates.get(saved.family.id)).family.state, 'ARCHIVED');
            const plan = (await h.service.getContext(h.destination.id, h.destination.revision.id)).plan;
            if (results[0].status === 'fulfilled') { assert.equal(plan.id, results[0].value.id); assert.equal(plan.current, true); }
            else { assert.equal(results[0].reason.code, 'TEMPLATE_ARCHIVED'); assert.equal(plan, null); }
        } finally { await other.close(); }
    });
    test('POSTGRES templates / a read observes one coherent snapshot across an intervening archive', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), saved = await h.save(), db = await openDatabase(h.db);
        const other = await openAssuranceRepository({ ...h.options, migrate: false }); let changed = false;
        const wrapped = { ...db, transaction: (fn, readOnly) => db.transaction(c => fn({ ...c, query: async (...args) => {
            const result = await c.query(...args);
            if (!changed && args[0].startsWith('SELECT * FROM verification_templates WHERE id IN')) { changed = true; await other.templates.archive(saved.family.id, archiveInput(saved), authority); }
            return result;
        } }), readOnly) };
        try {
            const repository = createTemplateRepository({ db: wrapped, model: createAssuranceReadModel(wrapped, h.options.targets), catalogue: h.options.targets });
            const read = await repository.api.get(saved.family.id); assert.equal(read.family.state, 'ACTIVE');
            assert.equal((await h.templates.get(saved.family.id)).family.state, 'ARCHIVED');
        } finally { await other.close(); await db.close(); }
    });
    test('POSTGRES templates / schema5-through7 migration preserves existing plans evidence and checksums', async t => {
        await reset(); const h = await setupMulti(t, { postgresURL: url }), original = await h.run(), db = await openDatabase(h.db);
        try {
            const before = await db.transaction(async c => ({ migrations: (await c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version')).rows,
                plans: (await c.query('SELECT * FROM assurance_plans ORDER BY id')).rows, evidence: (await c.query('SELECT * FROM assurance_evidence ORDER BY run_id')).rows }), true);
            await migrateTemplates(db); await migrateTemplates(db);
            const after = await db.transaction(async c => ({ migrations: (await c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version')).rows,
                plans: (await c.query('SELECT * FROM assurance_plans ORDER BY id')).rows, evidence: (await c.query('SELECT * FROM assurance_evidence ORDER BY run_id')).rows }), true);
            assert.deepEqual(after.migrations.filter(r => Number(r.version) <= 5), before.migrations);
            assert.equal(after.migrations.find(r => Number(r.version) === 7).checksum, templatesChecksum);
            assert.deepEqual(after.plans, before.plans); assert.deepEqual(after.evidence, before.evidence);
            assert.equal((await h.service.getRun(original.id)).evidenceDigest, original.evidenceDigest);
            await db.transaction(c => c.query("UPDATE qivvera_migrations SET checksum='damaged' WHERE version=7"));
            await assert.rejects(openAssuranceRepository({ ...h.options, migrate: false, templatesEnabled: true }), /TEMPLATES_MIGRATION_REQUIRED/);
        } finally { await db.close(); }
    });
    test('POSTGRES templates / narrow web grants protect immutable preparation and rollback failed approval', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), owner = new pg.Pool({ connectionString: url });
        const role = 'qivvera_template_web_' + randomUUID().replaceAll('-', ''), password = randomUUID() + randomUUID();
        let limited, pool, created = false;
        try {
            await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`); created = true;
            await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
            await owner.query(`GRANT SELECT ON qivvera_migrations,applications,changes,change_revisions,obligations,obligation_workflow,obligation_history,assurance_plans,assurance_runs,assurance_evidence,activity TO ${role}`);
            await owner.query(`GRANT INSERT ON assurance_plans,assurance_runs,activity TO ${role}`);
            await owner.query(`GRANT UPDATE(id) ON changes TO ${role}`);
            await owner.query(`GRANT UPDATE(status,finished_at,failure_code,lease_hash) ON assurance_runs TO ${role}`);
            await owner.query(readFileSync(new URL('../ops/templates-permissions.sql', import.meta.url), 'utf8').replaceAll('qivvera_web', role));
            const connection = new URL(url); connection.username = role; connection.password = password;
            limited = await openAssuranceRepository({ ...h.options, connectionString: connection.toString(), migrate: false });
            pool = new pg.Pool({ connectionString: connection.toString() });
            const saved = await limited.templates.create(h.input(), authority);
            const input = await h.useInput(saved), plan = await limited.approvePlan(h.destination.id, input, authority);
            await limited.templates.archive(saved.family.id, archiveInput(saved), authority);
            assert.equal((await limited.getContext(h.destination.id, h.destination.revision.id)).plan.current, true);
            for (const sql of ["UPDATE verification_template_versions SET snapshot='{}'", 'DELETE FROM verification_template_versions',
                "UPDATE verification_template_mutations SET receipt_snapshot='{}'", 'DELETE FROM verification_template_mutations',
                "UPDATE verification_template_uses SET receipt_snapshot='{}'", 'DELETE FROM verification_template_uses',
                "UPDATE verification_templates SET created_by='changed@example.test'", 'DELETE FROM verification_templates',
                "UPDATE assurance_plans SET snapshot='{}'", 'DELETE FROM assurance_evidence'])
                await assert.rejects(pool.query(sql), e => e.code === '42501');
            const next = await limited.templates.create(h.input(), authority), nextInput = await h.useInput(next);
            await owner.query(`REVOKE INSERT ON activity FROM ${role}`);
            await assert.rejects(limited.approvePlan(h.destination.id, nextInput, authority), e => e.code === '42501');
            assert.equal((await h.service.getContext(h.destination.id, h.destination.revision.id)).plan.id, plan.id);
            assert.equal(await h.sql(async c => Number((await c.query('SELECT COUNT(*) AS n FROM verification_template_uses')).rows[0].n)), 1);
        } finally {
            await pool?.end(); await limited?.close();
            if (created) { await owner.query(`DROP OWNED BY ${role}`); await owner.query(`DROP ROLE ${role}`); }
            await owner.end();
        }
    });
    test('POSTGRES templates / worker can claim template-backed plans without any template-table privileges', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), saved = await h.save();
        const plan = await h.service.approvePlan(h.destination.id, await h.useInput(saved), authority);
        const queued = await h.service.requestRun(h.destination.id, { revisionId: h.destination.revision.id, planId: plan.id, requestKey: randomUUID() }, author);
        const owner = new pg.Pool({ connectionString: url }), role = 'qivvera_template_worker_' + randomUUID().replaceAll('-', ''), password = randomUUID() + randomUUID();
        let worker, pool, created = false;
        try {
            await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`); created = true;
            await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
            await owner.query(`GRANT SELECT ON applications,changes,change_revisions,obligations,obligation_workflow,obligation_history,qivvera_migrations,assurance_plans,assurance_runs,assurance_evidence TO ${role}`);
            await owner.query(`GRANT UPDATE(status,started_at,finished_at,lease_until,lease_hash,worker_id,failure_code) ON assurance_runs TO ${role}`);
            await owner.query(`GRANT INSERT ON assurance_evidence,activity TO ${role}`);
            const connection = new URL(url); connection.username = role; connection.password = password;
            worker = await openAssuranceRepository({ ...h.options, connectionString: connection.toString(), migrate: false, templatesEnabled: false, worker: true });
            pool = new pg.Pool({ connectionString: connection.toString() });
            const job = await worker.claim('restricted-template-worker'); assert.equal(job.id, queued.id); assert.equal(worker.templates, null);
            for (const table of ['verification_templates','verification_template_versions','verification_template_mutations','verification_template_uses'])
                await assert.rejects(pool.query(`SELECT * FROM ${table}`), e => e.code === '42501');
        } finally {
            await pool?.end(); await worker?.close();
            if (created) { await owner.query(`DROP OWNED BY ${role}`); await owner.query(`DROP ROLE ${role}`); }
            await owner.end();
        }
    });
    test('POSTGRES templates / stored receipt corruption fails integrity instead of reporting successful replay', async t => {
        await reset(); const h = await setupTemplates(t, { postgresURL: url }), saved = await h.save(), input = await h.useInput(saved);
        const plan = await h.service.approvePlan(h.destination.id, input, authority);
        await h.sql(c => c.query("UPDATE verification_template_uses SET receipt_snapshot='{}' WHERE plan_id=$1", [plan.id]));
        await assert.rejects(h.service.approvePlan(h.destination.id, input, authority), e => e.code === 'TEMPLATE_INTEGRITY_FAILED');
        await assert.rejects(h.service.getContext(h.destination.id, h.destination.revision.id), e => e.code === 'TEMPLATE_INTEGRITY_FAILED');
    });
}
