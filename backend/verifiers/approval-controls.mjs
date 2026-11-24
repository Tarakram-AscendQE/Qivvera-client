/** Versioned behavioural oracle. Consumes real HTTP responses, not producer verdicts. */
import {randomUUID} from 'node:crypto';
import {createApprovalAdapter} from './approval-adapters.mjs';
import {digest} from '../server/assurance/contracts.mjs';
const limited = x => typeof x === 'string' && /^[a-zA-Z0-9_.:@-]{1,100}$/.test(x) ? x : null;
function identityMatches(body,target){return ['sourceRevision','artifactDigest','environmentDigest','instanceId'].every(k=>body[k]===target[k])&&body.contract==='qivvera.approval-http/1';}
export async function executeApprovalControl(target,checkId,{requesterToken,approverToken,allowLoopback=false,timeoutMs=2500,runId=randomUUID()}={}) {
  if(!['separation','finality'].includes(checkId))throw new Error('UNKNOWN_CHECK');
  const observations=[]; let boundBefore=false,boundAfter=false,counterexample=false,positive=false,negative=false,problem=null;
  const request=createApprovalAdapter(target,{allowLoopback,timeoutMs});
  function observe(step,expected,response){
    // Persist selected non-secret fields only, never headers, credentials or arbitrary error messages.
    const b=response.body;
    observations.push({step,expected,observed:{httpStatus:response.status,id:limited(b.id),requesterId:limited(b.requesterId),approverId:limited(b.approverId),status:limited(b.status),error:limited(b.error),subject:limited(b.subject)},observedAt:new Date().toISOString()});
  }
  async function create(label){
    const correlationId=`qv-${runId}-${label}`;
    const r=await request('POST','/requests',{token:requesterToken,data:{correlationId,purpose:'Synthetic assurance test; no real payment'}});
    observe(`${label}: create request`,{httpStatus:201,requesterId:target.requesterId,status:'PENDING'},r);
    if(r.status!==201||!limited(r.body.id)||r.body.requesterId!==target.requesterId||r.body.status!=='PENDING'||r.body.approverId!=null||r.body.correlationId!==correlationId)throw new Error('REQUEST_PRECONDITION_FAILED');
    const check=await request('GET',`/requests/${r.body.id}`,{token:requesterToken});
    observe(`${label}: read initial state`,{httpStatus:200,id:r.body.id,status:'PENDING',requesterId:target.requesterId},check);
    if(check.status!==200||check.body.id!==r.body.id||check.body.requesterId!==target.requesterId||check.body.status!=='PENDING'||check.body.approverId!=null||check.body.correlationId!==correlationId)throw new Error('INITIAL_STATE_NOT_ESTABLISHED');
    return r.body.id;
  }
  try{
    const identity=await request('GET','/identity',{token:requesterToken});
    boundBefore=identity.status===200&&identityMatches(identity.body,target);
    observations.push({step:'identity before',expected:{sourceRevision:target.sourceRevision,artifactDigest:target.artifactDigest,environmentDigest:target.environmentDigest,instanceId:target.instanceId},observed:{httpStatus:identity.status,identityDigest:digest(identity.body),matches:boundBefore},observedAt:new Date().toISOString()});
    if(!boundBefore)throw new Error('TARGET_IDENTITY_MISMATCH');
    for(const [label,token,subject] of [['requester',requesterToken,target.requesterId],['approver',approverToken,target.approverId]]){
      const me=await request('GET','/me',{token});observe(`authenticate ${label}`,{httpStatus:200,subject},me);
      if(me.status!==200||me.body.subject!==subject)throw new Error('ACTOR_IDENTITY_NOT_ESTABLISHED');
    }
    let same=null;
    if(checkId==='separation'){
    same=await create('self');
    const denied=await request('POST',`/requests/${same}/approve`,{token:requesterToken,data:{}});
    observe('attempt self-approval',{httpStatus:403,error:'SELF_APPROVAL_NOT_ALLOWED'},denied);
    const after=await request('GET',`/requests/${same}`,{token:requesterToken});
    observe('read state after self-approval',{httpStatus:200,status:'PENDING',requesterId:target.requesterId},after);
    if(after.status!==200||after.body.id!==same||after.body.requesterId!==target.requesterId)throw new Error('SELF_APPROVAL_STATE_UNOBSERVABLE');
    counterexample=after.body.status==='APPROVED'&&after.body.approverId===target.requesterId;
    negative=denied.status===403&&denied.body.error==='SELF_APPROVAL_NOT_ALLOWED'&&after.body.status==='PENDING'&&!after.body.approverId;
    if(!negative&&!counterexample)problem='SELF_APPROVAL_OBSERVATION_INCONCLUSIVE';
    }
    const control=await create('positive');
    if(control===same)throw new Error('CONTROL_NOT_ISOLATED');
    const approved=await request('POST',`/requests/${control}/approve`,{token:approverToken,data:{}});
    observe('independent approval positive control',{httpStatus:200,status:'APPROVED',approverId:target.approverId},approved);
    const final=await request('GET',`/requests/${control}`,{token:requesterToken});
    observe('read positive control state',{httpStatus:200,status:'APPROVED',requesterId:target.requesterId,approverId:target.approverId},final);
    positive=approved.status===200&&final.status===200&&final.body.id===control&&final.body.status==='APPROVED'&&final.body.requesterId===target.requesterId&&final.body.approverId===target.approverId;
    if(!positive&&!problem)problem='POSITIVE_CONTROL_NOT_ESTABLISHED';
    if(checkId==='finality'){
      // Do not establish finality from a target that never permits legitimate approval.
      counterexample=false;negative=false;
      if(positive){
        const again=await request('POST',`/requests/${control}/approve`,{token:approverToken,data:{}});
        observe('repeat finalized approval',{httpStatus:409,error:'NOT_PENDING'},again);
        const afterRepeat=await request('GET',`/requests/${control}`,{token:requesterToken});
        observe('read finalized state after repeat',{httpStatus:200,status:'APPROVED',approverId:target.approverId},afterRepeat);
        const visible=afterRepeat.status===200&&afterRepeat.body.id===control&&afterRepeat.body.requesterId===target.requesterId;
        if(!visible)throw new Error('FINAL_STATE_UNOBSERVABLE');
        counterexample=again.status===200||afterRepeat.body.status!=='APPROVED'||afterRepeat.body.approverId!==target.approverId;
        negative=again.status===409&&again.body.error==='NOT_PENDING'&&!counterexample;
        problem=negative?null:'FINALITY_OBSERVATION_INCONCLUSIVE';
      }
    }

  }catch(e){problem=typeof e.code==='string'?e.code:['TARGET_IDENTITY_MISMATCH','REQUEST_PRECONDITION_FAILED','INITIAL_STATE_NOT_ESTABLISHED','ACTOR_IDENTITY_NOT_ESTABLISHED','SELF_APPROVAL_STATE_UNOBSERVABLE','CONTROL_NOT_ISOLATED'].includes(e.message)?e.message:'VERIFIER_EXECUTION_INCOMPLETE';}
  if(boundBefore){
    try{const r=await request('GET','/identity',{token:requesterToken});boundAfter=r.status===200&&identityMatches(r.body,target);
      observations.push({step:'identity after',expected:{matches:true},observed:{httpStatus:r.status,matches:boundAfter,identityDigest:digest(r.body)},observedAt:new Date().toISOString()});}
    catch{problem='TARGET_IDENTITY_RECHECK_UNAVAILABLE';}
  }
  let outcome='INSUFFICIENT',reason=problem??'REQUIRED_OBSERVATION_MISSING';
  if(boundBefore&&boundAfter){
    if(counterexample){outcome='VIOLATED';reason=checkId==='finality'?'FINALIZED_APPROVAL_ACCEPTED_OR_MUTATED':'REQUESTER_APPROVED_OWN_REQUEST';}
    else if(negative&&positive&&!problem){outcome='SUPPORTED';reason=checkId==='finality'?'LEGITIMATE_APPROVAL_SUCCEEDED_AND_REPEAT_REJECTED':'SELF_APPROVAL_REJECTED_AND_INDEPENDENT_APPROVAL_SUCCEEDED';}
  }else reason=boundBefore?'TARGET_IDENTITY_CHANGED_OR_UNAVAILABLE':'TARGET_IDENTITY_NOT_ESTABLISHED';
  return {outcome,reason,observations,controls:{identityBefore:boundBefore,identityAfter:boundAfter,negative,positive,counterexample},
    limitations:['One isolated negative scenario and one positive control, not exhaustive verification.','Identity is target-reported and operator-pinned; observations do not independently attest the deployed binary.','Generated synthetic requests are retained in the test target for investigation; no destructive cleanup is performed.']};
}
