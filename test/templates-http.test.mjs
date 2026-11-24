/** Public template contracts over real HTTP, real sessions and disposable SQLite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setupTemplates, otherAuthority } from './templates-helpers.mjs';
import { author, authority, viewer } from './generalization-helpers.mjs';
import { openAssuranceRepository } from '../backend/server/assurance/repository.mjs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';

const ROOT = '/api/verification-templates';

async function fixture(t, { enabled = true } = {}) {
    const h = await setupTemplates(t);
    const service = enabled ? h.service : await openAssuranceRepository({ ...h.options, migrate: false, templatesEnabled: false });
    if (!enabled) t.after(() => service.close());
    const origin = 'http://127.0.0.1:3029';
    const password = randomUUID() + randomUUID(), passwordHash = hashPassword(password);
    const server = createApplicationServer({ repository: h.workflow, assurance: service, publicOrigin: origin,
        accounts: [author, authority, otherAuthority, viewer].map(actor => ({ ...actor, passwordHash })) });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(path, { method = 'GET', data, raw, session, from = origin, csrf,
        contentType = 'application/json' } = {}) {
        const response = await fetch(base + path, { method, headers: {
            ...(method !== 'GET' ? { ...(from === null ? {} : { Origin: from }), 'Content-Type': contentType } : {}),
            ...(session ? { Cookie: session.cookie, ...(csrf === null ? {} : { 'X-CSRF-Token': csrf ?? session.csrfToken }) } : {}),
        }, ...(raw !== undefined || data !== undefined ? { body: raw ?? JSON.stringify(data) } : {}) });
        const text = await response.text();
        return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
    }
    async function login(actor = authority) {
        const r = await call('/api/session', { method: 'POST', data: { email: actor.email, password } });
        assert.equal(r.status, 200);
        return { cookie: r.headers.get('set-cookie').split(';')[0], csrfToken: r.body.csrfToken };
    }
    const detailPath = (saved, version = undefined, exported = false) => ROOT + '/' + saved.family.id +
        (exported ? '/export' : '') + (version ? '?version=' + version : '');
    const assertOk = r => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
    async function create(input = h.input(), session = undefined) {
        const r = await call(ROOT, { method: 'POST', data: input, session: session ?? await login() });
        assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
    }
    async function list(session = undefined, suffix = '') {
        return assertOk(await call(ROOT + suffix, { session: session ?? await login() }));
    }
    const reviseInput = (saved, changes = {}) => h.input({ expectedVersion: saved.version.number,
        expectedStateVersion: saved.family.stateVersion, ...changes });
    const archiveInput = saved => ({ requestKey: randomUUID(), expectedVersion: saved.version.number,
        expectedStateVersion: saved.family.stateVersion, rationale: 'Retire this reusable example from new verification planning.' });
    const planPath = '/api/changes/' + h.destination.id + '/assurance-plan';
    const planContext = async session => assertOk(await call('/api/changes/' + h.destination.id +
        '/assurance-context?revision=' + h.destination.revision.id, { session: session ?? await login() }));
    return { ...h, service, call, login, create, list, detailPath, reviseInput, archiveInput, planPath, planContext, assertOk };
}

test('templates HTTP / saved templates, exports and mutations require a real session', async t => {
    const h = await fixture(t), saved = await h.create();
    for (const path of [ROOT, h.detailPath(saved), h.detailPath(saved, saved.version.id, true)]) {
        const r = await h.call(path); assert.equal(r.status, 401); assert.equal(r.body.error, 'AUTH_REQUIRED');
        assert.equal(JSON.stringify(r.body).includes(saved.version.snapshot.name), false);
    }
    for (const [path, data] of [[ROOT, h.input()], [ROOT + '/' + saved.family.id + '/versions', h.reviseInput(saved)],
        [ROOT + '/' + saved.family.id + '/archive', h.archiveInput(saved)]]) {
        const r = await h.call(path, { method: 'POST', data }); assert.equal(r.status, 401);
    }
});

test('templates HTTP / all authenticated roles inspect saved provenance and immutable versions', async t => {
    const h = await fixture(t), saved = await h.create();
    for (const actor of [author, authority, viewer]) {
        const session = await h.login(actor), listing = await h.list(session);
        assert.equal(listing.total, 1); assert.equal(listing.items.length, 1);
        const r = await h.call(h.detailPath(saved, saved.version.id), { session });
        assert.equal(r.status, 200); assert.equal(r.body.schema, 'qivvera.verification-template/1');
        assert.equal(r.body.version.digest, saved.version.digest); assert.equal(r.body.version.number, 1);
        assert.equal(r.body.family.state, 'ACTIVE'); assert.equal(r.body.history.length, 1);
        const workspace = await h.call('/api/workspace', { session });
        assert.equal(workspace.body.capabilities.verificationTemplates, true);
        const support = await h.call('/api/support-info', { session });
        assert.equal(support.status, 200);
        assert.equal(support.body.capabilities.verificationTemplates, true);
        assert.equal(support.body.workspace.requiredSchemaVersion, 7);
        assert.equal(support.body.actions.manageVerificationTemplates, actor.roles.includes('POLICY_AUTHORITY'));
    }
});

test('templates HTTP / only Policy Authority can save, revise or archive a template', async t => {
    const h = await fixture(t), saved = await h.create();
    for (const actor of [author, viewer]) {
        const session = await h.login(actor);
        for (const [path, data] of [[ROOT, h.input()], [ROOT + '/' + saved.family.id + '/versions', h.reviseInput(saved)],
            [ROOT + '/' + saved.family.id + '/archive', h.archiveInput(saved)]]) {
            const r = await h.call(path, { method: 'POST', data, session }); assert.equal(r.status, 403);
        }
    }
    assert.equal((await h.list()).total, 1);
    const detail = h.assertOk(await h.call(h.detailPath(saved), { session: await h.login() }));
    assert.equal(detail.version.number, 1); assert.equal(detail.family.state, 'ACTIVE');
});

test('templates HTTP / same-origin and CSRF checks protect every new mutation', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    for (const [path, data] of [[ROOT, h.input()], [ROOT + '/' + saved.family.id + '/versions', h.reviseInput(saved)],
        [ROOT + '/' + saved.family.id + '/archive', h.archiveInput(saved)]]) {
        for (const options of [{ from: 'https://untrusted.example' }, { from: null }, { csrf: 'invalid' }, { csrf: null }]) {
            const r = await h.call(path, { method: 'POST', data, session, ...options });
            assert.equal(r.status, 403); assert.ok(['ORIGIN_REJECTED', 'CSRF_REJECTED'].includes(r.body.error));
        }
    }
    assert.equal((await h.list(session)).total, 1);
});

test('templates HTTP / list pagination is explicit and query values are strict', async t => {
    const h = await fixture(t), session = await h.login();
    for (const name of ['First reusable example', 'Second reusable example', 'Third reusable example']) await h.create(h.input({ name }), session);
    const first = await h.list(session, '?offset=0&limit=2&includeArchived=false');
    const last = await h.list(session, '?offset=2&limit=2&includeArchived=false');
    assert.equal(first.total, 3); assert.equal(first.items.length, 2); assert.equal(first.hasMore, true);
    assert.equal(last.total, 3); assert.equal(last.items.length, 1); assert.equal(last.hasMore, false);
    assert.equal(first.offset, 0); assert.equal(first.limit, 2);
    for (const suffix of ['?offset=-1', '?offset=1.5', '?offset=', '?limit=0', '?limit=51', '?limit=1.5',
        '?limit=2&limit=3', '?includeArchived=yes', '?includeArchived=', '?includeArchived=true&includeArchived=false', '?token=unexpected']) {
        const r = await h.call(ROOT + suffix, { session }); assert.equal(r.status, 400, suffix);
    }
});

test('templates HTTP / details and export reject ambiguous or unrelated version selectors', async t => {
    const h = await fixture(t), session = await h.login(), a = await h.create(undefined, session), b = await h.create(h.input({ name: 'Another family' }), session);
    for (const tail of ['', '/export']) {
        const path = ROOT + '/' + a.family.id + tail;
        for (const suffix of ['?version=', '?version=bad', '?version=' + a.version.id + '&version=' + a.version.id, '?unexpected=1'])
            assert.equal((await h.call(path + suffix, { session })).status, 400, suffix);
        assert.equal((await h.call(path + '?version=' + b.version.id, { session })).status, 404);
        assert.equal((await h.call(path + '?version=' + randomUUID(), { session })).status, 404);
    }
    assert.equal((await h.call(ROOT + '/' + randomUUID(), { session })).status, 404);
});

test('templates HTTP / create replay is stable and altered replay cannot create a second record', async t => {
    const h = await fixture(t), session = await h.login(), input = h.input(), saved = await h.create(input, session);
    const replay = await h.call(ROOT, { method: 'POST', data: input, session });
    assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.family.id, saved.family.id); assert.equal(replay.body.version.digest, saved.version.digest);
    const conflict = await h.call(ROOT, { method: 'POST', data: { ...input, name: 'Changed retry payload' }, session });
    assert.equal(conflict.status, 409); assert.equal((await h.list(session)).total, 1);
});

test('templates HTTP / request receipts are bound to the authenticated actor rather than a client-supplied identity', async t => {
    const h = await fixture(t), policySession = await h.login(), otherSession = await h.login(otherAuthority), input = h.input();
    const original = await h.create(input, policySession);
    const another = await h.create(input, otherSession);
    assert.notEqual(another.family.id, original.family.id);
    assert.equal(original.version.snapshot.createdBy, authority.email);
    assert.equal(another.version.snapshot.createdBy, otherAuthority.email);
    const reuse = await h.useInput(original);
    assert.equal((await h.call(h.planPath, { method: 'POST', data: reuse, session: policySession })).status, 201);
    const foreignReplay = await h.call(h.planPath, { method: 'POST', data: reuse, session: otherSession });
    assert.equal(foreignReplay.status, 409); assert.notEqual(foreignReplay.body.replayed, true);
    const forged = await h.call(ROOT, { method: 'POST', data: h.input({ createdBy: authority.email }), session: otherSession });
    assert.equal(forged.status, 400);
    assert.equal((await h.planContext(policySession)).plan.approvedBy, authority.email);
});

test('templates HTTP / one actor cannot reuse a request key across template management and plan approval', async t => {
    const h = await fixture(t), session = await h.login(), createInput = h.input(), saved = await h.create(createInput, session);
    const planInput = await h.useInput(saved);
    const reusedCreateKey = { ...planInput, templateUse: { ...planInput.templateUse, requestKey: createInput.requestKey } };
    const firstConflict = await h.call(h.planPath, { method: 'POST', data: reusedCreateKey, session });
    assert.equal(firstConflict.status, 409); assert.equal(firstConflict.body.error, 'TEMPLATE_REQUEST_CONFLICT');
    assert.equal((await h.planContext(session)).plan, null);
    const approved = await h.call(h.planPath, { method: 'POST', data: planInput, session }); assert.equal(approved.status, 201);
    const secondConflict = await h.call(ROOT, { method: 'POST',
        data: h.input({ requestKey: planInput.templateUse.requestKey, name: 'A different action under an already used key' }), session });
    assert.equal(secondConflict.status, 409); assert.equal(secondConflict.body.error, 'TEMPLATE_REQUEST_CONFLICT');
    assert.equal((await h.list(session)).total, 1); assert.equal((await h.planContext(session)).plan.id, approved.body.id);
});

test('templates HTTP / saving and reading preparation records do not alter assurance or obligation records', async t => {
    const h = await fixture(t), session = await h.login();
    const snapshot = () => h.sql(async c => {
        const data = {};
        for (const table of ['obligations', 'obligation_workflow', 'obligation_history', 'assurance_plans', 'assurance_runs', 'assurance_evidence'])
            data[table] = (await c.query('SELECT * FROM ' + table)).rows.map(row => JSON.stringify(row)).sort();
        return data;
    });
    const before = await snapshot(), saved = await h.create(undefined, session);
    await h.list(session); h.assertOk(await h.call(h.detailPath(saved), { session }));
    h.assertOk(await h.call(h.detailPath(saved, saved.version.id, true), { session }));
    assert.deepEqual(await snapshot(), before);
    assert.equal((await h.planContext(session)).plan, null);
});

test('templates HTTP / export contains bounded provenance without execution secrets or an inherited disposition', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    const r = await h.call(h.detailPath(saved, saved.version.id, true), { session });
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-disposition'), /^attachment; filename="qivvera-verification-template-[a-f0-9-]+\.json"$/);
    assert.equal(r.body.version.digest, saved.version.digest);
    assert.deepEqual(r.body.version.snapshot, saved.version.snapshot);
    const text = JSON.stringify(r.body);
    for (const key of ['requesterTokenEnv', 'approverTokenEnv', 'requesterId', 'approverId', 'lease_hash', 'csrfToken', 'passwordHash'])
        assert.equal(text.includes('"' + key + '"'), false, key);
    assert.equal(text.includes(h.sourceTarget.origin), false);
    assert.equal(Object.hasOwn(r.body, 'disposition'), false);
    assert.equal(Object.hasOwn(r.body.version.snapshot, 'evidence'), false);
});

test('templates HTTP / a new version preserves the earlier snapshot and validates optimistic versions', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    const path = ROOT + '/' + saved.family.id + '/versions', input = h.reviseInput(saved, { name: 'Second recorded version' });
    const r = await h.call(path, { method: 'POST', data: input, session });
    assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.version.number, 2);
    assert.equal(r.body.family.id, saved.family.id); assert.equal(r.body.history.length, 2);
    const old = h.assertOk(await h.call(h.detailPath(saved, saved.version.id), { session }));
    assert.deepEqual(old.version, saved.version);
    const replay = await h.call(path, { method: 'POST', data: input, session });
    assert.equal(replay.status, 200); assert.equal(replay.body.version.id, r.body.version.id);
    const stale = await h.call(path, { method: 'POST', data: h.reviseInput(saved, { name: 'Stale revision attempt' }), session });
    assert.equal(stale.status, 409);
});

test('templates HTTP / archived families remain inspectable and are excluded from default new-use listing', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session), input = h.archiveInput(saved);
    const r = await h.call(ROOT + '/' + saved.family.id + '/archive', { method: 'POST', data: input, session });
    assert.equal(r.status, 200); assert.equal(r.body.family.state, 'ARCHIVED');
    assert.equal((await h.list(session)).total, 0);
    assert.equal((await h.list(session, '?includeArchived=true')).total, 1);
    const old = h.assertOk(await h.call(h.detailPath(saved, saved.version.id), { session }));
    assert.equal(old.family.state, 'ARCHIVED'); assert.deepEqual(old.version, saved.version);
    const replay = await h.call(ROOT + '/' + saved.family.id + '/archive', { method: 'POST', data: input, session });
    assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
    const revision = await h.call(ROOT + '/' + saved.family.id + '/versions', { method: 'POST', data: h.reviseInput(old), session });
    assert.equal(revision.status, 409);
});

test('templates HTTP / malformed bodies, unknown fields and oversized payloads fail before persistence', async t => {
    const h = await fixture(t), session = await h.login();
    for (const data of [[], null, {}, h.input({ acknowledgeLimits: false }), h.input({ arbitraryScript: 'return true' }),
        h.input({ name: ' ' }), h.input({ name: 'x'.repeat(121) }), h.input({ rationale: 'short' })]) {
        const r = await h.call(ROOT, { method: 'POST', data, session }); assert.equal(r.status, 400);
    }
    assert.equal((await h.call(ROOT, { method: 'POST', raw: '{', session })).status, 400);
    assert.equal((await h.call(ROOT, { method: 'POST', data: h.input(), contentType: 'text/plain', session })).status, 415);
    assert.equal((await h.call(ROOT, { method: 'POST', data: h.input({ purpose: 'x'.repeat(36000) }), session })).status, 413);
    assert.equal((await h.list(session)).total, 0);
});

test('templates HTTP / valid maximum-length Unicode fields fit the bounded template and plan envelopes', async t => {
    const h = await fixture(t), session = await h.login();
    const input = h.input({ name: '界'.repeat(120), purpose: '意'.repeat(2000), rationale: '理'.repeat(2000) });
    const saved = await h.create(input, session);
    assert.equal(saved.version.snapshot.name, input.name);
    const plan = await h.useInput(saved, { rationale: '理'.repeat(2000) });
    plan.mappings = plan.mappings.map(m => ({ ...m, rationale: '義'.repeat(2000) }));
    assert.ok(Buffer.byteLength(JSON.stringify(plan)) > 16384);
    assert.ok(Buffer.byteLength(JSON.stringify(plan)) < 32768);
    const r = await h.call(h.planPath, { method: 'POST', data: plan, session });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.snapshot.mappings[0].rationale.length, 2000);
    const tooLong = await h.call(ROOT, { method: 'POST', data: h.input({ purpose: '意'.repeat(2001) }), session });
    assert.equal(tooLong.status, 400);
});

test('templates HTTP / mutation query parameters cannot change or qualify a saved request', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    for (const [path, data] of [[ROOT, h.input()], [ROOT + '/' + saved.family.id + '/versions', h.reviseInput(saved)],
        [ROOT + '/' + saved.family.id + '/archive', h.archiveInput(saved)]]) {
        const r = await h.call(path + '?version=' + saved.version.id, { method: 'POST', data, session });
        assert.equal(r.status, 400);
    }
    assert.equal((await h.list(session)).total, 1);
    assert.equal(h.assertOk(await h.call(h.detailPath(saved), { session })).family.state, 'ACTIVE');
    const plan = await h.call(h.planPath + '?version=' + saved.version.id, { method: 'POST', data: await h.useInput(saved), session });
    assert.equal(plan.status, 400); assert.equal(plan.body.error, 'ASSURANCE_PLAN_QUERY_UNSUPPORTED');
    assert.equal((await h.planContext(session)).plan, null);
});

test('templates HTTP / source plan and scope must match the selected source change', async t => {
    const h = await fixture(t), session = await h.login();
    for (const changes of [{ sourcePlanId: randomUUID() }, { sourceChangeId: h.destination.id },
        { sourceRevisionId: h.destination.revision.id }, { sourceScopeDigest: 'sha256:' + 'f'.repeat(64) }]) {
        const r = await h.call(ROOT, { method: 'POST', data: h.input(changes), session });
        assert.ok([404, 409].includes(r.status), JSON.stringify(r.body));
    }
    assert.equal((await h.list(session)).total, 0);
});

test('templates HTTP / a scope change invalidates an open save form without mutating prior records', async t => {
    const h = await fixture(t), session = await h.login(), input = h.input();
    await h.workflow.addObligation(h.source.id, { revisionId: h.source.revision.id,
        statement: 'The audit log must retain the new approval reason.', sourceReference: 'Audit policy', sourceVersion: '2', criticality: 'HIGH' }, author);
    const r = await h.call(ROOT, { method: 'POST', data: input, session });
    assert.equal(r.status, 409); assert.equal((await h.list(session)).total, 0);
});

test('templates HTTP / corrupted source-plan snapshots fail explicitly without a partial template', async t => {
    const h = await fixture(t), session = await h.login();
    await h.sql(c => c.query("UPDATE assurance_plans SET snapshot='{}' WHERE id=$1", [h.sourcePlan.id]));
    const r = await h.call(ROOT, { method: 'POST', data: h.input(), session });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(JSON.stringify(r.body).includes('SELECT '), false);
    assert.equal((await h.list(session)).total, 0);
});

test('templates HTTP / template-backed approval preserves all declared mandatory scope and fresh plan provenance', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    const extra = await h.workflow.addObligation(h.destination.id, { revisionId: h.destination.revision.id,
        statement: 'The application must retain a separately verified audit record.', sourceReference: 'Audit source', sourceVersion: '1', criticality: 'HIGH' }, author);
    const input = await h.useInput(saved), r = await h.call(h.planPath, { method: 'POST', data: input, session });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.snapshot.schema, 'qivvera.assurance-plan/2');
    assert.equal(r.body.snapshot.scope.revisionId, h.destination.revision.id);
    assert.equal(r.body.snapshot.scope.obligations.length, 3);
    assert.equal(r.body.snapshot.scope.obligations.find(o => o.id === extra.id).reviewStatus, 'DRAFT');
    assert.equal(Object.hasOwn(r.body.snapshot, 'templateUse'), false);
    assert.equal(Object.hasOwn(r.body.snapshot, 'disposition'), false);
    const context = await h.planContext(session);
    assert.equal(context.plan.id, r.body.id); assert.equal(context.plan.current, true);
    assert.equal(context.plan.templateUse.templateId, saved.family.id);
    assert.equal(context.plan.templateUse.versionId, saved.version.id);
});

test('templates HTTP / template reuse still requires current Policy Authority and normal plan protections', async t => {
    const h = await fixture(t), saved = await h.create();
    for (const actor of [author, viewer]) {
        const r = await h.call(h.planPath, { method: 'POST', data: await h.useInput(saved), session: await h.login(actor) });
        assert.equal(r.status, 403);
    }
    const session = await h.login();
    for (const override of [{ acknowledgeLimits: false }, { targetId: 'unknown-target' }]) {
        const r = await h.call(h.planPath, { method: 'POST', data: await h.useInput(saved, override), session }); assert.equal(r.status, 400);
    }
    const r = await h.call(h.planPath, { method: 'POST', data: await h.useInput(saved), session, csrf: null }); assert.equal(r.status, 403);
    assert.equal((await h.planContext()).plan, null);
});

test('templates HTTP / template use validates immutable digest, exact check set and mapping applicability', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    const normal = await h.useInput(saved);
    const attempts = [
        { ...normal, templateUse: { ...normal.templateUse, requestKey: randomUUID(), templateDigest: 'sha256:' + 'f'.repeat(64) } },
        { ...normal, templateUse: { ...normal.templateUse, requestKey: randomUUID(), versionId: randomUUID() } },
        { ...normal, templateUse: { ...normal.templateUse, requestKey: randomUUID() }, mappings: normal.mappings.slice(0, 1) },
        { ...normal, templateUse: { ...normal.templateUse, requestKey: randomUUID() }, mappings: normal.mappings.map((m, i) => ({ ...m, obligationId: h.sourceObligations[i].id })) },
    ];
    for (const data of attempts) {
        const r = await h.call(h.planPath, { method: 'POST', data, session });
        assert.ok([400, 404, 409].includes(r.status), JSON.stringify(r.body));
    }
    assert.equal((await h.planContext(session)).plan, null);
});

test('templates HTTP / plan approval replay returns one plan and rejects an altered replay', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session), input = await h.useInput(saved);
    const first = await h.call(h.planPath, { method: 'POST', data: input, session });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await h.call(h.planPath, { method: 'POST', data: input, session });
    assert.equal(second.status, 200); assert.equal(second.body.replayed, true); assert.equal(second.body.id, first.body.id);
    const changed = await h.call(h.planPath, { method: 'POST', data: { ...input, rationale: 'A different decision cannot reuse the earlier request identity.' }, session });
    assert.equal(changed.status, 409);
    const context = await h.planContext(session); assert.equal(context.plan.version, 1);
});

test('templates HTTP / concurrent identical approval requests converge to the same durable plan', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session), input = await h.useInput(saved);
    const replies = await Promise.all([h.call(h.planPath, { method: 'POST', data: input, session }),
        h.call(h.planPath, { method: 'POST', data: input, session })]);
    assert.deepEqual(replies.map(r => r.status).sort(), [200, 201]);
    assert.equal(replies[0].body.id, replies[1].body.id); assert.equal((await h.planContext(session)).plan.version, 1);
});

test('templates HTTP / superseded and archived versions cannot establish new plan approval', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session), staleUse = await h.useInput(saved);
    const v2 = await h.call(ROOT + '/' + saved.family.id + '/versions', { method: 'POST', data: h.reviseInput(saved), session });
    assert.equal(v2.status, 201);
    assert.equal((await h.call(h.planPath, { method: 'POST', data: staleUse, session })).status, 409);
    const latestUse = await h.useInput(v2.body);
    assert.equal((await h.call(ROOT + '/' + saved.family.id + '/archive', { method: 'POST', data: h.archiveInput(v2.body), session })).status, 200);
    assert.equal((await h.call(h.planPath, { method: 'POST', data: latestUse, session })).status, 409);
    assert.equal((await h.planContext(session)).plan, null);
});

test('templates HTTP / archiving a used template preserves the existing approved plan and its provenance', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session), input = await h.useInput(saved);
    const approved = await h.call(h.planPath, { method: 'POST', data: input, session }); assert.equal(approved.status, 201);
    const before = await h.planContext(session);
    const archived = await h.call(ROOT + '/' + saved.family.id + '/archive', { method: 'POST', data: h.archiveInput(saved), session }); assert.equal(archived.status, 200);
    const after = await h.planContext(session);
    assert.equal(after.plan.id, before.plan.id); assert.equal(after.plan.current, true);
    assert.deepEqual(after.plan.snapshot, before.plan.snapshot);
    assert.equal(after.plan.templateUse.versionId, saved.version.id);
});

test('templates HTTP / a changed destination revision rejects a previously prepared approval', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session), input = await h.useInput(saved);
    await h.workflow.createRevision(h.destination.id, { expectedRevisionId: h.destination.revision.id,
        sourceRevision: 'c'.repeat(40), intent: 'New declared implementation', reason: 'A real concurrent revision invalidates the open plan form.', copyObligations: false }, author);
    const r = await h.call(h.planPath, { method: 'POST', data: input, session });
    assert.equal(r.status, 409); assert.equal(r.body.error, 'REVISION_CONFLICT');
    assert.equal((await h.planContext(session)).plan, null);
});

test('templates HTTP / unsupported mutation methods cannot edit or delete recorded versions', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const r = await h.call(h.detailPath(saved), { method, data: {}, session }); assert.equal(r.status, 404);
    }
    const after = h.assertOk(await h.call(h.detailPath(saved), { session }));
    const { replayed, ...savedRecord } = saved; void replayed;
    assert.deepEqual(after, savedRecord);
});

test('templates HTTP / a fresh repository reads the same saved version after a new connection', async t => {
    const h = await fixture(t), saved = await h.create();
    const reopened = await openAssuranceRepository({ ...h.options, migrate: false });
    try {
        const read = await reopened.templates.get(saved.family.id, { versionId: saved.version.id });
        assert.deepEqual(read.version, saved.version); assert.equal(read.family.id, saved.family.id);
    } finally { await reopened.close(); }
});

test('templates HTTP / disabled feature exposes no template API and cannot accept template-backed approvals', async t => {
    const h = await fixture(t, { enabled: false }), session = await h.login();
    assert.equal((await h.call(ROOT, { session })).status, 404);
    assert.equal((await h.call(ROOT, { method: 'POST', data: h.input(), session })).status, 404);
    const workspace = await h.call('/api/workspace', { session });
    assert.equal(workspace.body.capabilities.verificationTemplates, false);
    const fake = { family: { id: randomUUID() }, version: { id: randomUUID(), digest: 'sha256:' + 'f'.repeat(64),
        snapshot: { entries: h.destinationMappings.map(m => ({ check: { id: m.checkId } })) } } };
    const r = await h.call(h.planPath, { method: 'POST', data: await h.useInput(fake), session });
    assert.ok([400, 409].includes(r.status)); assert.equal((await h.planContext(session)).plan, null);
});

test('templates HTTP / revoked sessions lose both business-record and mutation access', async t => {
    const h = await fixture(t), session = await h.login(), saved = await h.create(undefined, session);
    assert.equal((await h.call('/api/session', { method: 'DELETE', data: {}, session })).status, 200);
    assert.equal((await h.call(h.detailPath(saved), { session })).status, 401);
    assert.equal((await h.call(ROOT, { method: 'POST', data: h.input(), session })).status, 401);
    const viewerSession = await h.login(viewer);
    assert.equal((await h.call(h.detailPath(saved), { session: viewerSession })).status, 200);
});
