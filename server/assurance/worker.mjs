import {executeApprovalControl} from '../../verifiers/approval-controls.mjs';
import {isV2,configuredSnapshot} from './generalization.mjs';
import {executeApprovalSeparation} from '../../verifiers/approval-separation.mjs';
import {digest,publicTarget,verifierDigest} from './contracts.mjs';
/** One bounded job per call. The worker is separate from the Vercel request handler. */
export async function workOnce({repository,targets,workerId,secretEnv=process.env,allowLoopback=false,timeoutMs=2500}) {
  const job=await repository.claim(workerId);if(!job)return {worked:false};
  const target=targets.find(t=>t.id===job.snapshot.target.id);
  let report;
  if(!target||!configuredSnapshot(job.snapshot,targets)){
    const failure={outcome:'INSUFFICIENT',reason:'WORKER_CONFIGURATION_MISMATCH',observations:[]};
    report=isV2(job.snapshot)?{schema:'qivvera.multi-report/1',reports:job.snapshot.mappings.map(m=>({obligationId:m.obligationId,checkId:m.checkId,verifierDigest:m.verifier.digest,report:failure}))}:failure;
  }else if(isV2(job.snapshot)){
    const deadline=Date.now()+90000,reports=[];
    for(const m of job.snapshot.mappings){
      let result;
      if(Date.now()>=deadline)result={outcome:'INSUFFICIENT',reason:'EXECUTION_BUDGET_EXHAUSTED',observations:[]};
      else try{result=await executeApprovalControl(target,m.checkId,{requesterToken:secretEnv[target.requesterTokenEnv],approverToken:secretEnv[target.approverTokenEnv],allowLoopback,timeoutMs:Math.min(timeoutMs,1500),runId:job.id+'-'+m.checkId});}catch{result={outcome:'INSUFFICIENT',reason:'VERIFIER_CONFIGURATION_OR_EXECUTION_FAILED',observations:[]};}
      reports.push({obligationId:m.obligationId,checkId:m.checkId,verifierDigest:m.verifier.digest,report:result});
    }
    report={schema:'qivvera.multi-report/1',reports};
  }else{
    try{report=await executeApprovalSeparation(target,{requesterToken:secretEnv[target.requesterTokenEnv],approverToken:secretEnv[target.approverTokenEnv],allowLoopback,timeoutMs,runId:job.id});}
    catch{report={outcome:'INSUFFICIENT',reason:'VERIFIER_CONFIGURATION_OR_EXECUTION_FAILED',observations:[]};}
  }
  try{await repository.complete(job,report);return {worked:true,runId:job.id,status:'COMPLETED',outcome:report.outcome??null};}
  catch(e){if(e.code==='LEASE_REJECTED')return {worked:true,runId:job.id,status:'RESULT_NOT_ACCEPTED'};throw e;}
}
