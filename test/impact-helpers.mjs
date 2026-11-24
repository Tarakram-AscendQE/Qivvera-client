import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openDatabase } from '../backend/server/workflow-store.mjs';
import { setup } from './assurance-helpers.mjs';
import { setupMulti } from './generalization-helpers.mjs';
export { author, authority, viewer } from './assurance-helpers.mjs';
import { author, authority } from './assurance-helpers.mjs';

export async function setupImpact(t, { postgresURL, assurance = false, generalization = false, mode = 'correct', clock } = {}) {
    let h;
    if (assurance) {
        h = generalization ? await setupMulti(t, { postgresURL, mode }) : await setup(t, { postgresURL, mode, clock });
        const readerOptions = { ...h.db, migrate: false, impact: { ...h.options, assuranceEnabled: true, ...(clock ? { now: clock } : {}) } };
        const readerWorkflow = await openWorkflowRepository(readerOptions);
        t.after(() => readerWorkflow.close());
        h = { ...h, impact: readerWorkflow.impact, readerWorkflow, readerOptions };
    } else {
        const dir = mkdtempSync(join(tmpdir(), 'qivvera-impact-'));
        const db = postgresURL ? { driver: 'postgres', connectionString: postgresURL, sslMode: 'disable' } : { path: join(dir, 'workspace.sqlite') };
        const readerOptions = { ...db, migrate: true, impact: { ...(clock ? { now: clock } : {}) } };
        const workflow = await openWorkflowRepository(readerOptions);
        t.after(async () => { await workflow.close(); rmSync(dir, { recursive: true, force: true }); });
        const app = await workflow.createApplication({ name: 'Impact ' + randomUUID() }, author);
        const change = await workflow.createChange({ applicationId: app.id, title: 'Recorded scope change', sourceRevision: 'a'.repeat(40), intent: 'Preserve declared approval rules.' }, author);
        h = { dir, db, app, change, workflow, readerWorkflow: workflow, readerOptions, impact: workflow.impact };
    }
    const add = (revisionId = h.change.revision.id, overrides = {}) => h.workflow.addObligation(h.change.id, {
        revisionId, statement: 'The application must preserve the exact request identifier.', sourceReference: 'Versioned business policy', sourceVersion: '1', criticality: 'HIGH', ...overrides
    }, author);
    const accept = async o => {
        o = await h.workflow.transitionObligation(o.id, { revisionId: o.revisionId, version: o.version, action: 'SUBMIT' }, author);
        return h.workflow.transitionObligation(o.id, { revisionId: o.revisionId, version: o.version, action: 'ACCEPT', rationale: 'A separate named authority confirms this declared business requirement.' }, authority);
    };
    const revise = async (previous = h.change, overrides = {}) => h.workflow.createRevision(h.change.id, {
        expectedRevisionId: previous.revision.id, sourceRevision: 'b'.repeat(40), intent: 'Preserve approval rules in a new declared implementation.', reason: 'A new declared implementation requires fresh scope review.', copyObligations: true, ...overrides
    }, author);
    const edit = (o, overrides) => h.workflow.editObligation(o.id, {
        revisionId: o.revisionId, version: o.version, statement: o.statement, sourceReference: o.sourceReference, sourceVersion: o.sourceVersion, criticality: o.criticality, ...overrides
    }, author);
    const sql = async fn => { const db = await openDatabase(h.db); try { return await db.transaction(fn); } finally { await db.close(); } };
    const report = revisionId => h.impact.get(h.change.id, revisionId ?? h.change.revision.id);
    return { ...h, add, accept, revise, edit, sql, report };
}
