import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { generateDrafts } from '../backend/server/drafting/generator.mjs';
import { PROMPT_DIGEST, PROMPT_VERSION } from '../backend/server/drafting/contracts.mjs';

export const author = { email: 'draft-author@example.test', roles: ['AUTHOR'] };
export const otherAuthor = { email: 'other-draft-author@example.test', roles: ['AUTHOR'] };
export const authority = { email: 'draft-policy@example.test', roles: ['POLICY_AUTHORITY'] };
export const viewer = { email: 'draft-viewer@example.test', roles: ['VIEWER'] };
export const dualRole = { email: author.email, roles: ['AUTHOR', 'POLICY_AUTHORITY'] };
export const SOURCE = 'A requester must not approve their own request.\nAn eligible independent approver must be able to approve a pending request.';

export async function modelResult(sourceText, method = 'openai', config = {}) {
    const rules = await generateDrafts(sourceText, 'rules', {});
    if (method === 'rules') return rules;
    const model = config.model ?? 'test-drafting-model';
    return { engine: { method: 'openai', id: 'openai-responses', version: '1.0.0', provider: 'openai',
        requestedModel: model, model, promptVersion: PROMPT_VERSION, promptDigest: PROMPT_DIGEST,
        responseId: 'resp_synthetic_repository_fixture' }, suggestions: rules.suggestions, warnings: [] };
}

export async function setupDrafting(t, { postgresURL, drafting = {} } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'qivvera-drafting-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const db = postgresURL ? { driver: 'postgres', connectionString: postgresURL, sslMode: 'disable' } : { path: join(dir, 'workspace.sqlite') };
    const options = { ...db, migrate: true, drafting: { enabled: true, openaiEnabled: false, ...drafting } };
    const workflow = await openWorkflowRepository(options); t.after(() => workflow.close());
    const app = await workflow.createApplication({ name: 'Drafting ' + randomUUID(), description: 'Synthetic drafting verification workspace.' }, author);
    const change = await workflow.createChange({ applicationId: app.id, title: 'Review approval requirements',
        intent: 'Prepare sourced candidate requirements for independent review.', sourceRevision: 'a'.repeat(40), producer: 'HUMAN' }, author);
    return { workflow, drafting: workflow.drafting, app, change, db, options,
        input: (overrides = {}) => ({ requestId: randomUUID(), revisionId: change.revision.id, sourceReference: 'Approval policy §2',
            sourceVersion: '2026-11 review 1', sourceText: SOURCE, method: 'rules', externalProcessingConfirmed: false, ...overrides }),
        createDecision: (suggestion, overrides = {}) => ({ action: 'CREATE_CANDIDATE', version: suggestion.version,
            statement: suggestion.statement, criticality: 'HIGH', rationale: 'This source statement applies to the declared change.', ...overrides }),
        dismissDecision: (overrides = {}) => ({ action: 'DISMISS', version: 1, rationale: 'This preparation suggestion is outside the declared change.', ...overrides }),
    };
}

/** Genuine existing assurance execution before/after the new candidate creation path. */
export async function draftingAssuranceJourney(t, { postgresURL } = {}) {
    const { setupMulti } = await import('./generalization-helpers.mjs');
    const h = await setupMulti(t, { postgresURL });
    const original = await h.run();
    const workflow = await openWorkflowRepository({ ...h.db, migrate: true, drafting: { enabled: true } });
    t.after(() => workflow.close());
    const run = await workflow.drafting.generate(h.change.id, { requestId: randomUUID(), revisionId: h.change.revision.id,
        sourceReference: 'Additional policy requirements', sourceVersion: '2',
        sourceText: 'Every approval must record a reason.\nEvery request must retain its originating department.', method: 'rules', externalProcessingConfirmed: false }, author);
    const afterPreparation = await h.service.getRun(original.id);
    await workflow.drafting.act(run.id, run.suggestions[0].id, { action: 'DISMISS', version: 1,
        rationale: 'The reason statement requires further applicability analysis.' }, author);
    const afterDismissal = await h.service.getRun(original.id);
    const adopted = await workflow.drafting.act(run.id, run.suggestions[1].id, { action: 'CREATE_CANDIDATE', version: 1,
        statement: run.suggestions[1].statement, criticality: 'HIGH', rationale: 'This additional requirement belongs in the declared scope.' }, author);
    const afterAdoption = await h.service.getRun(original.id), context = await h.service.getContext(h.change.id, h.change.revision.id);
    const reassessment = await h.run(), preserved = await h.service.getRun(original.id);
    return { original, afterPreparation, afterDismissal, afterAdoption, context, reassessment, preserved, adopted,
        workflow, schemaVersion: await workflow.getSchemaVersion() };
}
