import { randomUUID } from 'node:crypto';
import { openDatabase, migrateDatabase, requireSchema } from './workflow-store.mjs';
import { InputError, fields, text, version, identifier, actorEmail, requireRole, applicationInput, changeInput, obligationInput, sourceRevision, appView, obligationView, revisionView, iso } from './workflow-input.mjs';
import { createDraftingRepository } from './drafting/repository.mjs';
import { createImpactReader } from './impact/reader.mjs';
import { migrateDrafting, requireDrafting } from './drafting/migration.mjs';
const oq = `SELECT o.*,w.revision_id,w.source_version,w.review_state,w.proposed_by,w.last_edited_by,w.imported,w.copied_from FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id`;
const eventView = r => ({ id: r.id, obligationId: r.obligation_id, version: Number(r.version), revisionId: r.revision_id, action: r.action, actor: r.actor, rationale: r.rationale, independentActor: !!Number(r.independent_actor), snapshot: JSON.parse(r.snapshot), createdAt: iso(r.created_at) });
export async function openWorkflowRepository(options = {}) {
    const db = await openDatabase(options);
    try {
        if (options.migrate)
            await migrateDatabase(db);
        else
            await requireSchema(db);
        if (options.drafting?.enabled === true) {
            if (options.migrate) await migrateDrafting(db);
            else await requireDrafting(db);
        }
    }
    catch (e) {
        await db.close();
        throw e;
    }
    const reviewMode = options.reviewMode ?? 'independent';
    if (!['independent', 'founder-review'].includes(reviewMode)) {
        await db.close();
        throw new Error('INVALID_REVIEW_MODE');
    }
    const read = fn => db.transaction(fn, true);
    const audit = async (c, actor, action, id, detail) => c.query('INSERT INTO activity (id,actor,action,entity_id,detail,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), actor, action, id, detail, new Date().toISOString()]);
    const getOb = async (c, id) => (await c.query(oq + ' WHERE o.id=$1', [id])).rows[0];
    const head = async (c, id) => (await c.query('SELECT * FROM change_revisions WHERE change_id=$1 ORDER BY revision_number DESC LIMIT 1', [id])).rows[0];
    const lockedChange = async (c, id) => { const r = (await c.query('SELECT * FROM changes WHERE id=$1' + db.lock, [id])).rows[0]; if (!r)
        throw new InputError('CHANGE_NOT_FOUND', 'This change was not found.', 404); return r; };
    const ensureHead = async (c, changeId, revisionId) => { await lockedChange(c, changeId); const r = await head(c, changeId); if (!r || r.id !== revisionId)
        throw new InputError('REVISION_CONFLICT', 'This is no longer the current revision. Open the latest revision before changing it.', 409); return r; };
    const getChange = async (c, id, revisionId) => {
        const r = (await c.query('SELECT * FROM changes WHERE id=$1', [id])).rows[0];
        if (!r)
            return null;
        const revisions = (await c.query('SELECT * FROM change_revisions WHERE change_id=$1 ORDER BY revision_number DESC', [id])).rows;
        const current = revisions[0], selected = revisionId ? revisions.find(x => x.id === revisionId) : current;
        if (!selected)
            throw new InputError('REVISION_NOT_FOUND', 'This revision does not belong to this change.', 404);
        return { id: r.id, applicationId: r.application_id, title: r.title, intent: selected.intent, producer: selected.producer, sourceRevision: selected.source_revision || null, sourceBinding: 'DECLARED_NOT_VERIFIED', createdAt: iso(r.created_at), assessmentStatus: 'NOT_ASSESSED', disposition: null, revision: revisionView(selected), currentRevisionId: current.id, isCurrentRevision: selected.id === current.id, revisions: revisions.map(revisionView), obligations: (await c.query(oq + ' WHERE o.change_id=$1 AND w.revision_id=$2 ORDER BY o.created_at,o.id', [id, selected.id])).rows.map(obligationView) };
    };
    const history = async (c, o, action, actor, rationale = '', independent = false) => c.query('INSERT INTO obligation_history (id,obligation_id,version,revision_id,action,actor,rationale,independent_actor,snapshot,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [randomUUID(), o.id, o.version, o.revision_id, action, actor, rationale, independent ? 1 : 0, JSON.stringify(obligationView(o)), new Date().toISOString()]);
    const createOb = async (c, changeId, revId, input, email, copiedFrom = null) => { const id = randomUUID(), now = new Date().toISOString(); await c.query('INSERT INTO obligations (id,change_id,statement,source_reference,criticality,version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,1,$6,$6)', [id, changeId, input.statement, input.sourceReference, input.criticality, now]); await c.query('INSERT INTO obligation_workflow (obligation_id,revision_id,source_version,review_state,proposed_by,last_edited_by,imported,copied_from) VALUES ($1,$2,$3,$4,$5,$5,0,$6)', [id, revId, input.sourceVersion ?? '', 'DRAFT', email, copiedFrom]); const o = await getOb(c, id); await history(c, o, copiedFrom ? 'COPIED_TO_REVISION' : 'PROPOSED', email, copiedFrom ? 'Prior acceptance and assessment do not carry to this revision.' : ''); return obligationView(o); };
    // Archive state is the latest APPLICATION_ARCHIVED / APPLICATION_RESTORED activity for the application.
    // Archiving hides an application; it never deletes it or any of its history (no schema change needed).
    const ARCHIVE_ACTIONS = ['APPLICATION_ARCHIVED', 'APPLICATION_RESTORED'];
    const archiveStates = async (c) => new Map((await c.query('SELECT DISTINCT ON (entity_id) entity_id, action, actor, created_at FROM activity WHERE action = ANY($1) ORDER BY entity_id, created_at DESC, id DESC', [ARCHIVE_ACTIONS])).rows.map(r => [r.entity_id, r]));
    const archiveView = (app, state) => ({ ...app, archived: state?.action === 'APPLICATION_ARCHIVED', archivedAt: state?.action === 'APPLICATION_ARCHIVED' ? iso(state.created_at) : null, archivedBy: state?.action === 'APPLICATION_ARCHIVED' ? state.actor : null });
    const listApps = async (c) => { const states = await archiveStates(c); return (await c.query('SELECT * FROM applications ORDER BY created_at DESC,id')).rows.map(r => archiveView(appView(r), states.get(r.id))); };
    const isArchived = async (c, id) => (await c.query('SELECT action FROM activity WHERE entity_id=$1 AND action = ANY($2) ORDER BY created_at DESC, id DESC LIMIT 1', [id, ARCHIVE_ACTIONS])).rows[0]?.action === 'APPLICATION_ARCHIVED';
    /** Archive or restore: Authors and Policy Authorities only; one activity record, nothing removed. */
    const setArchived = (archive) => async (id, input, actor) => {
        const email = actorEmail(actor);
        if (!actor.roles.includes('AUTHOR') && !actor.roles.includes('POLICY_AUTHORITY')) throw new InputError('FORBIDDEN', 'Your workspace role does not permit this action.', 403);
        identifier(id, 'Application');
        fields(input ?? {}, ['reason']);
        const reason = text(input?.reason, 'Reason', 500, false);
        return db.transaction(async (c) => {
            const row = (await c.query(`SELECT * FROM applications WHERE id=$1${db.lock}`, [id])).rows[0];
            if (!row) throw new InputError('APPLICATION_NOT_FOUND', 'This application was not found.', 404);
            if (await isArchived(c, id) === archive) throw new InputError(archive ? 'APPLICATION_ALREADY_ARCHIVED' : 'APPLICATION_NOT_ARCHIVED', archive ? 'This application is already archived. Reload to see its current state.' : 'This application is not archived. Reload to see its current state.', 409);
            await audit(c, email, archive ? 'APPLICATION_ARCHIVED' : 'APPLICATION_RESTORED', id, `${archive ? 'Archived' : 'Restored'} ${row.name}${reason ? ': ' + reason : ''}`);
            return archiveView(appView(row), { action: archive ? 'APPLICATION_ARCHIVED' : 'APPLICATION_RESTORED', actor: email, created_at: new Date().toISOString() });
        });
    };
    const listChanges = async (c) => { const all = (await c.query('SELECT id FROM changes ORDER BY created_at DESC,id')).rows; const result = []; for (const r of all) {
        const change = await getChange(c, r.id);
        const { obligations, ...rest } = change;
        result.push({ ...rest, obligationCount: obligations.length, acceptedCount: obligations.filter(o => o.reviewStatus === 'ACCEPTED').length, inReviewCount: obligations.filter(o => o.reviewStatus === 'IN_REVIEW').length, draftCount: obligations.filter(o => o.reviewStatus === 'DRAFT' || o.reviewStatus === 'CLARIFICATION_REQUIRED').length });
    } return result; };
    const listActivity = async (c) => (await c.query('SELECT * FROM activity ORDER BY created_at DESC,id DESC LIMIT 100')).rows.map(r => ({ id: r.id, actor: r.actor, action: r.action, entityId: r.entity_id, detail: r.detail, createdAt: iso(r.created_at) }));
    const result = { workflow: true, driver: db.driver, reviewMode,
        close: () => db.close(), healthy: () => db.healthy(), listApplications: () => read(listApps), listChanges: () => read(listChanges), listActivity: () => read(listActivity),
        getSchemaVersion: () => read(async (c) => { const value = (await c.query('SELECT MAX(version) AS version FROM qivvera_migrations')).rows[0]?.version; return value === null || value === undefined ? null : Number(value); }),
        getApplication: id => read(async (c) => { const app = appView((await c.query('SELECT * FROM applications WHERE id=$1', [id])).rows[0]); return app && archiveView(app, (await archiveStates(c)).get(id)); }),
        archiveApplication: setArchived(true), restoreApplication: setArchived(false), getChange: (id, rev) => read(c => getChange(c, id, rev)),
        // `within` runs on the same transaction after the row is written, so registration and its GitHub connection are saved together or not at all.
        async createApplication(input, actor, { within } = {}) { requireRole(actor, 'AUTHOR'); const a = applicationInput(input), email = actorEmail(actor); try {
            return await db.transaction(async (c) => { const id = randomUUID(), now = new Date().toISOString(); await c.query('INSERT INTO applications (id,name,normalized_name,description,repository_url,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [id, a.name, a.name.toLocaleLowerCase('en-US'), a.description, a.repositoryUrl, now]); await audit(c, email, 'APPLICATION_CREATED', id, `Registered ${a.name}`); const app = appView((await c.query('SELECT * FROM applications WHERE id=$1', [id])).rows[0]); if (within) await within(c, app); return app; });
        }
        catch (e) {
            if (e.code === '23505')
                throw new InputError('DUPLICATE_APPLICATION', 'An application with this name already exists.', 409);
            throw e;
        } },
        async createChange(input, actor) { requireRole(actor, 'AUTHOR'); const x = changeInput(input), email = actorEmail(actor); return db.transaction(async (c) => { if (!(await c.query('SELECT id FROM applications WHERE id=$1', [x.applicationId])).rows[0])
            throw new InputError('APPLICATION_NOT_FOUND', 'Select an existing application.', 404); if (await isArchived(c, x.applicationId))
            throw new InputError('APPLICATION_ARCHIVED', 'This application is archived. Restore it before adding changes.', 409); const id = randomUUID(), rev = randomUUID(), now = new Date().toISOString(); await c.query('INSERT INTO changes (id,application_id,title,intent,source_revision,producer,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, x.applicationId, x.title, x.intent, x.sourceRevision, x.producer, now]); await c.query('INSERT INTO change_revisions (id,change_id,revision_number,parent_revision_id,source_revision,intent,producer,reason,created_by,created_at) VALUES ($1,$2,1,NULL,$3,$4,$5,$6,$7,$8)', [rev, id, x.sourceRevision, x.intent, x.producer, 'Initial registered revision.', email, now]); await audit(c, email, 'CHANGE_CREATED', id, `Created ${x.title}`); return getChange(c, id); }); },
        async addObligation(changeId, input, actor) { requireRole(actor, 'AUTHOR'); const o = obligationInput(input), email = actorEmail(actor); return db.transaction(async (c) => { await ensureHead(c, changeId, o.revisionId); const out = await createOb(c, changeId, o.revisionId, o, email); await audit(c, email, 'OBLIGATION_PROPOSED', out.id, `Proposed: ${o.statement}`); return out; }); },
        async editObligation(id, input, actor) { requireRole(actor, 'AUTHOR'); const o = obligationInput(input, true), email = actorEmail(actor); return db.transaction(async (c) => { let old = await getOb(c, id); if (!old)
            throw new InputError('OBLIGATION_NOT_FOUND', 'This obligation was not found.', 404); await ensureHead(c, old.change_id, o.revisionId); old = await getOb(c, id); if (old.revision_id !== o.revisionId)
            throw new InputError('REVISION_MISMATCH', 'The obligation belongs to another revision.', 409); if (Number(old.version) !== input.version)
            throw new InputError('VERSION_CONFLICT', 'This obligation changed. Reload before saving.', 409); if (old.review_state === 'IN_REVIEW')
            throw new InputError('REVIEW_IN_PROGRESS', 'Withdraw the review request before editing this obligation.', 409); await c.query('UPDATE obligations SET statement=$1,source_reference=$2,criticality=$3,version=version+1,updated_at=$4 WHERE id=$5', [o.statement, o.sourceReference, o.criticality, new Date().toISOString(), id]); await c.query("UPDATE obligation_workflow SET source_version=$1,review_state='DRAFT',last_edited_by=$2,proposed_by=CASE WHEN imported=1 THEN $2 ELSE proposed_by END,imported=0 WHERE obligation_id=$3", [o.sourceVersion, email, id]); const next = await getOb(c, id); await history(c, next, 'REVISED', email, 'A new content version requires a new review; earlier decisions remain in history.'); await audit(c, email, 'OBLIGATION_UPDATED', id, 'Updated candidate; review reset to draft.'); return obligationView(next); }); },
        async transitionObligation(id, input, actor) {
            fields(input, ['action', 'version', 'revisionId', 'rationale']);
            version(input.version);
            identifier(input.revisionId);
            const action = input.action;
            if (!['SUBMIT', 'WITHDRAW', 'ACCEPT', 'REJECT', 'REQUEST_CLARIFICATION'].includes(action))
                throw new InputError('INVALID_ACTION', 'Choose a supported review action.');
            const decision = ['ACCEPT', 'REJECT', 'REQUEST_CLARIFICATION'].includes(action);
            requireRole(actor, decision ? 'POLICY_AUTHORITY' : 'AUTHOR');
            const email = actorEmail(actor), rationale = text(input.rationale, 'Decision reason', 2000, decision);
            if (decision && rationale.length < 10)
                throw new InputError('REASON_REQUIRED', 'Give a decision reason of at least 10 characters.');
            return db.transaction(async (c) => {
                let old = await getOb(c, id);
                if (!old)
                    throw new InputError('OBLIGATION_NOT_FOUND', 'This obligation was not found.', 404);
                await ensureHead(c, old.change_id, input.revisionId);
                old = await getOb(c, id);
                if (old.revision_id !== input.revisionId)
                    throw new InputError('REVISION_MISMATCH', 'The obligation belongs to another revision.', 409);
                if (Number(old.version) !== input.version)
                    throw new InputError('VERSION_CONFLICT', 'This obligation changed. Reload before acting.', 409);
                let next, independent = false;
                if (action === 'SUBMIT') {
                    if (!['DRAFT', 'CLARIFICATION_REQUIRED'].includes(old.review_state))
                        throw new InputError('INVALID_TRANSITION', 'Only a draft or clarified obligation can be submitted.', 409);
                    if (Number(old.imported))
                        throw new InputError('IMPORTED_REVIEW_REQUIRED', 'Review and save this imported draft under a named identity before submitting.');
                    if (!old.source_reference?.trim() || !old.source_version?.trim())
                        throw new InputError('SOURCE_REQUIRED', 'Provide a source reference and its version before requesting review.');
                    next = 'IN_REVIEW';
                }
                else if (action === 'WITHDRAW') {
                    if (old.review_state !== 'IN_REVIEW')
                        throw new InputError('INVALID_TRANSITION', 'This obligation is not awaiting review.', 409);
                    if (email !== old.last_edited_by && email !== old.proposed_by)
                        throw new InputError('FORBIDDEN', 'Only the proposer or last editor can withdraw this request.', 403);
                    next = 'DRAFT';
                }
                else {
                    if (old.review_state !== 'IN_REVIEW')
                        throw new InputError('INVALID_TRANSITION', 'This obligation must be submitted for review first.', 409);
                    const contributors = (await c.query("SELECT DISTINCT actor FROM obligation_history WHERE obligation_id=$1 AND action IN ('PROPOSED','REVISED','COPIED_TO_REVISION')", [id])).rows.map(x => x.actor);
                    independent = !Number(old.imported) && email !== old.proposed_by && email !== old.last_edited_by && old.proposed_by !== 'legacy-import' && !contributors.includes(email);
                    if (reviewMode === 'independent' && !independent)
                        throw new InputError('INDEPENDENT_REVIEW_REQUIRED', 'A different authorized person must review this obligation.', 403);
                    if (action === 'ACCEPT' && (!old.source_reference?.trim() || !old.source_version?.trim()))
                        throw new InputError('SOURCE_REQUIRED', 'An accepted obligation requires a source and version.');
                    next = { ACCEPT: 'ACCEPTED', REJECT: 'REJECTED', REQUEST_CLARIFICATION: 'CLARIFICATION_REQUIRED' }[action];
                }
                await c.query('UPDATE obligations SET version=version+1,updated_at=$1 WHERE id=$2', [new Date().toISOString(), id]);
                await c.query('UPDATE obligation_workflow SET review_state=$1 WHERE obligation_id=$2', [next, id]);
                const current = await getOb(c, id);
                await history(c, current, action, email, rationale, independent);
                await audit(c, email, `OBLIGATION_${action}`, id, `${next}: ${rationale || 'Review workflow updated.'}`);
                return { ...obligationView(current), independentActor: decision ? independent : null };
            });
        },
        getObligationHistory: id => read(async (c) => { if (!await getOb(c, id))
            throw new InputError('OBLIGATION_NOT_FOUND', 'This obligation was not found.', 404); return (await c.query('SELECT * FROM obligation_history WHERE obligation_id=$1 ORDER BY version', [id])).rows.map(eventView); }),
        async createRevision(changeId, input, actor) { requireRole(actor, 'AUTHOR'); fields(input, ['expectedRevisionId', 'sourceRevision', 'intent', 'reason', 'copyObligations']); const expected = identifier(input.expectedRevisionId), source = sourceRevision(input.sourceRevision, true), intent = text(input.intent, 'Business intent', 4000), reason = text(input.reason, 'Revision reason', 1500); if (typeof input.copyObligations !== 'boolean')
            throw new InputError('INVALID_INPUT', 'Choose explicitly whether to copy prior obligations as candidates.'); const email = actorEmail(actor); return db.transaction(async (c) => { const old = await ensureHead(c, changeId, expected); if ((await c.query('SELECT id FROM change_revisions WHERE change_id=$1 AND source_revision=$2', [changeId, source])).rows.length)
            throw new InputError('DUPLICATE_REVISION', 'This source reference is already registered for this change.', 409); const id = randomUUID(); await c.query('INSERT INTO change_revisions (id,change_id,revision_number,parent_revision_id,source_revision,intent,producer,reason,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, changeId, Number(old.revision_number) + 1, old.id, source, intent, old.producer, reason, email, new Date().toISOString()]); if (input.copyObligations) {
            const obs = (await c.query(oq + " WHERE o.change_id=$1 AND w.revision_id=$2 AND w.review_state<>'REJECTED' ORDER BY o.created_at,o.id", [changeId, old.id])).rows;
            for (const o of obs)
                await createOb(c, changeId, id, { statement: o.statement, sourceReference: o.source_reference, sourceVersion: o.source_version, criticality: o.criticality }, email, o.id);
        } await audit(c, email, 'REVISION_CREATED', changeId, `Registered revision ${Number(old.revision_number) + 1}. Prior authority decisions and evidence were not carried over.`); return getChange(c, changeId); }); },
        exportWorkspace: () => read(async (c) => { const apps = await listApps(c), changes = await listChanges(c), full = []; for (const x of changes) {
            const revisions = [];
            for (const r of x.revisions) {
                const view = await getChange(c, x.id, r.id);
                for (const o of view.obligations)
                    o.history = (await c.query('SELECT * FROM obligation_history WHERE obligation_id=$1 ORDER BY version', [o.id])).rows.map(eventView);
                revisions.push(view);
            }
            full.push({ id: x.id, title: x.title, revisions });
        } return { schemaVersion: 2, exportedAt: new Date().toISOString(), applications: apps, changes: full, activity: await listActivity(c), notice: 'Working records and human review history. Not an assurance evidence bundle or tamper-proof audit log.' }; }),
        saveSession: (tokenHash, email, csrfToken, expiresAt, credentialVersion) => db.transaction(c => c.query('INSERT INTO workspace_sessions (token_hash,email,csrf_token,expires_at,credential_version) VALUES ($1,$2,$3,$4,$5)', [tokenHash, email, csrfToken, expiresAt, credentialVersion])),
        getSession: (tokenHash, now = Date.now()) => read(async (c) => { const r = (await c.query('SELECT * FROM workspace_sessions WHERE token_hash=$1 AND expires_at>$2', [tokenHash, now])).rows[0]; return r ? { email: r.email, csrfToken: r.csrf_token, expiresAt: Number(r.expires_at), credentialVersion: r.credential_version } : null; }),
        deleteSession: tokenHash => db.transaction(c => c.query('DELETE FROM workspace_sessions WHERE token_hash=$1', [tokenHash])),
        consumeLoginAttempt: (key, now = Date.now()) => db.transaction(async (c) => { await c.query('INSERT INTO auth_buckets (bucket_key,attempt_count,reset_at) VALUES ($1,0,$2) ON CONFLICT (bucket_key) DO NOTHING', [key, now + 600000]); const r = (await c.query('SELECT * FROM auth_buckets WHERE bucket_key=$1' + db.lock, [key])).rows[0]; if (Number(r.reset_at) <= now) {
            await c.query('UPDATE auth_buckets SET attempt_count=1,reset_at=$1 WHERE bucket_key=$2', [now + 600000, key]);
            return true;
        } if (Number(r.attempt_count) >= 10)
            return false; await c.query('UPDATE auth_buckets SET attempt_count=attempt_count+1 WHERE bucket_key=$1', [key]); return true; }),
        cleanupSessions: () => db.transaction(async (c) => { await c.query('DELETE FROM workspace_sessions WHERE expires_at<=$1', [Date.now()]); await c.query('DELETE FROM auth_buckets WHERE reset_at<=$1', [Date.now()]); }),
    };
    if (options.drafting?.enabled === true) result.drafting = createDraftingRepository({
        db, config: options.drafting, helpers: { head, lockedChange, ensureHead, createOb, audit },
    });
    try { result.impact = createImpactReader(db, { ...options.impact, reviewMode }); }
    catch (error) { await db.close(); throw error; }
    return result;
}
