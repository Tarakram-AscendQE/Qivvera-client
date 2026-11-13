import { InputError, fields } from './errors.mjs';
export { InputError, fields };
export function text(value, name, max, required = true) {
    if (!required && (value === undefined || value === null || value === ''))
        return '';
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
        throw new InputError('INVALID_FIELD', `${name} must contain ${required ? '1' : '0'}–${max} readable characters.`);
    return value.trim();
}
export function identifier(value, name = 'Identifier') { const s = text(value, name, 64); if (!/^[a-f0-9-]{36}$/.test(s))
    throw new InputError('INVALID_ID', `${name} must be a saved record identifier.`); return s; }
export function version(value) { if (!Number.isInteger(value) || value < 1)
    throw new InputError('INVALID_VERSION', 'Reload this record and submit its current version.'); return value; }
export function actorEmail(actor) { if (!actor || typeof actor.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor.email.trim()) || !Array.isArray(actor.roles))
    throw new InputError('AUTH_REQUIRED', 'An authenticated workspace identity is required.', 401); return actor.email.trim().toLowerCase(); }
export function requireRole(actor, role) { actorEmail(actor); if (!actor.roles.includes(role))
    throw new InputError('FORBIDDEN', 'Your workspace role does not permit this action.', 403); }
export function sourceRevision(value, required = false) { const r = text(value, 'Source revision', 64, required).toLowerCase(); if (r && !/^[a-f0-9]{7,64}$/.test(r))
    throw new InputError('INVALID_REVISION', 'Use a 7–64 character Git reference. This reference remains declared, not verified.'); return r; }
export function applicationInput(input) { fields(input, ['name', 'description', 'repositoryUrl']); const repositoryUrl = text(input.repositoryUrl, 'Repository URL', 500, false); if (repositoryUrl) {
    let u;
    try {
        u = new URL(repositoryUrl);
    }
    catch {
        throw new InputError('INVALID_URL', 'Use a valid HTTPS repository URL.');
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search)
        throw new InputError('INVALID_URL', 'Use an HTTPS URL without credentials or query parameters.');
} return { name: text(input.name, 'Application name', 100), description: text(input.description, 'Description', 1000, false), repositoryUrl }; }
export function changeInput(input) { fields(input, ['applicationId', 'title', 'intent', 'sourceRevision', 'producer']); const producer = input.producer ?? 'UNSPECIFIED'; if (!['AI_ASSISTED', 'HUMAN', 'AUTOMATION', 'UNSPECIFIED'].includes(producer))
    throw new InputError('INVALID_PRODUCER', 'Choose a supported producer category.'); return { applicationId: identifier(input.applicationId), title: text(input.title, 'Change title', 160), intent: text(input.intent, 'Business intent', 4000, false), sourceRevision: sourceRevision(input.sourceRevision), producer }; }
export function obligationInput(input, edit = false) { fields(input, edit ? ['statement', 'sourceReference', 'sourceVersion', 'criticality', 'version', 'revisionId'] : ['statement', 'sourceReference', 'sourceVersion', 'criticality', 'revisionId']); const criticality = input.criticality ?? 'MEDIUM'; if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(criticality))
    throw new InputError('INVALID_CRITICALITY', 'Choose a supported criticality.'); if (edit)
    version(input.version); return { statement: text(input.statement, 'Obligation', 1200), sourceReference: text(input.sourceReference, 'Source reference', 500, false), sourceVersion: text(input.sourceVersion, 'Source version', 120, false), criticality, revisionId: identifier(input.revisionId, 'Change revision') }; }
export const iso = v => new Date(v).toISOString();
export const appView = r => r && ({ id: r.id, name: r.name, description: r.description, repositoryUrl: r.repository_url, createdAt: iso(r.created_at) });
export const revisionView = r => r && ({ id: r.id, changeId: r.change_id, number: Number(r.revision_number), parentRevisionId: r.parent_revision_id, sourceRevision: r.source_revision || null, sourceBinding: 'DECLARED_NOT_VERIFIED', intent: r.intent, producer: r.producer, reason: r.reason, createdBy: r.created_by, createdAt: iso(r.created_at), assessmentStatus: 'NOT_ASSESSED', disposition: null });
export function obligationView(r) { if (!r)
    return null; return { id: r.id, changeId: r.change_id, revisionId: r.revision_id, statement: r.statement, sourceReference: r.source_reference, sourceVersion: r.source_version, criticality: r.criticality, authority: r.review_state === 'ACCEPTED' ? 'AUTHORITATIVE' : 'CANDIDATE', authorityBasis: r.review_state === 'ACCEPTED' ? 'NAMED_HUMAN_ATTESTATION' : 'UNCONFIRMED', sourceAuthenticity: 'NOT_INDEPENDENTLY_VERIFIED', reviewStatus: r.review_state, proposedBy: r.proposed_by, lastEditedBy: r.last_edited_by, imported: !!Number(r.imported), copiedFrom: r.copied_from || null, state: 'NOT_ASSESSED', evidenceCount: 0, version: Number(r.version), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) }; }
