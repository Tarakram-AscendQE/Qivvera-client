/** Mandatory release suite; only disposable loopback PostgreSQL databases are allowed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { openWorkflowRepository } from '../server/workflow-repository.mjs';
import { contractCases } from './workflow-contract.mjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) {
    test('POSTGRES NOT EXECUTED: supply disposable TEST_DATABASE_URL', { skip: process.env.REQUIRE_POSTGRES !== 'true' }, () => { throw new Error('Mandatory PostgreSQL suite did not execute.'); });
}
else {
    const u = new URL(url);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || !/^\/qivvera_test_[a-z0-9_]+$/.test(u.pathname))
        throw new Error('Integration tests require an isolated loopback qivvera_test_* database. Never point this test at customer data.');
    const { default: pg } = await import('pg');
    const reset = async () => { const p = new pg.Pool({ connectionString: url }); try {
        await p.query('DROP TABLE IF EXISTS resolution_challenges,resolution_history,resolution_items,assurance_evidence,assurance_runs,assurance_plans,obligation_history,obligation_workflow,change_revisions,workspace_sessions,auth_buckets,qivvera_migrations,activity,obligations,changes,applications CASCADE');
    }
    finally {
        await p.end();
    } };
    for (const [name, fn] of contractCases())
        test(`POSTGRES / ${name}`, async (t) => { await reset(); const r = await openWorkflowRepository({ driver: 'postgres', connectionString: url, sslMode: 'disable', migrate: true }); t.after(() => r.close()); await fn(r); });
    test('POSTGRES / actual legacy TIMESTAMPTZ rows survive idempotent migration', async () => {
        await reset();
        const p = new pg.Pool({ connectionString: url });
        try {
            await p.query(`CREATE TABLE applications(id TEXT PRIMARY KEY,name TEXT NOT NULL,normalized_name TEXT NOT NULL UNIQUE,description TEXT NOT NULL,repository_url TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL);
   CREATE TABLE changes(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),title TEXT NOT NULL,intent TEXT NOT NULL,source_revision TEXT NOT NULL,producer TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL);
   CREATE TABLE obligations(id TEXT PRIMARY KEY,change_id TEXT NOT NULL REFERENCES changes(id),statement TEXT NOT NULL,source_reference TEXT NOT NULL,criticality TEXT NOT NULL,version INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL,updated_at TIMESTAMPTZ NOT NULL);`);
            const a = '11111111-1111-4111-8111-111111111111', c = '22222222-2222-4222-8222-222222222222', o = '33333333-3333-4333-8333-333333333333';
            await p.query("INSERT INTO applications VALUES($1,'Existing app','existing app','','',now())", [a]);
            await p.query("INSERT INTO changes VALUES($1,$2,'Existing change','Existing intent','abcdef0','HUMAN',now())", [c, a]);
            await p.query("INSERT INTO obligations VALUES($1,$2,'Existing obligation','Rule reference','HIGH',4,now(),now())", [o, c]);
            for (let i = 0; i < 2; i++) {
                const r = await openWorkflowRepository({ driver: 'postgres', connectionString: url, sslMode: 'disable', migrate: true });
                try {
                    const value = await r.getChange(c);
                    assert.equal(value.revisions.length, 1);
                    assert.equal(value.obligations.length, 1);
                    assert.equal(value.obligations[0].imported, true);
                    assert.equal(value.obligations[0].version, 4);
                    assert.equal(value.obligations[0].authority, 'CANDIDATE');
                    assert.equal((await r.getObligationHistory(o)).length, 1);
                }
                finally {
                    await r.close();
                }
            }
        }
        finally {
            await p.end();
        }
    });
    test('POSTGRES / fresh repository and auth instances share revocation and persistent history', async () => {
        await reset();
        const { createWorkspaceAuth } = await import('../server/workspace-auth.mjs');
        const { hashPassword } = await import('../server/auth.mjs');
        const options = { driver: 'postgres', connectionString: url, sslMode: 'disable', migrate: true };
        const one = await openWorkflowRepository(options);
        const account = { email: 'reviewer@example.test', passwordHash: hashPassword('synthetic-pg-session-password'), roles: ['POLICY_AUTHORITY'] };
        const authOne = createWorkspaceAuth({ accounts: [account], repository: one });
        const login = await authOne.login(account.email, 'synthetic-pg-session-password');
        assert.ok(login.session);
        const req = { headers: { cookie: login.cookie.split(';')[0] } };
        await one.close();
        const two = await openWorkflowRepository({ ...options, migrate: false }), three = await openWorkflowRepository({ ...options, migrate: false });
        try {
            const a = createWorkspaceAuth({ accounts: [account], repository: two }), b = createWorkspaceAuth({ accounts: [account], repository: three });
            assert.ok(await a.session(req));
            assert.ok(await b.session(req));
            await a.logout(req);
            assert.equal(await b.session(req), null);
        }
        finally {
            await two.close();
            await three.close();
        }
    });
    test('POSTGRES / actual integration suite executed', () => assert.ok(url));
}
