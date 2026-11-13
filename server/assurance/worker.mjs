import {executeApprovalSeparation} from '../../verifiers/approval-separation.mjs';
import {digest,publicTarget,verifierDigest} from './contracts.mjs';
/** One bounded job per call. The worker is separate from the Vercel request handler. */
export async function workOnce({repository,targets,workerId,secretEnv=process.env,allowLoopback=false,timeoutMs=2500}) {
  const job=await repository.claim(workerId);if(!job)return {worked:false};
  const target=targets.find(t=>t.id===job.snapshot.target.id);
  let report;
  if(!target||digest(publicTarget(target))!==digest(job.snapshot.target)||job.snapshot.verifier.digest!==verifierDigest()){
    report={outcome:'INSUFFICIENT',reason:'WORKER_CONFIGURATION_MISMATCH',observations:[]};
  }else{
    try{report=await executeApprovalSeparation(target,{requesterToken:secretEnv[target.requesterTokenEnv],approverToken:secretEnv[target.approverTokenEnv],allowLoopback,timeoutMs,runId:job.id});}
    catch{report={outcome:'INSUFFICIENT',reason:'VERIFIER_CONFIGURATION_OR_EXECUTION_FAILED',observations:[]};}
  }
  try{await repository.complete(job,report);return {worked:true,runId:job.id,status:'COMPLETED',outcome:report.outcome};}
  catch(e){if(e.code==='LEASE_REJECTED')return {worked:true,runId:job.id,status:'RESULT_NOT_ACCEPTED'};throw e;}
}
