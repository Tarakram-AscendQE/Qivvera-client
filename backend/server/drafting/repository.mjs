/** Durable candidate preparation. Uses the workflow repository's transaction and creation path. */
import { randomUUID } from 'node:crypto';
import { InputError, identifier, actorEmail, requireRole } from '../workflow-input.mjs';
import { canonical, digest } from '../assurance/contracts.mjs';
import { DRAFTING_SCHEMA, FAILURE_CODES, normalizeRunInput, normalizeDecisionInput, validateGenerated } from './contracts.mjs';
import { generateDrafts } from './generator.mjs';

const WINDOW_MS = 600000, GENERATION_MS = 60000;
const fail = (code, message, status = 409) => { throw new InputError(code, message, status); };
const integrity = () => fail('DRAFTING_INTEGRITY_FAILED', 'Saved drafting records failed integrity validation. Contact the workspace operator.');
const same = (a, b) => canonical(a) === canonical(b);
const iso = n => new Date(n).toISOString();
const failureCodes = new Set(FAILURE_CODES);
// Requirement literals can be case-, Unicode- and whitespace-sensitive.
const equivalentStatement = value => value.trim();

export function createDraftingRepository({ db, config, helpers }) {
    const now = config.now ?? Date.now;
    const generate = config.generateDrafts ?? generateDrafts;
    const methods = Object.freeze({ rules: true, openai: config.openaiEnabled === true });
    const read = fn => db.transaction(fn, true);
    const rowFor = async (c, id, lock = false) => {
        const row = (await c.query('SELECT * FROM drafting_runs WHERE id=$1' + (lock ? db.lock : ''), [id])).rows[0];
        if (!row) fail('DRAFTING_RUN_NOT_FOUND', 'The drafting run was not found.', 404);
        return row;
    };
    const getSource = row => {
        try {
            const source = JSON.parse(row.source_snapshot);
            const input = normalizeRunInput(source.input);
            if (digest(source) !== row.source_snapshot_digest || source.schema !== 'qivvera.drafting-source/1' ||
                !same(input, source.input) || source.sourceDigest !== digest(input.sourceText) ||
                source.id !== row.id || source.applicationId !== row.application_id || source.changeId !== row.change_id ||
                source.revisionId !== row.revision_id || source.createdBy !== row.created_by || source.createdAt !== row.created_at ||
                source.expiresAt !== iso(Number(row.expires_at)) || Date.parse(source.createdAt) !== Number(row.created_at_ms) ||
                Number(row.expires_at) - Number(row.created_at_ms) !== GENERATION_MS ||
                input.requestId !== row.request_id || input.revisionId !== row.revision_id || input.method !== row.method ||
                row.request_digest !== digest({ changeId: row.change_id, actor: row.created_by, input })) integrity();
            return source;
        } catch { integrity(); }
    };
    const getResult = (row, source) => {
        try {
            if (row.status !== 'COMPLETED') {
                if (!['GENERATING', 'FAILED'].includes(row.status) || row.result_snapshot !== null || row.result_digest !== null ||
                    (row.status === 'FAILED' && !failureCodes.has(row.failure_code)) ||
                    (row.status === 'GENERATING' && (row.failure_code !== null || row.completed_at !== null))) integrity();
                return null;
            }
            const result = JSON.parse(row.result_snapshot);
            if (digest(result) !== row.result_digest || result.schema !== 'qivvera.drafting-result/1' ||
                result.runId !== row.id || result.sourceReceiptDigest !== row.source_snapshot_digest ||
                !Array.isArray(result.suggestions) || row.failure_code !== null || !row.completed_at) integrity();
            const validated = validateGenerated(source.input.sourceText, {
                engine: result.engine, warnings: result.warnings,
                suggestions: result.suggestions.map(({ id, ordinal, ...suggestion }) => suggestion),
            }, source.input.method);
            if (!same(validated, { engine: result.engine, warnings: result.warnings,
                suggestions: result.suggestions.map(({ id, ordinal, ...suggestion }) => suggestion) })) integrity();
            const ids = new Set();
            for (const [ordinal, suggestion] of result.suggestions.entries()) {
                identifier(suggestion.id);
                if (ids.has(suggestion.id) || suggestion.ordinal !== ordinal) integrity();
                ids.add(suggestion.id);
            }
            return result;
        } catch { integrity(); }
    };
    const getDecision = (record, row, result) => {
        try {
            if (record.status === 'PROPOSED') {
                if (Number(record.version) !== 1 || record.decision_snapshot !== null || record.decision_digest !== null ||
                    record.decision_request_digest !== null || record.obligation_id !== null) integrity();
                return null;
            }
            const saved = JSON.parse(record.decision_snapshot), input = normalizeDecisionInput(saved.input), decision = saved.decision;
            if (digest(saved) !== record.decision_digest || saved.schema !== 'qivvera.drafting-decision/1' ||
                saved.runId !== row.id || saved.suggestionId !== record.id || saved.sourceReceiptDigest !== row.source_snapshot_digest ||
                saved.resultDigest !== row.result_digest || !same(input, saved.input) || input.version !== 1 || Number(record.version) !== 2 ||
                decision.actor !== row.created_by || decision.action !== input.action || decision.rationale !== input.rationale ||
                !Number.isFinite(Date.parse(decision.createdAt)) ||
                record.decision_request_digest !== digest({ runId: row.id, suggestionId: record.id, actor: decision.actor, input })) integrity();
            if (input.action === 'CREATE_CANDIDATE') {
                if (record.status !== 'CANDIDATE_CREATED' || decision.statement !== input.statement || decision.criticality !== input.criticality ||
                    record.obligation_id !== decision.obligationId) integrity();
                identifier(decision.obligationId);
                if (!same(Object.keys(decision).sort(), ['action', 'actor', 'rationale', 'statement', 'criticality', 'obligationId', 'createdAt'].sort())) integrity();
            } else if (record.status !== 'DISMISSED' || record.obligation_id !== null ||
                !same(Object.keys(decision).sort(), ['action', 'actor', 'rationale', 'createdAt'].sort())) integrity();
            if (!result.suggestions.some(s => s.id === record.id)) integrity();
            return decision;
        } catch { integrity(); }
    };
    const verifyCandidate = async (c, row, source, decision) => {
        if (decision?.action !== 'CREATE_CANDIDATE') return;
        const candidate = (await c.query('SELECT o.id,o.change_id,w.revision_id,w.proposed_by FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.id=$1', [decision.obligationId])).rows[0];
        const first = (await c.query('SELECT * FROM obligation_history WHERE obligation_id=$1 AND version=1', [decision.obligationId])).rows[0];
        try {
            const snapshot = first && JSON.parse(first.snapshot);
            if (!candidate || candidate.change_id !== row.change_id || candidate.revision_id !== row.revision_id || candidate.proposed_by !== decision.actor ||
                !first || first.action !== 'PROPOSED' || first.actor !== decision.actor || first.revision_id !== row.revision_id ||
                snapshot.id !== decision.obligationId || snapshot.changeId !== row.change_id || snapshot.revisionId !== row.revision_id ||
                snapshot.statement !== decision.statement || snapshot.criticality !== decision.criticality ||
                snapshot.sourceReference !== source.input.sourceReference || snapshot.sourceVersion !== source.input.sourceVersion ||
                snapshot.proposedBy !== decision.actor || snapshot.lastEditedBy !== decision.actor || snapshot.version !== 1 ||
                snapshot.reviewStatus !== 'DRAFT' || snapshot.authority !== 'CANDIDATE' || snapshot.state !== 'NOT_ASSESSED' || snapshot.evidenceCount !== 0) integrity();
        } catch { integrity(); }
    };
    const view = async (c, row) => {
        const source = getSource(row), result = getResult(row, source);
        const current = await helpers.head(c, row.change_id);
        const revision = (await c.query('SELECT r.source_revision,c.application_id FROM change_revisions r JOIN changes c ON c.id=r.change_id WHERE r.id=$1 AND r.change_id=$2', [row.revision_id, row.change_id])).rows[0];
        if (!revision || revision.application_id !== row.application_id || (revision.source_revision || null) !== source.sourceRevision) integrity();
        const records = (await c.query('SELECT * FROM drafting_suggestions WHERE run_id=$1 ORDER BY ordinal', [row.id])).rows;
        if (records.length !== (result?.suggestions.length ?? 0)) integrity();
        const suggestions = [];
        for (const [index, record] of records.entries()) {
            const original = result.suggestions[index];
            if (record.id !== original.id || Number(record.ordinal) !== index) integrity();
            const decision = getDecision(record, row, result);
            await verifyCandidate(c, row, source, decision);
            suggestions.push({ id: original.id, statement: original.statement, quote: original.quote, startLine: original.startLine,
                endLine: original.endLine, status: record.status, version: Number(record.version), decision });
        }
        const expired = row.status === 'GENERATING' && Number(row.expires_at) <= now();
        return { schema: DRAFTING_SCHEMA, id: row.id, applicationId: row.application_id, changeId: row.change_id, revisionId: row.revision_id,
            sourceRevision: source.sourceRevision, createdBy: row.created_by, createdAt: row.created_at,
            status: expired ? 'EXPIRED' : row.status, applicability: current?.id === row.revision_id ? 'CURRENT' : 'HISTORICAL',
            method: row.method, source: { reference: source.input.sourceReference, version: source.input.sourceVersion,
                text: source.input.sourceText, digest: source.sourceDigest }, sourceReceiptDigest: row.source_snapshot_digest,
            resultDigest: row.result_digest, engine: result?.engine ?? null, warnings: result?.warnings ?? [],
            failureCode: expired ? 'DRAFTING_GENERATION_EXPIRED' : row.failure_code, suggestions };
    };
    const summary = run => ({ id: run.id, changeId: run.changeId, revisionId: run.revisionId,
        source: { reference: run.source.reference, version: run.source.version }, method: run.method, engine: run.engine,
        status: run.status, applicability: run.applicability, createdBy: run.createdBy, createdAt: run.createdAt,
        pendingCount: run.suggestions.filter(s => s.status === 'PROPOSED').length,
        createdCount: run.suggestions.filter(s => s.status === 'CANDIDATE_CREATED').length,
        dismissedCount: run.suggestions.filter(s => s.status === 'DISMISSED').length });

    return {
        enabled: true, methods,
        async get(id) { identifier(id); return read(async c => view(c, await rowFor(c, id))); },
        async getContext(changeId, revisionId = null, { offset = 0, limit = 20 } = {}) {
            identifier(changeId); if (revisionId) identifier(revisionId);
            if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 50)
                fail('INVALID_PAGINATION', 'Choose an offset from zero and a page size from 1 to 50.', 400);
            return read(async c => {
                const change = (await c.query('SELECT id FROM changes WHERE id=$1', [changeId])).rows[0];
                if (!change) fail('CHANGE_NOT_FOUND', 'This change was not found.', 404);
                const current = await helpers.head(c, changeId), selected = revisionId ?? current?.id;
                if (!(await c.query('SELECT id FROM change_revisions WHERE id=$1 AND change_id=$2', [selected, changeId])).rows[0])
                    fail('REVISION_NOT_FOUND', 'This revision does not belong to this change.', 404);
                const total = Number((await c.query('SELECT COUNT(*) AS n FROM drafting_runs WHERE change_id=$1 AND revision_id=$2', [changeId, selected])).rows[0].n);
                const rows = (await c.query('SELECT * FROM drafting_runs WHERE change_id=$1 AND revision_id=$2 ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4', [changeId, selected, limit, offset])).rows;
                const runs = []; for (const row of rows) runs.push(summary(await view(c, row)));
                return { changeId, revisionId: selected, isCurrentRevision: current.id === selected, methods, runs, offset, limit, total, hasMore: offset + runs.length < total };
            });
        },
        async generate(changeId, rawInput, actor) {
            requireRole(actor, 'AUTHOR'); identifier(changeId);
            const input = normalizeRunInput(rawInput), email = actorEmail(actor);
            const requestDigest = digest({ changeId, actor: email, input });
            const reserved = await db.transaction(async c => {
                // This short reservation lock serializes actor/workspace limits across processes.
                if (db.driver === 'postgres') await c.query('SELECT pg_advisory_xact_lock(78124429)');
                const existing = (await c.query('SELECT * FROM drafting_runs WHERE created_by=$1 AND request_id=$2', [email, input.requestId])).rows[0];
                if (existing) {
                    if (existing.request_digest !== requestDigest) fail('DRAFTING_REQUEST_CONFLICT', 'This request identifier was already used with different drafting inputs.');
                    return { existing: { ...await view(c, existing), replayed: true } };
                }
                if (input.method === 'openai' && !methods.openai) fail('DRAFTING_METHOD_DISABLED', 'AI suggestions are not configured for this workspace.', 400);
                const revision = await helpers.ensureHead(c, changeId, input.revisionId);
                const change = (await c.query('SELECT application_id FROM changes WHERE id=$1', [changeId])).rows[0];
                const time = now();
                const active = (await c.query("SELECT id FROM drafting_runs WHERE created_by=$1 AND status='GENERATING' AND expires_at>$2 LIMIT 1", [email, time])).rows[0];
                if (active) fail('DRAFTING_GENERATION_ACTIVE', 'A drafting request is already running for your account. Open that request before starting another.');
                const count = Number((await c.query('SELECT COUNT(*) AS n FROM drafting_runs WHERE created_by=$1 AND created_at_ms>$2', [email, time - WINDOW_MS])).rows[0].n);
                if (count >= 10) fail('DRAFTING_RATE_LIMITED', 'The drafting request limit was reached. Try again later.', 429);
                if (input.method === 'openai') {
                    const all = Number((await c.query("SELECT COUNT(*) AS n FROM drafting_runs WHERE method='openai' AND created_at_ms>$1", [time - WINDOW_MS])).rows[0].n);
                    if (all >= 30) fail('DRAFTING_RATE_LIMITED', 'The workspace AI request limit was reached. Try again later.', 429);
                }
                const id = randomUUID(), createdAt = iso(time);
                const source = { schema: 'qivvera.drafting-source/1', id, applicationId: change.application_id, changeId,
                    revisionId: revision.id, sourceRevision: revision.source_revision || null, createdBy: email, createdAt,
                    expiresAt: iso(time + GENERATION_MS), input, sourceDigest: digest(input.sourceText) };
                await c.query("INSERT INTO drafting_runs(id,request_id,request_digest,application_id,change_id,revision_id,created_by,created_at,created_at_ms,expires_at,method,status,source_snapshot,source_snapshot_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'GENERATING',$12,$13)",
                    [id, input.requestId, requestDigest, change.application_id, changeId, revision.id, email, createdAt, time, time + GENERATION_MS, input.method, canonical(source), digest(source)]);
                await helpers.audit(c, email, 'DRAFTING_REQUESTED', id, 'Requested source-grounded candidate preparation; no obligation or authority created.');
                return { id };
            });
            if (reserved.existing) return reserved.existing;
            let generated, failureCode = null;
            try {
                generated = validateGenerated(input.sourceText, await generate(input.sourceText, input.method, config), input.method);
                if (input.method === 'openai' && generated.engine.requestedModel !== config.model) throw new Error('UNEXPECTED_REQUESTED_MODEL');
            } catch (e) { failureCode = failureCodes.has(e?.code) ? e.code : 'DRAFTING_GENERATION_FAILED'; }
            return db.transaction(async c => {
                const row = await rowFor(c, reserved.id, true);
                getSource(row);
                if (row.status !== 'GENERATING' || Number(row.expires_at) <= now()) return view(c, row);
                if (failureCode) {
                    await c.query("UPDATE drafting_runs SET status='FAILED',failure_code=$1,completed_at=$2 WHERE id=$3", [failureCode, iso(now()), row.id]);
                    await helpers.audit(c, email, 'DRAFTING_FAILED', row.id, 'Candidate preparation failed; no suggestions or obligations were accepted.');
                } else {
                    const result = { schema: 'qivvera.drafting-result/1', runId: row.id, sourceReceiptDigest: row.source_snapshot_digest,
                        engine: generated.engine, warnings: generated.warnings,
                        suggestions: generated.suggestions.map((suggestion, ordinal) => ({ id: randomUUID(), ordinal, ...suggestion })) };
                    for (const suggestion of result.suggestions)
                        await c.query("INSERT INTO drafting_suggestions(id,run_id,ordinal,status,version) VALUES($1,$2,$3,'PROPOSED',1)", [suggestion.id, row.id, suggestion.ordinal]);
                    await c.query("UPDATE drafting_runs SET status='COMPLETED',result_snapshot=$1,result_digest=$2,completed_at=$3 WHERE id=$4", [canonical(result), digest(result), iso(now()), row.id]);
                    await helpers.audit(c, email, 'DRAFTING_COMPLETED', row.id, `Prepared ${result.suggestions.length} suggestions for explicit author review; no obligations created.`);
                }
                return view(c, await rowFor(c, row.id));
            });
        },
        async act(id, suggestionId, rawInput, actor) {
            requireRole(actor, 'AUTHOR'); identifier(id); identifier(suggestionId);
            const input = normalizeDecisionInput(rawInput), email = actorEmail(actor);
            const requestDigest = digest({ runId: id, suggestionId, actor: email, input });
            return db.transaction(async c => {
                const unlocked = await rowFor(c, id);
                await helpers.lockedChange(c, unlocked.change_id);
                const row = await rowFor(c, id, true), run = await view(c, row), source = getSource(row);
                if (email !== row.created_by) fail('DRAFTING_ACTOR_MISMATCH', 'Only the Author who requested these suggestions can decide on them.', 403);
                if (run.status !== 'COMPLETED') fail('DRAFTING_NOT_COMPLETED', 'Only a completed drafting run can receive decisions.');
                const record = (await c.query('SELECT * FROM drafting_suggestions WHERE id=$1 AND run_id=$2', [suggestionId, id])).rows[0];
                if (!record) fail('DRAFTING_SUGGESTION_NOT_FOUND', 'This suggestion does not belong to the drafting run.', 404);
                if (record.status !== 'PROPOSED') {
                    if (record.decision_request_digest !== requestDigest) fail('DRAFTING_DECISION_CONFLICT', 'This suggestion already has a different recorded decision.');
                    return { ...run, replayed: true };
                }
                if (Number(record.version) !== input.version) fail('VERSION_CONFLICT', 'This suggestion changed. Reload before deciding.');
                await helpers.ensureHead(c, row.change_id, row.revision_id);
                const decision = { action: input.action, actor: email, rationale: input.rationale, createdAt: iso(now()) };
                if (input.action === 'CREATE_CANDIDATE') {
                    const existing = (await c.query('SELECT o.statement FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id WHERE w.revision_id=$1', [row.revision_id])).rows;
                    if (existing.some(o => equivalentStatement(o.statement) === equivalentStatement(input.statement)))
                        fail('DRAFTING_DUPLICATE_OBLIGATION', 'An obligation with this statement is already declared on this revision. Review the existing obligation.');
                    const obligation = await helpers.createOb(c, row.change_id, row.revision_id, {
                        statement: input.statement, criticality: input.criticality,
                        sourceReference: source.input.sourceReference, sourceVersion: source.input.sourceVersion,
                    }, email);
                    Object.assign(decision, { statement: input.statement, criticality: input.criticality, obligationId: obligation.id });
                }
                const saved = { schema: 'qivvera.drafting-decision/1', runId: id, suggestionId,
                    sourceReceiptDigest: row.source_snapshot_digest, resultDigest: row.result_digest, input, decision };
                const status = input.action === 'CREATE_CANDIDATE' ? 'CANDIDATE_CREATED' : 'DISMISSED';
                await c.query('UPDATE drafting_suggestions SET status=$1,version=2,decision_snapshot=$2,decision_digest=$3,decision_request_digest=$4,obligation_id=$5 WHERE id=$6',
                    [status, canonical(saved), digest(saved), requestDigest, decision.obligationId ?? null, suggestionId]);
                await helpers.audit(c, email, 'DRAFTING_' + status, decision.obligationId ?? id,
                    input.action === 'CREATE_CANDIDATE' ? 'Created a draft candidate from reviewed source wording; separate authority review remains required.' : 'Dismissed a preparation suggestion with a reason; this is not an obligation rejection or waiver.');
                return { ...await view(c, row), replayed: false };
            });
        },
    };
}
