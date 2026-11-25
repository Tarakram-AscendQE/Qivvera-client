import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setupDrafting, draftingAssuranceJourney, author, otherAuthor, authority, viewer, dualRole, modelResult, SOURCE } from './drafting-helpers.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openDatabase } from '../backend/server/workflow-store.mjs';
import { generateDrafts } from '../backend/server/drafting/generator.mjs';
import { digest } from '../backend/server/assurance/contracts.mjs';
import { InputError } from '../backend/server/errors.mjs';
import { failActivityInsert } from './postgres-test-database.mjs';

const code = expected => error => error.code === expected;
async function inspect(h, fn) { const db = await openDatabase(h.db); try { return await fn(db); } finally { await db.close(); } }
async function revise(h) { return h.workflow.createRevision(h.change.id, { expectedRevisionId: h.change.revision.id,
    sourceRevision: 'b'.repeat(40), intent: 'Next source revision requires its own candidate scope.', reason: 'The source implementation changed.', copyObligations: false }, author); }

test('drafting preserves normalized source and prepares suggestions without declaring obligations', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input({ sourceText: SOURCE.replaceAll('\n', '\r\n') }), author);
    assert.equal(run.status, 'COMPLETED'); assert.equal(run.source.text, SOURCE); assert.equal(run.source.digest, digest(SOURCE));
    assert.equal(run.sourceRevision, 'a'.repeat(40)); assert.equal(run.applicability, 'CURRENT');
    assert.equal(run.suggestions.length, 2); assert.ok(run.suggestions.every(s => s.status === 'PROPOSED' && s.version === 1 && s.decision === null));
    const change = await h.workflow.getChange(h.change.id);
    assert.equal(change.obligations.length, 0); assert.equal(change.disposition, null);
    const counts = await inspect(h, db => db.transaction(async c => (await c.query('SELECT COUNT(*) AS n FROM assurance_evidence')).rows[0], true));
    assert.equal(Number(counts.n), 0);
});

test('drafting author adoption preserves original quote and edited wording as an unaccepted candidate', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), suggestion = run.suggestions[0];
    const statement = 'A requester must not approve the request that they created.';
    const saved = await h.drafting.act(run.id, suggestion.id, h.createDecision(suggestion, { statement, criticality: 'CRITICAL' }), author);
    const decided = saved.suggestions[0];
    assert.equal(decided.statement, suggestion.statement); assert.equal(decided.quote, suggestion.quote);
    assert.equal(decided.status, 'CANDIDATE_CREATED'); assert.equal(decided.version, 2);
    assert.equal(decided.decision.statement, statement); assert.equal(decided.decision.actor, author.email);
    const obligation = (await h.workflow.getChange(h.change.id)).obligations[0];
    assert.equal(obligation.id, decided.decision.obligationId); assert.equal(obligation.statement, statement);
    assert.equal(obligation.sourceReference, run.source.reference); assert.equal(obligation.sourceVersion, run.source.version);
    assert.equal(obligation.authority, 'CANDIDATE'); assert.equal(obligation.reviewStatus, 'DRAFT');
    assert.equal(obligation.state, 'NOT_ASSESSED'); assert.equal(obligation.evidenceCount, 0); assert.equal(obligation.proposedBy, author.email);
});

test('drafting adoption still requires a different eligible authority and retains provenance after later edits', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
    const adopted = await h.drafting.act(run.id, s.id, h.createDecision(s), author), id = adopted.suggestions[0].decision.obligationId;
    let o = (await h.workflow.getChange(h.change.id)).obligations[0];
    o = await h.workflow.transitionObligation(id, { revisionId: o.revisionId, version: o.version, action: 'SUBMIT', rationale: '' }, author);
    const decision = { revisionId: o.revisionId, version: o.version, action: 'ACCEPT', rationale: 'The reviewed source requirement applies to this change.' };
    await assert.rejects(h.workflow.transitionObligation(id, decision, dualRole), code('INDEPENDENT_REVIEW_REQUIRED'));
    o = await h.workflow.transitionObligation(id, decision, authority); assert.equal(o.authority, 'AUTHORITATIVE');
    await h.workflow.editObligation(id, { revisionId: o.revisionId, version: o.version, statement: 'A different edited requirement needs fresh review.', sourceReference: 'Updated policy', sourceVersion: '2', criticality: 'MEDIUM' }, author);
    const preserved = await h.drafting.get(run.id);
    assert.equal(preserved.suggestions[0].decision.statement, s.statement); assert.equal(preserved.suggestions[0].quote, s.quote);
    assert.equal((await h.workflow.getChange(h.change.id)).obligations[0].reviewStatus, 'DRAFT');
});

test('drafting dismissal records a reason and creates neither an obligation nor authority rejection', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author);
    const saved = await h.drafting.act(run.id, run.suggestions[0].id, h.dismissDecision(), author);
    assert.equal(saved.suggestions[0].status, 'DISMISSED'); assert.equal(saved.suggestions[0].decision.action, 'DISMISS');
    assert.ok(!('obligationId' in saved.suggestions[0].decision)); assert.equal((await h.workflow.getChange(h.change.id)).obligations.length, 0);
});

test('drafting identical generation replay is durable and never re-executes after the change advances', async t => {
    let calls = 0;
    const h = await setupDrafting(t, { drafting: { generateDrafts: async (...args) => { calls++; return generateDrafts(...args); } } });
    const input = h.input(), one = await h.drafting.generate(h.change.id, input, author);
    await revise(h);
    const two = await h.drafting.generate(h.change.id, input, author);
    assert.equal(two.id, one.id); assert.equal(two.replayed, true); assert.equal(two.applicability, 'HISTORICAL'); assert.equal(calls, 1);
    await assert.rejects(h.drafting.generate(h.change.id, { ...input, sourceVersion: 'changed' }, author), code('DRAFTING_REQUEST_CONFLICT'));
    assert.equal(calls, 1);
});

for (const role of [viewer, authority]) test(`drafting ${role.roles[0]} cannot generate or decide`, async t => {
    const h = await setupDrafting(t), input = h.input();
    await assert.rejects(h.drafting.generate(h.change.id, input, role), code('FORBIDDEN'));
    const run = await h.drafting.generate(h.change.id, input, author);
    await assert.rejects(h.drafting.act(run.id, run.suggestions[0].id, h.dismissDecision(), role), code('FORBIDDEN'));
    assert.equal((await h.drafting.get(run.id)).suggestions[0].status, 'PROPOSED');
});

test('drafting decisions are bound to the requesting author even for another Author account', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author);
    await assert.rejects(h.drafting.act(run.id, run.suggestions[0].id, h.createDecision(run.suggestions[0]), otherAuthor), code('DRAFTING_ACTOR_MISMATCH'));
    assert.equal((await h.workflow.getChange(h.change.id)).obligations.length, 0);
});

test('drafting historical revisions reject new generation and undecided adoption without losing old source', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author);
    await revise(h);
    await assert.rejects(h.drafting.generate(h.change.id, h.input(), author), code('REVISION_CONFLICT'));
    await assert.rejects(h.drafting.act(run.id, run.suggestions[0].id, h.createDecision(run.suggestions[0]), author), code('REVISION_CONFLICT'));
    const historical = await h.drafting.getContext(h.change.id, h.change.revision.id);
    assert.equal(historical.isCurrentRevision, false); assert.equal(historical.total, 1); assert.equal(historical.runs[0].applicability, 'HISTORICAL');
});

test('drafting identical decision replay succeeds after revision advancement while changed choices conflict', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0], input = h.createDecision(s);
    const one = await h.drafting.act(run.id, s.id, input, author); await revise(h);
    const two = await h.drafting.act(run.id, s.id, input, author);
    assert.equal(two.replayed, true); assert.equal(two.suggestions[0].decision.obligationId, one.suggestions[0].decision.obligationId);
    await assert.rejects(h.drafting.act(run.id, s.id, { ...input, rationale: 'A different reason changes the request.' }, author), code('DRAFTING_DECISION_CONFLICT'));
});

test('drafting stale suggestion version conflicts and spoofed authority fields are rejected', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
    await assert.rejects(h.drafting.act(run.id, s.id, h.createDecision(s, { version: 2 }), author), code('VERSION_CONFLICT'));
    await assert.rejects(h.drafting.act(run.id, s.id, h.createDecision(s, { authority: 'AUTHORITATIVE' }), author), code('UNKNOWN_FIELD'));
    await assert.rejects(h.drafting.act(run.id, s.id, h.createDecision(s, { criticality: undefined }), author), code('DRAFTING_CRITICALITY_REQUIRED'));
    assert.equal((await h.workflow.getChange(h.change.id)).obligations.length, 0);
});

test('drafting detects an already declared exact statement without merging or changing it', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
    const existing = await h.workflow.addObligation(h.change.id, { revisionId: h.change.revision.id, statement: s.statement, sourceReference: 'Existing policy', sourceVersion: '1', criticality: 'LOW' }, author);
    await assert.rejects(h.drafting.act(run.id, s.id, h.createDecision(s), author), code('DRAFTING_DUPLICATE_OBLIGATION'));
    const change = await h.workflow.getChange(h.change.id); assert.equal(change.obligations.length, 1); assert.equal(change.obligations[0].id, existing.id);
    assert.equal(change.obligations[0].criticality, 'LOW'); assert.equal((await h.drafting.get(run.id)).suggestions[0].status, 'PROPOSED');
});

test('drafting retains distinct case, spacing and Unicode literals as separate candidates', async t => {
    const h = await setupDrafting(t), sourceText = [
        'The password must equal Secret.', 'The password must equal secret.',
        'The literal must equal é.', 'The literal must equal e\u0301.',
        'The text must equal "a  b".', 'The text must equal "a b".',
    ].join('\n');
    const run = await h.drafting.generate(h.change.id, h.input({ sourceText }), author);
    assert.equal(run.suggestions.length, 6);
    for (const s of run.suggestions) await h.drafting.act(run.id, s.id, h.createDecision(s), author);
    const obligations = (await h.workflow.getChange(h.change.id)).obligations;
    assert.equal(obligations.length, 6); assert.deepEqual(new Set(obligations.map(o => o.statement)), new Set(sourceText.split('\n')));
});

test('drafting concurrent identical decisions produce one candidate and one durable receipt', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0], input = h.createDecision(s);
    const results = await Promise.all([h.drafting.act(run.id, s.id, input, author), h.drafting.act(run.id, s.id, input, author)]);
    assert.equal(results[0].suggestions[0].decision.obligationId, results[1].suggestions[0].decision.obligationId);
    assert.equal((await h.workflow.getChange(h.change.id)).obligations.length, 1);
});

test('drafting competing decisions cannot both succeed', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
    const results = await Promise.allSettled([h.drafting.act(run.id, s.id, h.createDecision(s), author), h.drafting.act(run.id, s.id, h.dismissDecision(), author)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.code, 'DRAFTING_DECISION_CONFLICT');
});

test('drafting transaction failure rolls candidate, history and suggestion decision back together', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
    await inspect(h, db => db.transaction(c => c.exec(failActivityInsert('reject_drafting_activity', 'DRAFTING_CANDIDATE_CREATED', 'synthetic rollback exercise'))));
    await assert.rejects(h.drafting.act(run.id, s.id, h.createDecision(s), author));
    assert.equal((await h.workflow.getChange(h.change.id)).obligations.length, 0);
    assert.equal((await h.drafting.get(run.id)).suggestions[0].status, 'PROPOSED');
    const count = await inspect(h, db => db.transaction(async c => (await c.query('SELECT COUNT(*) AS n FROM obligation_history')).rows[0], true));
    assert.equal(Number(count.n), 0);
});

for (const part of ['source', 'result', 'suggestion', 'decision']) test(`drafting damaged ${part} blocks reading and further decisions`, async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0];
    if (part === 'decision') await h.drafting.act(run.id, s.id, h.dismissDecision(), author);
    await inspect(h, db => db.transaction(async c => {
        if (part === 'source') await c.query('UPDATE drafting_runs SET source_snapshot=$1 WHERE id=$2', ['{}', run.id]);
        if (part === 'result') await c.query('UPDATE drafting_runs SET result_snapshot=$1 WHERE id=$2', ['{}', run.id]);
        if (part === 'suggestion') await c.query('DELETE FROM drafting_suggestions WHERE id=$1', [s.id]);
        if (part === 'decision') await c.query('UPDATE drafting_suggestions SET decision_snapshot=$1 WHERE id=$2', ['{}', s.id]);
    }));
    await assert.rejects(h.drafting.get(run.id), code('DRAFTING_INTEGRITY_FAILED'));
    await assert.rejects(h.drafting.act(run.id, run.suggestions[1].id, h.dismissDecision(), author), code('DRAFTING_INTEGRITY_FAILED'));
});

for (const damage of ['missing', 'corrupt']) test(`drafting ${damage} candidate creation history blocks provenance and decision replay`, async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author), s = run.suggestions[0], input = h.createDecision(s);
    const saved = await h.drafting.act(run.id, s.id, input, author), obligationId = saved.suggestions[0].decision.obligationId;
    await inspect(h, db => db.transaction(c => damage === 'missing'
        ? c.query('DELETE FROM obligation_history WHERE obligation_id=$1 AND version=1', [obligationId])
        : c.query('UPDATE obligation_history SET snapshot=$1 WHERE obligation_id=$2 AND version=1', ['{}', obligationId])));
    await assert.rejects(h.drafting.get(run.id), code('DRAFTING_INTEGRITY_FAILED'));
    await assert.rejects(h.drafting.act(run.id, s.id, input, author), code('DRAFTING_INTEGRITY_FAILED'));
});

test('drafting a suggestion identifier from another run is rejected', async t => {
    const h = await setupDrafting(t), a = await h.drafting.generate(h.change.id, h.input(), author), b = await h.drafting.generate(h.change.id, h.input(), author);
    await assert.rejects(h.drafting.act(a.id, b.suggestions[0].id, h.dismissDecision(), author), code('DRAFTING_SUGGESTION_NOT_FOUND'));
});

test('drafting actor rate limits count saved failures and reset at the defined window', async t => {
    let time = Date.now(), calls = 0;
    const h = await setupDrafting(t, { drafting: { now: () => time, generateDrafts: async () => { calls++; throw new Error('synthetic hidden provider failure'); } } });
    for (let i = 0; i < 10; i++) assert.equal((await h.drafting.generate(h.change.id, h.input(), author)).status, 'FAILED');
    await assert.rejects(h.drafting.generate(h.change.id, h.input(), author), code('DRAFTING_RATE_LIMITED')); assert.equal(calls, 10);
    time += 600000; await h.drafting.generate(h.change.id, h.input(), author); assert.equal(calls, 11);
});

test('drafting workspace AI request cap applies across separate actors', async t => {
    const h = await setupDrafting(t, { drafting: { openaiEnabled: true, model: 'test-drafting-model', generateDrafts: modelResult } });
    for (let i = 0; i < 30; i++) {
        const actor = { email: `limited-${Math.floor(i / 10)}@example.test`, roles: ['AUTHOR'] };
        const run = await h.drafting.generate(h.change.id, h.input({ method: 'openai', externalProcessingConfirmed: true }), actor);
        assert.equal(run.status, 'COMPLETED');
    }
    await assert.rejects(h.drafting.generate(h.change.id, h.input({ method: 'openai', externalProcessingConfirmed: true }), otherAuthor), code('DRAFTING_RATE_LIMITED'));
    const rules = await h.drafting.generate(h.change.id, h.input(), otherAuthor);
    assert.equal(rules.status, 'COMPLETED');
});

test('drafting reserves before generation, permits identical replay and blocks another active request', async t => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
    let calls = 0;
    const h = await setupDrafting(t, { drafting: { generateDrafts: async (...args) => { calls++; entered(); await gate; return generateDrafts(...args); } } });
    const input = h.input(), pending = h.drafting.generate(h.change.id, input, author); await started;
    const replay = await h.drafting.generate(h.change.id, input, author);
    assert.equal(replay.status, 'GENERATING'); assert.equal(replay.replayed, true);
    await assert.rejects(h.drafting.generate(h.change.id, h.input(), author), code('DRAFTING_GENERATION_ACTIVE'));
    release(); const result = await pending; assert.equal(result.id, replay.id); assert.equal(calls, 1); assert.equal(result.status, 'COMPLETED');
});

test('drafting interrupted reservation expires visibly and late output cannot complete it', async t => {
    let time = Date.now(), release, entered;
    const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
    const h = await setupDrafting(t, { drafting: { now: () => time, generateDrafts: async (...args) => { entered(); await gate; return generateDrafts(...args); } } });
    const input = h.input(), pending = h.drafting.generate(h.change.id, input, author); await started;
    time += 60000;
    const replay = await h.drafting.generate(h.change.id, input, author); assert.equal(replay.status, 'EXPIRED');
    release(); const result = await pending; assert.equal(result.status, 'EXPIRED'); assert.equal(result.suggestions.length, 0);
    assert.equal(result.resultDigest, null); assert.equal(result.failureCode, 'DRAFTING_GENERATION_EXPIRED');
});

test('drafting provider failure remains a saved sanitized failure and replay never retries', async t => {
    let calls = 0;
    const h = await setupDrafting(t, { drafting: { generateDrafts: async () => { calls++; throw new InputError('DRAFTING_PROVIDER_TIMEOUT', 'private token synthetic-do-not-expose', 502); } } });
    const input = h.input(), run = await h.drafting.generate(h.change.id, input, author);
    assert.equal(run.status, 'FAILED'); assert.equal(run.failureCode, 'DRAFTING_PROVIDER_TIMEOUT'); assert.ok(!JSON.stringify(run).includes('synthetic-do-not-expose'));
    const replay = await h.drafting.generate(h.change.id, input, author); assert.equal(replay.id, run.id); assert.equal(calls, 1);
});

test('drafting fabricated quotes fail validation before any suggestion or obligation is stored', async t => {
    const h = await setupDrafting(t, { drafting: { generateDrafts: async (...args) => {
        const result = await generateDrafts(...args); result.suggestions[0].quote = 'This quote is absent from the source.'; return result;
    } } });
    const run = await h.drafting.generate(h.change.id, h.input(), author);
    assert.equal(run.status, 'FAILED'); assert.equal(run.failureCode, 'DRAFTING_UNGROUNDED_OUTPUT'); assert.equal(run.suggestions.length, 0);
    assert.equal((await h.workflow.getChange(h.change.id)).obligations.length, 0);
});

test('drafting empty successful output is distinct from failure and source markup remains plain text', async t => {
    const h = await setupDrafting(t), text = '<script>untrusted()</script>\nThis is descriptive context without a requirement.';
    const run = await h.drafting.generate(h.change.id, h.input({ sourceText: text }), author);
    assert.equal(run.status, 'COMPLETED'); assert.equal(run.suggestions.length, 0); assert.equal(run.source.text, text); assert.equal(run.failureCode, null);
});

test('drafting current and historical contexts use explicit bounded pagination', async t => {
    const h = await setupDrafting(t);
    for (let i = 0; i < 3; i++) await h.drafting.generate(h.change.id, h.input({ sourceVersion: String(i) }), author);
    const first = await h.drafting.getContext(h.change.id, null, { limit: 2 });
    const next = await h.drafting.getContext(h.change.id, null, { offset: 2, limit: 2 });
    assert.equal(first.total, 3); assert.equal(first.hasMore, true); assert.equal(next.hasMore, false); assert.equal(next.runs.length, 1);
    assert.equal(new Set([...first.runs, ...next.runs].map(r => r.id)).size, 3); assert.equal(first.runs[0].pendingCount, 2);
    await assert.rejects(h.drafting.getContext(h.change.id, null, { limit: 51 }), code('INVALID_PAGINATION'));
    await assert.rejects(h.drafting.getContext(h.change.id, randomUUID()), code('REVISION_NOT_FOUND'));
});

test('drafting runs and decisions survive reopening; disabled workflow can still read schema6 records', async t => {
    const h = await setupDrafting(t), run = await h.drafting.generate(h.change.id, h.input(), author);
    await h.drafting.act(run.id, run.suggestions[0].id, h.dismissDecision(), author);
    const reopened = await openWorkflowRepository({ ...h.options, migrate: false }), disabled = await openWorkflowRepository({ ...h.db, migrate: false });
    try {
        assert.equal((await reopened.drafting.get(run.id)).suggestions[0].status, 'DISMISSED');
        assert.equal(await disabled.getSchemaVersion(), 6); assert.equal(disabled.drafting, undefined);
    } finally { await reopened.close(); await disabled.close(); }
});

test('drafting enabled startup requires explicit schema6 migration', async t => {
    const h = await setupDrafting(t);
    await inspect(h, db => db.transaction(async c => { await c.query('DELETE FROM qivvera_migrations WHERE version=6'); }));
    await assert.rejects(openWorkflowRepository({ ...h.options, migrate: false }), /DRAFTING_MIGRATION_REQUIRED/);
});

test('drafting preparation preserves READY; adopted candidate invalidates current scope and prevents new READY', async t => {
    const h = await draftingAssuranceJourney(t);
    assert.equal(h.original.disposition, 'READY'); assert.equal(h.schemaVersion, 6);
    for (const beforeAdoption of [h.afterPreparation, h.afterDismissal]) {
        assert.equal(beforeAdoption.applicability, 'CURRENT'); assert.equal(beforeAdoption.disposition, 'READY');
        assert.equal(beforeAdoption.evidenceDigest, h.original.evidenceDigest);
    }
    assert.equal(h.afterAdoption.applicability, 'STALE_INPUTS'); assert.equal(h.context.plan.current, false);
    assert.equal(h.reassessment.disposition, 'INDETERMINATE');
    assert.equal(h.preserved.evidenceDigest, h.original.evidenceDigest); assert.deepEqual(h.preserved.case, h.original.case);
});
