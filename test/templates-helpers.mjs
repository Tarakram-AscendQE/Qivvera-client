import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openWorkflowRepository } from '../server/workflow-repository.mjs';
import { openAssuranceRepository } from '../server/assurance/repository.mjs';
import { openDatabase } from '../server/workflow-store.mjs';
import { CHECKS } from '../server/assurance/generalization.mjs';
export const author = { email: 'author@example.test', roles: ['AUTHOR'] };
export const authority = { email: 'policy@example.test', roles: ['POLICY_AUTHORITY'] };
export const otherAuthority = { email: 'other-policy@example.test', roles: ['POLICY_AUTHORITY'] };
export const viewer = { email: 'viewer@example.test', roles: ['VIEWER'] };
export const rationale = 'A named authority has reviewed this exact requirement against the bounded check and its limitations.';

export async function setupTemplates(t, { postgresURL, adapter = 'approval-v1', reviewMode = 'independent', clock } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'qivvera-templates-'));
    const db = postgresURL ? { driver: 'postgres', connectionString: postgresURL, sslMode: 'disable' } : { path: join(dir, 'workspace.sqlite') };
    let workflow, service;
    t.after(async () => { await service?.close(); await workflow?.close(); rmSync(dir, { recursive: true, force: true }); });
    workflow = await openWorkflowRepository({ ...db, migrate: true, reviewMode });
    const app = await workflow.createApplication({ name: 'Template source ' + randomUUID() }, author);
    const destinationApp = await workflow.createApplication({ name: 'Template destination ' + randomUUID() }, author);
    const source = await workflow.createChange({ applicationId: app.id, title: 'Original approval controls', sourceRevision: 'a'.repeat(40), intent: 'Preserve separation and finality.' }, author);
    const destination = await workflow.createChange({ applicationId: destinationApp.id, title: 'Another approval implementation', sourceRevision: 'b'.repeat(40), intent: 'Review applicability again for this application.' }, author);
    const accept = async o => {
        o = await workflow.transitionObligation(o.id, { revisionId: o.revisionId, version: o.version, action: 'SUBMIT' }, author);
        return workflow.transitionObligation(o.id, { revisionId: o.revisionId, version: o.version, action: 'ACCEPT', rationale }, authority);
    };
    const add = async (change, check, overrides = {}) => accept(await workflow.addObligation(change.id, {
        revisionId: change.revision.id, statement: check.rule, sourceReference: 'Approved control specification', sourceVersion: '1', criticality: 'HIGH', ...overrides
    }, author));
    const sourceObligations = [], destinationObligations = [];
    for (const check of CHECKS) { sourceObligations.push(await add(source, check)); destinationObligations.push(await add(destination, check)); }
    const targetFor = (change, id) => ({ id, name: 'Synthetic ' + id, applicationId: change.applicationId, sourceRevision: change.revision.sourceRevision,
        artifactDigest: 'sha256:' + 'd'.repeat(64), environmentDigest: 'sha256:' + 'e'.repeat(64), instanceId: id + '-instance',
        origin: 'http://127.0.0.1:1', requesterId: 'fixture-requester', approverId: 'fixture-approver',
        requesterTokenEnv: 'TEMPLATE_FIXTURE_REQUESTER_TOKEN', approverTokenEnv: 'TEMPLATE_FIXTURE_APPROVER_TOKEN',
        bindingStatement: 'Synthetic operator declaration; this record makes no claim of actual execution.', testOnly: true, adapterId: adapter });
    const sourceTarget = targetFor(source, 'template-source'), destinationTarget = targetFor(destination, 'template-destination');
    const options = { ...db, migrate: true, targets: [sourceTarget, destinationTarget], allowLocalTargets: true,
        generalizationEnabled: true, templatesEnabled: true, reviewMode, ...(clock ? { now: clock } : {}) };
    service = await openAssuranceRepository(options);
    const sourceMappings = sourceObligations.map((o, i) => ({ obligationId: o.id, checkId: CHECKS[i].id, rationale }));
    const destinationMappings = destinationObligations.map((o, i) => ({ obligationId: o.id, checkId: CHECKS[i].id, rationale }));
    const sourceContext = await service.getContext(source.id, source.revision.id);
    const sourcePlan = await service.approvePlan(source.id, { revisionId: source.revision.id, scopeDigest: sourceContext.scopeDigest,
        expectedPlanVersion: 0, targetId: sourceTarget.id, mappings: sourceMappings, rationale, acknowledgeLimits: true }, authority);
    const input = (overrides = {}) => ({ requestKey: randomUUID(), sourceChangeId: source.id, sourceRevisionId: source.revision.id,
        sourcePlanId: sourcePlan.id, sourceScopeDigest: sourceContext.scopeDigest,
        name: 'Approval controls to review', purpose: 'Prepare explicit mapping review in another change with the same approved adapter.',
        rationale, acknowledgeLimits: true, ...overrides });
    const useInput = async (template, overrides = {}) => {
        const context = await service.getContext(destination.id, destination.revision.id);
        return { revisionId: destination.revision.id, scopeDigest: context.scopeDigest, expectedPlanVersion: context.plan?.version ?? 0,
            targetId: destinationTarget.id, mappings: destinationMappings.filter(m => template.version.snapshot.entries.some(e => e.check.id === m.checkId)),
            rationale, acknowledgeLimits: true, templateUse: { templateId: template.family.id, versionId: template.version.id,
                templateDigest: template.version.digest, requestKey: randomUUID() }, ...overrides };
    };
    const sql = async fn => { const connection = await openDatabase(db); try { return await connection.transaction(fn); } finally { await connection.close(); } };
    return { dir, db, options, workflow, service, templates: service.templates, app, destinationApp, source, change: source, destination,
        sourceObligations, destinationObligations, sourceTarget, destinationTarget, sourceContext, sourcePlan, sourceMappings,
        destinationMappings, input, useInput, sql, accept, add, save: overrides => service.templates.create(input(overrides), authority) };
}
