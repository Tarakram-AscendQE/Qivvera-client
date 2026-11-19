/** Validate stored assurance inputs before they can support an execution or a disposition.
 * Digests detect inconsistent records; this is not protection from a database administrator.
 * Published profile/verifier bytes and historical snapshot formats remain unchanged.
 */
import { InputError } from '../workflow-input.mjs';
import { canonical, digest } from './contracts.mjs';
import { CHECKS, isV2, mappingsOf } from './generalization.mjs';

export const assuranceIntegrityFailure = () => {
    throw new InputError('ASSURANCE_INTEGRITY_FAILED',
        'Saved assurance inputs are missing or inconsistent. No assurance conclusion is available. Ask the workspace operator to inspect the original records.', 409);
};
const fail = assuranceIntegrityFailure;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => canonical(a) === canonical(b);
const nonempty = value => typeof value === 'string' && value.length > 0;
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const statuses = new Set(['DRAFT', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'CLARIFICATION_REQUIRED']);
const parse = value => {
    try { const result = JSON.parse(value); if (!object(result)) fail(); return result; }
    catch { return fail(); }
};

/** One SQL statement observes membership, current rows and their history together.
 * This also avoids false corruption reports if a different process edits a requirement
 * while a worker is reading without UPDATE permission on the authority tables.
 */
export async function loadVerifiedObligations(c, changeId, revisionId) {
    const rows = (await c.query(`SELECT checks.*, records.* FROM (
        SELECT
            (SELECT COUNT(*) FROM obligation_workflow WHERE revision_id=$2) AS membership_count,
            (SELECT COUNT(*) FROM obligations o LEFT JOIN obligation_workflow w ON w.obligation_id=o.id
                WHERE o.change_id=$1 AND w.obligation_id IS NULL) AS orphan_count,
            (SELECT COUNT(DISTINCT h.obligation_id) FROM obligation_history h
                LEFT JOIN obligation_workflow w ON w.obligation_id=h.obligation_id
                LEFT JOIN obligations o ON o.id=h.obligation_id
                WHERE h.revision_id=$2 AND (w.obligation_id IS NULL OR o.id IS NULL
                    OR w.revision_id<>h.revision_id OR o.change_id<>$1)) AS misplaced_count
        ) checks LEFT JOIN (
            SELECT o.*, w.revision_id,w.source_version,w.review_state,w.copied_from,
                h.id AS review_event_id,h.action AS review_action,h.actor AS review_actor,
                h.rationale AS review_reason,h.independent_actor,
                h.revision_id AS history_revision_id,h.snapshot AS history_snapshot
            FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id
                LEFT JOIN obligation_history h ON h.obligation_id=o.id AND h.version=o.version
            WHERE o.change_id=$1 AND w.revision_id=$2
        ) records ON 1=1 ORDER BY records.id`, [changeId, revisionId])).rows;
    const checks = rows[0], obligations = rows.filter(row => row.id !== null);
    if (!checks || Number(checks.orphan_count) || Number(checks.misplaced_count) ||
        Number(checks.membership_count) !== obligations.length) fail();
    const ids = new Set();
    for (const o of obligations) {
        if (ids.has(o.id) || o.change_id !== changeId || o.revision_id !== revisionId ||
            !o.review_event_id || o.history_revision_id !== revisionId || !statuses.has(o.review_state)) fail();
        ids.add(o.id);
        const saved = parse(o.history_snapshot);
        if (saved.statement !== o.statement || saved.sourceReference !== o.source_reference ||
            saved.criticality !== o.criticality || saved.reviewStatus !== o.review_state) fail();
        if (o.review_action !== 'IMPORTED' &&
            (saved.id !== o.id || saved.changeId !== changeId || saved.revisionId !== revisionId ||
                saved.version !== Number(o.version) || saved.sourceVersion !== o.source_version ||
                (saved.copiedFrom ?? null) !== (o.copied_from ?? null))) fail();
        if (o.review_state === 'ACCEPTED' && o.review_action !== 'ACCEPT' ||
            o.review_state === 'REJECTED' && o.review_action !== 'REJECT') fail();
    }
    return obligations;
}

/** Validate the frozen representation independently of today's live authority decisions. */
export function planSnapshot(row) {
    try {
        if (!row || !positive(row.version) || !nonempty(row.approved_by) || !nonempty(row.rationale)) fail();
        const s = parse(row.snapshot), scope = s.scope;
        if (!['qivvera.assurance-plan/1', 'qivvera.assurance-plan/2'].includes(s.schema) ||
            !object(scope) || !Array.isArray(scope.obligations) ||
            scope.changeId !== row.change_id || scope.revisionId !== row.revision_id ||
            !nonempty(scope.applicationId) || !nonempty(scope.sourceRevision) ||
            s.scopeDigest !== row.scope_digest || s.scopeDigest !== digest(scope) ||
            !object(s.profile) || s.profileDigest !== digest(s.profile) ||
            !object(s.target) || s.target.applicationId !== scope.applicationId ||
            s.target.sourceRevision !== scope.sourceRevision) fail();
        const ids = new Set();
        for (const o of scope.obligations) {
            if (!object(o) || !nonempty(o.id) || ids.has(o.id) || !positive(o.version) ||
                !statuses.has(o.reviewStatus) || typeof o.statement !== 'string' ||
                typeof o.sourceReference !== 'string' || typeof o.sourceVersion !== 'string' ||
                !nonempty(o.criticality)) fail();
            ids.add(o.id);
        }
        const mappings = mappingsOf(s), mapped = new Set(), checks = new Set();
        if (!Array.isArray(mappings) || mappings.length < 1 || mappings.length > (isV2(s) ? 2 : 1)) fail();
        for (const m of mappings) {
            const o = object(m) && scope.obligations.find(item => item.id === m.obligationId);
            if (!o || mapped.has(m.obligationId) || checks.has(m.checkId) ||
                !CHECKS.some(check => check.id === m.checkId) || o.reviewStatus !== 'ACCEPTED' ||
                o.version !== m.obligationVersion || !object(o.reviewDecision) ||
                o.reviewDecision.id !== m.acceptanceDecisionId || o.reviewDecision.action !== 'ACCEPT' ||
                o.reviewDecision.actor !== m.acceptedBy || o.reviewDecision.independentActor !== m.independentReviewer ||
                typeof m.rationale !== 'string' || m.rationale.trim().length < 10 ||
                !object(m.verifier) || !nonempty(m.verifier.digest)) fail();
            mapped.add(m.obligationId); checks.add(m.checkId);
        }
        return s;
    } catch { return fail(); }
}

export async function validateStoredPlan(c, row) {
    const snapshot = planSnapshot(row), scope = snapshot.scope;
    const revision = (await c.query(`SELECT r.*,c.application_id FROM change_revisions r
        JOIN changes c ON c.id=r.change_id WHERE r.id=$1`, [row.revision_id])).rows[0];
    if (!revision || revision.change_id !== row.change_id || revision.application_id !== scope.applicationId) fail();
    // The frozen source/target pair was checked above. A different current declaration
    // makes the plan stale through its scope digest; retain the original plan as history.
    for (const m of mappingsOf(snapshot)) {
        const o = scope.obligations.find(item => item.id === m.obligationId);
        const accepted = (await c.query('SELECT * FROM obligation_history WHERE id=$1', [m.acceptanceDecisionId])).rows[0];
        const original = (await c.query(`SELECT o.change_id,w.revision_id FROM obligations o
            JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.id=$1`, [o.id])).rows[0];
        if (!original || original.change_id !== row.change_id || original.revision_id !== row.revision_id ||
            !accepted || accepted.obligation_id !== o.id || accepted.revision_id !== row.revision_id ||
            Number(accepted.version) !== o.version || accepted.action !== 'ACCEPT' ||
            accepted.actor !== m.acceptedBy || !!Number(accepted.independent_actor) !== m.independentReviewer ||
            accepted.rationale !== o.reviewDecision.rationale) fail();
        const saved = parse(accepted.snapshot);
        if (saved.id !== o.id || saved.changeId !== row.change_id || saved.revisionId !== row.revision_id ||
            saved.version !== o.version || saved.reviewStatus !== 'ACCEPTED' ||
            ['statement', 'sourceReference', 'sourceVersion', 'criticality'].some(key => saved[key] !== o[key])) fail();
    }
    return snapshot;
}

export async function validateStoredRun(c, row) {
    if (!row || !['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(row.status)) fail();
    const plan = (await c.query('SELECT * FROM assurance_plans WHERE id=$1', [row.plan_id])).rows[0];
    if (!plan || plan.change_id !== row.change_id || plan.revision_id !== row.revision_id) fail();
    const expected = await validateStoredPlan(c, plan), snapshot = parse(row.snapshot);
    if (!same(snapshot, expected)) fail();
    return snapshot;
}
