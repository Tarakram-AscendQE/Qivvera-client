/** Read-only declared-scope comparison. This module never mutates records or contacts a target. */
import { InputError, identifier } from '../workflow-input.mjs';
import { digest, PROFILE, publicTarget, verifierDigest } from '../assurance/contracts.mjs';
import { CHECKS, PROFILE_V2, isV2, mappingsOf, validateTargets, verificationIdentity } from '../assurance/generalization.mjs';
import { createAssuranceReadModel } from '../assurance/read-model.mjs';
import { assuranceChecksum } from '../assurance/migration.mjs';
import { resolutionChecksum } from '../resolution/migration.mjs';
import { intakeChecksum } from '../intake/migration.mjs';

export const MAX_IMPACT_OBLIGATIONS = 500;
const contentFields = ['statement', 'sourceReference', 'sourceVersion', 'criticality'];
const fail = (code, message, status = 409) => { throw new InputError(code, message, status); };
const integrity = () => fail('IMPACT_RECORD_INTEGRITY', 'The saved records cannot support a reliable impact report. Ask the deployment owner to inspect the original records.');
const guidance = (code, message, action, role = 'ANY') => ({ code, message, action, role });
const differences = (before, after, keys = contentFields) => keys.filter(key => before[key] !== after[key]).map(field => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
const safeTarget = t => ({ id: t.id, name: t.name, sourceRevision: t.sourceRevision, artifactDigest: t.artifactDigest, environmentDigest: t.environmentDigest, instanceId: t.instanceId, adapterId: t.adapterId ?? 'approval-v1' });
const safeRevision = (r, currentId) => ({ id: r.id, number: Number(r.revision_number), parentRevisionId: r.parent_revision_id, sourceRevision: r.source_revision || null, intent: r.intent, producer: r.producer, reason: r.reason, isCurrent: r.id === currentId });
const safeObligation = o => ({ id: o.id, version: Number(o.version), revisionId: o.revision_id, statement: o.statement, sourceReference: o.source_reference, sourceVersion: o.source_version, criticality: o.criticality, reviewStatus: o.review_state, copiedFrom: o.copied_from || null });
const parsed = value => { try { const result = JSON.parse(value); if (!result || typeof result !== 'object' || Array.isArray(result)) return integrity(); return result; } catch { return integrity(); } };
const checkTitle = id => CHECKS.find(c => c.id === id)?.title ?? 'Unknown recorded check';
const fullSource = value => typeof value === 'string' && /^([a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const limits = Object.freeze([
    'This report compares recorded revision, requirement, review and assurance inputs. It does not inspect source-code changes, dependencies or undeclared requirements.',
    'Recorded fields that are unchanged do not establish unchanged software behaviour. Every non-rejected obligation on the selected revision remains mandatory.',
    'Copy links establish recorded lineage only. Earlier authority decisions, mappings, observations and dispositions do not transfer to a new revision.',
    'Suggested next steps and prior mapping hints require human judgment. This report never approves a requirement or plan, starts verification, resolves a finding or changes a disposition.',
    'Source references and target identities retain their existing declared/operator-pinned qualifications. A report digest identifies content; it is not a signature or independent attestation.',
    'The report is an observation of one database snapshot. Refresh after changes; existing mutation routes recheck their own authority and current inputs.'
]);

export function createImpactReader(db, options = {}) {
    const assuranceEnabled = options.assuranceEnabled === true;
    const reviewMode = options.reviewMode ?? 'independent';
    if (!['independent', 'founder-review'].includes(reviewMode)) throw new Error('INVALID_REVIEW_MODE');
    const generalizationEnabled = options.generalizationEnabled === true;
    const catalogue = assuranceEnabled ? validateTargets(options.targets ?? [], { local: options.allowLocalTargets === true }) : [];
    const model = createAssuranceReadModel(db, catalogue);
    const now = options.now ?? Date.now;

    async function loadObligations(c, changeId, revisionId) {
        // Historical membership guards against silently shrinking scope after a broken join.
        const orphaned = Number((await c.query('SELECT COUNT(*) AS n FROM obligations o LEFT JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.change_id=$1 AND w.obligation_id IS NULL', [changeId])).rows[0].n);
        const misplaced = Number((await c.query('SELECT COUNT(DISTINCT h.obligation_id) AS n FROM obligation_history h LEFT JOIN obligation_workflow w ON w.obligation_id=h.obligation_id LEFT JOIN obligations o ON o.id=h.obligation_id WHERE h.revision_id=$1 AND (w.obligation_id IS NULL OR o.id IS NULL OR w.revision_id<>h.revision_id OR o.change_id<>$2)', [revisionId, changeId])).rows[0].n);
        if (orphaned || misplaced) integrity();
        const count = Number((await c.query('SELECT COUNT(*) AS n FROM obligation_workflow WHERE revision_id=$1', [revisionId])).rows[0].n);
        if (count > MAX_IMPACT_OBLIGATIONS) fail('IMPACT_SCOPE_LIMIT', `This report supports at most ${MAX_IMPACT_OBLIGATIONS} obligations per revision. No obligations were omitted.`, 422);
        const rows = (await c.query('SELECT o.*,w.revision_id,w.source_version,w.review_state,w.copied_from,w.imported,h.id AS history_id,h.revision_id AS history_revision_id,h.action AS history_action,h.snapshot AS history_snapshot FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id LEFT JOIN obligation_history h ON h.obligation_id=o.id AND h.version=o.version WHERE w.revision_id=$1 ORDER BY o.created_at,o.id', [revisionId])).rows;
        if (rows.length !== count || rows.some(o => o.change_id !== changeId)) integrity();
        for (const o of rows) {
            if (!o.history_id || o.history_revision_id !== revisionId) integrity();
            const snapshot = parsed(o.history_snapshot), view = safeObligation(o);
            const keys = o.history_action === 'IMPORTED' ? contentFields.filter(k => k !== 'sourceVersion').concat('reviewStatus') : [...contentFields, 'id', 'version', 'revisionId', 'reviewStatus', 'copiedFrom'];
            if (keys.some(k => (snapshot[k] ?? null) !== (view[k] ?? null))) integrity();
            if (o.review_state === 'ACCEPTED' && o.history_action !== 'ACCEPT' || o.review_state === 'REJECTED' && o.history_action !== 'REJECT') integrity();
        }
        return rows;
    }
    async function planFor(c, ctx, suppliedRow) {
        const row = suppliedRow ?? await model.latestPlan(c, ctx.revision.id);
        if (!row) return null;
        const snapshot = parsed(row.snapshot);
        if (row.change_id !== ctx.change.id || row.revision_id !== ctx.revision.id || !snapshot || !['qivvera.assurance-plan/1', 'qivvera.assurance-plan/2'].includes(snapshot.schema) ||
            snapshot.scope?.changeId !== ctx.change.id || snapshot.scope?.revisionId !== ctx.revision.id ||
            snapshot.scope?.applicationId !== ctx.change.application_id || snapshot.scopeDigest !== row.scope_digest ||
            digest(snapshot.scope) !== row.scope_digest || !snapshot.profile || typeof snapshot.profile !== 'object' || snapshot.profileDigest !== digest(snapshot.profile) ||
            !snapshot.target || snapshot.target.applicationId !== ctx.change.application_id || snapshot.target.sourceRevision !== snapshot.scope.sourceRevision || !Array.isArray(snapshot.scope.obligations)) integrity();
        let mappings;
        try { mappings = mappingsOf(snapshot); } catch { integrity(); }
        if (!Array.isArray(mappings) || mappings.length < 1 || mappings.length > (isV2(snapshot) ? 2 : 1)) integrity();
        const ids = new Set(), checks = new Set();
        if (snapshot.scope.obligations.some(o => !o || typeof o !== 'object' || !o.id)) integrity();
        for (const m of mappings) {
            if (!m || typeof m !== 'object') integrity();
            const o = snapshot.scope.obligations.find(o => o.id === m.obligationId);
            if (!o || o.reviewStatus !== 'ACCEPTED' || o.version !== m.obligationVersion || o.reviewDecision?.id !== m.acceptanceDecisionId ||
                o.reviewDecision?.action !== 'ACCEPT' || ids.has(m.obligationId) || checks.has(m.checkId) || !CHECKS.some(c => c.id === m.checkId)) integrity();
            const accepted = (await c.query('SELECT * FROM obligation_history WHERE id=$1', [m.acceptanceDecisionId])).rows[0];
            if (!accepted || accepted.obligation_id !== m.obligationId || accepted.revision_id !== ctx.revision.id || Number(accepted.version) !== m.obligationVersion || accepted.action !== 'ACCEPT' ||
                accepted.actor !== m.acceptedBy || accepted.actor !== o.reviewDecision.actor || !!Number(accepted.independent_actor) !== m.independentReviewer || !!Number(accepted.independent_actor) !== o.reviewDecision.independentActor ||
                differences(parsed(accepted.snapshot), o).length) integrity();
            ids.add(m.obligationId); checks.add(m.checkId);
        }
        const reasons = [], target = catalogue.find(t => t.id === snapshot.target.id);
        if (snapshot.scopeDigest !== ctx.scopeDigest) reasons.push({ code: 'SCOPE_CHANGED', message: 'Recorded obligations or authority decisions changed after this plan was approved.' });
        if (!target) reasons.push({ code: 'TARGET_UNAVAILABLE', message: 'The plan target is no longer configured.' });
        else if (digest(publicTarget(target)) !== digest(snapshot.target)) reasons.push({ code: 'TARGET_CONFIGURATION_CHANGED', message: 'The configured target identity or connection settings differ from the approved plan.' });
        if (isV2(snapshot) && !generalizationEnabled) reasons.push({ code: 'GENERALIZATION_DISABLED', message: 'The recorded multi-obligation profile is not enabled in this workspace.' });
        let verifierMatches = false;
        try {
            verifierMatches = isV2(snapshot) ? snapshot.profileDigest === digest(PROFILE_V2) && mappings.every(m => digest(m.verifier) === digest(verificationIdentity(m.checkId, snapshot.target.adapterId ?? 'approval-v1'))) : snapshot.profileDigest === digest(PROFILE) && snapshot.verifier?.digest === verifierDigest();
        } catch { verifierMatches = false; }
        if (!verifierMatches) reasons.push({ code: 'PROFILE_OR_VERIFIER_CHANGED', message: 'The recorded profile or verifier differs from this application version.' });
        return { row, snapshot, mappings, view: { id: row.id, version: Number(row.version), current: reasons.length === 0 && ctx.isCurrent,
            reasons: [...reasons, ...(!ctx.isCurrent ? [{ code: 'HISTORICAL_REVISION', message: 'This plan belongs to an earlier revision.' }] : [])],
            mappings: mappings.map(m => ({ obligationId: m.obligationId, checkId: m.checkId, checkTitle: checkTitle(m.checkId) })), target: safeTarget(snapshot.target) } };
    }
    function inputDifferences(snapshot, ctx, latestPlan) {
        const out = differences({ sourceRevision: snapshot.scope.sourceRevision }, { sourceRevision: ctx.scope.sourceRevision }, ['sourceRevision']);
        const old = new Map(snapshot.scope.obligations.map(o => [o.id, o])), current = new Map(ctx.scope.obligations.map(o => [o.id, o]));
        for (const id of new Set([...old.keys(), ...current.keys()])) {
            const before = old.get(id), after = current.get(id);
            if (!before || !after) out.push({ field: `Obligation ${id}`, before: before?.statement ?? null, after: after?.statement ?? null });
            else {
                for (const d of differences(before, after, [...contentFields, 'version', 'reviewStatus'])) out.push({ ...d, field: `Obligation ${id} / ${d.field}` });
                if (digest(before.reviewDecision) !== digest(after.reviewDecision)) out.push({ field: `Obligation ${id} / reviewDecision`, before: before.reviewDecision?.id ?? null, after: after.reviewDecision?.id ?? null });
            }
        }
        if (latestPlan && snapshot.scopeDigest !== latestPlan.snapshot.scopeDigest) out.push({ field: 'Approved plan scope', before: snapshot.scopeDigest, after: latestPlan.snapshot.scopeDigest });
        return out;
    }
    async function latestRunFor(c, ctx, plan, observedAt) {
        const row = (await c.query('SELECT * FROM assurance_runs WHERE revision_id=$1 ORDER BY run_number DESC LIMIT 1', [ctx.revision.id])).rows[0];
        if (!row) return null;
        if (row.change_id !== ctx.change.id) integrity();
        const snapshot = parsed(row.snapshot);
        if (snapshot.scope?.revisionId !== ctx.revision.id || snapshot.scope?.changeId !== ctx.change.id || snapshot.scopeDigest !== digest(snapshot.scope)) integrity();
        // Validate the referenced plan too: a run cannot silently replace its frozen plan input.
        const saved = (await c.query('SELECT * FROM assurance_plans WHERE id=$1', [row.plan_id])).rows[0];
        if (!saved || saved.revision_id !== ctx.revision.id || saved.change_id !== ctx.change.id || digest(parsed(saved.snapshot)) !== digest(snapshot)) integrity();
        await planFor(c, ctx, saved);
        let run;
        try { run = await model.viewRun(c, row, ctx); } catch { integrity(); }
        const expired = row.status === 'QUEUED' && Number(row.queued_deadline) <= observedAt ? 'QUEUE_DEADLINE_EXCEEDED' : row.status === 'RUNNING' && Number(row.lease_until) <= observedAt ? 'WORKER_LEASE_EXPIRED' : null;
        const valid = row.status === 'COMPLETED' && run.evidenceIntegrity === 'DIGEST_MATCH';
        const applicability = isV2(snapshot) && !generalizationEnabled || ctx.isCurrent && !plan?.view.current ? 'STALE_INPUTS' : run.applicability;
        const changed = inputDifferences(snapshot, ctx, plan);
        if (plan?.row.id !== row.plan_id) changed.push({ field: 'Approved plan', before: row.plan_id, after: plan?.row.id ?? null });
        if (!model.configured(snapshot)) changed.push({ field: 'Target or verifier configuration', before: 'Recorded configuration', after: 'Configuration differs or is unavailable' });
        return { id: row.id, number: Number(row.run_number), status: row.status, observedStatus: expired ?? row.status, applicability,
            evidenceIntegrity: run.evidenceIntegrity, evidenceDigest: run.evidenceDigest, recordedDisposition: valid ? run.disposition : null,
            currentDisposition: valid && ctx.isCurrent && applicability === 'CURRENT' ? run.disposition : null, failureCode: expired ?? row.failure_code,
            findings: valid ? (run.case?.findings ?? []).map(f => ({ obligationId: f.obligationId, state: f.state, reason: f.reason })) : [], inputDifferences: changed };
    }
    function rowGuidance(row, selected, assurance, plan) {
        const o = row.current;
        if (!selected.isCurrent) return [guidance('HISTORICAL_REVISION', 'Inspect this earlier revision as history. Continue work on the current revision.', 'OPEN_CURRENT_REVISION')];
        if (o.reviewStatus === 'REJECTED') return [guidance('REJECTED_BY_AUTHORITY', 'This recorded rejection excludes the obligation from current mandatory scope. It is not evidence of satisfied behaviour.', 'REVIEW_OBLIGATIONS')];
        if (o.reviewStatus !== 'ACCEPTED') return [guidance('AUTHORITY_REQUIRED', o.reviewStatus === 'IN_REVIEW' ? 'A permitted Policy Authority must decide the pending review before this requirement can be mapped.' : reviewMode === 'independent' ? 'Prepare this candidate and submit it for independent authority review. Prior acceptance does not transfer.' : 'Prepare this candidate and submit it for review. This workspace permits founder review and does not establish independent human approval. Prior acceptance does not transfer.', 'REVIEW_OBLIGATIONS', o.reviewStatus === 'IN_REVIEW' ? 'POLICY_AUTHORITY' : 'AUTHOR')];
        if (!assurance.available) return [guidance('ASSURANCE_UNAVAILABLE', 'The accepted requirement remains mandatory. Ask the deployment owner to configure supported verification.', 'CONTACT_OPERATOR', 'OPERATOR')];
        if (assurance.latestRun?.status === 'COMPLETED' && assurance.latestRun.evidenceIntegrity !== 'DIGEST_MATCH') return [guidance('EVIDENCE_INTEGRITY_REVIEW', 'The latest saved evidence is missing or fails integrity checks. Investigate it before drawing assurance conclusions.', 'CONTACT_OPERATOR', 'OPERATOR')];
        if (!plan?.view.current || !plan.mappings.some(m => m.obligationId === o.id)) return [guidance('MAPPING_REVIEW_REQUIRED', 'An eligible Policy Authority must judge a supported check against this requirement and approve a current plan. Unmapped requirements remain gaps.', 'REVIEW_PLAN', 'POLICY_AUTHORITY')];
        const latest = assurance.latestRun;
        if (!latest || latest.applicability !== 'CURRENT') return [guidance('FRESH_ASSESSMENT_REQUIRED', 'Obtain fresh evidence under the current approved plan. Earlier observations remain historical.', 'REQUEST_ASSESSMENT', 'AUTHOR')];
        if (latest.observedStatus !== latest.status || ['FAILED', 'CANCELLED'].includes(latest.status)) return [guidance('EXECUTION_REVIEW_REQUIRED', 'The latest attempt did not establish a completed assessment. Inspect the failure or interruption before explicitly requesting another run.', 'INSPECT_ASSESSMENT')];
        if (['QUEUED', 'RUNNING'].includes(latest.status)) return [guidance('ASSESSMENT_IN_PROGRESS', 'The latest assessment is still pending; it supplies no disposition.', 'INSPECT_ASSESSMENT')];
        const finding = latest.findings.find(f => f.obligationId === o.id);
        if (finding?.state === 'VIOLATED') return [guidance('COUNTEREXAMPLE_REQUIRES_RESOLUTION', 'Inspect the valid counterexample and use the correction and resolution workflow. A later pass alone does not erase it.', 'INSPECT_ASSESSMENT')];
        if (finding?.state === 'SUPPORTED') return [guidance('INSPECT_BOUNDED_SUPPORT', 'The latest current assessment supports this obligation within its recorded limits. Inspect the evidence and the rest of mandatory scope.', 'INSPECT_ASSESSMENT')];
        return [guidance('INSUFFICIENT_EVIDENCE', 'The latest assessment does not support this mandatory obligation. Inspect its stated gap and plan the needed verification.', 'INSPECT_ASSESSMENT')];
    }
    return Object.freeze({
        async get(changeId, revisionId) {
            identifier(changeId, 'Change'); identifier(revisionId, 'Selected revision');
            return db.transaction(async c => {
                const observedAt = now();
                const change = (await c.query('SELECT * FROM changes WHERE id=$1', [changeId])).rows[0];
                if (!change) fail('CHANGE_NOT_FOUND', 'Change not found.', 404);
                const selected = (await c.query('SELECT * FROM change_revisions WHERE id=$1 AND change_id=$2', [revisionId, changeId])).rows[0];
                if (!selected) fail('REVISION_NOT_FOUND', 'Revision does not belong to this change.', 404);
                const head = (await c.query('SELECT id FROM change_revisions WHERE change_id=$1 ORDER BY revision_number DESC LIMIT 1', [changeId])).rows[0];
                const parent = selected.parent_revision_id ? (await c.query('SELECT * FROM change_revisions WHERE id=$1', [selected.parent_revision_id])).rows[0] : null;
                if (selected.parent_revision_id && (!parent || parent.change_id !== changeId || Number(parent.revision_number) !== Number(selected.revision_number) - 1) || !selected.parent_revision_id && Number(selected.revision_number) !== 1) integrity();
                const currentRows = await loadObligations(c, changeId, revisionId), parentRows = parent ? await loadObligations(c, changeId, parent.id) : [];
                const selectedRevision = safeRevision(selected, head.id), baselineRevision = parent ? safeRevision(parent, head.id) : null;
                const baseline = new Map(parentRows.map(o => [o.id, safeObligation(o)])), linked = new Set(), rows = [];
                const creation = new Map((await c.query('SELECT h.* FROM obligation_history h JOIN obligation_workflow w ON w.obligation_id=h.obligation_id WHERE w.revision_id=$1 AND h.version=1', [revisionId])).rows.map(h => [h.obligation_id, h]));
                for (const o of currentRows) {
                    const current = safeObligation(o), before = current.copiedFrom ? baseline.get(current.copiedFrom) : null;
                    if (current.copiedFrom) {
                        if (!before || linked.has(current.copiedFrom)) integrity();
                        const first = creation.get(o.id), initial = first ? parsed(first.snapshot) : null;
                        if (!first || first.revision_id !== revisionId || first.action !== 'COPIED_TO_REVISION' || Number(first.version) !== 1 || initial?.id !== o.id || initial?.changeId !== changeId || initial?.copiedFrom !== before.id || initial?.revisionId !== revisionId || differences(before, initial).length) integrity();
                        linked.add(current.copiedFrom);
                    }
                    const changed = before ? differences(before, current) : [];
                    rows.push({ current, baseline: before ?? null, comparison: before ? changed.length ? 'COPIED_CHANGED' : 'COPIED_UNCHANGED' : 'NEW', differences: changed,
                        authorityChanged: !!before && (before.reviewStatus !== current.reviewStatus || before.id !== current.id), priorMappingHint: null, guidance: [] });
                }
                const ctx = await model.context(c, changeId, revisionId);
                const assurance = { available: assuranceEnabled, scopeDigest: ctx.scopeDigest, plan: null, latestRun: null, checks: [], targetOptions: [] };
                let plan = null, parentPlan = null;
                if (assuranceEnabled) {
                    const versions = (await c.query('SELECT version,checksum FROM qivvera_migrations ORDER BY version')).rows;
                    const required = [[3, assuranceChecksum], ...(generalizationEnabled ? [[4, resolutionChecksum], [5, intakeChecksum]] : [])];
                    if (versions.some(v => Number(v.version) > 9) || required.some(([version, checksum]) => !versions.some(v => Number(v.version) === version && v.checksum === checksum))) fail('IMPACT_ASSURANCE_UNAVAILABLE', 'Configured assurance records require compatible, verified migrations. Ask the deployment owner to check the schema.');
                    plan = await planFor(c, ctx);
                    if (parent) parentPlan = await planFor(c, await model.context(c, changeId, parent.id));
                    assurance.plan = plan?.view ?? null;
                    assurance.latestRun = await latestRunFor(c, ctx, plan, observedAt);
                    assurance.checks = (generalizationEnabled ? CHECKS : CHECKS.filter(x => x.id === 'separation')).map(c => ({ id: c.id, title: c.title, rule: c.rule }));
                    assurance.targetOptions = catalogue.filter(t => t.applicationId === change.application_id && t.sourceRevision === selected.source_revision && (generalizationEnabled || (t.adapterId ?? 'approval-v1') === 'approval-v1')).map(safeTarget);
                    for (const row of rows) {
                        const m = row.baseline && parentPlan?.mappings.find(m => m.obligationId === row.baseline.id);
                        if (m) row.priorMappingHint = { planId: parentPlan.row.id, planVersion: Number(parentPlan.row.version), checkId: m.checkId, checkTitle: checkTitle(m.checkId), sourceObligationId: m.obligationId, obligationVersion: m.obligationVersion, rationale: m.rationale,
                            contentUnchanged: row.comparison === 'COPIED_UNCHANGED' && !differences(parentPlan.snapshot.scope.obligations.find(o => o.id === m.obligationId), row.baseline).length,
                            notice: 'Previously recorded human mapping; inspect its exact original scope. It is a review hint only. Fresh authority and plan approval are required on the selected revision.' };
                    }
                }
                for (const row of rows) row.guidance = rowGuidance(row, selectedRevision, assurance, plan);
                const summary = { obligations: rows.length, mandatory: rows.filter(r => r.current.reviewStatus !== 'REJECTED').length,
                    awaitingAuthority: rows.filter(r => !['ACCEPTED', 'REJECTED'].includes(r.current.reviewStatus)).length,
                    accepted: rows.filter(r => r.current.reviewStatus === 'ACCEPTED').length, rejected: rows.filter(r => r.current.reviewStatus === 'REJECTED').length,
                    new: rows.filter(r => r.comparison === 'NEW').length, copiedUnchanged: rows.filter(r => r.comparison === 'COPIED_UNCHANGED').length,
                    copiedChanged: rows.filter(r => r.comparison === 'COPIED_CHANGED').length, notCarriedForward: parentRows.length - linked.size };
                const next = [];
                if (!selectedRevision.isCurrent) next.push(guidance('HISTORICAL_REVISION', 'This is a historical revision. Its recorded findings and decisions do not establish readiness for the current revision.', 'OPEN_CURRENT_REVISION'));
                else {
                    if (!summary.mandatory) next.push(guidance('DECLARE_MANDATORY_SCOPE', 'No non-rejected obligations are recorded. This cannot establish complete requirements or readiness; review the intended scope.', 'REVIEW_OBLIGATIONS', 'AUTHOR'));
                    if (summary.awaitingAuthority) next.push(guidance('AUTHORITY_REQUIRED', `${summary.awaitingAuthority} mandatory candidate(s) still require authority review.`, 'REVIEW_OBLIGATIONS', 'AUTHOR'));
                    if (!assurance.available) next.push(guidance('ASSURANCE_UNAVAILABLE', 'Assessment guidance is unavailable because assurance execution is not configured. The recorded scope comparison remains available.', 'CONTACT_OPERATOR', 'OPERATOR'));
                    else {
                        if (!fullSource(selected.source_revision)) next.push(guidance('FULL_SOURCE_REVISION_REQUIRED', 'Assurance needs a declared full 40- or 64-character source revision. A short reference is insufficient.', 'INSPECT_SCOPE', 'AUTHOR'));
                        if (!assurance.targetOptions.length) next.push(guidance('MATCHING_TARGET_REQUIRED', 'No configured supported target matches this application and source revision. Ask the deployment owner to register one.', 'CONTACT_OPERATOR', 'OPERATOR'));
                        if (!plan) next.push(guidance('PLAN_REQUIRED', 'An eligible Policy Authority must approve explicit mappings in a current plan. The supported-check catalogue is not a semantic recommendation.', 'REVIEW_PLAN', 'POLICY_AUTHORITY'));
                        else if (!plan.view.current) next.push(guidance('PLAN_REVIEW_REQUIRED', 'The recorded plan is no longer current. Review the listed scope or configuration changes before approving another plan.', 'REVIEW_PLAN', 'POLICY_AUTHORITY'));
                        const run = assurance.latestRun;
                        if (!run && plan?.view.current) next.push(guidance('ASSESSMENT_REQUIRED', 'The current plan has no assessment. Request fresh verification; an approved plan is not evidence.', 'REQUEST_ASSESSMENT', 'AUTHOR'));
                        if (run) {
                            if (run.status === 'COMPLETED' && run.evidenceIntegrity !== 'DIGEST_MATCH') next.push(guidance('EVIDENCE_INTEGRITY_REVIEW', 'The latest completed assessment has missing or invalid evidence. Its disposition is withheld; investigate the original records.', 'CONTACT_OPERATOR', 'OPERATOR'));
                            else if (run.applicability !== 'CURRENT') next.push(guidance('ASSESSMENT_INPUTS_CHANGED', 'The latest assessment belongs to earlier inputs. Inspect the exact recorded changes and obtain fresh evidence under a current plan.', 'REVIEW_PLAN', 'POLICY_AUTHORITY'));
                            else if (run.observedStatus !== run.status || ['FAILED', 'CANCELLED'].includes(run.status)) next.push(guidance('EXECUTION_REVIEW_REQUIRED', 'The latest attempt is failed, cancelled or past its execution deadline. Inspect it before explicitly requesting another assessment.', 'INSPECT_ASSESSMENT'));
                            else if (['QUEUED', 'RUNNING'].includes(run.status)) next.push(guidance('ASSESSMENT_IN_PROGRESS', 'The latest assessment is pending and supplies no disposition. Refresh or inspect its progress.', 'INSPECT_ASSESSMENT'));
                            else next.push(guidance('INSPECT_LATEST_ASSESSMENT', 'Inspect the latest assessment and its per-obligation findings. Its conclusion is bounded by declared scope and recorded conditions.', 'INSPECT_ASSESSMENT'));
                        }
                    }
                }
                const report = { schema: 'qivvera.impact/1', reviewMode, change: { id: changeId, title: change.title, applicationId: change.application_id, currentRevisionId: head.id },
                    selectedRevision, baselineRevision, revisionDifferences: parent ? differences(baselineRevision, selectedRevision, ['sourceRevision', 'intent', 'producer']) : [], summary, obligations: rows,
                    notCarriedForward: parentRows.filter(o => !linked.has(o.id)).map(o => ({ ...safeObligation(o), notice: o.review_state === 'REJECTED' ? 'Rejected on the prior revision; retained as history. No copied candidate is recorded.' : 'No copied candidate is recorded on the selected revision. This is not a resolution, waiver or proof that the requirement no longer applies.' })),
                    guidance: next, assurance, limitations: [...limits, ...(reviewMode === 'founder-review' ? ['This workspace permits founder review. Its configuration does not establish independent human approval; inspect each recorded authority decision.'] : [])] };
                return { ...report, generatedAt: new Date(observedAt).toISOString(), snapshotDigest: digest(report) };
            }, true);
        }
    });
}
