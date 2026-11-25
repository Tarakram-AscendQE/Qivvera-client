import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setupImpact, author, authority } from './impact-helpers.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openAssuranceRepository } from '../backend/server/assurance/repository.mjs';
import { digest } from '../backend/server/assurance/contracts.mjs';
import { MAX_IMPACT_OBLIGATIONS } from '../backend/server/impact/reader.mjs';
const code = expected => e => e.code === expected;

test('impact / first revision and empty scope produce no invented readiness or baseline', async t => {
    const h = await setupImpact(t), r = await h.report();
    assert.equal(await h.workflow.getSchemaVersion(), 2); assert.equal(r.schema, 'qivvera.impact/1');
    assert.equal(r.baselineRevision, null); assert.equal(r.summary.mandatory, 0); assert.equal(r.assurance.available, false);
    assert.ok(r.guidance.some(g => g.code === 'DECLARE_MANDATORY_SCOPE')); assert.equal(r.disposition, undefined);
});
test('impact / new candidate remains mandatory and requires authority', async t => {
    const h = await setupImpact(t), o = await h.add(), r = await h.report();
    assert.equal(r.summary.mandatory, 1); assert.equal(r.summary.awaitingAuthority, 1);
    assert.equal(r.obligations[0].current.id, o.id); assert.equal(r.obligations[0].comparison, 'NEW');
    assert.equal(r.obligations[0].guidance[0].code, 'AUTHORITY_REQUIRED');
});
test('impact / unchanged copied text still requires fresh authority and evidence', async t => {
    const h = await setupImpact(t), old = await h.accept(await h.add()), next = await h.revise(), r = await h.report(next.revision.id);
    const row = r.obligations[0]; assert.equal(row.comparison, 'COPIED_UNCHANGED'); assert.equal(row.baseline.id, old.id);
    assert.equal(row.current.reviewStatus, 'DRAFT'); assert.equal(row.authorityChanged, true); assert.equal(row.guidance[0].code, 'AUTHORITY_REQUIRED');
    assert.equal(r.revisionDifferences.find(x => x.field === 'sourceRevision').after, 'b'.repeat(40));
});
for (const [label, before, after] of [['case', 'Value must equal Secret.', 'Value must equal secret.'], ['Unicode form', 'Value must equal café.', 'Value must equal cafe\u0301.'], ['internal spacing', 'Value must equal A B.', 'Value must equal A  B.']]) {
    test(`impact / exact ${label} changes are material recorded differences`, async t => {
        const h = await setupImpact(t); await h.add(undefined, { statement: before }); const next = await h.revise();
        await h.edit(next.obligations[0], { statement: after }); const r = await h.report(next.revision.id);
        assert.equal(r.obligations[0].comparison, 'COPIED_CHANGED'); assert.deepEqual(r.obligations[0].differences, [{ field: 'statement', before, after }]);
    });
}
test('impact / source version, source reference and criticality differences remain explicit', async t => {
    const h = await setupImpact(t); await h.add(); const next = await h.revise();
    await h.edit(next.obligations[0], { sourceVersion: '2', sourceReference: 'New policy', criticality: 'CRITICAL' });
    assert.deepEqual((await h.report(next.revision.id)).obligations[0].differences.map(d => d.field), ['sourceReference', 'sourceVersion', 'criticality']);
});
test('impact / identical unlinked wording never invents copied lineage or resolves omitted scope', async t => {
    const h = await setupImpact(t), old = await h.add(), next = await h.revise(undefined, { copyObligations: false });
    await h.add(next.revision.id); const r = await h.report(next.revision.id);
    assert.equal(r.obligations[0].comparison, 'NEW'); assert.equal(r.notCarriedForward[0].id, old.id);
    assert.match(r.notCarriedForward[0].notice, /not a resolution/); assert.equal(r.summary.mandatory, 1);
});
test('impact / earlier rejected scope is retained separately without claiming satisfaction', async t => {
    const h = await setupImpact(t); let o = await h.add(); o = await h.workflow.transitionObligation(o.id, { revisionId: o.revisionId, version: o.version, action: 'SUBMIT' }, author);
    await h.workflow.transitionObligation(o.id, { revisionId: o.revisionId, version: o.version, action: 'REJECT', rationale: 'This statement is outside the declared business scope.' }, authority);
    const next = await h.revise(), r = await h.report(next.revision.id);
    assert.equal(r.summary.mandatory, 0); assert.equal(r.notCarriedForward[0].reviewStatus, 'REJECTED'); assert.match(r.notCarriedForward[0].notice, /history/);
});
test('impact / comparison uses the immediate recorded parent, never a convenient ancestor', async t => {
    const h = await setupImpact(t), first = await h.add(), second = await h.revise(), third = await h.revise(second, { sourceRevision: 'c'.repeat(40) });
    const r = await h.report(third.revision.id); assert.equal(r.baselineRevision.id, second.revision.id);
    assert.equal(r.obligations[0].baseline.id, second.obligations[0].id); assert.notEqual(r.obligations[0].baseline.id, first.id);
});
test('impact / a selected historical revision is inspectable and only points to current work', async t => {
    const h = await setupImpact(t); await h.add(); const next = await h.revise(), r = await h.report();
    assert.equal(r.selectedRevision.isCurrent, false); assert.equal(r.change.currentRevisionId, next.revision.id);
    assert.deepEqual(r.guidance.map(g => g.action), ['OPEN_CURRENT_REVISION']);
    assert.deepEqual(r.obligations[0].guidance.map(g => g.action), ['OPEN_CURRENT_REVISION']);
});
test('impact / missing, malformed and cross-change revision identities fail closed', async t => {
    const h = await setupImpact(t); await assert.rejects(h.impact.get(h.change.id), code('INVALID_FIELD'));
    await assert.rejects(h.impact.get('invalid', h.change.revision.id), code('INVALID_ID'));
    await assert.rejects(h.impact.get(randomUUID(), h.change.revision.id), code('CHANGE_NOT_FOUND'));
    const other = await h.workflow.createChange({ applicationId: h.app.id, title: 'Different scope' }, author);
    await assert.rejects(h.impact.get(h.change.id, other.revision.id), code('REVISION_NOT_FOUND'));
});
test('impact / broken direct-parent lineage cannot produce a report', async t => {
    const h = await setupImpact(t); const next = await h.revise();
    await h.sql(c => c.query('UPDATE change_revisions SET parent_revision_id=NULL WHERE id=$1', [next.revision.id]));
    await assert.rejects(h.report(next.revision.id), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / copy links to a different requirement than their creation history are rejected', async t => {
    const h = await setupImpact(t); const first = await h.add(); const other = await h.add(undefined, { statement: 'A different rule must hold.' }); const next = await h.revise();
    await h.sql(c => c.query('UPDATE obligation_workflow SET copied_from=$1 WHERE obligation_id=$2', [other.id, next.obligations.find(o => o.copiedFrom === first.id).id]));
    await assert.rejects(h.report(next.revision.id), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / missing current human history fails without inventing authority', async t => {
    const h = await setupImpact(t), o = await h.accept(await h.add());
    await h.sql(c => c.query('DELETE FROM obligation_history WHERE obligation_id=$1 AND version=$2', [o.id, o.version]));
    await assert.rejects(h.report(), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / altered current wording without a matching history record fails integrity', async t => {
    const h = await setupImpact(t), o = await h.add();
    await h.sql(c => c.query("UPDATE obligations SET statement='Altered stored wording' WHERE id=$1", [o.id]));
    await assert.rejects(h.report(), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / report digest is stable across observation times and changes when scope changes', async t => {
    let clock = Date.now(); const h = await setupImpact(t, { clock: () => clock }), one = await h.report(); clock += 1000; const two = await h.report();
    assert.equal(one.snapshotDigest, two.snapshotDigest); assert.notEqual(one.generatedAt, two.generatedAt);
    const { generatedAt, snapshotDigest, ...content } = two; assert.equal(digest(content), snapshotDigest);
    await h.add(); assert.notEqual((await h.report()).snapshotDigest, two.snapshotDigest);
});
test('impact / the supported scope boundary is inclusive and excess is never silently truncated', async t => {
    const h = await setupImpact(t);
    for (let i = 0; i < MAX_IMPACT_OBLIGATIONS; i++) await h.add(undefined, { statement: `Requirement ${i} must remain visible.` });
    assert.equal((await h.report()).obligations.length, MAX_IMPACT_OBLIGATIONS);
    await h.add(undefined, { statement: 'The excess requirement must not disappear.' });
    await assert.rejects(h.report(), e => e.code === 'IMPACT_SCOPE_LIMIT' && e.status === 422);
});
test('impact / real assessment support appears only on its current selected inputs', async t => {
    const h = await setupImpact(t, { assurance: true }), run = await h.run(), r = await h.report();
    assert.equal(r.assurance.latestRun.id, run.id); assert.equal(r.assurance.latestRun.currentDisposition, 'READY');
    assert.equal(r.obligations[0].guidance[0].code, 'INSPECT_BOUNDED_SUPPORT'); assert.equal(r.assurance.plan.current, true);
});
test('impact / real failure remains a counterexample requiring inspection and resolution', async t => {
    const h = await setupImpact(t, { assurance: true, mode: 'self-approval-defect' }); await h.run(); const r = await h.report();
    assert.equal(r.assurance.latestRun.currentDisposition, 'NOT_READY'); assert.equal(r.obligations[0].guidance[0].code, 'COUNTEREXAMPLE_REQUIRES_RESOLUTION');
});
test('impact / latest insufficient target observations are not labeled supported', async t => {
    const h = await setupImpact(t, { assurance: true, mode: 'reject-all' }); await h.run(); const r = await h.report();
    assert.equal(r.assurance.latestRun.currentDisposition, 'INDETERMINATE'); assert.equal(r.obligations[0].guidance[0].code, 'INSUFFICIENT_EVIDENCE');
});
test('impact / same-revision changes show exact assessment-input differences and preserve old proof', async t => {
    const h = await setupImpact(t, { assurance: true }), old = await h.run(); await h.edit(h.obligation, { sourceVersion: '2', statement: 'A modified requirement must hold.' });
    const r = await h.report(), latest = r.assurance.latestRun;
    assert.equal(latest.applicability, 'STALE_INPUTS'); assert.equal(latest.recordedDisposition, 'READY'); assert.equal(latest.currentDisposition, null);
    assert.ok(latest.inputDifferences.some(d => d.field.endsWith('/ statement') && d.before === h.obligation.statement));
    assert.ok(latest.inputDifferences.some(d => d.field.endsWith('/ sourceVersion') && d.after === '2'));
    assert.equal((await h.service.getRun(old.id)).evidenceDigest, old.evidenceDigest);
});
test('impact / copied requirements show prior explicit mappings only as fresh-review hints', async t => {
    const h = await setupImpact(t, { assurance: true }); await h.run(); const next = await h.revise(), r = await h.report(next.revision.id), row = r.obligations[0];
    assert.equal(row.priorMappingHint.checkId, 'separation'); assert.equal(row.priorMappingHint.contentUnchanged, true);
    assert.match(row.priorMappingHint.notice, /Fresh authority/); assert.equal(r.assurance.plan, null); assert.equal(r.assurance.latestRun, null);
    assert.equal(row.guidance[0].code, 'AUTHORITY_REQUIRED'); assert.equal(r.assurance.targetOptions.length, 0);
});
test('impact / changed copied wording cannot masquerade as unchanged mapping context', async t => {
    const h = await setupImpact(t, { assurance: true }); await h.plan(); const next = await h.revise(); await h.edit(next.obligations[0], { statement: 'The approved record must preserve an additional field.' });
    assert.equal((await h.report(next.revision.id)).obligations[0].priorMappingHint.contentUnchanged, false);
});
test('impact / historical evidence keeps its recorded result without establishing current readiness', async t => {
    const h = await setupImpact(t, { assurance: true }); await h.run(); await h.revise(); const r = await h.report();
    assert.equal(r.assurance.latestRun.recordedDisposition, 'READY'); assert.equal(r.assurance.latestRun.currentDisposition, null);
    assert.equal(r.assurance.latestRun.applicability, 'HISTORICAL_REVISION'); assert.equal(r.assurance.plan.current, false);
});
test('impact / latest cancelled attempt is shown instead of cherry-picking an earlier pass', async t => {
    const h = await setupImpact(t, { assurance: true }); const old = await h.run(), latest = await h.queue(); await h.service.cancel(latest.id, author);
    const r = await h.report(); assert.notEqual(r.assurance.latestRun.id, old.id); assert.equal(r.assurance.latestRun.status, 'CANCELLED');
    assert.equal(r.assurance.latestRun.currentDisposition, null); assert.ok(r.guidance.some(g => g.code === 'EXECUTION_REVIEW_REQUIRED'));
});
test('impact / observing expired queued work neither expires nor rewrites the database', async t => {
    let clock = Date.now(); const h = await setupImpact(t, { assurance: true, clock: () => clock }), queued = await h.queue(); clock += 600001;
    const before = await h.sql(c => c.query('SELECT * FROM assurance_runs WHERE id=$1', [queued.id]));
    const r = await h.report(); assert.equal(r.assurance.latestRun.status, 'QUEUED'); assert.equal(r.assurance.latestRun.observedStatus, 'QUEUE_DEADLINE_EXCEEDED');
    assert.equal(r.assurance.latestRun.currentDisposition, null);
    const after = await h.sql(c => c.query('SELECT * FROM assurance_runs WHERE id=$1', [queued.id])); assert.deepEqual(after.rows, before.rows);
});
test('impact / observing an expired worker lease is read-only and supplies no result', async t => {
    let clock = Date.now(); const h = await setupImpact(t, { assurance: true, clock: () => clock }), queued = await h.queue(); await h.worker.claim('impact-test-worker'); clock += 120001;
    const r = await h.report(); assert.equal(r.assurance.latestRun.observedStatus, 'WORKER_LEASE_EXPIRED'); assert.equal(r.assurance.latestRun.status, 'RUNNING');
    assert.equal((await h.sql(c => c.query('SELECT status FROM assurance_runs WHERE id=$1', [queued.id]))).rows[0].status, 'RUNNING');
});
for (const kind of ['missing', 'corrupt']) test(`impact / ${kind} latest evidence is visible and cannot produce a disposition`, async t => {
    const h = await setupImpact(t, { assurance: true }), run = await h.run();
    await h.sql(c => c.query(kind === 'missing' ? 'DELETE FROM assurance_evidence WHERE run_id=$1' : "UPDATE assurance_evidence SET manifest='{}' WHERE run_id=$1", [run.id]));
    const r = await h.report(); assert.equal(r.assurance.latestRun.recordedDisposition, null); assert.equal(r.assurance.latestRun.currentDisposition, null);
    assert.ok(r.guidance.some(g => g.code === 'EVIDENCE_INTEGRITY_REVIEW')); assert.deepEqual(r.assurance.latestRun.findings, []);
});
test('impact / missing referenced counterevidence cannot become a clean report', async t => {
    const h = await setupImpact(t, { assurance: true, mode: 'intermittent' }), one = await h.run(); await h.run();
    await h.sql(c => c.query('DELETE FROM assurance_evidence WHERE run_id=$1', [one.id]));
    const r = await h.report(); assert.equal(r.assurance.latestRun.evidenceIntegrity, 'COUNTEREVIDENCE_UNAVAILABLE'); assert.equal(r.assurance.latestRun.currentDisposition, null);
});
test('impact / new approved plan explains why a prior assessment is non-current', async t => {
    const h = await setupImpact(t, { assurance: true }); await h.run(); const plan = await h.plan(), r = await h.report();
    assert.equal(r.assurance.latestRun.currentDisposition, null); assert.ok(r.assurance.latestRun.inputDifferences.some(d => d.field === 'Approved plan' && d.after === plan.id));
});
test('impact / target drift invalidates plan and evidence without exposing configuration secrets', async t => {
    const h = await setupImpact(t, { assurance: true }); await h.run();
    const fresh = await openWorkflowRepository({ ...h.readerOptions, impact: { ...h.readerOptions.impact, targets: [{ ...h.target, instanceId: 'new-instance' }] } }); t.after(() => fresh.close());
    const r = await fresh.impact.get(h.change.id, h.change.revision.id), serialized = JSON.stringify(r);
    assert.equal(r.assurance.plan.current, false); assert.ok(r.assurance.plan.reasons.some(x => x.code === 'TARGET_CONFIGURATION_CHANGED'));
    assert.equal(r.assurance.latestRun.currentDisposition, null);
    for (const value of [h.target.origin, h.target.requesterTokenEnv, h.target.approverTokenEnv, h.makerToken, h.checkerToken, h.target.requesterId, h.target.approverId]) assert.ok(!serialized.includes(value), value);
});
test('impact / enabled assurance on incompatible schema fails instead of pretending no evidence exists', async t => {
    const h = await setupImpact(t), fresh = await openWorkflowRepository({ ...h.db, impact: { assuranceEnabled: true } }); t.after(() => fresh.close());
    await assert.rejects(fresh.impact.get(h.change.id, h.change.revision.id), code('IMPACT_ASSURANCE_UNAVAILABLE'));
});
test('impact / damage to an approved plan snapshot cannot manufacture clean guidance', async t => {
    const h = await setupImpact(t, { assurance: true }), p = await h.plan();
    await h.sql(c => c.query("UPDATE assurance_plans SET snapshot='{}' WHERE id=$1", [p.id]));
    await assert.rejects(h.report(), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / queued run cannot substitute a snapshot different from its referenced plan', async t => {
    const h = await setupImpact(t, { assurance: true }), r = await h.queue();
    await h.sql(c => c.query("UPDATE assurance_runs SET snapshot='{}' WHERE id=$1", [r.id]));
    await assert.rejects(h.report(), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / multi-obligation report retains every mandatory item and exposes supported checks without automapping', async t => {
    const h = await setupImpact(t, { assurance: true, generalization: true }); await h.run(); const extra = await h.add(), r = await h.report();
    assert.equal(r.summary.mandatory, 3); assert.equal(r.assurance.checks.length, 2); assert.equal(r.assurance.latestRun.currentDisposition, null);
    assert.equal(r.obligations.find(o => o.current.id === extra.id).guidance[0].code, 'AUTHORITY_REQUIRED');
    assert.equal(r.assurance.plan.mappings.length, 2); assert.equal(r.assurance.plan.current, false);
});
test('impact / disabling multi-profile support does not present its saved pass as current', async t => {
    const h = await setupImpact(t, { assurance: true, generalization: true }); await h.run();
    const fresh = await openWorkflowRepository({ ...h.readerOptions, impact: { ...h.readerOptions.impact, generalizationEnabled: false } }); t.after(() => fresh.close());
    const r = await fresh.impact.get(h.change.id, h.change.revision.id); assert.equal(r.assurance.checks.length, 1);
    assert.equal(r.assurance.latestRun.currentDisposition, null); assert.equal(r.assurance.latestRun.recordedDisposition, 'READY');
    assert.ok(r.assurance.plan.reasons.some(x => x.code === 'GENERALIZATION_DISABLED'));
});
test('impact / report reads do not append activity, approve plans, create runs or change requirements', async t => {
    const h = await setupImpact(t, { assurance: true }); await h.run();
    const tables = ['activity', 'obligations', 'obligation_workflow', 'obligation_history', 'assurance_plans', 'assurance_runs', 'assurance_evidence'];
    const snapshot = () => h.sql(async c => Promise.all(tables.map(async table => (await c.query('SELECT * FROM ' + table)).rows)));
    const before = await snapshot(); await h.report(); await h.report(); assert.deepEqual(await snapshot(), before);
});

test('impact / founder review remains explicitly qualified in the self-contained report', async t => {
    const h = await setupImpact(t); await h.add(); const independent = await h.report();
    const founder = await openWorkflowRepository({ ...h.db, reviewMode: 'founder-review', impact: { reviewMode: 'independent' } }); t.after(() => founder.close());
    const r = await founder.impact.get(h.change.id, h.change.revision.id);
    assert.equal(r.reviewMode, 'founder-review'); assert.notEqual(r.snapshotDigest, independent.snapshotDigest);
    assert.ok(r.limitations.some(x => /does not establish independent human approval/.test(x)));
    assert.match(r.obligations[0].guidance[0].message, /permits founder review/);
});
test('impact / corrupted evidence takes priority over generic reassessment advice after scope drift', async t => {
    const h = await setupImpact(t, { assurance: true }), run = await h.run(); await h.add();
    await h.sql(c => c.query('DELETE FROM assurance_evidence WHERE run_id=$1', [run.id]));
    const r = await h.report(); assert.equal(r.assurance.latestRun.applicability, 'STALE_INPUTS');
    assert.equal(r.obligations.find(o => o.current.id === h.obligation.id).guidance[0].code, 'EVIDENCE_INTEGRITY_REVIEW');
});
test('impact / changed stored source identity is an explicit difference from frozen assessment inputs', async t => {
    const h = await setupImpact(t, { assurance: true }); await h.run();
    await h.sql(c => c.query('UPDATE change_revisions SET source_revision=$1 WHERE id=$2', ['b'.repeat(40), h.change.revision.id]));
    const r = await h.report(); assert.deepEqual(r.assurance.latestRun.inputDifferences.find(d => d.field === 'sourceRevision'), { field: 'sourceRevision', before: 'a'.repeat(40), after: 'b'.repeat(40) });
    assert.equal(r.assurance.latestRun.currentDisposition, null);
});
test('impact / latest plan cannot silently claim a different change identity', async t => {
    const h = await setupImpact(t, { assurance: true }), p = await h.plan();
    const other = await h.workflow.createChange({ applicationId: h.app.id, title: 'Unrelated change' }, author);
    await h.sql(c => c.query('UPDATE assurance_plans SET change_id=$1 WHERE id=$2', [other.id, p.id]));
    await assert.rejects(h.report(), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / plan acceptance identity must match the actual saved human decision', async t => {
    const h = await setupImpact(t, { assurance: true }), p = await h.plan();
    await h.sql(c => c.query("UPDATE obligation_history SET actor='altered@example.test' WHERE id=$1", [p.snapshot.mapping.acceptanceDecisionId]));
    await assert.rejects(h.report(), code('IMPACT_RECORD_INTEGRITY'));
});

for (const selectedParent of [false, true]) test(`impact / an orphaned ${selectedParent ? 'parent' : 'selected'} obligation cannot silently disappear from scope`, async t => {
    const h = await setupImpact(t), o = await h.add(), next = selectedParent ? await h.revise() : null;
    await h.sql(c => c.query('DELETE FROM obligation_workflow WHERE obligation_id=$1', [o.id]));
    await assert.rejects(h.report(next?.revision.id), code('IMPACT_RECORD_INTEGRITY'));
});
test('impact / moving a workflow membership away from its historical revision fails closed', async t => {
    const h = await setupImpact(t), o = await h.add(), next = await h.revise(undefined, { copyObligations: false });
    await h.sql(c => c.query('UPDATE obligation_workflow SET revision_id=$1 WHERE obligation_id=$2', [next.revision.id, o.id]));
    await assert.rejects(h.report(next.revision.id), code('IMPACT_RECORD_INTEGRITY'));
});
