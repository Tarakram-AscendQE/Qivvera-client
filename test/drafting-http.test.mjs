/** Increment 7 HTTP contracts over the real application and disposable SQLite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';

const author = { email: 'draft-author@example.test', roles: ['AUTHOR'] };
const other = { email: 'draft-other@example.test', roles: ['AUTHOR'] };
const dual = { email: 'draft-contributor@example.test', roles: ['AUTHOR', 'POLICY_AUTHORITY'] };
const policy = { email: 'draft-policy@example.test', roles: ['POLICY_AUTHORITY'] };
const viewer = { email: 'draft-viewer@example.test', roles: ['VIEWER'] };
const sourceText = 'The requester must not approve their own request.\nThe application must preserve the original request identity.';

async function fixture(t, { enabled = true, draftingConfig = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'qivvera-drafting-http-'));
    const repository = await openWorkflowRepository({
        path: join(dir, 'workspace.sqlite'), migrate: true, reviewMode: 'independent',
        drafting: { enabled, openaiEnabled: false, ...draftingConfig },
    });
    const application = await repository.createApplication({ name: 'Drafting HTTP ' + randomUUID() }, author);
    const change = await repository.createChange({
        applicationId: application.id, title: 'Source-grounded approval change', sourceRevision: 'a'.repeat(40),
    }, author);
    const password = randomUUID() + randomUUID(), passwordHash = hashPassword(password);
    const origin = 'http://127.0.0.1:3016';
    const server = createApplicationServer({
        repository, publicOrigin: origin,
        accounts: [author, other, dual, policy, viewer].map(actor => ({ ...actor, passwordHash })),
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        await repository.close();
        rmSync(dir, { recursive: true, force: true });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(path, { method = 'GET', data, session, from = origin, csrf } = {}) {
        const response = await fetch(base + path, {
            method,
            headers: {
                ...(method !== 'GET' ? { Origin: from, 'Content-Type': 'application/json' } : {}),
                ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': csrf ?? session.csrfToken } : {}),
            },
            ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
        });
        const text = await response.text();
        return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
    }
    async function login(actor = author) {
        const result = await call('/api/session', { method: 'POST', data: { email: actor.email, password } });
        assert.equal(result.status, 200);
        return { cookie: result.headers.get('set-cookie').split(';')[0], csrfToken: result.body.csrfToken };
    }
    const contextPath = `/api/changes/${change.id}/drafting?revision=${change.revision.id}`;
    const generationPath = `/api/changes/${change.id}/drafting-runs`;
    const input = (extra = {}) => ({
        requestId: randomUUID(), revisionId: change.revision.id,
        sourceReference: 'Synthetic approval policy', sourceVersion: '2026.1', sourceText,
        method: 'rules', externalProcessingConfirmed: false, ...extra,
    });
    async function generate(session, extra = {}) {
        const result = await call(generationPath, { method: 'POST', session, data: input(extra) });
        assert.equal(result.status, 201, JSON.stringify(result.body));
        assert.equal(result.body.status, 'COMPLETED', JSON.stringify(result.body));
        return result.body;
    }
    const actionPath = (run, suggestion = run.suggestions[0]) => `/api/drafting-runs/${run.id}/suggestions/${suggestion.id}/actions`;
    const createInput = (suggestion, extra = {}) => ({
        action: 'CREATE_CANDIDATE', version: suggestion.version, statement: suggestion.statement,
        criticality: 'HIGH', rationale: 'I checked the quoted source and this draft belongs to the change.', ...extra,
    });
    return { repository, application, change, call, login, contextPath, generationPath, input, generate, actionPath, createInput, password };
}

test('drafting HTTP / every source, run, export and mutation route requires a real session', async t => {
    const h = await fixture(t), id = randomUUID();
    for (const path of [h.contextPath, `/api/drafting-runs/${id}`, `/api/drafting-runs/${id}/export`])
        assert.equal((await h.call(path)).status, 401);
    for (const path of [h.generationPath, `/api/drafting-runs/${id}/suggestions/${randomUUID()}/actions`])
        assert.equal((await h.call(path, { method: 'POST', data: {} })).status, 401);
});

test('drafting HTTP / exact origin and CSRF protect generation before a run is saved', async t => {
    const h = await fixture(t), session = await h.login();
    for (const extra of [{ from: 'https://untrusted.invalid' }, { csrf: 'incorrect' }])
        assert.equal((await h.call(h.generationPath, { method: 'POST', data: h.input(), session, ...extra })).status, 403);
    assert.deepEqual((await h.call(h.contextPath, { session })).body.runs, []);
});

test('drafting HTTP / rules generation preserves normalized source and creates no obligation or evidence', async t => {
    const h = await fixture(t), session = await h.login();
    const run = await h.generate(session, { sourceText: sourceText.replaceAll('\n', '\r\n') });
    assert.equal(run.source.text, sourceText);
    assert.equal(run.source.reference, 'Synthetic approval policy');
    assert.equal(run.source.version, '2026.1');
    assert.equal(run.createdBy, author.email);
    assert.equal(run.revisionId, h.change.revision.id);
    assert.equal(run.applicability, 'CURRENT');
    assert.equal(run.suggestions.length, 2);
    for (const suggestion of run.suggestions) {
        assert.equal(suggestion.status, 'PROPOSED');
        assert.equal(suggestion.decision, null);
        assert.equal(suggestion.quote, sourceText.split('\n').slice(suggestion.startLine - 1, suggestion.endLine).join('\n').trim());
    }
    const change = await h.repository.getChange(h.change.id);
    assert.equal(change.obligations.length, 0);
    assert.equal(change.disposition, null);
    assert.equal(change.assessmentStatus, 'NOT_ASSESSED');
});

test('drafting HTTP / workspace readers inspect provenance but only an Author generates', async t => {
    const h = await fixture(t), run = await h.generate(await h.login());
    for (const actor of [policy, viewer]) {
        const session = await h.login(actor);
        assert.equal((await h.call(h.contextPath, { session })).status, 200);
        assert.equal((await h.call(`/api/drafting-runs/${run.id}`, { session })).status, 200);
        assert.equal((await h.call(`/api/drafting-runs/${run.id}/export`, { session })).status, 200);
        assert.equal((await h.call(h.generationPath, { method: 'POST', session, data: h.input() })).status, 403);
        assert.equal((await h.call(h.actionPath(run), { method: 'POST', session, data: h.createInput(run.suggestions[0]) })).status, 403);
    }
});

test('drafting HTTP / another Author can inspect but cannot act on someone else’s run', async t => {
    const h = await fixture(t), run = await h.generate(await h.login()), session = await h.login(other);
    assert.equal((await h.call(`/api/drafting-runs/${run.id}`, { session })).status, 200);
    assert.equal((await h.call(h.actionPath(run), { method: 'POST', session, data: h.createInput(run.suggestions[0]) })).status, 403);
    assert.equal((await h.repository.getChange(h.change.id)).obligations.length, 0);
});

test('drafting HTTP / identical generation replays and altered reuse conflicts', async t => {
    const h = await fixture(t), session = await h.login(), data = h.input();
    const first = await h.call(h.generationPath, { method: 'POST', session, data });
    assert.equal(first.status, 201);
    const replay = await h.call(h.generationPath, { method: 'POST', session, data });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.id, first.body.id);
    assert.equal(replay.body.replayed, true);
    const changed = await h.call(h.generationPath, { method: 'POST', session, data: { ...data, sourceVersion: '2026.2' } });
    assert.equal(changed.status, 409);
    assert.equal((await h.call(h.contextPath, { session })).body.runs.length, 1);
});

test('drafting HTTP / candidate creation and replay preserve one unassessed obligation', async t => {
    const h = await fixture(t), session = await h.login(), run = await h.generate(session);
    const data = h.createInput(run.suggestions[0]), path = h.actionPath(run);
    const first = await h.call(path, { method: 'POST', session, data });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const created = first.body.suggestions.find(s => s.id === run.suggestions[0].id);
    assert.equal(created.status, 'CANDIDATE_CREATED');
    assert.equal(created.decision.actor, author.email);
    const replay = await h.call(path, { method: 'POST', session, data });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    const change = await h.repository.getChange(h.change.id), obligation = change.obligations[0];
    assert.equal(change.obligations.length, 1);
    assert.equal(obligation.id, created.decision.obligationId);
    assert.equal(obligation.reviewStatus, 'DRAFT');
    assert.equal(obligation.authority, 'CANDIDATE');
    assert.equal(obligation.state, 'NOT_ASSESSED');
    assert.equal(obligation.evidenceCount, 0);
    assert.equal(obligation.proposedBy, author.email);
    assert.equal(obligation.sourceReference, run.source.reference);
    assert.equal(obligation.sourceVersion, run.source.version);
    assert.equal(change.disposition, null);
    assert.equal((await h.call(path, { method: 'POST', session, data: { ...data, rationale: 'Different choices must not replace the original decision.' } })).status, 409);
});

test('drafting HTTP / contribution still requires a different Policy Authority after conversion', async t => {
    const h = await fixture(t), session = await h.login(dual), run = await h.generate(session);
    const created = await h.call(h.actionPath(run), { method: 'POST', session, data: h.createInput(run.suggestions[0]) });
    assert.equal(created.status, 200);
    const id = created.body.suggestions[0].decision.obligationId, path = `/api/obligations/${id}/review`;
    const submit = await h.call(path, { method: 'POST', session, data: { action: 'SUBMIT', version: 1, revisionId: h.change.revision.id } });
    assert.equal(submit.status, 200);
    const decision = { action: 'ACCEPT', version: submit.body.version, revisionId: h.change.revision.id, rationale: 'This quoted rule applies to the synthetic approval workflow.' };
    assert.equal((await h.call(path, { method: 'POST', session, data: decision })).status, 403);
    const accepted = await h.call(path, { method: 'POST', session: await h.login(policy), data: decision });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.reviewStatus, 'ACCEPTED');
    assert.equal(accepted.body.state, 'NOT_ASSESSED');
    assert.equal(accepted.body.evidenceCount, 0);
    const preserved = await h.call(`/api/drafting-runs/${run.id}`, { session });
    assert.equal(preserved.body.suggestions[0].statement, run.suggestions[0].statement);
    assert.equal(preserved.body.suggestions[0].decision.actor, dual.email);
});

test('drafting HTTP / dismissal records a reason and creates no declared obligation', async t => {
    const h = await fixture(t), session = await h.login(), run = await h.generate(session);
    const result = await h.call(h.actionPath(run), { method: 'POST', session, data: {
        action: 'DISMISS', version: run.suggestions[0].version,
        rationale: 'This source clause is outside the declared change; a human will review the remaining scope.',
    } });
    assert.equal(result.status, 200);
    assert.equal(result.body.suggestions[0].status, 'DISMISSED');
    assert.equal(result.body.suggestions[0].decision.actor, author.email);
    assert.equal((await h.repository.getChange(h.change.id)).obligations.length, 0);
});

test('drafting HTTP / unknown authority fields and missing decisions are rejected without mutation', async t => {
    const h = await fixture(t), session = await h.login(), run = await h.generate(session);
    for (const data of [
        h.createInput(run.suggestions[0], { disposition: 'READY' }),
        h.createInput(run.suggestions[0], { authority: 'AUTHORITATIVE' }),
        h.createInput(run.suggestions[0], { actor: policy.email }),
        h.createInput(run.suggestions[0], { criticality: '' }),
        h.createInput(run.suggestions[0], { rationale: 'short' }),
    ]) assert.equal((await h.call(h.actionPath(run), { method: 'POST', session, data })).status, 400);
    assert.equal((await h.call(h.generationPath, { method: 'POST', session, data: h.input({ reviewStatus: 'ACCEPTED' }) })).status, 400);
    assert.equal((await h.repository.getChange(h.change.id)).obligations.length, 0);
});

test('drafting HTTP / a newly advanced revision blocks acting on a previously displayed suggestion', async t => {
    const h = await fixture(t), session = await h.login(), run = await h.generate(session);
    await h.repository.createRevision(h.change.id, {
        expectedRevisionId: h.change.revision.id, sourceRevision: 'b'.repeat(40),
        intent: 'Changed source after the draft was prepared.', reason: 'A later implementation revision requires its own review.', copyObligations: false,
    }, author);
    assert.equal((await h.call(h.actionPath(run), { method: 'POST', session, data: h.createInput(run.suggestions[0]) })).status, 409);
    assert.equal((await h.call(h.generationPath, { method: 'POST', session, data: h.input() })).status, 409);
    const saved = await h.call(`/api/drafting-runs/${run.id}`, { session });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.applicability, 'HISTORICAL');
    assert.equal(saved.body.suggestions[0].status, 'PROPOSED');
    assert.equal((await h.repository.getChange(h.change.id)).obligations.length, 0);
});

test('drafting HTTP / duplicate already-declared statement cannot create a second candidate', async t => {
    const h = await fixture(t), session = await h.login(), run = await h.generate(session);
    await h.repository.addObligation(h.change.id, {
        revisionId: h.change.revision.id, statement: run.suggestions[0].statement,
        sourceReference: 'Previously reviewed source', sourceVersion: '1', criticality: 'MEDIUM',
    }, author);
    const result = await h.call(h.actionPath(run), { method: 'POST', session, data: h.createInput(run.suggestions[0]) });
    assert.equal(result.status, 409);
    assert.equal((await h.repository.getChange(h.change.id)).obligations.length, 1);
});

test('drafting HTTP / source limits reject invalid input without producing successful runs', async t => {
    const h = await fixture(t), session = await h.login();
    for (const extra of [
        { sourceText: '' }, { sourceText: 'a'.repeat(6001) }, { sourceText: '\ud800' },
        { sourceText: 'a\n'.repeat(201) }, { sourceText: 'The request must reject\u0000bad input.' },
        { sourceReference: '' }, { sourceVersion: '' },
    ]) assert.equal((await h.call(h.generationPath, { method: 'POST', session, data: h.input(extra) })).status, 400);
    assert.equal((await h.call(h.contextPath, { session })).body.runs.length, 0);
});

test('drafting HTTP / unconfigured AI generation cannot silently fall back to rules', async t => {
    const h = await fixture(t), session = await h.login();
    const result = await h.call(h.generationPath, { method: 'POST', session, data: h.input({ method: 'openai', externalProcessingConfirmed: true }) });
    assert.ok([400, 409, 503].includes(result.status), JSON.stringify(result));
    assert.equal((await h.repository.getChange(h.change.id)).obligations.length, 0);
    assert.equal((await h.call(h.contextPath, { session })).body.methods.openai, false);
});

test('drafting HTTP / logout revokes source and export access', async t => {
    const h = await fixture(t), session = await h.login(), run = await h.generate(session);
    assert.equal((await h.call('/api/session', { method: 'DELETE', session })).status, 200);
    for (const path of [h.contextPath, `/api/drafting-runs/${run.id}`, `/api/drafting-runs/${run.id}/export`])
        assert.equal((await h.call(path, { session })).status, 401);
});

test('drafting HTTP / disabled service grants no generation or inspection route', async t => {
    const h = await fixture(t, { enabled: false }), session = await h.login();
    assert.equal((await h.call(h.contextPath, { session })).status, 404);
    assert.equal((await h.call(h.generationPath, { method: 'POST', session, data: h.input() })).status, 404);
    const workspace = await h.call('/api/workspace', { session });
    assert.equal(workspace.body.capabilities.obligationDrafting, false);
});

test('drafting HTTP / support reports configured drafting without probing AI or exposing source and secrets', async t => {
    for (const openaiEnabled of [false, true]) {
        let providerCalls = 0;
        const secret = 'protected-test-key-' + randomUUID(), model = 'qe-private-model';
        const h = await fixture(t, { draftingConfig: {
            openaiEnabled, apiKey: secret, model,
            fetchFn: async () => { providerCalls++; throw new Error('Support must never invoke a provider.'); },
        } });
        const session = await h.login(), reference = 'Private source ' + randomUUID();
        await h.generate(session, { sourceReference: reference });
        const before = (await h.call('/api/workspace', { session })).body;
        const response = await h.call('/api/support-info', { session });
        assert.equal(response.status, 200);
        const support = response.body;
        assert.equal(support.workspace.schemaVersion, 6);
        assert.equal(support.workspace.requiredSchemaVersion, 6);
        assert.equal(support.capabilities.obligationDrafting, true);
        assert.equal(support.capabilities.aiDrafting, openaiEnabled);
        assert.equal(support.actions.draftObligations, true);
        assert.equal(support.limitations.aiProviderConnection, 'not-probed');
        assert.equal(providerCalls, 0);
        const serialized = JSON.stringify(support);
        for (const forbidden of [secret, model, reference, sourceText, h.password, session.cookie, session.csrfToken, author.email])
            assert.equal(serialized.includes(forbidden), false);
        assert.deepEqual((await h.call('/api/workspace', { session })).body, before);
        const viewerSupport = await h.call('/api/support-info', { session: await h.login(viewer) });
        assert.equal(viewerSupport.body.actions.draftObligations, false);
        assert.equal(viewerSupport.body.capabilities.aiDrafting, openaiEnabled);
        assert.equal(providerCalls, 0);
    }
});

test('drafting HTTP / a valid escaped multi-byte source fits the generation envelope', async t => {
    const h = await fixture(t), session = await h.login();
    const data = h.input({ sourceText: '"'.repeat(3000) + '€'.repeat(3000), sourceReference: '€'.repeat(500), sourceVersion: '€'.repeat(120) });
    assert.equal(data.sourceText.length, 6000);
    assert.equal(Buffer.byteLength(data.sourceText, 'utf8'), 12000);
    assert.ok(Buffer.byteLength(JSON.stringify(data), 'utf8') > 16384);
    const result = await h.call(h.generationPath, { method: 'POST', session, data });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.status, 'COMPLETED');
    assert.equal(result.body.source.text, data.sourceText);
    assert.deepEqual(result.body.suggestions, []);
});

test('drafting HTTP / generation envelope is bounded and unrelated mutations retain their smaller limit', async t => {
    const h = await fixture(t), session = await h.login();
    const tooLarge = await h.call(h.generationPath, { method: 'POST', session, data: h.input({ sourceText: 'a'.repeat(33000) }) });
    assert.equal(tooLarge.status, 413);
    const unchangedLimit = await h.call('/api/applications', { method: 'POST', session, data: { name: 'Large body', description: 'a'.repeat(17000) } });
    assert.equal(unchangedLimit.status, 413);
    assert.equal((await h.call(h.contextPath, { session })).body.total, 0);
});
