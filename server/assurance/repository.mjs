/** Durable run coordination. Worker mutations are not exposed by any HTTP endpoint. */
import {randomUUID,randomBytes} from 'node:crypto';
import {openDatabase} from '../workflow-store.mjs';
import {InputError,fields,text,identifier,actorEmail,requireRole} from '../workflow-input.mjs';
import {migrateAssurance,requireAssurance} from './migration.mjs';
import {canonical,digest,PROFILE,verifierDigest,validateCatalogue,publicTarget,scopeOf,fullRevision,deriveCase,comparisonKey} from './contracts.mjs';
const oq="SELECT o.*, w.revision_id,w.source_version,w.review_state,h.id AS review_event_id,h.action AS review_action,h.actor AS review_actor,h.rationale AS review_reason,h.independent_actor FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id LEFT JOIN obligation_history h ON h.obligation_id=o.id AND h.version=o.version";
const fail=(code,message,status=409)=>{throw new InputError(code,message,status);};
const stamp=n=>new Date(n).toISOString();
export async function openAssuranceRepository(options={}) {
  const db=await openDatabase(options);
  try{ if(options.migrate) await migrateAssurance(db); else await requireAssurance(db); }
  catch(e){await db.close();throw e;}
  const catalogue=validateCatalogue(options.targets??[],{local:options.allowLocalTargets===true});
  const localDigest=verifierDigest();
  const now=options.now??Date.now;
  const read=f=>db.transaction(f,true);
  const audit=(c,actor,action,id,detail)=>c.query('INSERT INTO activity(id,actor,action,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,action,id,detail,stamp(now())]);
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
  async function expire(c){
    await c.query("UPDATE assurance_runs SET status='FAILED',finished_at=$1,failure_code='QUEUE_DEADLINE_EXCEEDED',lease_hash=NULL WHERE status='QUEUED' AND queued_deadline<=$2",[stamp(now()),now()]);
    await c.query("UPDATE assurance_runs SET status='FAILED',finished_at=$1,failure_code='WORKER_LEASE_EXPIRED',lease_hash=NULL WHERE status='RUNNING' AND lease_until<=$2",[stamp(now()),now()]);
  }
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
  const publicAPI={
    close:()=>db.close(),healthy:()=>db.healthy(),enabled:catalogue.length>0,
    async getContext(changeId,revisionId){
      return read(async c=>{const ctx=await context(c,changeId,revisionId);const plan=await latestPlan(c,revisionId);
        return {scope:ctx.scope,scopeDigest:ctx.scopeDigest,isCurrent:ctx.isCurrent,profile:PROFILE,targets:catalogue.filter(t=>t.applicationId===ctx.change.application_id&&t.sourceRevision===ctx.revision.source_revision).map(publicTarget),
          plan:plan?{id:plan.id,version:Number(plan.version),approvedBy:plan.approved_by,rationale:plan.rationale,createdAt:plan.created_at,current:validPlan(plan,ctx),snapshot:JSON.parse(plan.snapshot)}:null};
      });
    },
    async approvePlan(changeId,input,actor){
      requireRole(actor,'POLICY_AUTHORITY');fields(input,['revisionId','scopeDigest','expectedPlanVersion','obligationId','targetId','rationale','acknowledgeLimits']);
      identifier(input.revisionId);identifier(input.obligationId);
      if(!Number.isInteger(input.expectedPlanVersion)||input.expectedPlanVersion<0)fail('PLAN_VERSION_REQUIRED','Reload the assurance plan before changing it.',400);
      if(input.acknowledgeLimits!==true)fail('SCOPE_ACKNOWLEDGEMENT_REQUIRED','Confirm the declared scope, mapping and limitations.',400);
      const rationale=text(input.rationale,'Mapping rationale',2000);if(rationale.length<10)fail('REASON_REQUIRED','Explain why this check supports the mapped obligation.',400);
      const email=actorEmail(actor);
      return db.transaction(async c=>{
        const ctx=await context(c,changeId,input.revisionId,true);if(!ctx.isCurrent)fail('REVISION_CONFLICT','Only the current revision can receive a new plan.');
        if(input.scopeDigest!==ctx.scopeDigest)fail('SCOPE_CHANGED','Obligations changed. Reload before approving a plan.');
        fullRevision(ctx.revision.source_revision);
        const old=await latestPlan(c,input.revisionId);if(Number(old?.version??0)!==input.expectedPlanVersion)fail('PLAN_CONFLICT','A newer plan exists. Reload.');
        const o=ctx.obligations.find(x=>x.id===input.obligationId);
        if(!o||o.review_state!=='ACCEPTED')fail('ACCEPTED_OBLIGATION_REQUIRED','Map an accepted obligation on this revision.',400);
        const accepted=(await c.query("SELECT * FROM obligation_history WHERE obligation_id=$1 AND version=$2 AND action='ACCEPT'",[o.id,o.version])).rows[0];
        if(!accepted)fail('ACCEPTANCE_RECORD_REQUIRED','No matching acceptance decision is available.');
        const t=catalogue.find(x=>x.id===input.targetId);
        if(!t||t.applicationId!==ctx.change.application_id||t.sourceRevision!==ctx.revision.source_revision)fail('TARGET_NOT_APPROVED','Choose an operator-configured target matching this application and full source revision.',400);
        const snapshot={schema:'qivvera.assurance-plan/1',scope:ctx.scope,scopeDigest:ctx.scopeDigest,profile:PROFILE,profileDigest:digest(PROFILE),target:publicTarget(t),
          mapping:{obligationId:o.id,obligationVersion:Number(o.version),acceptanceDecisionId:accepted.id,acceptedBy:accepted.actor,independentReviewer:!!Number(accepted.independent_actor),rationale},
          verifier:{id:PROFILE.verifierId,version:PROFILE.verifierVersion,digest:localDigest}};
        const id=randomUUID(),v=Number(old?.version??0)+1;
        await c.query('INSERT INTO assurance_plans(id,change_id,revision_id,version,scope_digest,snapshot,approved_by,rationale,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,changeId,input.revisionId,v,ctx.scopeDigest,canonical(snapshot),email,rationale,stamp(now())]);
        await audit(c,email,'ASSURANCE_PLAN_APPROVED',changeId,`Approved plan ${v}; all non-rejected obligations retained in scope.`);
        return {id,version:v,snapshot};
      });
    },
    async requestRun(changeId,input,actor){
      actorEmail(actor);if(!actor.roles.some(x=>['AUTHOR','POLICY_AUTHORITY'].includes(x)))fail('FORBIDDEN','Your role cannot request assessments.',403);
      fields(input,['revisionId','planId','requestKey']);identifier(input.revisionId);identifier(input.planId);identifier(input.requestKey);
      const email=actorEmail(actor), requestDigest=digest({changeId,...input,actor:email});
      return db.transaction(async c=>{
        if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(78124423)');
        const ctx=await context(c,changeId,input.revisionId,true);
        const replay=(await c.query('SELECT * FROM assurance_runs WHERE request_key=$1',[input.requestKey])).rows[0];
        if(replay){if(replay.request_digest!==requestDigest)fail('IDEMPOTENCY_CONFLICT','This request key belongs to another request.');return viewRun(c,replay,ctx);}
        await expire(c);
        if(!ctx.isCurrent)fail('REVISION_CONFLICT','Assess the current revision.');
        const plan=await latestPlan(c,input.revisionId);
        if(plan?.id!==input.planId||!validPlan(plan,ctx))fail('CURRENT_APPROVED_PLAN_REQUIRED','The plan or target changed. Obtain a current mapping decision.');
        if((await c.query("SELECT id FROM assurance_runs WHERE change_id=$1 AND status IN ('QUEUED','RUNNING')",[changeId])).rows.length)fail('ASSESSMENT_ACTIVE','An assessment is already queued or running.');
        const count=(await c.query("SELECT COUNT(*) AS n FROM assurance_runs WHERE status IN ('QUEUED','RUNNING')")).rows[0];
        if(Number(count.n)>=32)fail('QUEUE_CAPACITY','The review queue is full. Retry after active runs finish.',429);
        const id=randomUUID();
        const runNumber=Number((await c.query('SELECT COALESCE(MAX(run_number),0) AS n FROM assurance_runs WHERE revision_id=$1',[input.revisionId])).rows[0].n)+1;
        await c.query('INSERT INTO assurance_runs(id,change_id,revision_id,plan_id,request_key,request_digest,requested_by,status,snapshot,queued_at,queued_deadline,run_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,changeId,input.revisionId,plan.id,input.requestKey,requestDigest,email,'QUEUED',plan.snapshot,stamp(now()),now()+600000,runNumber]);
        await audit(c,email,'ASSURANCE_QUEUED',changeId,`Assessment ${id} queued. No verdict yet.`);
        return viewRun(c,(await c.query('SELECT * FROM assurance_runs WHERE id=$1',[id])).rows[0],ctx);
      });
    },
    async listRuns(changeId,revisionId){
      await db.transaction(expire);
      return read(async c=>{const ctx=await context(c,changeId,revisionId);const rows=(await c.query('SELECT * FROM assurance_runs WHERE change_id=$1 AND revision_id=$2 ORDER BY run_number DESC LIMIT 50',[changeId,revisionId])).rows;
        const out=[];for(const row of rows)out.push(await viewRun(c,row,ctx));return out;});
    },
    async getRun(id){identifier(id);await db.transaction(expire);return read(async c=>{const row=(await c.query('SELECT * FROM assurance_runs WHERE id=$1',[id])).rows[0];if(!row)fail('RUN_NOT_FOUND','Assessment not found.',404);return viewRun(c,row,await context(c,row.change_id,row.revision_id));});},
    async cancel(id,actor){actorEmail(actor);if(!actor.roles.some(x=>['AUTHOR','POLICY_AUTHORITY'].includes(x)))fail('FORBIDDEN','Your role cannot cancel.',403);
      return db.transaction(async c=>{const r=(await c.query('SELECT * FROM assurance_runs WHERE id=$1'+db.lock,[identifier(id)])).rows[0];if(!r)fail('RUN_NOT_FOUND','Assessment not found.',404);
        if(!['QUEUED','RUNNING'].includes(r.status))fail('RUN_TERMINAL','Completed or failed runs cannot be changed.');
        await c.query("UPDATE assurance_runs SET status='CANCELLED',finished_at=$1,lease_hash=NULL,failure_code='CANCELLED_BY_USER' WHERE id=$2",[stamp(now()),id]);
        await audit(c,actor.email,'ASSURANCE_CANCELLED',r.change_id,'Cancellation invalidates result acceptance. Any already-sent target operation may still complete.');return {id,status:'CANCELLED',disposition:null};});
    }
  };
  if(!options.worker) return publicAPI;
  return {...publicAPI,
    async claim(workerId){text(workerId,'Worker identity',100);return db.transaction(async c=>{
      if(db.driver==='postgres')await c.query('SELECT pg_advisory_xact_lock(78124423)');
      await expire(c);
      const row=(await c.query("SELECT * FROM assurance_runs WHERE status='QUEUED' ORDER BY queued_at,id LIMIT 1")).rows[0];if(!row)return null;
      // Worker never needs UPDATE privilege on producer/authority records.
      // Input drift is rechecked and cannot establish current readiness.
      const ctx=await context(c,row.change_id,row.revision_id);
      const locked=(await c.query('SELECT * FROM assurance_runs WHERE id=$1'+db.lock,[row.id])).rows[0];if(locked.status!=='QUEUED')return null;
      const plan=await latestPlan(c,row.revision_id),snapshot=JSON.parse(row.snapshot);
      if(!ctx.isCurrent||plan?.id!==row.plan_id||snapshot.scopeDigest!==ctx.scopeDigest||!configured(snapshot)){
        await c.query("UPDATE assurance_runs SET status='FAILED',failure_code='INPUTS_CHANGED_BEFORE_EXECUTION',finished_at=$1 WHERE id=$2",[stamp(now()),row.id]);return null;
      }
      const leaseToken=randomBytes(32).toString('hex'),until=now()+120000;
      await c.query("UPDATE assurance_runs SET status='RUNNING',started_at=$1,lease_until=$2,lease_hash=$3,worker_id=$4 WHERE id=$5",[stamp(now()),until,digest(leaseToken),workerId,row.id]);
      return {id:row.id,snapshot,leaseToken,leaseUntil:until,workerId};
    });},
    async complete(job,report){
      if(!report||!['SUPPORTED','VIOLATED','INSUFFICIENT'].includes(report.outcome)||!Array.isArray(report.observations)||report.observations.length>20)throw new Error('INVALID_VERIFIER_REPORT');
      if(Buffer.byteLength(canonical(report))>65536)throw new Error('EVIDENCE_TOO_LARGE');
      return db.transaction(async c=>{
        const row=(await c.query('SELECT * FROM assurance_runs WHERE id=$1'+db.lock,[job.id])).rows[0];
        if(!row||row.status!=='RUNNING'||row.lease_hash!==digest(job.leaseToken)||Number(row.lease_until)<=now()||row.worker_id!==job.workerId)fail('LEASE_REJECTED','This worker no longer owns the active run.');
        if(digest(JSON.parse(row.snapshot))!==digest(job.snapshot))fail('SNAPSHOT_MISMATCH','Job inputs do not match the queued snapshot.');
        // A later pass does not erase an earlier valid counterexample to the same obligation/target.
        const previous=(await c.query("SELECT e.run_id,e.manifest,e.digest,r.snapshot FROM assurance_evidence e JOIN assurance_runs r ON r.id=e.run_id WHERE r.revision_id=$1 AND r.status='COMPLETED' ORDER BY r.run_number",[row.revision_id])).rows;
        const counterevidence=[];
        for(const e of previous){
          const prior=JSON.parse(e.manifest),oldSnapshot=JSON.parse(e.snapshot);
          if(comparisonKey(oldSnapshot)!==comparisonKey(job.snapshot))continue;
          if(digest(prior)!==e.digest)throw new Error('PRIOR_EVIDENCE_INTEGRITY_FAILED');
          if(prior.report.outcome==='VIOLATED')counterevidence.push({runId:e.run_id,evidenceDigest:e.digest,obligationId:job.snapshot.mapping.obligationId,reason:prior.report.reason});
        }
        const manifest={schema:'qivvera.evidence/1',runId:row.id,changeId:row.change_id,revisionId:row.revision_id,planId:row.plan_id,snapshotDigest:digest(job.snapshot),target:job.snapshot.target,verifier:job.snapshot.verifier,workerId:job.workerId,startedAt:row.started_at,completedAt:stamp(now()),report,counterevidence,
          integrityNotice:'SHA-256 binds these serialized observations; no signature, trusted timestamp, or database-admin tamper resistance is claimed.'};
        const serialized=canonical(manifest),hash=digest(manifest);
        await c.query('INSERT INTO assurance_evidence(run_id,manifest,digest,created_at) VALUES($1,$2,$3,$4)',[row.id,serialized,hash,stamp(now())]);
        await c.query("UPDATE assurance_runs SET status='COMPLETED',finished_at=$1,lease_hash=NULL WHERE id=$2",[stamp(now()),row.id]);
        await audit(c,job.workerId,'ASSURANCE_COMPLETED',row.change_id,`Assessment ${row.id} completed; ${deriveCase(job.snapshot,report,counterevidence).disposition} within its frozen scope.`);
        return {id:row.id,status:'COMPLETED',evidenceDigest:hash};
      });
    }
  };
}
