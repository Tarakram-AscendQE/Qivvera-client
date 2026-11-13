/** Increment 3: explicit, versioned contracts. No model judges a disposition. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fields, InputError, text, identifier } from '../workflow-input.mjs';

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export const digest = value => 'sha256:' + createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export function fullRevision(value) {
  if (typeof value !== 'string' || !/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(value))
    throw new InputError('FULL_REVISION_REQUIRED', 'Assurance requires the full 40- or 64-character source revision. A typed reference is not a verified artifact.');
  return value;
}
export function contentDigest(value) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_CONTENT_DIGEST');
  return value;
}
export const PROFILE = Object.freeze({
  id: 'approval-separation', version: '1.0.0',
  title: 'Approval separation — bounded behavioural assessment',
  rule: 'The requester must not approve their own request. A different eligible approver must be able to approve it.',
  contract: 'qivvera.approval-http/1',
  verifierId: 'approval-separation-http', verifierVersion: '1.0.0',
  scopeRule: 'All non-rejected obligations on the selected change revision are mandatory. Only one explicitly accepted mapping is executable in this release; other obligations remain gaps.',
  exclusions: ['Unregistered obligations', 'Other APIs or workflows', 'Race conditions inside the target', 'Performance and resilience', 'Production operating conditions', 'Independent source/build attestation'],
  independence: {
    oracle: 'Versioned verifier and human-accepted mapping, not generated from target implementation.',
    execution: 'Separate worker process; deployment owner must enforce credentials and network separation.',
    binding: 'Operator-pinned expected identity, matched to target-reported identity before and after execution; not independent build attestation.',
    evidence: 'Append-only application writes and SHA-256 content digest; not a signature or protection from database administrators.'
  }
});
export function verifierDigest() {
  const files = ['../../verifiers/approval-separation.mjs', '../../verifiers/transport.mjs', './contracts.mjs'];
  return digest(files.map(path => ({ path, content: readFileSync(new URL(path, import.meta.url), 'utf8') })));
}
export function validateCatalogue(input, { local = false } = {}) {
  if (!Array.isArray(input) || input.length > 30) throw new Error('INVALID_TARGET_CATALOGUE');
  const seen = new Set();
  return input.map(t => {
    fields(t, ['id','name','applicationId','sourceRevision','artifactDigest','environmentDigest','instanceId','origin','requesterId','approverId','requesterTokenEnv','approverTokenEnv','bindingStatement','testOnly']);
    const id = text(t.id, 'Target ID', 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || seen.has(id)) throw new Error('INVALID_OR_DUPLICATE_TARGET_ID');
    seen.add(id);
    const u = new URL(t.origin);
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || !['https:','http:'].includes(u.protocol)) throw new Error('INVALID_TARGET_ORIGIN');
    if (u.protocol === 'http:' && !(local && ['127.0.0.1','localhost'].includes(u.hostname))) throw new Error('TARGET_HTTPS_REQUIRED');
    if (t.testOnly !== true) throw new Error('SYNTHETIC_TEST_ENVIRONMENT_REQUIRED');
    for (const k of ['requesterTokenEnv','approverTokenEnv']) if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(t[k])) throw new Error('INVALID_SECRET_REFERENCE');
    const requesterId = text(t.requesterId, 'Requester identity', 100), approverId = text(t.approverId, 'Approver identity', 100);
    if (requesterId === approverId) throw new Error('DISTINCT_CONTROL_IDENTITIES_REQUIRED');
    return Object.freeze({id, name:text(t.name,'Target name',100), applicationId:identifier(t.applicationId), sourceRevision:fullRevision(t.sourceRevision), artifactDigest:contentDigest(t.artifactDigest), environmentDigest:contentDigest(t.environmentDigest), instanceId:text(t.instanceId,'Instance identity',100), origin:u.origin, requesterId, approverId, requesterTokenEnv:t.requesterTokenEnv, approverTokenEnv:t.approverTokenEnv, bindingStatement:text(t.bindingStatement,'Operator binding statement',1000), testOnly:true});
  });
}
export function publicTarget(t) {
  const {requesterTokenEnv,approverTokenEnv,...safe} = t;
  void requesterTokenEnv; void approverTokenEnv;
  return safe;
}
export function scopeOf(change, revision, obligations) {
  return { changeId:change.id, applicationId:change.application_id, revisionId:revision.id, sourceRevision:revision.source_revision,
    obligations:obligations.map(o=>({id:o.id,version:Number(o.version),statement:o.statement,sourceReference:o.source_reference,sourceVersion:o.source_version,reviewStatus:o.review_state,criticality:o.criticality,reviewDecision:o.review_event_id?{id:o.review_event_id,action:o.review_action,actor:o.review_actor,rationale:o.review_reason,independentActor:!!Number(o.independent_actor)}:null})).sort((a,b)=>a.id.localeCompare(b.id)) };
}
export function comparisonKey(snapshot) {
  return digest({target:snapshot.target,verifier:snapshot.verifier,profileDigest:snapshot.profileDigest,
    obligationId:snapshot.mapping.obligationId,obligationVersion:snapshot.mapping.obligationVersion,acceptanceDecisionId:snapshot.mapping.acceptanceDecisionId});
}
export function deriveCase(snapshot, report, counterevidence = []) {
  const gap = (o, reason) => ({obligationId:o.id, statement:o.statement, state:'INSUFFICIENT', reason, evidenceIds:[]});
  const findings = snapshot.scope.obligations.map(o => {
    if (o.reviewStatus === 'REJECTED') return {obligationId:o.id,statement:o.statement,state:'EXCLUDED',reason:'Rejected by the recorded authority workflow; preserved in scope history.',evidenceIds:[]};
    if (o.reviewStatus !== 'ACCEPTED') return gap(o,'AUTHORITATIVE_REQUIREMENT_UNRESOLVED');
    if (o.id !== snapshot.mapping.obligationId) return gap(o,'NO_SUPPORTED_VERIFIER_MAPPING');
    if(counterevidence.length) return {obligationId:o.id,statement:o.statement,state:'VIOLATED',reason:'UNRESOLVED_PRIOR_COUNTEREXAMPLE',evidenceIds:['execution',...counterevidence.map(e=>e.runId)]};
    return {obligationId:o.id,statement:o.statement,state:report.outcome,reason:report.reason,evidenceIds:['execution']};
  });
  const required = findings.filter(f=>f.state!=='EXCLUDED');
  let disposition = 'INDETERMINATE';
  if (required.some(f=>f.state==='VIOLATED')) disposition='NOT_READY';
  else if(required.length && required.every(f=>f.state==='SUPPORTED')) disposition='READY';
  return {disposition, findings, reason:disposition==='READY'?'All declared mandatory obligations are supported within this frozen scope.':disposition==='NOT_READY'?'A valid behavioural observation contradicts a mandatory obligation.':'The evidence does not support all declared mandatory obligations.',
    qualification:'Scope-bound behavioural assessment, not universal safety, compliance, or independent artifact attestation.'};
}
