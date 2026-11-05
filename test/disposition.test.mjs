import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDisposition, sameTarget } from '../dist/core/disposition.js';

const digest = char => `sha256:${char.repeat(64)}`;
const target = () => ({applicationId:'app-A', revision:'rev-A', artifactDigest:digest('a'), environmentDigest:digest('b'), profileId:'profile-A',profileVersion:'1',scopeDigest:digest('c'),verifierSetDigest:digest('d')});
function snapshot() {
  const t=target();
  return {target:t,lifecycle:'COMPLETED',scopeConfirmed:true,requestedExceptionIds:[],
    obligations:[{id:'OBL-1',mandatory:true,blocking:true,authority:'AUTHORITATIVE',authorityAccepted:true,state:'SUPPORTED',evidenceIds:['E-1']}],
    evidence:[{id:'E-1',obligationId:'OBL-1',target:{...t},admissible:true}]};
}

test('accepted current support yields scope-bound READY',()=>{
  const result=deriveDisposition(snapshot());
  assert.equal(result.disposition,'READY');
  assert.deepEqual(result.reasonCodes,['REQUIRED_OBLIGATIONS_SUPPORTED_WITHIN_DECLARED_SCOPE']);
});
for (const lifecycle of ['QUEUED','RUNNING','FAILED','CANCELLED']) {
  test(`${lifecycle} has no completed disposition`,()=>{
    const s=snapshot();s.lifecycle=lifecycle;
    const d=deriveDisposition(s);
    assert.equal(d.disposition,null);
    assert.deepEqual(d.reasonCodes,[`ASSESSMENT_${lifecycle}`]);
  });
}
test('new revision cannot inherit previous READY',()=>{
  const old=snapshot();
  assert.equal(deriveDisposition(old).disposition,'READY');
  const current=structuredClone(old);current.target.revision='rev-B';
  assert.equal(deriveDisposition(current).disposition,'INDETERMINATE');
  assert.equal(deriveDisposition(old).disposition,'READY');
});
for (const field of Object.keys(target())) {
  test(`evidence must match target field ${field}`,()=>{
    const s=snapshot();s.evidence[0].target[field] = field.toLowerCase().includes('digest') ? digest('e') : 'different';
    assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
  });
}
test('empty scope cannot produce vacuous READY',()=>{
  const s=snapshot();s.obligations=[];s.evidence=[];
  const d=deriveDisposition(s);assert.equal(d.disposition,'INDETERMINATE');
  assert.ok(d.reasonCodes.includes('NO_REQUIRED_OBLIGATIONS'));
});
test('unconfirmed scope cannot produce READY',()=>{
  const s=snapshot();s.scopeConfirmed=false;
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('candidate cannot be promoted merely by support evidence',()=>{
  const s=snapshot();s.obligations[0].authority='CANDIDATE';
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('unaccepted derived authority prevents READY',()=>{
  const s=snapshot();s.obligations[0].authority='DERIVED';s.obligations[0].authorityAccepted=false;
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
for (const state of ['INSUFFICIENT','CONFLICTED','NOT_ASSESSED']) {
  test(`mandatory ${state} prevents READY`,()=>{
    const s=snapshot();s.obligations[0].state=state;
    assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
  });
}
test('one valid blocking violation dominates other support',()=>{
  const s=snapshot();s.obligations.push({...s.obligations[0],id:'OBL-2',state:'VIOLATED',evidenceIds:['E-2']});
  s.evidence.push({...s.evidence[0],id:'E-2',obligationId:'OBL-2'});
  assert.equal(deriveDisposition(s).disposition,'NOT_READY');
});
test('candidate concern does not masquerade as a confirmed violation',()=>{
  const s=snapshot();s.obligations[0].authority='CANDIDATE';s.obligations[0].state='VIOLATED';
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('unbound allegation cannot establish NOT READY',()=>{
  const s=snapshot();s.obligations[0].state='VIOLATED';s.evidence=[];
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('missing evidence cannot support READY',()=>{
  const s=snapshot();s.evidence=[];
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('inadmissible evidence cannot support READY',()=>{
  const s=snapshot();s.evidence[0].admissible=false;
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('one obligations evidence cannot be borrowed by another',()=>{
  const s=snapshot();s.obligations.push({...s.obligations[0],id:'OBL-2'});
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('exception request cannot override a violation',()=>{
  const s=snapshot();s.obligations[0].state='VIOLATED';s.requestedExceptionIds=['EX-1'];
  assert.equal(deriveDisposition(s).disposition,'NOT_READY');
});
test('unimplemented exception workflow never fabricates acceptance',()=>{
  const s=snapshot();s.requestedExceptionIds=['EX-1'];
  assert.equal(deriveDisposition(s).disposition,'INDETERMINATE');
});
test('a valid violation is preserved even when overall scope is incomplete',()=>{
  const s=snapshot();s.scopeConfirmed=false;s.obligations[0].state='VIOLATED';
  assert.equal(deriveDisposition(s).disposition,'NOT_READY');
});
test('duplicate obligation IDs fail validation',()=>{
  const s=snapshot();s.obligations.push({...s.obligations[0]});
  assert.throws(()=>deriveDisposition(s),/INVALID_OBLIGATION_ID/);
});
test('duplicate evidence IDs fail validation',()=>{
  const s=snapshot();s.evidence.push({...s.evidence[0]});
  assert.throws(()=>deriveDisposition(s),/INVALID_EVIDENCE_ID/);
});
test('unknown lifecycle fails validation',()=>{
  const s=snapshot();s.lifecycle='MAGIC_SUCCESS';
  assert.throws(()=>deriveDisposition(s),/INVALID_SNAPSHOT/);
});
test('unknown obligation state fails validation',()=>{
  const s=snapshot();s.obligations[0].state='PROVEN_SAFE';
  assert.throws(()=>deriveDisposition(s),/INVALID_OBLIGATION/);
});
test('invalid digest fails validation',()=>{
  const s=snapshot();s.target.artifactDigest='sha256:placeholder';
  assert.throws(()=>deriveDisposition(s),/INVALID_DIGEST/);
});
test('evidence for an unknown obligation fails validation',()=>{
  const s=snapshot();s.evidence[0].obligationId='MISSING';
  assert.throws(()=>deriveDisposition(s),/INVALID_EVIDENCE/);
});
test('assessment input is not mutated by evaluation',()=>{
  const s=snapshot();const before=JSON.stringify(s);deriveDisposition(s);
  assert.equal(JSON.stringify(s),before);
});
test('returned target is a detached snapshot',()=>{
  const s=snapshot();const result=deriveDisposition(s);s.target.revision='rev-B';
  assert.equal(result.target.revision,'rev-A');
});
test('sameTarget rejects blank identity',()=>{
  const a=target(),b=target();b.revision='';
  assert.throws(()=>sameTarget(a,b),/INVALID_TARGET:revision/);
});
