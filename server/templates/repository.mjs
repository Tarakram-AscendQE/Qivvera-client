/** Versioned preparation records. Only the established plan approval creates executable mappings. */
import { randomUUID } from 'node:crypto';
import { InputError, fields, text, identifier, actorEmail, requireRole } from '../workflow-input.mjs';
import { canonical, digest } from '../assurance/contracts.mjs';
import { CHECKS, PROFILE_V2, verificationIdentity, isV2 } from '../assurance/generalization.mjs';

export const TEMPLATE_LIMITS = Object.freeze({ families: 100, versions: 50, scope: 500, name: 120, purpose: 2000, rationale: 2000, readBytes: 16 * 1024 * 1024 });
const schema = 'qivvera.verification-template/1';
const fail = (code, message, status = 409) => { throw new InputError(code, message, status); };
const integrity = () => fail('TEMPLATE_INTEGRITY_FAILED', 'Saved template provenance is missing or inconsistent. Ask the workspace operator to inspect the original records.');
const parsed = value => { try { const x = JSON.parse(value); if (!x || typeof x !== 'object' || Array.isArray(x)) integrity(); return x; } catch { integrity(); } };
const same = (a, b) => canonical(a) === canonical(b);
const iso = n => new Date(n).toISOString();
const contentDigest = value => { if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) fail('INVALID_TEMPLATE_DIGEST', 'Use the exact displayed content digest.', 400); return value; };
const positive = (value, label) => { if (!Number.isSafeInteger(value) || value < 1) fail('TEMPLATE_VERSION_REQUIRED', `Reload the ${label} and submit its current version.`, 400); return value; };
const reason = (value, label = 'Rationale') => { const result = text(value, label, TEMPLATE_LIMITS.rationale); if (result.length < 10) fail('TEMPLATE_REASON_REQUIRED', 'Explain this preparation or archive decision in at least 10 characters.', 400); return result; };
const limits = Object.freeze([
    'This template reuses recorded verification preparation. Its source requirement acceptance and plan approval do not apply to another change.',
    'A named Policy Authority must judge every new mapping, choose a currently configured target and approve a fresh plan. All non-rejected obligations remain mandatory.',
    'This template does not create requirements, authority, evidence, readiness, a waiver, or permission to omit verification. Fresh execution remains separate.',
    'Only the two existing bounded approval checks and the same recorded adapter are supported. Source references remain declarations; matching text does not establish applicability.',
    'Saved versions and use receipts identify recorded content with SHA-256. They are not signatures, independent attestations or protection from database administrators.'
]);
const qualification = mode => mode === 'founder-review'
    ? 'This workspace permits founder review; saved preparation does not establish independent human approval.'
    : 'Independent requirement-review rules remain in force. Saving a template grants no new authority.';

function normalizeSave(input, revise = false) {
    fields(input, ['requestKey', 'sourceChangeId', 'sourceRevisionId', 'sourcePlanId', 'sourceScopeDigest', 'name', 'purpose', 'rationale', 'acknowledgeLimits', ...(revise ? ['expectedVersion', 'expectedStateVersion'] : [])]);
    if (input.acknowledgeLimits !== true) fail('TEMPLATE_ACKNOWLEDGEMENT_REQUIRED', 'Confirm that the template creates preparation only and transfers no approval or evidence.', 400);
    return { requestKey: identifier(input.requestKey), sourceChangeId: identifier(input.sourceChangeId), sourceRevisionId: identifier(input.sourceRevisionId),
        sourcePlanId: identifier(input.sourcePlanId), sourceScopeDigest: contentDigest(input.sourceScopeDigest), name: text(input.name, 'Template name', TEMPLATE_LIMITS.name),
        purpose: text(input.purpose, 'Applicability notes', TEMPLATE_LIMITS.purpose), rationale: reason(input.rationale), acknowledgeLimits: true,
        ...(revise ? { expectedVersion: positive(input.expectedVersion, 'template'), expectedStateVersion: positive(input.expectedStateVersion, 'template state') } : {}) };
}
function normalizeArchive(input) {
    fields(input, ['requestKey', 'expectedVersion', 'expectedStateVersion', 'rationale']);
    return { requestKey: identifier(input.requestKey), expectedVersion: positive(input.expectedVersion, 'template'),
        expectedStateVersion: positive(input.expectedStateVersion, 'template state'), rationale: reason(input.rationale) };
}
export function normalizeTemplateUse(input) {
    fields(input, ['templateId', 'versionId', 'templateDigest', 'requestKey']);
    return { templateId: identifier(input.templateId), versionId: identifier(input.versionId), templateDigest: contentDigest(input.templateDigest), requestKey: identifier(input.requestKey) };
}

export function createTemplateRepository({ db, model, catalogue, now = Date.now, reviewMode = 'independent' }) {
    if (!['independent', 'founder-review'].includes(reviewMode)) throw new Error('INVALID_REVIEW_MODE');
    const read = fn => db.transaction(fn, true);
    // Every template mutation/use acquires this lock BEFORE any source/destination change lock.
    // Reads use a repeatable-read snapshot; neither worker nor ordinary plan approval needs this lock.
    const lock = async c => { if (db.driver === 'postgres') await c.query('SELECT pg_advisory_xact_lock(78124430)'); };
    const audit = (c, actor, action, id, detail) => c.query('INSERT INTO activity(id,actor,action,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), actor, action, id, detail, iso(now())]);
    const familyView = row => ({ id: row.id, state: row.state, stateVersion: Number(row.state_version), createdBy: row.created_by, createdAt: row.created_at,
        archivedBy: row.archived_by, archivedAt: row.archived_at, archiveRationale: row.archive_rationale });
    const batchRows=async(c,sql,ids)=>ids.length?(await c.query(sql+' ('+ids.map((_,i)=>'$'+(i+1)).join(',')+')',ids)).rows:[];
    const index=rows=>new Map(rows.map(r=>[r.id,r]));
    async function ensureReadBudget(c,ids,extra=0){
        if(!ids.length)return 0;
        const selected='('+ids.map((_,i)=>'$'+(i+1)).join(',')+')';
        const bytes=column=>db.driver==='postgres'?`octet_length(${column})`:`length(CAST(${column} AS BLOB))`;
        const sql=`SELECT COALESCE((SELECT SUM(${bytes('snapshot')}) FROM verification_template_versions WHERE template_id IN ${selected}),0)
            +COALESCE((SELECT SUM(${bytes('snapshot')}) FROM assurance_plans WHERE id IN (SELECT DISTINCT source_plan_id FROM verification_template_versions WHERE template_id IN ${selected})),0)
            +COALESCE((SELECT SUM(${bytes('receipt_snapshot')}+${bytes('input_snapshot')}) FROM verification_template_mutations WHERE operation='ARCHIVE' AND template_id IN ${selected}),0) AS bytes`;
        const size=Number((await c.query(sql,ids)).rows[0].bytes);
        if(!Number.isSafeInteger(size)||size+extra>TEMPLATE_LIMITS.readBytes)fail('TEMPLATE_READ_LIMIT','This request exceeds the 16 MiB template provenance read budget. Request a smaller catalogue page; no records were omitted or changed.',422);
        return size;
    }
    async function bundleFor(c,ids){
        // A page may contain 50 families x 50 versions. Batch lineage reads instead of issuing
        // thousands of sequential PostgreSQL calls. Full history is still checked, never truncated.
        await ensureReadBudget(c,ids);
        const families=await batchRows(c,'SELECT * FROM verification_templates WHERE id IN',ids);
        const versions=await batchRows(c,'SELECT * FROM verification_template_versions WHERE template_id IN',ids);
        const plans=await batchRows(c,'SELECT * FROM assurance_plans WHERE id IN',[...new Set(versions.map(v=>v.source_plan_id))]);
        const snapshots=plans.map(p=>parsed(p.snapshot));
        const acceptanceIds=[],obligationIds=[];
        for(const s of snapshots){if(!Array.isArray(s.mappings))integrity();for(const m of s.mappings){if(typeof m?.acceptanceDecisionId!=='string'||typeof m?.obligationId!=='string')integrity();acceptanceIds.push(m.acceptanceDecisionId);obligationIds.push(m.obligationId);}}
        const revisions=await batchRows(c,'SELECT r.*,c.application_id FROM change_revisions r JOIN changes c ON c.id=r.change_id WHERE r.id IN',[...new Set(plans.map(p=>p.revision_id))]);
        const decisions=await batchRows(c,'SELECT * FROM obligation_history WHERE id IN',[...new Set(acceptanceIds)]);
        const originals=await batchRows(c,'SELECT o.id,o.change_id,w.revision_id FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.id IN',[...new Set(obligationIds)]);
        const mutations=await batchRows(c,'SELECT id,actor,request_key,operation,template_id,version_id,created_at FROM verification_template_mutations WHERE template_id IN',ids);
        const archives=await batchRows(c,"SELECT * FROM verification_template_mutations WHERE operation='ARCHIVE' AND template_id IN",ids);
        return {families:index(families),versions,plans:index(plans),revisions:index(revisions),decisions:index(decisions),originals:index(originals),mutations,archives};
    }

    async function assertScope(c, ctx) {
        const orphan = Number((await c.query('SELECT COUNT(*) AS n FROM obligations o LEFT JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.change_id=$1 AND w.obligation_id IS NULL', [ctx.change.id])).rows[0].n);
        const misplaced = Number((await c.query('SELECT COUNT(DISTINCT h.obligation_id) AS n FROM obligation_history h LEFT JOIN obligation_workflow w ON w.obligation_id=h.obligation_id LEFT JOIN obligations o ON o.id=h.obligation_id WHERE h.revision_id=$1 AND (w.obligation_id IS NULL OR o.id IS NULL OR w.revision_id<>h.revision_id OR o.change_id<>$2)', [ctx.revision.id, ctx.change.id])).rows[0].n);
        if (orphan || misplaced) integrity();
        if (ctx.obligations.length > TEMPLATE_LIMITS.scope) fail('TEMPLATE_SCOPE_LIMIT', 'Template preparation supports at most 500 declared obligations per revision. No scope was omitted.', 422);
        const count = Number((await c.query('SELECT COUNT(*) AS n FROM obligation_workflow WHERE revision_id=$1', [ctx.revision.id])).rows[0].n);
        if (count !== ctx.obligations.length || ctx.obligations.some(o => o.change_id !== ctx.change.id)) integrity();
        const histories = (await c.query('SELECT h.* FROM obligation_history h JOIN obligations o ON o.id=h.obligation_id AND o.version=h.version WHERE h.revision_id=$1', [ctx.revision.id])).rows;
        const byId = new Map(histories.map(h => [h.obligation_id, h]));
        if (histories.length !== ctx.obligations.length || byId.size !== histories.length) integrity();
        for (const o of ctx.obligations) {
            const history = byId.get(o.id), saved = history && parsed(history.snapshot);
            if (!history || history.revision_id !== ctx.revision.id || history.id !== o.review_event_id ||
                saved.statement !== o.statement || saved.sourceReference !== o.source_reference || saved.criticality !== o.criticality || saved.reviewStatus !== o.review_state ||
                (history.action !== 'IMPORTED' && (saved.id !== o.id || saved.revisionId !== ctx.revision.id || saved.version !== Number(o.version) || saved.sourceVersion !== o.source_version)) ||
                (o.review_state === 'ACCEPTED' && history.action !== 'ACCEPT') || (o.review_state === 'REJECTED' && history.action !== 'REJECT')) integrity();
        }
    }

    async function sourcePlan(c, planId, bundle = null) {
        const row = bundle?bundle.plans.get(planId):(await c.query('SELECT * FROM assurance_plans WHERE id=$1', [planId])).rows[0];
        if (!row) integrity();
        const snapshot = parsed(row.snapshot), scope = snapshot.scope;
        if (!isV2(snapshot) || !scope || !Array.isArray(scope.obligations) || !Array.isArray(snapshot.mappings) ||
            snapshot.mappings.length < 1 || snapshot.mappings.length > 2 || snapshot.scopeDigest !== digest(scope) || snapshot.scopeDigest !== row.scope_digest ||
            row.change_id !== scope.changeId || row.revision_id !== scope.revisionId || snapshot.target?.applicationId !== scope.applicationId ||
            snapshot.target?.sourceRevision !== scope.sourceRevision || snapshot.profile?.id !== PROFILE_V2.id ||
            snapshot.profileDigest !== digest(snapshot.profile) || !Array.isArray(snapshot.profile?.checks) || !row.approved_by || !row.rationale) integrity();
        const revision = bundle?bundle.revisions.get(row.revision_id):(await c.query('SELECT r.*,c.application_id FROM change_revisions r JOIN changes c ON c.id=r.change_id WHERE r.id=$1', [row.revision_id])).rows[0];
        if (!revision || revision.change_id !== row.change_id || revision.application_id !== scope.applicationId || revision.source_revision !== scope.sourceRevision) integrity();
        const ids = new Set(), checks = new Set(), scopeIds = new Set();
        for (const o of scope.obligations) { if (!o || !o.id || scopeIds.has(o.id)) integrity(); scopeIds.add(o.id); }
        const entries = [];
        for (const m of snapshot.mappings) {
            const o = scope.obligations.find(o => o.id === m.obligationId), check = snapshot.profile.checks.find(x => x.id === m.checkId);
            if (!o || o.reviewStatus !== 'ACCEPTED' || o.version !== m.obligationVersion || o.reviewDecision?.id !== m.acceptanceDecisionId ||
                o.reviewDecision?.action !== 'ACCEPT' || ids.has(m.obligationId) || checks.has(m.checkId) || !check ||
                !CHECKS.some(x => x.id === check.id) || !m.verifier || m.verifier.adapterId !== (snapshot.target.adapterId ?? 'approval-v1') ||
                typeof m.rationale !== 'string' || m.rationale.trim().length < 10) integrity();
            const decision = bundle?bundle.decisions.get(m.acceptanceDecisionId):(await c.query('SELECT * FROM obligation_history WHERE id=$1', [m.acceptanceDecisionId])).rows[0];
            const original = bundle?bundle.originals.get(o.id):(await c.query('SELECT o.change_id,w.revision_id FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.id=$1',[o.id])).rows[0];
            const saved = decision && parsed(decision.snapshot);
            if (!original || original.change_id!==row.change_id || original.revision_id!==row.revision_id || !decision || decision.obligation_id !== o.id || decision.revision_id !== row.revision_id || Number(decision.version) !== o.version || decision.action !== 'ACCEPT' ||
                decision.actor !== m.acceptedBy || decision.actor !== o.reviewDecision.actor || !!Number(decision.independent_actor) !== m.independentReviewer ||
                !!Number(decision.independent_actor) !== o.reviewDecision.independentActor || decision.rationale !== o.reviewDecision.rationale ||
                saved.id !== o.id || saved.revisionId !== row.revision_id || saved.version !== o.version || saved.reviewStatus !== 'ACCEPTED' ||
                ['statement', 'sourceReference', 'sourceVersion', 'criticality'].some(k => saved[k] !== o[k])) integrity();
            ids.add(m.obligationId); checks.add(m.checkId);
            entries.push({ check: { id: check.id, version: check.version, title: check.title, rule: check.rule },
                requirement: { id: o.id, version: o.version, statement: o.statement, sourceReference: o.sourceReference, sourceVersion: o.sourceVersion, criticality: o.criticality,
                    acceptanceDecision: { id: decision.id, actor: decision.actor, rationale: decision.rationale, independentActor: !!Number(decision.independent_actor) } },
                mappingRationale: m.rationale, verifierDigest: m.verifier.digest });
        }
        return { row, snapshot, entries: entries.sort((a, b) => a.check.id.localeCompare(b.check.id)) };
    }
    const sourceView = p => ({ changeId: p.row.change_id, revisionId: p.row.revision_id, planId: p.row.id, planVersion: Number(p.row.version),
        planDigest: digest(p.snapshot), scopeDigest: p.row.scope_digest, applicationId: p.snapshot.scope.applicationId,
        sourceRevision: p.snapshot.scope.sourceRevision, approvedBy: p.row.approved_by, planRationale: p.row.rationale });
    const compatible = s => s.profile.digest === digest(PROFILE_V2) && s.entries.every(e => {
        const check = CHECKS.find(x => x.id === e.check.id);
        return check && same(e.check, check) && e.verifierDigest === verificationIdentity(e.check.id, s.adapterId).digest;
    });

    async function versionView(c, row, bundle = null) {
        const s = parsed(row.snapshot), p = await sourcePlan(c, row.source_plan_id,bundle);
        try {
            if (digest(s) !== row.digest || s.schema !== 'qivvera.verification-template-version/1' || s.familyId !== row.template_id || s.versionId !== row.id ||
                s.number !== Number(row.version) || s.parentVersionId !== row.parent_version_id || s.createdBy !== row.created_by || s.createdAt !== row.created_at ||
                !['independent', 'founder-review'].includes(s.reviewMode) || s.name !== text(s.name, 'Template name', TEMPLATE_LIMITS.name) ||
                s.purpose !== text(s.purpose, 'Applicability notes', TEMPLATE_LIMITS.purpose) || s.rationale !== reason(s.rationale) ||
                row.source_plan_digest !== digest(p.snapshot) || !same(s.source, sourceView(p)) || !same(s.entries, p.entries) ||
                !same(s.profile, { id: p.snapshot.profile.id, version: p.snapshot.profile.version, digest: p.snapshot.profileDigest }) ||
                s.adapterId !== (p.snapshot.target.adapterId ?? 'approval-v1') || !same(s.limitations, [...limits, qualification(s.reviewMode)]) ||
                !same(Object.keys(s).sort(), ['schema','familyId','versionId','number','parentVersionId','name','purpose','rationale','createdBy','createdAt','reviewMode','source','profile','adapterId','entries','limitations'].sort())) integrity();
        } catch { integrity(); }
        return { id: row.id, number: Number(row.version), digest: row.digest, snapshot: s };
    }
    async function validateFamily(c, row, allowArchiveReceiptMissing = false,bundle=null) {
        if (!['ACTIVE', 'ARCHIVED'].includes(row.state) || !row.created_by || !Number.isFinite(Date.parse(row.created_at))) integrity();
        if (row.state === 'ACTIVE') {
            if (Number(row.state_version) !== 1 || [row.archived_by,row.archived_at,row.archive_rationale,row.archive_request_key].some(v => v !== null)) integrity();
            if(bundle?.archives.some(r=>r.template_id===row.id))integrity();
        } else {
            if (Number(row.state_version) !== 2 || !row.archived_by || !Number.isFinite(Date.parse(row.archived_at)) || !row.archive_rationale || !row.archive_request_key) integrity();
            if (!allowArchiveReceiptMissing) {
                const record = bundle?bundle.archives.find(r=>r.template_id===row.id&&r.actor===row.archived_by&&r.request_key===row.archive_request_key):(await c.query("SELECT * FROM verification_template_mutations WHERE template_id=$1 AND actor=$2 AND request_key=$3 AND operation='ARCHIVE'", [row.id,row.archived_by,row.archive_request_key])).rows[0];
                const receipt = record && parsed(record.receipt_snapshot);
                if (!record || digest(receipt) !== record.receipt_digest || !same(receipt.family, familyView(row))) integrity();
            }
        }
    }
    async function view(c, id, versionId = null, allowArchiveReceiptMissing = false,{pendingVersionId=null,bundle=null}={}) {
        bundle??=await bundleFor(c,[id]);
        const family = bundle.families.get(id);if(!family)fail('TEMPLATE_NOT_FOUND','This verification template was not found.',404);
        await validateFamily(c, family, allowArchiveReceiptMissing,bundle);
        const rows = bundle.versions.filter(r=>r.template_id===id).sort((a,b)=>Number(a.version)-Number(b.version));
        if (!rows.length || rows.length > TEMPLATE_LIMITS.versions) integrity();
        const mutations=bundle.mutations.filter(m=>m.template_id===id&&m.operation!=='ARCHIVE');
        if(mutations.some(m=>!rows.some(r=>r.id===m.version_id))||mutations.length!==rows.length-(pendingVersionId?1:0))integrity();
        const versions = [];
        for (let i = 0; i < rows.length; i++) {
            const anchors=mutations.filter(m=>m.version_id===rows[i].id);
            if(rows[i].id!==pendingVersionId&&(anchors.length!==1||anchors[0].operation!==(i===0?'CREATE':'VERSION')||anchors[0].actor!==rows[i].created_by))integrity();
            if (Number(rows[i].version) !== i + 1 || rows[i].parent_version_id !== (rows[i - 1]?.id ?? null) ||
                (i === 0 && (rows[i].created_by !== family.created_by || rows[i].created_at !== family.created_at))) integrity();
            versions.push(await versionView(c, rows[i],bundle));
        }
        const selected = versionId ? versions.find(v => v.id === versionId) : versions.at(-1);
        if (!selected) fail('TEMPLATE_VERSION_NOT_FOUND', 'This version does not belong to the selected template.', 404);
        return { schema, family: familyView(family), version: selected, history: versions.map(v => ({ id: v.id, number: v.number,
            name: v.snapshot.name, createdBy: v.snapshot.createdBy, createdAt: v.snapshot.createdAt, digest: v.digest })) };
    }
    async function sourceForSave(c, input) {
        let ctx;
        try { ctx = await model.context(c, input.sourceChangeId, input.sourceRevisionId, true); }
        catch (e) { if (e.code === 'ASSURANCE_INTEGRITY_FAILED') integrity(); throw e; }
        await assertScope(c, ctx);
        if (!ctx.isCurrent) fail('TEMPLATE_SOURCE_HISTORICAL', 'Save from a current revision with a current approved plan.');
        const latest = await model.latestPlan(c, input.sourceRevisionId);
        if (!latest || latest.id !== input.sourcePlanId) fail('TEMPLATE_SOURCE_CHANGED', 'The selected source scope or plan changed. Reload it before saving.');
        const selected=parsed(latest.snapshot);
        if(selected.schema==='qivvera.assurance-plan/1')fail('TEMPLATE_V2_PLAN_REQUIRED','Save a template from a current version 2 approved plan with explicit supported check mappings.',400);
        if(!isV2(selected))integrity();
        const p = await sourcePlan(c, latest.id);
        if(input.sourceScopeDigest!==ctx.scopeDigest)fail('TEMPLATE_SOURCE_CHANGED','The selected source scope changed. Reload it before saving.');
        if (!model.validPlan(latest, ctx) || !isV2(p.snapshot) || p.snapshot.profileDigest !== digest(PROFILE_V2)) fail('TEMPLATE_SOURCE_NOT_CURRENT', 'A current version 2 approved plan is required.');
        if (!same(ctx.scope, p.snapshot.scope)) integrity();
        return p;
    }
    async function recordVersion(c, family, old, input, actor, p) {
        const id = randomUUID(), createdAt = old ? iso(now()) : family.created_at, number = Number(old?.number ?? 0) + 1;
        if (number > TEMPLATE_LIMITS.versions) fail('TEMPLATE_VERSION_LIMIT', 'A template supports at most 50 immutable versions. Create a separately identified template if needed.', 422);
        const snapshot = { schema: 'qivvera.verification-template-version/1', familyId: family.id, versionId: id, number, parentVersionId: old?.id ?? null,
            name: input.name, purpose: input.purpose, rationale: input.rationale, createdBy: actor, createdAt, reviewMode,
            source: sourceView(p), profile: { id: p.snapshot.profile.id, version: p.snapshot.profile.version, digest: p.snapshot.profileDigest },
            adapterId: p.snapshot.target.adapterId ?? 'approval-v1', entries: p.entries, limitations: [...limits, qualification(reviewMode)] };
        await c.query('INSERT INTO verification_template_versions(id,template_id,version,parent_version_id,source_plan_id,source_plan_digest,snapshot,digest,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [id,family.id,number,old?.id ?? null,p.row.id,digest(p.snapshot),canonical(snapshot),digest(snapshot),actor,createdAt]);
        return id;
    }
    const mutationDigest = (operation, templateId, actor, input) => digest({ operation, templateId, actor, input });
    async function replayMutation(c, operation, templateId, actor, input) {
        if((await c.query('SELECT plan_id FROM verification_template_uses WHERE actor=$1 AND request_key=$2',[actor,input.requestKey])).rows.length)fail('TEMPLATE_REQUEST_CONFLICT','This request identifier belongs to a different template action.');
        const row = (await c.query('SELECT * FROM verification_template_mutations WHERE actor=$1 AND request_key=$2', [actor,input.requestKey])).rows[0];
        if (!row) return null;
        if (row.request_digest !== mutationDigest(operation,templateId,actor,input)) fail('TEMPLATE_REQUEST_CONFLICT', 'This request identifier belongs to another template action or payload.');
        const receipt = parsed(row.receipt_snapshot), savedInput = parsed(row.input_snapshot);
        if (digest(receipt) !== row.receipt_digest || !same(input,savedInput) || row.operation !== operation || receipt.family?.id !== row.template_id ||
            receipt.version?.id !== row.version_id || (templateId && templateId !== row.template_id)) integrity();
        const current = await view(c,row.template_id,row.version_id);
        if (!same(current.version,receipt.version)) integrity();
        return { ...receipt, replayed: true };
    }
    async function saveMutation(c, operation, targetId, actor, input, receipt) {
        await c.query('INSERT INTO verification_template_mutations(id,actor,request_key,request_digest,operation,template_id,version_id,input_snapshot,receipt_snapshot,receipt_digest,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
            [randomUUID(),actor,input.requestKey,mutationDigest(operation,targetId,actor,input),operation,receipt.family.id,receipt.version.id,canonical(input),canonical(receipt),digest(receipt),iso(now())]);
    }

    const api = {
        enabled: true,
        async list({ offset = 0, limit = 20, includeArchived = false } = {}) {
            if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 50 || typeof includeArchived !== 'boolean') fail('INVALID_PAGINATION', 'Use an offset from zero and a page size from 1 to 50.', 400);
            return read(async c => {
                const where = includeArchived ? '' : " WHERE state='ACTIVE'";
                const total = Number((await c.query('SELECT COUNT(*) AS n FROM verification_templates' + where)).rows[0].n);
                const rows = (await c.query('SELECT id FROM verification_templates' + where + ' ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2',[limit,offset])).rows;
                const bundle=await bundleFor(c,rows.map(r=>r.id));
                const items = [];
                for (const row of rows) { const v = await view(c,row.id,null,false,{bundle}); items.push({ id: v.family.id, state: v.family.state, stateVersion: v.family.stateVersion,
                    versionId: v.version.id, version: v.version.number, name: v.version.snapshot.name, purpose: v.version.snapshot.purpose,
                    checkCount: v.version.snapshot.entries.length, adapterId: v.version.snapshot.adapterId, createdBy: v.version.snapshot.createdBy, createdAt: v.version.snapshot.createdAt }); }
                return { items, offset, limit, total, hasMore: offset + items.length < total };
            });
        },
        async get(id, { versionId = null } = {}) { identifier(id); if (versionId) identifier(versionId); return read(c => view(c,id,versionId)); },
        async create(raw, actor) {
            requireRole(actor,'POLICY_AUTHORITY'); const input = normalizeSave(raw), email = actorEmail(actor);
            return db.transaction(async c => {
                await lock(c); const replay = await replayMutation(c,'CREATE',null,email,input); if (replay) return replay;
                const count = Number((await c.query('SELECT COUNT(*) AS n FROM verification_templates')).rows[0].n);
                if (count >= TEMPLATE_LIMITS.families) fail('TEMPLATE_FAMILY_LIMIT','This workspace supports at most 100 template families, including archived records.',422);
                const p = await sourceForSave(c,input), id = randomUUID(), createdAt = iso(now());
                await c.query("INSERT INTO verification_templates(id,state,state_version,created_by,created_at) VALUES($1,'ACTIVE',1,$2,$3)",[id,email,createdAt]);
                const versionId=await recordVersion(c,{ id,created_at:createdAt },null,input,email,p);
                const receipt = await view(c,id,null,false,{pendingVersionId:versionId});
                // Preserve room for a future archive receipt rather than filling the readable budget.
                await ensureReadBudget(c,[id],Buffer.byteLength(canonical(receipt),'utf8')+32768);
                await saveMutation(c,'CREATE',null,email,input,receipt);
                await audit(c,email,'VERIFICATION_TEMPLATE_CREATED',id,'Saved immutable verification preparation from an approved plan; no approval or evidence transferred.');
                return { ...receipt,replayed:false };
            });
        },
        async revise(id, raw, actor) {
            requireRole(actor,'POLICY_AUTHORITY'); identifier(id); const input = normalizeSave(raw,true), email = actorEmail(actor);
            return db.transaction(async c => {
                await lock(c); const replay = await replayMutation(c,'VERSION',id,email,input); if (replay) return replay;
                const current = await view(c,id);
                if (current.family.state !== 'ACTIVE') fail('TEMPLATE_ARCHIVED','Archived templates cannot receive new versions.');
                if (current.family.stateVersion !== input.expectedStateVersion || current.version.number !== input.expectedVersion) fail('TEMPLATE_VERSION_CONFLICT','The template changed. Reload its latest version and state.');
                const p = await sourceForSave(c,input);
                const versionId=await recordVersion(c,{ id,created_at:current.family.createdAt },current.version,input,email,p);
                const receipt = await view(c,id,null,false,{pendingVersionId:versionId});
                await ensureReadBudget(c,[id],Buffer.byteLength(canonical(receipt),'utf8')+32768);
                await saveMutation(c,'VERSION',id,email,input,receipt);
                await audit(c,email,'VERIFICATION_TEMPLATE_VERSIONED',id,'Saved a new immutable preparation version; older versions and approved plans remain unchanged.');
                return { ...receipt,replayed:false };
            });
        },
        async archive(id, raw, actor) {
            requireRole(actor,'POLICY_AUTHORITY'); identifier(id); const input = normalizeArchive(raw), email = actorEmail(actor);
            return db.transaction(async c => {
                await lock(c); const replay = await replayMutation(c,'ARCHIVE',id,email,input); if (replay) return replay;
                const current = await view(c,id);
                if (current.family.state !== 'ACTIVE') fail('TEMPLATE_ARCHIVED','This template is already archived.');
                if (current.family.stateVersion !== input.expectedStateVersion || current.version.number !== input.expectedVersion) fail('TEMPLATE_VERSION_CONFLICT','The template changed. Reload its latest version and state.');
                await c.query("UPDATE verification_templates SET state='ARCHIVED',state_version=2,archived_by=$1,archived_at=$2,archive_rationale=$3,archive_request_key=$4 WHERE id=$5",[email,iso(now()),input.rationale,input.requestKey,id]);
                const receipt = await view(c,id,null,true); await saveMutation(c,'ARCHIVE',id,email,input,receipt);
                await ensureReadBudget(c,[id]);
                await audit(c,email,'VERIFICATION_TEMPLATE_ARCHIVED',id,'Archived preparation for future use. Existing plans, evidence and decisions are unchanged.');
                return { ...receipt,replayed:false };
            });
        }
    };

    async function useReceipt(c, row) {
        const use = (await c.query('SELECT * FROM verification_template_uses WHERE plan_id=$1',[row.id])).rows[0];
        const anchors = (await c.query("SELECT actor FROM activity WHERE entity_id=$1 AND action='VERIFICATION_TEMPLATE_USED'",[row.id])).rows;
        if (!use) { if(anchors.length)integrity(); return null; }
        if(anchors.length!==1||anchors[0].actor!==use.actor)integrity();
        const receipt = parsed(use.receipt_snapshot), input = parsed(use.input_snapshot), snapshot = parsed(row.snapshot);
        const template = await view(c,use.template_id,use.version_id);let selection;
        try{selection=normalizeTemplateUse(input.templateUse);}catch{integrity();}
        const expected = { schema:'qivvera.verification-template-use/1',templateId:template.family.id,versionId:template.version.id,version:template.version.number,
            templateDigest:template.version.digest,name:template.version.snapshot.name,planId:row.id,planVersion:Number(row.version),planDigest:digest(snapshot),
            changeId:row.change_id,revisionId:row.revision_id,scopeDigest:row.scope_digest,targetId:snapshot.target?.id,adapterId:snapshot.target?.adapterId??'approval-v1',
            usedBy:use.actor,usedAt:use.created_at,requestKey:use.request_key };
        if (digest(receipt)!==use.receipt_digest || !same(receipt,expected) || use.request_digest!==digest({ changeId:row.change_id,actor:use.actor,input }) ||
            selection.templateId!==use.template_id || selection.versionId!==use.version_id || selection.templateDigest!==template.version.digest || selection.requestKey!==use.request_key ||
            input.scopeDigest!==row.scope_digest || input.revisionId!==row.revision_id || input.targetId!==snapshot.target?.id || input.expectedPlanVersion+1!==Number(row.version) ||
            use.actor!==row.approved_by || typeof input.rationale!=='string' || input.rationale.trim()!==row.rationale || !Array.isArray(input.mappings) || input.mappings.some(m=>!m||typeof m.rationale!=='string') ||
            !same(input.mappings.map(m=>({obligationId:m.obligationId,checkId:m.checkId,rationale:m.rationale.trim()})).sort((a,b)=>a.obligationId.localeCompare(b.obligationId)),
                snapshot.mappings?.map(m=>({obligationId:m.obligationId,checkId:m.checkId,rationale:m.rationale})).sort((a,b)=>a.obligationId.localeCompare(b.obligationId)))) integrity();
        return { templateId:receipt.templateId,versionId:receipt.versionId,version:receipt.version,templateDigest:receipt.templateDigest,name:receipt.name,usedBy:receipt.usedBy,usedAt:receipt.usedAt };
    }
    return { api, lock, assertScope,
        async replayUse(c, changeId, input, actor) {
            const selection=normalizeTemplateUse(input.templateUse), email=actorEmail(actor);
            if((await c.query('SELECT id FROM verification_template_mutations WHERE actor=$1 AND request_key=$2',[email,selection.requestKey])).rows.length)fail('TEMPLATE_REQUEST_CONFLICT','This request identifier belongs to a different template action.');
            const use=(await c.query('SELECT * FROM verification_template_uses WHERE actor=$1 AND request_key=$2',[email,selection.requestKey])).rows[0];
            if(!use)return null;
            if(use.request_digest!==digest({changeId,actor:email,input}))fail('TEMPLATE_REQUEST_CONFLICT','This request identifier belongs to another plan approval payload.');
            const plan=(await c.query('SELECT * FROM assurance_plans WHERE id=$1',[use.plan_id])).rows[0];if(!plan)integrity();
            const provenance=await useReceipt(c,plan);
            return {id:plan.id,version:Number(plan.version),snapshot:parsed(plan.snapshot),templateUse:provenance,replayed:true};
        },
        async prepareUse(c, ctx, input) {
            const selection=normalizeTemplateUse(input.templateUse), template=await view(c,selection.templateId,selection.versionId);
            if(template.version.digest!==selection.templateDigest)fail('TEMPLATE_DIGEST_CHANGED','The displayed template digest does not match the saved version. Reload.');
            if(template.family.state!=='ACTIVE')fail('TEMPLATE_ARCHIVED','This template is archived and cannot be used for a new plan.');
            if(template.history.at(-1).id!==template.version.id)fail('TEMPLATE_VERSION_SUPERSEDED','Use the latest template version after reviewing its changes.');
            if(!compatible(template.version.snapshot))fail('TEMPLATE_CONTRACT_CHANGED','The profile or verifier contract changed. Review and save a current template version.');
            const target=catalogue.find(t=>t.id===input.targetId);
            if(target&&(target.adapterId??'approval-v1')!==template.version.snapshot.adapterId)fail('TEMPLATE_ADAPTER_MISMATCH','This template requires the same declared adapter as its source plan.',400);
            if(!Array.isArray(input.mappings)||!same(input.mappings.map(m=>m.checkId).sort(),template.version.snapshot.entries.map(e=>e.check.id).sort()))fail('TEMPLATE_CHECK_SET_MISMATCH','Explicitly map every check in this template exactly once. Other obligations remain mandatory.',400);
            await assertScope(c,ctx);
            return {selection,template};
        },
        async recordUse(c, prepared, plan, changeId, input, actor) {
            const email=actorEmail(actor),usedAt=iso(now()),s=plan.snapshot;
            const receipt={schema:'qivvera.verification-template-use/1',templateId:prepared.template.family.id,versionId:prepared.template.version.id,version:prepared.template.version.number,
                templateDigest:prepared.template.version.digest,name:prepared.template.version.snapshot.name,planId:plan.id,planVersion:plan.version,planDigest:digest(s),
                changeId,revisionId:s.scope.revisionId,scopeDigest:s.scopeDigest,targetId:s.target.id,adapterId:s.target.adapterId??'approval-v1',usedBy:email,usedAt,requestKey:prepared.selection.requestKey};
            await c.query('INSERT INTO verification_template_uses(plan_id,template_id,version_id,actor,request_key,request_digest,input_snapshot,receipt_snapshot,receipt_digest,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [plan.id,receipt.templateId,receipt.versionId,email,receipt.requestKey,digest({changeId,actor:email,input}),canonical(input),canonical(receipt),digest(receipt),usedAt]);
            await audit(c,email,'VERIFICATION_TEMPLATE_USED',plan.id,'Recorded explicit fresh plan mapping from a saved template; no authority, evidence or disposition transferred.');
            return {templateId:receipt.templateId,versionId:receipt.versionId,version:receipt.version,templateDigest:receipt.templateDigest,name:receipt.name,usedBy:email,usedAt};
        },
        useReceipt
    };
}
