/** Real PostgreSQL operational checks. Every test creates its own disposable database; no shared reset. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { databaseConfig, connectDatabase, beginReadSnapshot, databaseFingerprint, quoteIdentifier } from '../backend/server/operations/common.mjs';
import { auditRuntimePermissions } from '../backend/server/operations/permissions.mjs';
import { rehearseRecovery } from '../backend/server/operations/recovery.mjs';
import { setupTemplates, author, authority, rationale } from './templates-helpers.mjs';
import { setupMulti } from './generalization-helpers.mjs';
import { setupDrafting, author as draftAuthor } from './drafting-helpers.mjs';
import { openAssuranceRepository } from '../backend/server/assurance/repository.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openDatabase } from '../backend/server/workflow-store.mjs';
import { migrateAccounts } from '../backend/server/accounts/migration.mjs';

const url = process.env.TEST_DATABASE_URL;
const revision = process.env.GITHUB_SHA ?? process.env.QIVVERA_RELEASE_SHA ?? 'd'.repeat(40);
if (!url) test('OPERATIONS POSTGRES NOT EXECUTED: disposable database and matching PostgreSQL clients required',
    { skip: process.env.REQUIRE_POSTGRES !== 'true' }, () => { throw new Error('Mandatory operational PostgreSQL suite did not execute.'); });
else {
    // Strict component validation precedes any client construction; URL routing/session overrides are rejected.
    const base = databaseConfig(url, { sslMode: 'disable', kind: 'source' });
    async function fixture(t, { differentLocale = false } = {}) {
        const adminURL = new URL(base.connectionString); adminURL.pathname = '/postgres';
        const admin = await connectDatabase(databaseConfig(adminURL.toString(), { sslMode: 'disable', kind: 'admin' }));
        const name = 'qivvera_test_ops_' + randomUUID().replaceAll('-', ''), sourceURL = new URL(base.connectionString);
        sourceURL.pathname = '/' + name;
        const cleanups = [], roles = [], copies = []; let source, created = false;
        t.after(async () => {
            for (const cleanup of cleanups.reverse()) await cleanup();
            await source?.end();
            for (const database of copies) await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
            if (created) await admin.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`);
            for (const role of roles.reverse()) await admin.query(`DROP ROLE ${quoteIdentifier(role)}`);
            await admin.end();
        });
        const defaults = (await admin.query(`SELECT datlocprovider AS provider,datctype AS ctype,
            current_setting('server_version_num')::integer AS version FROM pg_database WHERE datname='template0'`)).rows[0];
        // Seed the genuine Unicode plan snapshots in UTF8. LATIN1 would reject the protected
        // profile's en dash before the recovery command could test incompatible text semantics.
        let options = '';
        if (differentLocale) {
            if (defaults.version >= 170000 && defaults.provider !== 'b')
                options = " ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'";
            else {
                const locale = defaults.provider === 'b' || !['C', 'POSIX'].includes(defaults.ctype) ? 'C' : 'C.UTF-8';
                options = ` ENCODING 'UTF8' LOCALE_PROVIDER libc LC_COLLATE '${locale}' LC_CTYPE '${locale}'`;
            }
        }
        await admin.query(`CREATE DATABASE ${quoteIdentifier(name)} TEMPLATE template0${options}`); created = true;
        source = await connectDatabase(databaseConfig(sourceURL.toString(), { sslMode: 'disable', kind: 'source' }));
        const life = { after: fn => cleanups.push(fn) }, h = await setupTemplates(life, { postgresURL: sourceURL.toString() });
        // Cumulative schema 8: database-held accounts.
        const accountsDb = await openDatabase({ driver: 'postgres', connectionString: sourceURL.toString(), sslMode: 'disable' });
        try { await migrateAccounts(accountsDb); } finally { await accountsDb.close(); }
        async function role(label, login = true) {
            const name = 'qivvera_op_' + label + '_' + randomUUID().replaceAll('-', ''), password = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
            await admin.query(`CREATE ROLE ${quoteIdentifier(name)} ${login ? 'LOGIN' : 'NOLOGIN'} NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
            roles.push(name); const connection = new URL(sourceURL); connection.username = name; connection.password = password;
            return { name, connectionString: connection.toString() };
        }
        async function runtimeRoles() {
            const web = await role('web'), worker = await role('worker'), w = quoteIdentifier(web.name), v = quoteIdentifier(worker.name);
            await source.query(`GRANT USAGE ON SCHEMA public TO ${w},${v}`);
            await source.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${w}`);
            await source.query(`GRANT INSERT ON applications,changes,change_revisions,obligations,obligation_workflow,obligation_history,activity,
                workspace_sessions,auth_buckets,assurance_plans,assurance_runs,resolution_items,resolution_history,resolution_challenges,
                source_previews,source_imports,source_backoff,drafting_runs,drafting_suggestions,verification_templates,
                verification_template_versions,verification_template_mutations,verification_template_uses TO ${w}`);
            await source.query(`GRANT UPDATE(id) ON changes TO ${w};
                GRANT UPDATE(statement,source_reference,criticality,version,updated_at) ON obligations TO ${w};
                GRANT UPDATE(source_version,review_state,last_edited_by,proposed_by,imported) ON obligation_workflow TO ${w};
                GRANT UPDATE(attempt_count,reset_at) ON auth_buckets TO ${w};
                GRANT UPDATE(status,finished_at,failure_code,lease_hash) ON assurance_runs TO ${w};
                GRANT UPDATE(assigned_to,action_plan,external_reference,status,version,correction_revision_id,correction_obligation_id,
                    correction_note,correction_proposed_by,correction_proposed_at,correction_run_floor,linked_run_id,verification_snapshot,
                    verified_by,verified_at,updated_at) ON resolution_items TO ${w};
                GRANT UPDATE(state,response,responded_by,response_reason,independent_actor,responded_at) ON resolution_challenges TO ${w};
                GRANT UPDATE(import_id,request_digest) ON source_previews TO ${w};
                GRANT UPDATE(retry_after) ON source_backoff TO ${w};
                GRANT UPDATE(status,result_snapshot,result_digest,failure_code,completed_at) ON drafting_runs TO ${w};
                GRANT UPDATE(status,version,decision_snapshot,decision_digest,decision_request_digest,obligation_id) ON drafting_suggestions TO ${w};
                GRANT UPDATE(state,state_version,archived_by,archived_at,archive_rationale,archive_request_key) ON verification_templates TO ${w};
                GRANT UPDATE(last_login_at) ON workspace_users TO ${w};
                GRANT DELETE ON workspace_sessions,auth_buckets,source_previews TO ${w}`);
            await source.query(`GRANT SELECT ON applications,changes,change_revisions,obligations,obligation_workflow,obligation_history,
                qivvera_migrations,assurance_plans,assurance_runs,assurance_evidence TO ${v};
                GRANT INSERT ON assurance_evidence,activity TO ${v};
                GRANT UPDATE(status,started_at,finished_at,lease_until,lease_hash,worker_id,failure_code) ON assurance_runs TO ${v}`);
            return { web, worker, input: { webConnectionString: web.connectionString, workerConnectionString: worker.connectionString,
                sslMode: 'disable', releaseRevision: revision } };
        }
        function recoveryInput() {
            const destinationDatabase = 'qivvera_test_restore_' + randomUUID().replaceAll('-', ''); copies.push(destinationDatabase);
            return { sourceConnectionString: sourceURL.toString(), destinationAdminConnectionString: adminURL.toString(),
                destinationDatabase, releaseRevision: revision, binaryDirectory: process.env.QIVVERA_PG_BIN_DIR };
        }
        return { ...h, h, life, source, admin, sourceURL: sourceURL.toString(), adminURL: adminURL.toString(), role, runtimeRoles, recoveryInput, copies };
    }
    async function snapshot(connectionString) {
        const client = await connectDatabase(databaseConfig(connectionString, { sslMode: 'disable', kind: 'source' }));
        try { await beginReadSnapshot(client); return await databaseFingerprint(client); }
        finally { await client.query('ROLLBACK'); await client.end(); }
    }
    async function retain(name, report) {
        const out = process.env.QIVVERA_TEST_OUTPUT ?? 'review-test-results';
        await mkdir(out, { recursive: true });
        await writeFile(join(out, name), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    }

    test('POSTGRES operations / narrow real runtime logins pass and the audit leaves all application rows unchanged', async t => {
        const f = await fixture(t), roles = await f.runtimeRoles(), before = await snapshot(f.sourceURL);
        const report = await auditRuntimePermissions(roles.input);
        assert.equal(report.passed, true, JSON.stringify(report.roles));
        assert.deepEqual(await snapshot(f.sourceURL), before);
        const limited = await openAssuranceRepository({ ...f.options, connectionString: roles.web.connectionString, migrate: false });
        const worker = await openAssuranceRepository({ ...f.options, connectionString: roles.worker.connectionString, migrate: false, templatesEnabled: false, worker: true });
        try {
            const template = await limited.templates.create(f.input(), authority);
            const plan = await limited.approvePlan(f.destination.id, await f.useInput(template), authority);
            const run = await limited.requestRun(f.destination.id, { revisionId: f.destination.revision.id, planId: plan.id, requestKey: randomUUID() }, author);
            assert.equal((await worker.claim('operations-isolation-test')).id, run.id);
            await limited.templates.archive(template.family.id, { expectedVersion: 1, expectedStateVersion: 1, requestKey: randomUUID(), rationale }, authority);
        } finally { await worker.close(); await limited.close(); }
        await retain('operations-permissions-report.json', { ...report, genuineNarrowRolePlanAndClaim: true });
    });
    test('POSTGRES operations / forbidden NOINHERIT membership usable through SET ROLE is detected', async t => {
        const f = await fixture(t), roles = await f.runtimeRoles(), group = await f.role('group', false);
        await f.source.query(`GRANT UPDATE(manifest) ON assurance_evidence TO ${quoteIdentifier(group.name)}`);
        await f.admin.query(`GRANT ${quoteIdentifier(group.name)} TO ${quoteIdentifier(roles.web.name)}`);
        const report = await auditRuntimePermissions(roles.input);
        assert.equal(report.passed, false);
        assert.ok(report.roles.web.violations.some(v => v.code === 'FORBIDDEN_COLUMN_PRIVILEGE' && v.table === 'assurance_evidence' && v.privilege === 'UPDATE' && v.via === 'available-role'));
    });
    test('POSTGRES operations / inherited PUBLIC grants cannot give worker template access', async t => {
        const f = await fixture(t), roles = await f.runtimeRoles();
        await f.source.query('GRANT SELECT ON verification_templates TO PUBLIC');
        const report = await auditRuntimePermissions(roles.input);
        assert.equal(report.passed, false);
        assert.ok(report.roles.worker.violations.some(v => v.table === 'verification_templates' && v.privilege === 'SELECT'));
    });
    test('POSTGRES operations / allowed evidence INSERT with delegation is rejected for the worker', async t => {
        const f = await fixture(t), roles = await f.runtimeRoles();
        await f.source.query(`GRANT INSERT ON assurance_evidence TO ${quoteIdentifier(roles.worker.name)} WITH GRANT OPTION`);
        const report = await auditRuntimePermissions(roles.input);
        assert.equal(report.passed, false);
        assert.ok(report.roles.worker.violations.some(v => v.code === 'FORBIDDEN_TABLE_GRANT_OPTION' && v.table === 'assurance_evidence' && v.privilege === 'INSERT'));
        assert.ok(report.roles.worker.violations.some(v => v.code === 'FORBIDDEN_COLUMN_GRANT_OPTION' && v.table === 'assurance_evidence'));
    });
    test('POSTGRES operations / a runtime table owner and an overpowered role are rejected', async t => {
        const f = await fixture(t), roles = await f.runtimeRoles();
        await f.source.query(`ALTER TABLE verification_templates OWNER TO ${quoteIdentifier(roles.web.name)}`);
        await f.admin.query(`ALTER ROLE ${quoteIdentifier(roles.worker.name)} CREATEROLE`);
        const report = await auditRuntimePermissions(roles.input);
        assert.equal(report.passed, false);
        assert.ok(report.roles.web.violations.some(v => v.code === 'RUNTIME_OWNS_TABLE' && v.table === 'verification_templates'));
        assert.ok(report.roles.worker.violations.some(v => v.code === 'PRIVILEGED_RUNTIME_ROLE'));
    });
    test('POSTGRES operations / missing required column grants and immutable history writes are both failures', async t => {
        const f = await fixture(t), roles = await f.runtimeRoles();
        await f.source.query(`REVOKE UPDATE(lease_hash) ON assurance_runs FROM ${quoteIdentifier(roles.web.name)};
            GRANT DELETE ON obligation_history TO ${quoteIdentifier(roles.web.name)}`);
        const report = await auditRuntimePermissions(roles.input);
        assert.equal(report.passed, false);
        assert.ok(report.roles.web.violations.some(v => v.code === 'MISSING_COLUMN_PRIVILEGE' && v.column === 'lease_hash'));
        assert.ok(report.roles.web.violations.some(v => v.table === 'obligation_history' && v.privilege === 'DELETE'));
    });
    test('POSTGRES operations / real backup and fresh restore preserve evidence, versions, histories, drafting and replay', async t => {
        const f = await fixture(t), saved = await f.save(), use = await f.useInput(saved);
        const plan = await f.service.approvePlan(f.destination.id, use, authority);
        const next = await f.templates.revise(saved.family.id, f.input({ expectedVersion: 1, expectedStateVersion: 1 }), authority);
        await f.templates.archive(saved.family.id, { expectedVersion: 2, expectedStateVersion: 1, requestKey: randomUUID(), rationale }, authority);
        const multi = await setupMulti(f.life, { postgresURL: f.sourceURL }), run = await multi.run();
        assert.equal(run.status, 'COMPLETED'); assert.ok(run.evidenceDigest);
        const drafted = await setupDrafting(f.life, { postgresURL: f.sourceURL });
        const generation = await drafted.drafting.generate(drafted.change.id, drafted.input(), draftAuthor);
        await drafted.drafting.act(generation.id, generation.suggestions[0].id, drafted.createDecision(generation.suggestions[0]), draftAuthor);
        await f.workflow.saveSession('e'.repeat(64), 'recovery@example.test', 'synthetic-csrf', Date.now() + 100000, 'synthetic-credential-version');
        await f.workflow.consumeLoginAttempt('synthetic-recovery-bucket');
        const before = await snapshot(f.sourceURL), input = f.recoveryInput(), report = await rehearseRecovery(input);
        assert.equal(report.passed, true); assert.equal(report.sourceModified, false); assert.equal(report.destinationCreated, true);
        assert.deepEqual(await snapshot(f.sourceURL), before);
        const destination = new URL(f.adminURL); destination.pathname = '/' + input.destinationDatabase;
        assert.deepEqual(await snapshot(destination.toString()), before);
        const restored = await openAssuranceRepository({ ...f.options, connectionString: destination.toString(), targets: [...f.options.targets, multi.target], migrate: false });
        const workflow = await openWorkflowRepository({ ...f.db, connectionString: destination.toString(), migrate: false, drafting: { enabled: true } });
        try {
            const template = await restored.templates.get(saved.family.id);
            assert.equal(template.family.state, 'ARCHIVED'); assert.equal(template.version.id, next.version.id); assert.equal(template.history.length, 2);
            assert.equal((await restored.getRun(run.id)).evidenceDigest, run.evidenceDigest);
            const replay = await restored.approvePlan(f.destination.id, use, authority);
            assert.equal(replay.id, plan.id); assert.equal(replay.replayed, true); assert.deepEqual(replay.templateUse, plan.templateUse);
            assert.deepEqual(await workflow.getObligationHistory(f.sourceObligations[0].id), await f.workflow.getObligationHistory(f.sourceObligations[0].id));
            assert.equal((await workflow.drafting.get(generation.id)).suggestions[0].status, 'CANDIDATE_CREATED');
        } finally { await workflow.close(); await restored.close(); }
        assert.deepEqual(await snapshot(destination.toString()), before);
        await retain('operations-recovery-report.json', { ...report, restoredRepositoryReadsAndReplay: true, originalSourceUnchanged: true });
    });
    test('POSTGRES operations / an existing destination is refused without modifying either database', async t => {
        const f = await fixture(t), input = f.recoveryInput();
        await f.admin.query(`CREATE DATABASE ${quoteIdentifier(input.destinationDatabase)} TEMPLATE template0`);
        const before = await snapshot(f.sourceURL);
        await assert.rejects(rehearseRecovery(input), error => error.code === 'RECOVERY_DESTINATION_ALREADY_EXISTS' && error.receipt.destinationCreated === false);
        assert.deepEqual(await snapshot(f.sourceURL), before);
        assert.equal((await f.admin.query('SELECT COUNT(*)::integer AS count FROM pg_database WHERE datname=$1', [input.destinationDatabase])).rows[0].count, 1);
    });
    test('POSTGRES operations / fingerprints retain one snapshot across a concurrent source commit', async t => {
        const f = await fixture(t), reader = await connectDatabase(databaseConfig(f.sourceURL, { sslMode: 'disable', kind: 'source' }));
        try {
            await beginReadSnapshot(reader); const before = await databaseFingerprint(reader);
            await f.workflow.createApplication({ name: 'Concurrent recovery write ' + randomUUID() }, author);
            assert.deepEqual(await databaseFingerprint(reader), before);
            assert.notEqual((await snapshot(f.sourceURL)).contentDigest, before.contentDigest);
        } finally { await reader.query('ROLLBACK'); await reader.end(); }
    });
    test('POSTGRES operations / corrupt migration history blocks backup before destination creation', async t => {
        const f = await fixture(t), input = f.recoveryInput();
        await f.source.query("UPDATE qivvera_migrations SET checksum='corrupt' WHERE version=7");
        await assert.rejects(rehearseRecovery(input), error => error.code === 'OPERATIONS_MIGRATION_MISMATCH' && error.receipt.destinationCreated === false);
        assert.equal((await f.admin.query('SELECT COUNT(*)::integer AS count FROM pg_database WHERE datname=$1', [input.destinationDatabase])).rows[0].count, 0);
    });
    test('POSTGRES operations / incompatible locale or provider defaults fail before destination creation', async t => {
        const f = await fixture(t, { differentLocale: true }), input = f.recoveryInput();
        await assert.rejects(rehearseRecovery(input), error => error.code === 'RECOVERY_DATABASE_PROPERTIES_MISMATCH' && error.receipt.destinationCreated === false);
        assert.equal((await f.admin.query('SELECT COUNT(*)::integer AS count FROM pg_database WHERE datname=$1', [input.destinationDatabase])).rows[0].count, 0);
    });
}
