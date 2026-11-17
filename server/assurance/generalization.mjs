/** Version 2 extends, rather than rewrites, the published version 1 evidence contract. */
import {readFileSync} from 'node:fs';
import {PROFILE,canonical,digest,verifierDigest,validateCatalogue,publicTarget,deriveCase,comparisonKey} from './contracts.mjs';
export {canonical,digest,PROFILE,verifierDigest,publicTarget};
export const CHECKS=Object.freeze([
  Object.freeze({id:'separation',version:'1.0.0',title:'Requester–approver separation',rule:'A requester cannot approve their own request; a different eligible approver can approve it.'}),
  Object.freeze({id:'finality',version:'1.0.0',title:'Approval finality',rule:'After successful approval, a repeated approval must be rejected with 409 and must leave the approved record unchanged. This is not an idempotent-success contract.'})
]);
export const PROFILE_V2=Object.freeze({id:'approval-controls',version:'2.0.0',title:'Bounded approval controls',checks:CHECKS,scopeRule:'All non-rejected obligations remain mandatory. At most two distinct checks are mapped; unaccepted or unmapped obligations remain gaps.',exclusions:PROFILE.exclusions,independence:PROFILE.independence});
export const isV2=s=>s?.schema==='qivvera.assurance-plan/2';
export function validateTargets(raw,options={}){
  if(!Array.isArray(raw))throw new Error('INVALID_TARGET_CATALOGUE');
  const plain=raw.map(t=>{const {adapterId,...rest}=t;if(adapterId!==undefined&&!['approval-v1','expense-v1'].includes(adapterId))throw new Error('UNSUPPORTED_ADAPTER');return rest;});
  return validateCatalogue(plain,options).map((t,i)=>raw[i].adapterId===undefined?t:Object.freeze({...t,adapterId:raw[i].adapterId}));
}
export function verificationIdentity(checkId,adapterId='approval-v1'){
  const check=CHECKS.find(c=>c.id===checkId);
  if(!check||!['approval-v1','expense-v1'].includes(adapterId))throw new Error('UNSUPPORTED_VERIFICATION');
  const files=['../../verifiers/approval-controls.mjs','../../verifiers/approval-adapters.mjs','../../verifiers/bounded-transport.mjs','./generalization.mjs'];
  return {id:`approval-${checkId}`,version:check.version,adapterId,bundleDigest:digest(files.map(path=>({path,content:readFileSync(new URL(path,import.meta.url),'utf8')}))),digest:digest({check,adapterId,files:files.map(path=>({path,content:readFileSync(new URL(path,import.meta.url),'utf8')}))})};
}
export const mappingsOf=s=>isV2(s)?s.mappings:[{...s.mapping,checkId:'separation',verifier:s.verifier}];
export const mappingOf=(s,id)=>mappingsOf(s).find(m=>m.obligationId===id);
export function configuredSnapshot(s,catalogue){
 const target=catalogue.find(t=>t.id===s.target.id);
 if(!target||digest(publicTarget(target))!==digest(s.target))return false;
 if(!isV2(s))return (!target.adapterId||target.adapterId==='approval-v1')&&s.verifier.digest===verifierDigest();
 return s.profileDigest===digest(PROFILE_V2)&&s.mappings.length>=1&&s.mappings.length<=2&&s.mappings.every(m=>digest(m.verifier)===digest(verificationIdentity(m.checkId,target.adapterId??'approval-v1')));
}
export function mappedKey(snapshot,m){
 if(!isV2(snapshot))return comparisonKey(snapshot);
 return digest({target:snapshot.target,verifier:m.verifier,profileDigest:snapshot.profileDigest,obligationId:m.obligationId,obligationVersion:m.obligationVersion,acceptanceDecisionId:m.acceptanceDecisionId});
}
export const reportFor=(snapshot,report,id)=>isV2(snapshot)?report.reports?.find(r=>r.obligationId===id)?.report:report;
export function validateReport(snapshot,report){
 const valid=r=>r&&['SUPPORTED','VIOLATED','INSUFFICIENT'].includes(r.outcome)&&typeof r.reason==='string'&&/^[A-Z0-9_]{1,120}$/.test(r.reason)&&Array.isArray(r.observations)&&r.observations.length<=24;
 if(!isV2(snapshot)){if(!valid(report))throw new Error('INVALID_VERIFIER_REPORT');}
 else{
  if(report?.schema!=='qivvera.multi-report/1'||!Array.isArray(report.reports)||report.reports.length!==snapshot.mappings.length)throw new Error('INVALID_MULTI_REPORT');
  const ids=new Set();
  for(const r of report.reports){const m=mappingOf(snapshot,r.obligationId);if(!m||ids.has(r.obligationId)||r.checkId!==m.checkId||r.verifierDigest!==m.verifier.digest||!valid(r.report))throw new Error('INVALID_MAPPED_REPORT');ids.add(r.obligationId);}
 }
 if(Buffer.byteLength(canonical(report))>131072)throw new Error('EVIDENCE_TOO_LARGE');
}
export function deriveAssessment(snapshot,report,counterevidence=[]){
 if(!isV2(snapshot))return deriveCase(snapshot,report,counterevidence);
 const findings=snapshot.scope.obligations.map(o=>{
  const base={obligationId:o.id,statement:o.statement,evidenceIds:[]};
  if(o.reviewStatus==='REJECTED')return {...base,state:'EXCLUDED',reason:'REJECTED_BY_RECORDED_AUTHORITY'};
  if(o.reviewStatus!=='ACCEPTED')return {...base,state:'INSUFFICIENT',reason:'AUTHORITATIVE_REQUIREMENT_UNRESOLVED'};
  const m=mappingOf(snapshot,o.id);if(!m)return {...base,state:'INSUFFICIENT',reason:'NO_SUPPORTED_VERIFIER_MAPPING'};
  const refs=counterevidence.filter(e=>e.obligationId===o.id);
  if(refs.length)return {...base,state:'VIOLATED',reason:'UNRESOLVED_PRIOR_COUNTEREXAMPLE',evidenceIds:refs.map(e=>e.runId)};
  const r=reportFor(snapshot,report,o.id);
  return {...base,state:r?.outcome??'INSUFFICIENT',reason:r?.reason??'MAPPED_REPORT_MISSING',evidenceIds:r?[`execution:${o.id}`]:[]};
 });
 const required=findings.filter(f=>f.state!=='EXCLUDED');
 const disposition=required.some(f=>f.state==='VIOLATED')?'NOT_READY':required.length&&required.every(f=>f.state==='SUPPORTED')?'READY':'INDETERMINATE';
 return {disposition,findings,reason:disposition==='READY'?'Every declared mandatory obligation has supporting evidence within this scope.':disposition==='NOT_READY'?'At least one mandatory obligation has a valid counterexample.':'Unresolved authority, missing mappings or insufficient observations prevent readiness.',qualification:'Bounded approval-interface evidence, not exhaustive coverage, independent artifact attestation or universal safety.'};
}

export function sameExecutionContract(source,candidate,sourceId,candidateId){
 if(source.profileDigest!==candidate.profileDigest||(source.target.adapterId??'approval-v1')!==(candidate.target.adapterId??'approval-v1'))return false;
 if(!isV2(source)&&!isV2(candidate))return source.verifier.digest===candidate.verifier.digest;
 if(!isV2(source)||!isV2(candidate))return false;
 const before=mappingOf(source,sourceId),after=mappingOf(candidate,candidateId);
 if(!after)return false;
 return before?before.verifier.digest===after.verifier.digest:source.mappings[0]?.verifier.bundleDigest===after.verifier.bundleDigest;
}
