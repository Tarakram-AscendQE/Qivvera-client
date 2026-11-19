/** Shared assessment read model. Resolution never writes assurance evidence or dispositions. */
import {InputError} from '../workflow-input.mjs';
import {digest,scopeOf} from './contracts.mjs';
import {configuredSnapshot,validateReport,deriveAssessment as deriveCase} from './generalization.mjs';
import {loadVerifiedObligations,planSnapshot,validateStoredPlan,validateStoredRun} from './integrity.mjs';

const fail=(code,message,status=409)=>{throw new InputError(code,message,status);};
export function createAssuranceReadModel(db,catalogue){

  async function context(c,changeId,revisionId,lock=false){
    const change=(await c.query('SELECT * FROM changes WHERE id=$1'+(lock?db.lock:''),[changeId])).rows[0];
    if(!change)fail('CHANGE_NOT_FOUND','Change not found.',404);
    const revisions=(await c.query('SELECT * FROM change_revisions WHERE change_id=$1 ORDER BY revision_number DESC',[changeId])).rows;
    const revision=revisions.find(r=>r.id===revisionId);
    if(!revision)fail('REVISION_NOT_FOUND','Revision does not belong to this change.',404);
    const obligations=await loadVerifiedObligations(c,changeId,revisionId);
    const scope=scopeOf(change,revision,obligations);
    return {change,revision,obligations,scope,scopeDigest:digest(scope),isCurrent:revisions[0]?.id===revisionId};
  }
  const latestPlan=async(c,rev)=>(await c.query('SELECT * FROM assurance_plans WHERE revision_id=$1 ORDER BY version DESC LIMIT 1',[rev])).rows[0];
  const configured=snapshot=>configuredSnapshot(snapshot,catalogue);
  function validPlan(plan,ctx){if(!plan)return false;const snapshot=planSnapshot(plan);return snapshot.scopeDigest===ctx.scopeDigest&&configured(snapshot);}
  async function viewRun(c,row,ctx){
    const snapshot=await validateStoredRun(c,row),plan=await latestPlan(c,row.revision_id);
    if(plan&&plan.id!==row.plan_id)await validateStoredPlan(c,plan);
    let applicability=ctx?.isCurrent?'CURRENT':'HISTORICAL_REVISION';
    if(ctx && (snapshot.scopeDigest!==ctx.scopeDigest || plan?.id!==row.plan_id || !configured(snapshot))) applicability='STALE_INPUTS';
    const evidence=(await c.query('SELECT * FROM assurance_evidence WHERE run_id=$1',[row.id])).rows[0];
    let manifest=null,integrity='NOT_COLLECTED';
    if(evidence){
      try{manifest=JSON.parse(evidence.manifest);integrity=digest(manifest)===evidence.digest?'DIGEST_MATCH':'DIGEST_MISMATCH';}
      catch{integrity='DIGEST_MISMATCH';}
      if(integrity==='DIGEST_MATCH'){try{if(manifest.runId!==row.id||manifest.revisionId!==row.revision_id||manifest.snapshotDigest!==digest(snapshot)||digest(manifest.target)!==digest(snapshot.target))throw new Error('BINDING_MISMATCH');validateReport(snapshot,manifest.report);}catch{integrity='EVIDENCE_BINDING_INVALID';}}
      if(integrity!=='DIGEST_MATCH')manifest=null;
    }
    if(manifest){
      for(const ref of manifest.counterevidence??[]){
        const prior=(await c.query('SELECT * FROM assurance_evidence WHERE run_id=$1',[ref.runId])).rows[0];
        let valid=false;try{
          const priorRow=(await c.query('SELECT * FROM assurance_runs WHERE id=$1',[ref.runId])).rows[0];
          const priorSnapshot=await validateStoredRun(c,priorRow),priorManifest=prior&&JSON.parse(prior.manifest);
          valid=!!prior&&priorRow.status==='COMPLETED'&&prior.digest===ref.evidenceDigest&&digest(priorManifest)===ref.evidenceDigest&&
            priorManifest.runId===priorRow.id&&priorManifest.snapshotDigest===digest(priorSnapshot);
          if(valid)validateReport(priorSnapshot,priorManifest.report);
        }catch{valid=false;}
        if(!valid){integrity='COUNTEREVIDENCE_UNAVAILABLE';manifest=null;break;}
      }
    }
    const caseResult=manifest?deriveCase(snapshot,manifest.report,manifest.counterevidence??[]):null;
    return {id:row.id,number:Number(row.run_number),changeId:row.change_id,revisionId:row.revision_id,planId:row.plan_id,status:row.status,requestedBy:row.requested_by,queuedAt:row.queued_at,startedAt:row.started_at,finishedAt:row.finished_at,failureCode:row.failure_code,workerId:row.worker_id,applicability,
      disposition:row.status==='COMPLETED'&&integrity==='DIGEST_MATCH'?caseResult.disposition:null,
      case:caseResult,snapshot,evidence:manifest,evidenceDigest:evidence?.digest??null,evidenceIntegrity:integrity};
  }
  return {context,latestPlan,configured,validPlan,viewRun,validatePlan:validateStoredPlan,validateRun:validateStoredRun};
}
