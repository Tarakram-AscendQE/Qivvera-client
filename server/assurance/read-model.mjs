/** Shared assessment read model. Resolution never writes assurance evidence or dispositions. */
import {InputError} from '../workflow-input.mjs';
import {digest,verifierDigest,publicTarget,scopeOf,deriveCase} from './contracts.mjs';
const oq="SELECT o.*, w.revision_id,w.source_version,w.review_state,h.id AS review_event_id,h.action AS review_action,h.actor AS review_actor,h.rationale AS review_reason,h.independent_actor FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id LEFT JOIN obligation_history h ON h.obligation_id=o.id AND h.version=o.version";

const fail=(code,message,status=409)=>{throw new InputError(code,message,status);};
export function createAssuranceReadModel(db,catalogue){
  const localDigest=verifierDigest();
  async function context(c,changeId,revisionId,lock=false){
    const change=(await c.query('SELECT * FROM changes WHERE id=$1'+(lock?db.lock:''),[changeId])).rows[0];
    if(!change)fail('CHANGE_NOT_FOUND','Change not found.',404);
    const revisions=(await c.query('SELECT * FROM change_revisions WHERE change_id=$1 ORDER BY revision_number DESC',[changeId])).rows;
    const revision=revisions.find(r=>r.id===revisionId);
    if(!revision)fail('REVISION_NOT_FOUND','Revision does not belong to this change.',404);
    const obligations=(await c.query(oq+' WHERE o.change_id=$1 AND w.revision_id=$2 ORDER BY o.id',[changeId,revisionId])).rows;
    const scope=scopeOf(change,revision,obligations);
    return {change,revision,obligations,scope,scopeDigest:digest(scope),isCurrent:revisions[0]?.id===revisionId};
  }
  const latestPlan=async(c,rev)=>(await c.query('SELECT * FROM assurance_plans WHERE revision_id=$1 ORDER BY version DESC LIMIT 1',[rev])).rows[0];
  function configured(snapshot){
    const t=catalogue.find(x=>x.id===snapshot.target.id);
    return !!t && digest(publicTarget(t))===digest(snapshot.target) && snapshot.verifier.digest===localDigest;
  }
  function validPlan(plan,ctx){return !!plan&&plan.scope_digest===ctx.scopeDigest&&configured(JSON.parse(plan.snapshot));}
  async function viewRun(c,row,ctx){
    const snapshot=JSON.parse(row.snapshot),plan=await latestPlan(c,row.revision_id);
    let applicability=ctx?.isCurrent?'CURRENT':'HISTORICAL_REVISION';
    if(ctx && (snapshot.scopeDigest!==ctx.scopeDigest || plan?.id!==row.plan_id || !configured(snapshot))) applicability='STALE_INPUTS';
    const evidence=(await c.query('SELECT * FROM assurance_evidence WHERE run_id=$1',[row.id])).rows[0];
    let manifest=null,integrity='NOT_COLLECTED';
    if(evidence){
      try{manifest=JSON.parse(evidence.manifest);integrity=digest(manifest)===evidence.digest?'DIGEST_MATCH':'DIGEST_MISMATCH';}
      catch{integrity='DIGEST_MISMATCH';}
      if(integrity!=='DIGEST_MATCH')manifest=null;
    }
    if(manifest){
      for(const ref of manifest.counterevidence??[]){
        const prior=(await c.query('SELECT * FROM assurance_evidence WHERE run_id=$1',[ref.runId])).rows[0];
        let valid=false;try{valid=!!prior&&prior.digest===ref.evidenceDigest&&digest(JSON.parse(prior.manifest))===ref.evidenceDigest;}catch{}
        if(!valid){integrity='COUNTEREVIDENCE_UNAVAILABLE';manifest=null;break;}
      }
    }
    const caseResult=manifest?deriveCase(snapshot,manifest.report,manifest.counterevidence??[]):null;
    return {id:row.id,number:Number(row.run_number),changeId:row.change_id,revisionId:row.revision_id,planId:row.plan_id,status:row.status,requestedBy:row.requested_by,queuedAt:row.queued_at,startedAt:row.started_at,finishedAt:row.finished_at,failureCode:row.failure_code,workerId:row.worker_id,applicability,
      disposition:row.status==='COMPLETED'&&integrity==='DIGEST_MATCH'?caseResult.disposition:null,
      case:caseResult,snapshot,evidence:manifest,evidenceDigest:evidence?.digest??null,evidenceIntegrity:integrity};
  }
  return {context,latestPlan,configured,validPlan,viewRun};
}
