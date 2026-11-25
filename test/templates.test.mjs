import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setupTemplates, author, authority, otherAuthority, viewer, rationale } from './templates-helpers.mjs';
import { openAssuranceRepository } from '../backend/server/assurance/repository.mjs';
import { openDatabase } from '../backend/server/workflow-store.mjs';
import { createAssuranceReadModel } from '../backend/server/assurance/read-model.mjs';
import { createTemplateRepository, TEMPLATE_LIMITS } from '../backend/server/templates/repository.mjs';
import { migrateTemplates, templatesChecksum } from '../backend/server/templates/migration.mjs';
import { canonical, digest } from '../backend/server/assurance/contracts.mjs';
import { CHECKS, PROFILE_V2 } from '../backend/server/assurance/generalization.mjs';
import { setupMulti, separateWorker } from './generalization-helpers.mjs';
import { workOnce } from '../backend/server/assurance/worker.mjs';
import { failActivityInsert } from './postgres-test-database.mjs';

const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);
const archiveInput = (template, overrides = {}) => ({ requestKey: randomUUID(), expectedVersion: template.version.number, expectedStateVersion: template.family.stateVersion, rationale, ...overrides });
const revisionInput = (h, template, overrides = {}) => h.input({ expectedVersion: template.version.number, expectedStateVersion: template.family.stateVersion, ...overrides });
const withoutReplay = value => { const { replayed, ...rest } = value; return rest; };

test('templates / save freezes supported preparation and original human-decision provenance', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    assert.equal(saved.family.state, 'ACTIVE'); assert.equal(saved.version.number, 1);
    assert.equal(saved.version.snapshot.source.planDigest, digest(h.sourcePlan.snapshot));
    assert.equal(saved.version.snapshot.source.scopeDigest, h.sourceContext.scopeDigest);
    assert.equal(saved.version.snapshot.source.approvedBy, authority.email);
    assert.equal(saved.version.snapshot.profile.digest, digest(PROFILE_V2));
    assert.equal(saved.version.digest, digest(saved.version.snapshot));
    for (const entry of saved.version.snapshot.entries) {
        assert.equal(entry.requirement.acceptanceDecision.actor, authority.email);
        assert.equal(entry.requirement.acceptanceDecision.independentActor, true);
        assert.deepEqual(entry.check, CHECKS.find(c => c.id === entry.check.id));
    }
    assert.equal((await h.service.getContext(h.source.id, h.source.revision.id)).plan.id, h.sourcePlan.id);
    assert.equal((await h.service.listRuns(h.source.id, h.source.revision.id)).length, 0);
    assert.deepEqual(await h.templates.get(saved.family.id), withoutReplay(saved));
});
test('templates / exported preparation excludes target connection, execution identities, credentials and evidence', async t => {
    const h = await setupTemplates(t), saved = await h.save(), body = JSON.stringify(saved);
    for (const value of ['127.0.0.1', 'origin', 'requesterTokenEnv', 'approverTokenEnv', 'fixture-requester', 'fixture-approver', 'TEMPLATE_FIXTURE_', 'artifactDigest', 'environmentDigest']) assert.equal(body.includes(value), false, value);
    assert.equal(Object.hasOwn(saved.version.snapshot, 'evidence'), false); assert.equal(Object.hasOwn(saved.version.snapshot, 'disposition'), false);
});
test('templates / list pagination is bounded, complete and explicitly includes archived families', async t => {
    const h = await setupTemplates(t), a = await h.save(), b = await h.save({ name: 'Second template' });
    await h.templates.archive(a.family.id, archiveInput(a), authority);
    const active = await h.templates.list(); assert.equal(active.total, 1); assert.equal(active.items[0].id, b.family.id);
    const first = await h.templates.list({ includeArchived: true, limit: 1 }); assert.equal(first.total, 2); assert.equal(first.hasMore, true);
    const second = await h.templates.list({ includeArchived: true, offset: 1, limit: 1 }); assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.items, ...second.items].map(x => x.id)).size, 2);
    for (const options of [{ limit: 0 }, { limit: 51 }, { offset: -1 }, { offset: 1.5 }, { includeArchived: 'true' }]) await rejects(h.templates.list(options), 'INVALID_PAGINATION');
});
test('templates / exact requirement case Unicode and internal whitespace survive unchanged', async t => {
    const h = await setupTemplates(t), o = h.sourceObligations[0];
    const edited = await h.workflow.editObligation(o.id, { revisionId: o.revisionId, version: o.version, statement: 'Literal A  ≠ a and K ≠ K must remain exact.', sourceReference: o.sourceReference, sourceVersion: o.sourceVersion, criticality: o.criticality }, author);
    await h.accept(edited);
    const context = await h.service.getContext(h.source.id, h.source.revision.id);
    const plan = await h.service.approvePlan(h.source.id, { revisionId: h.source.revision.id, scopeDigest: context.scopeDigest, expectedPlanVersion: context.plan.version,
        targetId: h.sourceTarget.id, mappings: h.sourceMappings, rationale, acknowledgeLimits: true }, authority);
    const saved = await h.save({ sourcePlanId: plan.id, sourceScopeDigest: context.scopeDigest });
    assert.equal(saved.version.snapshot.entries.find(e => e.check.id === 'separation').requirement.statement, 'Literal A  ≠ a and K ≠ K must remain exact.');
});
test('templates / founder-review qualification remains explicit in source and receipt digests', async t => {
    const h = await setupTemplates(t, { reviewMode: 'founder-review' }), saved = await h.save();
    assert.equal(saved.version.snapshot.reviewMode, 'founder-review');
    assert.ok(saved.version.snapshot.limitations.some(s => s.includes('does not establish independent human approval')));
    assert.equal(saved.version.digest, digest(saved.version.snapshot));
});
test('templates / only Policy Authority may save revise archive or approve use', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    for (const actor of [author, viewer]) {
        await rejects(h.templates.create(h.input(), actor), 'FORBIDDEN');
        await rejects(h.templates.revise(saved.family.id, revisionInput(h, saved), actor), 'FORBIDDEN');
        await rejects(h.templates.archive(saved.family.id, archiveInput(saved), actor), 'FORBIDDEN');
        await rejects(h.service.approvePlan(h.destination.id, await h.useInput(saved), actor), 'FORBIDDEN');
    }
});
test('templates / source fields acknowledgements and meaningful reasons are bounded', async t => {
    const h = await setupTemplates(t);
    await rejects(h.templates.create(h.input({ name: 'x'.repeat(121) }), authority), 'INVALID_FIELD');
    await rejects(h.templates.create(h.input({ purpose: 'x'.repeat(2001) }), authority), 'INVALID_FIELD');
    await rejects(h.templates.create(h.input({ rationale: 'short' }), authority), 'TEMPLATE_REASON_REQUIRED');
    await rejects(h.templates.create(h.input({ acknowledgeLimits: false }), authority), 'TEMPLATE_ACKNOWLEDGEMENT_REQUIRED');
    await rejects(h.templates.create(h.input({ sourceScopeDigest: 'sha256:wrong' }), authority), 'INVALID_TEMPLATE_DIGEST');
    await assert.rejects(h.templates.create(h.input({ roles: ['POLICY_AUTHORITY'] }), authority));
    const saved = await h.save({ name: 'x'.repeat(120), purpose: 'x'.repeat(2000), rationale: 'x'.repeat(2000) });
    assert.equal(saved.version.snapshot.name.length, 120);
});
test('templates / source scope changed after display cannot be captured', async t => {
    const h = await setupTemplates(t); await h.workflow.addObligation(h.source.id, { revisionId: h.source.revision.id, statement: 'A new mandatory declaration', sourceReference: 'Policy', sourceVersion: '2', criticality: 'HIGH' }, author);
    await rejects(h.save(), 'TEMPLATE_SOURCE_CHANGED'); assert.equal((await h.templates.list()).total, 0);
});
test('templates / a newer approved source plan invalidates the stale save request', async t => {
    const h = await setupTemplates(t);
    await h.service.approvePlan(h.source.id, { revisionId: h.source.revision.id, scopeDigest: h.sourceContext.scopeDigest, expectedPlanVersion: 1, targetId: h.sourceTarget.id, mappings: h.sourceMappings, rationale, acknowledgeLimits: true }, authority);
    await rejects(h.save(), 'TEMPLATE_SOURCE_CHANGED');
});
test('templates / historical source revisions cannot create new templates', async t => {
    const h = await setupTemplates(t);
    await h.workflow.createRevision(h.source.id, { expectedRevisionId: h.source.revision.id, sourceRevision: 'c'.repeat(40), intent: 'New declared source', reason: 'A new implementation requires a new revision.', copyObligations: true }, author);
    await rejects(h.save(), 'TEMPLATE_SOURCE_HISTORICAL');
});
test('templates / a legitimate legacy v1 plan receives an explicit unsupported-profile response', async t => {
    const h = await setupTemplates(t);
    const legacy = await h.service.approvePlan(h.source.id, { revisionId: h.source.revision.id, scopeDigest: h.sourceContext.scopeDigest, expectedPlanVersion: 1, targetId: h.sourceTarget.id, obligationId: h.sourceObligations[0].id, rationale, acknowledgeLimits: true }, authority);
    await rejects(h.save({ sourcePlanId: legacy.id }), 'TEMPLATE_V2_PLAN_REQUIRED');
});
test('templates / changed protected target configuration prevents capture of an old source plan', async t => {
    const h = await setupTemplates(t), changed = await openAssuranceRepository({ ...h.options, migrate: false, targets: [{ ...h.sourceTarget, bindingStatement: 'Changed binding context must be freshly reviewed.' }, h.destinationTarget] });
    try { await rejects(changed.templates.create(h.input(), authority), 'TEMPLATE_SOURCE_NOT_CURRENT'); } finally { await changed.close(); }
});
test('templates / missing workflow membership cannot silently shrink the source scope', async t => {
    const h = await setupTemplates(t); await h.sql(c => c.query('DELETE FROM obligation_workflow WHERE obligation_id=$1', [h.sourceObligations[0].id]));
    await rejects(h.save(), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / malformed source plans are integrity failures, never ordinary unsupported profiles', async t => {
    const h = await setupTemplates(t); await h.sql(c => c.query("UPDATE assurance_plans SET snapshot='{}' WHERE id=$1", [h.sourcePlan.id]));
    await rejects(h.save(), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / altered acceptance history prevents both new capture and saved-version reads', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    const decision = saved.version.snapshot.entries[0].requirement.acceptanceDecision.id;
    await h.sql(c => c.query("UPDATE obligation_history SET actor='different@example.test' WHERE id=$1", [decision]));
    await rejects(h.save(), 'TEMPLATE_INTEGRITY_FAILED'); await rejects(h.templates.get(saved.family.id), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / current history content must agree with the recorded source requirement', async t => {
    const h = await setupTemplates(t); await h.sql(c => c.query("UPDATE obligations SET statement='Modified without corresponding history' WHERE id=$1", [h.sourceObligations[0].id]));
    await rejects(h.save(), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / save replay returns the original receipt after archival without creating anything', async t => {
    const h = await setupTemplates(t), input = h.input(), original = await h.templates.create(input, authority);
    await h.templates.archive(original.family.id, archiveInput(original), authority);
    const replay = await h.templates.create(input, authority);
    assert.equal(replay.replayed, true); assert.deepEqual(withoutReplay(replay), withoutReplay(original));
    assert.equal((await h.templates.get(original.family.id)).family.state, 'ARCHIVED');
    assert.equal((await h.templates.list({ includeArchived: true })).total, 1);
});
test('templates / reused mutation request keys reject different payloads and operations', async t => {
    const h = await setupTemplates(t), input = h.input(), saved = await h.templates.create(input, authority);
    await rejects(h.templates.create({ ...input, name: 'Different request' }, authority), 'TEMPLATE_REQUEST_CONFLICT');
    await rejects(h.templates.archive(saved.family.id, archiveInput(saved, { requestKey: input.requestKey }), authority), 'TEMPLATE_REQUEST_CONFLICT');
});
test('templates / mutation request receipts are bound to the actual actor', async t => {
    const h = await setupTemplates(t), input = h.input(), a = await h.templates.create(input, authority), b = await h.templates.create(input, otherAuthority);
    assert.notEqual(a.family.id, b.family.id); assert.equal(b.family.createdBy, otherAuthority.email); assert.equal(b.replayed, false);
});
test('templates / versioning preserves prior bodies and exact immutable parent links', async t => {
    const h = await setupTemplates(t), first = await h.save(), input = revisionInput(h, first, { name: 'Reviewed preparation revision' });
    const second = await h.templates.revise(first.family.id, input, authority), replay = await h.templates.revise(first.family.id, input, authority);
    assert.equal(second.version.number, 2); assert.equal(second.version.snapshot.parentVersionId, first.version.id);
    assert.deepEqual((await h.templates.get(first.family.id, { versionId: first.version.id })).version, first.version);
    assert.equal(replay.replayed, true); assert.deepEqual(withoutReplay(replay), withoutReplay(second));
    await rejects(h.templates.revise(first.family.id, revisionInput(h, first), authority), 'TEMPLATE_VERSION_CONFLICT');
});
test('templates / old versions remain inspectable but cannot approve a new plan', async t => {
    const h = await setupTemplates(t), first = await h.save(); await h.templates.revise(first.family.id, revisionInput(h, first), authority);
    await rejects(h.service.approvePlan(h.destination.id, await h.useInput(first), authority), 'TEMPLATE_VERSION_SUPERSEDED');
});
test('templates / archive has an expected-state guard and rejects future uses and versions', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    await rejects(h.templates.archive(saved.family.id, archiveInput(saved, { expectedStateVersion: 2 }), authority), 'TEMPLATE_VERSION_CONFLICT');
    const input = archiveInput(saved), archived = await h.templates.archive(saved.family.id, input, authority);
    assert.equal(archived.family.stateVersion, 2); assert.equal((await h.templates.archive(saved.family.id, input, authority)).replayed, true);
    await rejects(h.templates.revise(saved.family.id, revisionInput(h, saved), authority), 'TEMPLATE_ARCHIVED');
    await rejects(h.service.approvePlan(h.destination.id, await h.useInput(saved), authority), 'TEMPLATE_ARCHIVED');
});
test('templates / source revision advancement preserves the frozen template preparation', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    await h.workflow.createRevision(h.source.id, { expectedRevisionId: h.source.revision.id, sourceRevision: 'c'.repeat(40), intent: 'Another implementation', reason: 'Record a later implementation without changing history.', copyObligations: true }, author);
    assert.deepEqual((await h.templates.get(saved.family.id)).version, saved.version);
    assert.ok((await h.service.approvePlan(h.destination.id, await h.useInput(saved), authority)).templateUse);
});
test('templates / a later source requirement edit does not rewrite earlier preparation', async t => {
    const h = await setupTemplates(t), saved = await h.save(), o = h.sourceObligations[0];
    await h.workflow.editObligation(o.id, { revisionId: o.revisionId, version: o.version, statement: 'A different later wording', sourceReference: o.sourceReference, sourceVersion: '2', criticality: o.criticality }, author);
    assert.deepEqual((await h.templates.get(saved.family.id)).version, saved.version);
});
test('templates / edited version snapshots fail content integrity checks', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    await h.sql(c => c.query("UPDATE verification_template_versions SET snapshot='{}' WHERE id=$1", [saved.version.id]));
    await rejects(h.templates.get(saved.family.id), 'TEMPLATE_INTEGRITY_FAILED'); await rejects(h.templates.list(), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / original source plan edits are detected even when the template body is unchanged', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    await h.sql(c => c.query("UPDATE assurance_plans SET rationale='Changed approved rationale without preservation' WHERE id=$1", [h.sourcePlan.id]));
    await rejects(h.templates.get(saved.family.id), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / absent version mutation provenance is not silently accepted', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    await h.sql(c => c.query('DELETE FROM verification_template_mutations WHERE version_id=$1', [saved.version.id]));
    await rejects(h.templates.get(saved.family.id), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / failed audit insert rolls back family version and retry receipt together', async t => {
    const h = await setupTemplates(t);
    await h.sql(c => c.exec(failActivityInsert('fail_template_audit', 'VERIFICATION_TEMPLATE_CREATED', 'test-audit-fault')));
    await assert.rejects(h.save(), /test-audit-fault/);
    const counts = await h.sql(async c => Promise.all(['verification_templates','verification_template_versions','verification_template_mutations'].map(async table => Number((await c.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n))));
    assert.deepEqual(counts, [0,0,0]);
});
test('templates / new use records fresh authority mappings target and all mandatory scope', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    const extra = await h.workflow.addObligation(h.destination.id, { revisionId: h.destination.revision.id, statement: 'A separately declared mandatory requirement remains unresolved.', sourceReference: 'Another policy', sourceVersion: '1', criticality: 'CRITICAL' }, author);
    const plan = await h.service.approvePlan(h.destination.id, await h.useInput(saved), authority);
    assert.equal(plan.snapshot.scope.applicationId, h.destinationApp.id); assert.equal(plan.snapshot.target.id, h.destinationTarget.id);
    assert.equal(plan.snapshot.scope.obligations.length, 3); assert.equal(plan.snapshot.scope.obligations.find(o => o.id === extra.id).reviewStatus, 'DRAFT');
    assert.ok(plan.snapshot.mappings.every(m => h.destinationObligations.some(o => o.id === m.obligationId)));
    assert.equal(plan.templateUse.templateDigest, saved.version.digest); assert.equal((await h.service.listRuns(h.destination.id, h.destination.revision.id)).length, 0);
    assert.deepEqual((await h.service.getContext(h.destination.id, h.destination.revision.id)).plan.templateUse, plan.templateUse);
});
test('templates / each destination obligation needs its own acceptance decision', async t => {
    const h = await setupTemplates(t), saved = await h.save(), o = h.destinationObligations[0];
    await h.workflow.editObligation(o.id, { revisionId: o.revisionId, version: o.version, statement: 'Changed destination meaning requires another review.', sourceReference: o.sourceReference, sourceVersion: '2', criticality: o.criticality }, author);
    await rejects(h.service.approvePlan(h.destination.id, await h.useInput(saved), authority), 'ACCEPTED_OBLIGATION_REQUIRED');
});
test('templates / fresh explicit mapping may differ in wording but cannot use another revision obligation', async t => {
    const h = await setupTemplates(t), saved = await h.save(), input = await h.useInput(saved);
    input.mappings[0] = { ...input.mappings[0], obligationId: h.sourceObligations[0].id };
    await rejects(h.service.approvePlan(h.destination.id, input, authority), 'ACCEPTED_OBLIGATION_REQUIRED');
});
test('templates / every template check must be explicitly matched exactly once', async t => {
    const h = await setupTemplates(t), saved = await h.save(), input = await h.useInput(saved);
    await rejects(h.service.approvePlan(h.destination.id, { ...input, mappings: input.mappings.slice(0,1) }, authority), 'TEMPLATE_CHECK_SET_MISMATCH');
    await rejects(h.service.approvePlan(h.destination.id, { ...input, mappings: [{ ...input.mappings[0], checkId: 'unknown' }] }, authority), 'INVALID_MAPPINGS');
});
test('templates / same-adapter boundary rejects implicit cross-adapter reuse', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    const alternate = await openAssuranceRepository({ ...h.options, migrate: false, targets: [h.sourceTarget, { ...h.destinationTarget, adapterId: 'expense-v1' }] });
    try { await rejects(alternate.approvePlan(h.destination.id, await h.useInput(saved), authority), 'TEMPLATE_ADAPTER_MISMATCH'); } finally { await alternate.close(); }
});
test('templates / mismatched version digest and foreign family/version pairs are rejected', async t => {
    const h = await setupTemplates(t), a = await h.save(), b = await h.save(), input = await h.useInput(a);
    await rejects(h.service.approvePlan(h.destination.id, { ...input, templateUse: { ...input.templateUse, templateDigest: 'sha256:' + '0'.repeat(64) } }, authority), 'TEMPLATE_DIGEST_CHANGED');
    await rejects(h.templates.get(a.family.id, { versionId: b.version.id }), 'TEMPLATE_VERSION_NOT_FOUND');
});
test('templates / stale destination scope and plan versions fail before creating provenance', async t => {
    const h = await setupTemplates(t), saved = await h.save(), input = await h.useInput(saved);
    await h.workflow.addObligation(h.destination.id, { revisionId: h.destination.revision.id, statement: 'A later declared requirement.', sourceReference: 'Policy', sourceVersion: '2', criticality: 'HIGH' }, author);
    await rejects(h.service.approvePlan(h.destination.id, input, authority), 'SCOPE_CHANGED');
    const fresh = await h.useInput(saved); await h.service.approvePlan(h.destination.id, fresh, authority);
    await rejects(h.service.approvePlan(h.destination.id, { ...fresh, templateUse: { ...fresh.templateUse, requestKey: randomUUID() } }, authority), 'PLAN_CONFLICT');
});
test('templates / use replay returns one original plan after archive and later plan replacement', async t => {
    const h = await setupTemplates(t), saved = await h.save(), input = await h.useInput(saved), plan = await h.service.approvePlan(h.destination.id, input, authority);
    await h.templates.archive(saved.family.id, archiveInput(saved), authority);
    const replacement = { ...await h.useInput(saved), expectedPlanVersion: 1 }; delete replacement.templateUse;
    await h.service.approvePlan(h.destination.id, replacement, authority);
    const replay = await h.service.approvePlan(h.destination.id, input, authority);
    assert.equal(replay.replayed, true); assert.equal(replay.id, plan.id); assert.deepEqual(replay.templateUse, plan.templateUse);
    assert.equal((await h.service.getContext(h.destination.id, h.destination.revision.id)).plan.version, 2);
    assert.equal(await h.sql(async c => Number((await c.query('SELECT COUNT(*) AS n FROM verification_template_uses')).rows[0].n)), 1);
});
test('templates / use request-key conflicts cannot approve a different mapping', async t => {
    const h = await setupTemplates(t), saved = await h.save(), input = await h.useInput(saved); await h.service.approvePlan(h.destination.id, input, authority);
    await rejects(h.service.approvePlan(h.destination.id, { ...input, rationale: rationale + ' changed' }, authority), 'TEMPLATE_REQUEST_CONFLICT');
});
test('templates / actor request keys cannot cross from save to use or use to another mutation', async t => {
    const h=await setupTemplates(t),create=h.input(),saved=await h.templates.create(create,authority),input=await h.useInput(saved);
    await rejects(h.service.approvePlan(h.destination.id,{...input,templateUse:{...input.templateUse,requestKey:create.requestKey}},authority),'TEMPLATE_REQUEST_CONFLICT');
    await h.service.approvePlan(h.destination.id,input,authority);
    await rejects(h.templates.create(h.input({requestKey:input.templateUse.requestKey}),authority),'TEMPLATE_REQUEST_CONFLICT');
});
test('templates / archive or version advancement does not invalidate an already approved plan', async t => {
    const h = await setupTemplates(t), first = await h.save(), plan = await h.service.approvePlan(h.destination.id, await h.useInput(first), authority);
    const second = await h.templates.revise(first.family.id, revisionInput(h, first), authority);
    await h.templates.archive(first.family.id, archiveInput(second), authority);
    const context = await h.service.getContext(h.destination.id, h.destination.revision.id);
    assert.equal(context.plan.id, plan.id); assert.equal(context.plan.current, true); assert.equal(context.plan.templateUse.version, 1);
    const run = await h.service.requestRun(h.destination.id, { revisionId: h.destination.revision.id, planId: plan.id, requestKey: randomUUID() }, author);
    assert.equal(run.status, 'QUEUED'); assert.equal(run.disposition, null);
});
test('templates / a missing or damaged use receipt cannot silently become an ordinary plan', async t => {
    const h = await setupTemplates(t), saved = await h.save(), plan = await h.service.approvePlan(h.destination.id, await h.useInput(saved), authority);
    await h.sql(c => c.query('DELETE FROM verification_template_uses WHERE plan_id=$1', [plan.id]));
    await rejects(h.service.getContext(h.destination.id, h.destination.revision.id), 'TEMPLATE_INTEGRITY_FAILED');
});
test('templates / failing provenance audit rolls back the new plan and use receipt', async t => {
    const h = await setupTemplates(t), saved = await h.save();
    await h.sql(c => c.exec(failActivityInsert('fail_template_use', 'VERIFICATION_TEMPLATE_USED', 'test-use-fault')));
    await assert.rejects(h.service.approvePlan(h.destination.id, await h.useInput(saved), authority), /test-use-fault/);
    assert.equal((await h.service.getContext(h.destination.id, h.destination.revision.id)).plan, null);
    assert.equal(await h.sql(async c => Number((await c.query('SELECT COUNT(*) AS n FROM verification_template_uses')).rows[0].n)), 0);
});
test('templates / feature disabled preserves ordinary plans and rejects attributed reuse', async t => {
    const h = await setupTemplates(t), saved = await h.save(), disabled = await openAssuranceRepository({ ...h.options, migrate: false, templatesEnabled: false });
    try {
        assert.equal(disabled.templates, null); await rejects(disabled.approvePlan(h.destination.id, await h.useInput(saved), authority), 'TEMPLATES_DISABLED');
        const input = await h.useInput(saved); delete input.templateUse; assert.ok((await disabled.approvePlan(h.destination.id, input, authority)).id);
    } finally { await disabled.close(); }
});
test('templates / schema7 migration is additive idempotent and verifies its checksum', async t => {
    const h = await setupTemplates(t), db = await openDatabase(h.db);
    try {
        const before = await db.transaction(async c => (await c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version')).rows, true);
        await migrateTemplates(db); await migrateTemplates(db);
        assert.deepEqual(await db.transaction(async c => (await c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version')).rows, true), before);
        assert.equal(before.find(r => Number(r.version) === 7).checksum, templatesChecksum);
        await db.transaction(c => c.query("UPDATE qivvera_migrations SET checksum='damaged' WHERE version=7"));
        await assert.rejects(openAssuranceRepository({ ...h.options, migrate: false }), /TEMPLATES_MIGRATION_REQUIRED/);
        await assert.rejects(migrateTemplates(db), /TEMPLATES_MIGRATION_CHECKSUM_MISMATCH/);
    } finally { await db.close(); }
});
test('templates / bounded view validation uses a fixed number of database calls as history grows', async t => {
    const h = await setupTemplates(t); let saved = await h.save();
    for (let i = 1; i < 12; i++) saved = await h.templates.revise(saved.family.id, revisionInput(h, saved), authority);
    const db = await openDatabase(h.db); let calls = 0;
    const counted = { ...db, transaction: (fn, readOnly) => db.transaction(c => fn({ ...c, query: (...args) => { calls++; return c.query(...args); } }), readOnly) };
    const repository = createTemplateRepository({ db: counted, model: createAssuranceReadModel(counted, h.options.targets), catalogue: h.options.targets });
    try {
        const page = await repository.api.list(); assert.equal(page.items[0].version, 12);
        assert.ok(calls <= 11, `Expected at most 11 batched queries, got ${calls}`);
    } finally { await db.close(); }
});
test('templates / family and immutable-version limits fail explicitly without dropping history', async t => {
    const h = await setupTemplates(t); let saved = await h.save();
    for (let i = 1; i < TEMPLATE_LIMITS.versions; i++) saved = await h.templates.revise(saved.family.id, revisionInput(h, saved), authority);
    await rejects(h.templates.revise(saved.family.id, revisionInput(h, saved), authority), 'TEMPLATE_VERSION_LIMIT');
    assert.equal((await h.templates.get(saved.family.id)).history.length, TEMPLATE_LIMITS.versions);
    // Complete family creation is already covered; the global reservation boundary is exercised at 100.
    await h.sql(async c => { for (let i = 1; i < TEMPLATE_LIMITS.families; i++) await c.query("INSERT INTO verification_templates(id,state,state_version,created_by,created_at) VALUES($1,'ACTIVE',1,$2,$3)", [randomUUID(), authority.email, new Date().toISOString()]); });
    await rejects(h.save(), 'TEMPLATE_FAMILY_LIMIT');
});
test('templates / oversized stored source bodies are rejected before full body loading', async t => {
    const h=await setupTemplates(t),saved=await h.save(),db=await openDatabase(h.db);
    await h.sql(c=>c.query('UPDATE assurance_plans SET snapshot=$1 WHERE id=$2',['x'.repeat(TEMPLATE_LIMITS.readBytes+1),h.sourcePlan.id]));
    const queries=[];
    const watched={...db,transaction:(fn,readOnly)=>db.transaction(c=>fn({...c,query:(...args)=>{queries.push(args[0]);return c.query(...args);}}),readOnly)};
    try{
        const repository=createTemplateRepository({db:watched,model:createAssuranceReadModel(watched,h.options.targets),catalogue:h.options.targets});
        await rejects(repository.api.get(saved.family.id),'TEMPLATE_READ_LIMIT');
        assert.equal(queries.some(q=>q.startsWith('SELECT * FROM assurance_plans')),false);
    }finally{await db.close();}
});
test('templates / a legitimate large family rejects the next version atomically and retains archive headroom', async t => {
    const h=await setupTemplates(t);
    for(let i=0;i<498;i++)await h.workflow.addObligation(h.source.id,{revisionId:h.source.revision.id,
        statement:`Declared mandatory scope ${i}: `+'𝄞'.repeat(500),sourceReference:'𝄞'.repeat(200),sourceVersion:'1',criticality:'HIGH'},author);
    let saved=null,blocked=false;
    for(let i=0;i<TEMPLATE_LIMITS.versions;i++){
        const context=await h.service.getContext(h.source.id,h.source.revision.id);
        const plan=await h.service.approvePlan(h.source.id,{revisionId:h.source.revision.id,scopeDigest:context.scopeDigest,expectedPlanVersion:context.plan.version,
            targetId:h.sourceTarget.id,mappings:h.sourceMappings,rationale,acknowledgeLimits:true},authority);
        const input=h.input({sourcePlanId:plan.id,sourceScopeDigest:context.scopeDigest,...(saved?{expectedVersion:saved.version.number,expectedStateVersion:1}:{})});
        try{saved=saved?await h.templates.revise(saved.family.id,input,authority):await h.templates.create(input,authority);}
        catch(error){assert.equal(error.code,'TEMPLATE_READ_LIMIT');blocked=true;break;}
    }
    assert.equal(blocked,true);assert.ok(saved&&saved.version.number<TEMPLATE_LIMITS.versions);
    const current=await h.templates.get(saved.family.id);assert.deepEqual(current.version,saved.version);assert.equal(current.history.length,saved.version.number);
    const archived=await h.templates.archive(saved.family.id,archiveInput(saved),authority);
    assert.equal(archived.family.state,'ARCHIVED');assert.equal((await h.templates.get(saved.family.id)).family.state,'ARCHIVED');
});
test('templates / actual worker produces fresh evidence with unresolved scope and preserves prior counterexamples', async t => {
    const h = await setupMulti(t, { mode: 'intermittent' });
    const original = await h.run(); assert.equal(original.disposition, 'NOT_READY');
    const service = await openAssuranceRepository({ ...h.options, migrate: true, templatesEnabled: true });
    const worker = await openAssuranceRepository({ ...h.options, migrate: false, templatesEnabled: false, worker: true });
    try {
        const context = await service.getContext(h.change.id, h.change.revision.id);
        const saved = await service.templates.create({ requestKey: randomUUID(), sourceChangeId: h.change.id, sourceRevisionId: h.change.revision.id,
            sourcePlanId: context.plan.id, sourceScopeDigest: context.scopeDigest, name: 'Retained bounded checks', purpose: 'Explicitly review the same check mappings again.', rationale, acknowledgeLimits: true }, authority);
        const priorManifest = original.evidenceDigest;
        const plan = await service.approvePlan(h.change.id, { revisionId: h.change.revision.id, scopeDigest: context.scopeDigest, expectedPlanVersion: context.plan.version,
            targetId: h.target.id, mappings: h.mappings, rationale, acknowledgeLimits: true,
            templateUse: { templateId: saved.family.id, versionId: saved.version.id, templateDigest: saved.version.digest, requestKey: randomUUID() } }, authority);
        const queued = await service.requestRun(h.change.id, { revisionId: h.change.revision.id, planId: plan.id, requestKey: randomUUID() }, author);
        assert.equal(queued.disposition, null);
        await workOnce({ repository: worker, targets: [h.target], workerId: 'template-regression-worker', secretEnv: h.secretEnv, allowLoopback: true, timeoutMs: 500 });
        const fresh = await service.getRun(queued.id);
        assert.equal(fresh.disposition, 'NOT_READY'); assert.ok(fresh.case.findings.some(f => f.reason === 'UNRESOLVED_PRIOR_COUNTEREXAMPLE'));
        await service.templates.archive(saved.family.id, archiveInput(saved), authority);
        assert.equal((await service.getRun(queued.id)).evidenceDigest, fresh.evidenceDigest); assert.equal((await service.getRun(original.id)).evidenceDigest, priorManifest);
        assert.equal(worker.templates, null);
    } finally { await worker.close(); await service.close(); }
});
test('templates / actual separate execution retains extra unaccepted mandatory obligations as INDETERMINATE', async t => {
    const h = await setupMulti(t), original = await h.run(); assert.equal(original.disposition, 'READY');
    const service = await openAssuranceRepository({ ...h.options, migrate: true, templatesEnabled: true });
    const worker = await openAssuranceRepository({ ...h.options, migrate: false, templatesEnabled: false, worker: true });
    try {
        let context = await service.getContext(h.change.id, h.change.revision.id);
        const saved = await service.templates.create({ requestKey: randomUUID(), sourceChangeId: h.change.id, sourceRevisionId: h.change.revision.id,
            sourcePlanId: context.plan.id, sourceScopeDigest: context.scopeDigest, name: 'Preserve mandatory scope', purpose: 'Prepare mappings after newly declared requirements.', rationale, acknowledgeLimits: true }, authority);
        const extra = await h.workflow.addObligation(h.change.id, { revisionId: h.change.revision.id, statement: 'The export must retain a complete independent audit trail.', sourceReference: 'Audit policy', sourceVersion: '1', criticality: 'HIGH' }, author);
        context = await service.getContext(h.change.id, h.change.revision.id);
        const plan = await service.approvePlan(h.change.id, { revisionId: h.change.revision.id, scopeDigest: context.scopeDigest, expectedPlanVersion: context.plan.version,
            targetId: h.target.id, mappings: h.mappings, rationale, acknowledgeLimits: true,
            templateUse: { templateId: saved.family.id, versionId: saved.version.id, templateDigest: saved.version.digest, requestKey: randomUUID() } }, authority);
        const run = await service.requestRun(h.change.id, { revisionId: h.change.revision.id, planId: plan.id, requestKey: randomUUID() }, author);
        await separateWorker(h);
        const result = await service.getRun(run.id); assert.equal(result.disposition, 'INDETERMINATE');
        assert.equal(result.case.findings.find(f => f.obligationId === extra.id).reason, 'AUTHORITATIVE_REQUIREMENT_UNRESOLVED');
        assert.equal((await service.getRun(original.id)).evidenceDigest, original.evidenceDigest);
    } finally { await worker.close(); await service.close(); }
});
