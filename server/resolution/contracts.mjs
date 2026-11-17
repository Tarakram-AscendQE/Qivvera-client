/** Resolution is an accountable workflow, never a verdict override. */
import {InputError,text} from '../workflow-input.mjs';
export const RESOLUTION_NOTICE='Resolving this item does not change any assessment, evidence or release disposition. It records a reviewed correction within the verified scope.';
export const reason = value => {const r=text(value,'Reason',2000);if(r.length<10)throw new InputError('REASON_REQUIRED','Give a reason of at least 10 characters.');return r;};
export function directoryOf(accounts){
  if(!Array.isArray(accounts))throw new Error('RESOLUTION_DIRECTORY_REQUIRED');
  const seen=new Set();return accounts.map(a=>{
    if(typeof a.email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())||!Array.isArray(a.roles)||a.roles.some(r=>!['AUTHOR','POLICY_AUTHORITY','VIEWER'].includes(r)))throw new Error('INVALID_RESOLUTION_DIRECTORY');
    const email=a.email.trim().toLowerCase();if(seen.has(email))throw new Error('DUPLICATE_RESOLUTION_IDENTITY');seen.add(email);return {email,roles:[...a.roles]};
  });
}
export function kindOf(finding,status){
  if(status==='FAILED')return 'EXECUTION_FAILURE';
  if(finding?.state==='VIOLATED')return 'VIOLATION';
  if(finding?.state!=='INSUFFICIENT')throw new InputError('ACTIONABLE_FINDING_REQUIRED','Select a violation, an evidence/authority gap, or a failed assessment.',409);
  if(finding.reason==='AUTHORITATIVE_REQUIREMENT_UNRESOLVED')return 'AUTHORITY_GAP';
  if(finding.reason==='NO_SUPPORTED_VERIFIER_MAPPING')return 'VERIFICATION_GAP';
  return 'EVIDENCE_GAP';
}
export const expectationOf = o => ({statement:o.statement,sourceReference:o.sourceReference,sourceVersion:o.sourceVersion,criticality:o.criticality});
export function sameExpectation(a,b,{authorityGap=false}={}){
  return a.statement===b.statement && a.criticality===b.criticality && (authorityGap || a.sourceReference===b.sourceReference&&a.sourceVersion===b.sourceVersion);
}
