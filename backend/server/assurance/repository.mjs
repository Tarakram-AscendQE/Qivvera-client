import {migrateIntake,requireIntake} from '../intake/migration.mjs';
/** Durable run coordination. Worker mutations are not exposed by any HTTP endpoint. */
import {createAssuranceReadModel} from './read-model.mjs';
import {migrateTemplates,requireTemplates} from '../templates/migration.mjs';
import {createTemplateRepository,normalizeTemplateUse} from '../templates/repository.mjs';
import {randomUUID,randomBytes} from 'node:crypto';
import {openDatabase} from '../workflow-store.mjs';
import {InputError,fields,text,identifier,actorEmail,requireRole} from '../workflow-input.mjs';
import {migrateAssurance,requireAssurance} from './migration.mjs';
import {canonical,digest,PROFILE,verifierDigest,publicTarget,scopeOf,fullRevision} from './contracts.mjs';
import {CHECKS,PROFILE_V2,isV2,validateTargets as validateCatalogue,verificationIdentity,mappingsOf,mappedKey,reportFor,validateReport,deriveAssessment as deriveCase} from './generalization.mjs';
const fail=(code,message,status=409)=>{throw new InputError(code,message,status);};
const stamp=n=>new Date(n).toISOString();
export async function openAssuranceRepository(options={}) {
  if(options.templatesEnabled&&(!options.generalizationEnabled||options.worker))throw new Error('TEMPLATES_REQUIRE_WEB_GENERALIZATION');
  const db=await openDatabase(options);
  try{ if(options.migrate) await migrateAssurance(db); else await requireAssurance(db); }
  catch(e){await db.close();throw e;}
  if(options.generalizationEnabled){try{if(options.migrate)await migrateIntake(db);else await requireIntake(db);}catch(e){await db.close();throw e;}}
  if(options.templatesEnabled){try{if(options.migrate)await migrateTemplates(db);else await requireTemplates(db);}catch(e){await db.close();throw e;}}
  let catalogue;
  try{catalogue=validateCatalogue(options.targets??[],{local:options.allowLocalTargets===true});}catch(e){await db.close();throw e;}
  const localDigest=verifierDigest();
  const now=options.now??Date.now;
  // Runtime deadlines use the database clock. PostgreSQL transaction timestamps are
  // fixed at BEGIN, so use clock_timestamp() for the final acceptance predicate.
  // Only explicit test fixtures substitute a controllable clock.
  const testClock=typeof options.now==='function';
  const databaseClock='FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint';
  const currentTime=async c=>testClock?now():Number((await c.query(`SELECT ${databaseClock} AS now_ms`)).rows[0].now_ms);
  const acceptanceClock=parameter=>testClock?parameter:databaseClock;
  const read=f=>db.transaction(f,true);
  const audit=(c,actor,action,id,detail)=>c.query('INSERT INTO activity(id,actor,action,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),actor,action,id,detail,stamp(now())]);
  const model=createAssuranceReadModel(db,catalogue);
  const {context,latestPlan,configured,validPlan,viewRun}=model;
  let templates;
  try{templates=options.templatesEnabled?createTemplateRepository({db,model,catalogue,now,reviewMode:options.reviewMode??'independent'}):null;}catch(e){await db.close();throw e;}
  async function expire(c){
    const time=await currentTime(c);
    await c.query("UPDATE assurance_runs SET status='FAILED',finished_at=$1,failure_code='QUEUE_DEADLINE_EXCEEDED',lease_hash=NULL WHERE status='QUEUED' AND queued_deadline<=$2",[stamp(time),time]);
    await c.query("UPDATE assurance_runs SET status='FAILED',finished_at=$1,failure_code='WORKER_LEASE_EXPIRED',lease_hash=NULL WHERE status='RUNNING' AND lease_until<=$2",[stamp(time),time]);
  }
  const publicAPI={
    close:()=>db.close(),healthy:()=>db.healthy(),enabled:catalogue.length>0,generalizationEnabled:options.generalizationEnabled===true,
    templates:templates?.api??null,
    async getContext(changeId,revisionId){
      return read(async c=>{const ctx=await context(c,changeId,revisionId);const plan=await latestPlan(c,revisionId);
        if(plan)await model.validatePlan(c,plan);
        return {scope:ctx.scope,scopeDigest:ctx.scopeDigest,isCurrent:ctx.isCurrent,profile:PROFILE,profiles:options.generalizationEnabled?[PROFILE,PROFILE_V2]:[PROFILE],checks:options.generalizationEnabled?CHECKS:[],targets:catalogue.filter(t=>t.applicationId===ctx.change.application_id&&t.sourceRevision===ctx.revision.source_revision).map(publicTarget),
          plan:plan?{id:plan.id,version:Number(plan.version),approvedBy:plan.approved_by,rationale:plan.rationale,createdAt:plan.created_at,current:validPlan(plan,ctx),snapshot:JSON.parse(plan.snapshot),...(templates?{templateUse:await templates.useReceipt(c,plan)}:{})}:null};
      });
    },
    async approvePlan(changeId,input,actor){
      requireRole(actor,'POLICY_AUTHORITY');fields(input,['revisionId','scopeDigest','expectedPlanVersion','obligationId','targetId','rationale','acknowledgeLimits','mappings','templateUse']);
      identifier(input.revisionId);
      if(Object.hasOwn(input,'templateUse')){if(!templates)fail('TEMPLATES_DISABLED','Verification templates are not configured for this workspace.',400);normalizeTemplateUse(input.templateUse);if(!Object.hasOwn(input,'mappings'))fail('TEMPLATE_MULTI_PLAN_REQUIRED','Template use requires explicit version 2 mappings.',400);}
      const multi=Object.hasOwn(input,'mappings');
      if(multi){
        if(!options.generalizationEnabled)fail('GENERALIZATION_DISABLED','Multi-obligation execution requires the enabled feature and schema 5.',400);
        if(input.obligationId!==undefined||!Array.isArray(input.mappings)||input.mappings.length<1||input.mappings.length>2)fail('INVALID_MAPPINGS','Choose one or two distinct supported checks.',400);
        const ids=new Set(),checks=new Set();
        for(const m of input.mappings){fields(m,['obligationId','checkId','rationale']);identifier(m.obligationId);text(m.rationale,'Mapping rationale',2000);if(m.rationale.trim().length<10||ids.has(m.obligationId)||checks.has(m.checkId)||!CHECKS.some(c=>c.id===m.checkId))fail('INVALID_MAPPINGS','Use distinct accepted obligations and supported checks with meaningful reasons.',400);ids.add(m.obligationId);checks.add(m.checkId);}
      }else identifier(input.obligationId);
      if(!Number.isInteger(input.expectedPlanVersion)||input.expectedPlanVersion<0)fail('PLAN_VERSION_REQUIRED','Reload the assurance plan before changing it.',400);
      if(input.acknowledgeLimits!==true)fail('SCOPE_ACKNOWLEDGEMENT_REQUIRED','Confirm the declared scope, mapping and limitations.',400);
      const rationale=text(input.rationale,'Mapping rationale',2000);if(rationale.length<10)fail('REASON_REQUIRED','Explain why this check supports the mapped obligation.',400);
      const email=actorEmail(actor);
      return db.transaction(async c=>{
        if(input.templateUse){await templates.lock(c);const replay=await templates.replayUse(c,changeId,input,actor);if(replay)return replay;}
        const ctx=await context(c,changeId,input.revisionId,true);if(!ctx.isCurrent)fail('REVISION_CONFLICT','Only the current revision can receive a new plan.');
        if(input.scopeDigest!==ctx.scopeDigest)fail('SCOPE_CHANGED','Obligations changed. Reload before approving a plan.');
        fullRevision(ctx.revision.source_revision);
        const old=await latestPlan(c,input.revisionId);if(old)await model.validatePlan(c,old);if(Number(old?.version??0)!==input.expectedPlanVersion)fail('PLAN_CONFLICT','A newer plan exists. Reload.');
        const t=catalogue.find(x=>x.id===input.targetId);
        if(!t||t.applicationId!==ctx.change.application_id||t.sourceRevision!==ctx.revision.source_revision)fail('TARGET_NOT_APPROVED','Choose a configured target matching this application and full source revision.',400);
        if(!multi&&t.adapterId&&t.adapterId!=='approval-v1')fail('MULTI_PROFILE_REQUIRED','This adapter requires the version 2 plan.',400);
        const prepared=input.templateUse?await templates.prepareUse(c,ctx,input):null;
        const mappings=[];
        for(const chosen of multi?input.mappings:[{obligationId:input.obligationId,rationale}]){
          const o=ctx.obligations.find(x=>x.id===chosen.obligationId);
          if(!o||o.review_state!=='ACCEPTED')fail('ACCEPTED_OBLIGATION_REQUIRED','Map accepted obligations on this revision.',400);
          const accepted=(await c.query("SELECT * FROM obligation_history WHERE obligation_id=$1 AND version=$2 AND action='ACCEPT'",[o.id,o.version])).rows[0];
          if(!accepted)fail('ACCEPTANCE_RECORD_REQUIRED','No matching acceptance decision is available.');
          mappings.push({obligationId:o.id,obligationVersion:Number(o.version),acceptanceDecisionId:accepted.id,acceptedBy:accepted.actor,independentReviewer:!!Number(accepted.independent_actor),rationale:chosen.rationale.trim(),...(multi?{checkId:chosen.checkId,verifier:verificationIdentity(chosen.checkId,t.adapterId??'approval-v1')}:{})});
        }
        const snapshot=multi?{schema:'qivvera.assurance-plan/2',scope:ctx.scope,scopeDigest:ctx.scopeDigest,profile:PROFILE_V2,profileDigest:digest(PROFILE_V2),target:publicTarget(t),mappings:mappings.sort((a,b)=>a.obligationId.localeCompare(b.obligationId))}:
          {schema:'qivvera.assurance-plan/1',scope:ctx.scope,scopeDigest:ctx.scopeDigest,profile:PROFILE,profileDigest:digest(PROFILE),target:publicTarget(t),mapping:mappings[0],verifier:{id:PROFILE.verifierId,version:PROFILE.verifierVersion,digest:localDigest}};
        const id=randomUUID(),v=Number(old?.version??0)+1;
        await c.query('INSERT INTO assurance_plans(id,change_id,revision_id,version,scope_digest,snapshot,approved_by,rationale,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,changeId,input.revisionId,v,ctx.scopeDigest,canonical(snapshot),email,rationale,stamp(now())]);
        await audit(c,email,'ASSURANCE_PLAN_APPROVED',changeId,`Approved plan ${v}; all non-rejected obligations retained in scope.`);
        const result={id,version:v,snapshot};
        if(prepared){result.templateUse=await templates.recordUse(c,prepared,result,changeId,input,actor);result.replayed=false;}
        return result;
      });
    },
    async requestRun(changeId,input,actor){
      actorEmail(actor);if(!actor.roles.some(x=>['AUTHOR','POLICY_AUTHORITY'].includes(x)))fail('FORBIDDEN','Your role cannot request assessments.',403);
      fields(input,['revisionId','planId','requestKey']);identifier(input.revisionId);identifier(input.planId);identifier(input.requestKey);
      const email=actorEmail(actor), requestDigest=digest({changeId,...input,actor:email});
      return db.transaction(async c=>{
        await c.query('SELECT pg_advisory_xact_lock(78124423)');
        const ctx=await context(c,changeId,input.revisionId,true);
        const replay=(await c.query('SELECT * FROM assurance_runs WHERE request_key=$1',[input.requestKey])).rows[0];
        if(replay){if(replay.request_digest!==requestDigest)fail('IDEMPOTENCY_CONFLICT','This request key belongs to another request.');return viewRun(c,replay,ctx);}
        await expire(c);
        if(!ctx.isCurrent)fail('REVISION_CONFLICT','Assess the current revision.');
        const plan=await latestPlan(c,input.revisionId);
        if(plan)await model.validatePlan(c,plan);
        if(plan?.id!==input.planId||!validPlan(plan,ctx)||isV2(JSON.parse(plan.snapshot))&&!options.generalizationEnabled)fail('CURRENT_APPROVED_PLAN_REQUIRED','The plan or target changed. Obtain a current mapping decision.');
        if((await c.query("SELECT id FROM assurance_runs WHERE change_id=$1 AND status IN ('QUEUED','RUNNING')",[changeId])).rows.length)fail('ASSESSMENT_ACTIVE','An assessment is already queued or running.');
        const count=(await c.query("SELECT COUNT(*) AS n FROM assurance_runs WHERE status IN ('QUEUED','RUNNING')")).rows[0];
        if(Number(count.n)>=32)fail('QUEUE_CAPACITY','The review queue is full. Retry after active runs finish.',429);
        const id=randomUUID();
        const runNumber=Number((await c.query('SELECT COALESCE(MAX(run_number),0) AS n FROM assurance_runs WHERE revision_id=$1',[input.revisionId])).rows[0].n)+1;
        const queuedAt=await currentTime(c);
        await c.query('INSERT INTO assurance_runs(id,change_id,revision_id,plan_id,request_key,request_digest,requested_by,status,snapshot,queued_at,queued_deadline,run_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,changeId,input.revisionId,plan.id,input.requestKey,requestDigest,email,'QUEUED',plan.snapshot,stamp(queuedAt),queuedAt+600000,runNumber]);
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
      await c.query('SELECT pg_advisory_xact_lock(78124423)');
      await expire(c);
      const row=(await c.query("SELECT * FROM assurance_runs WHERE status='QUEUED' ORDER BY queued_at,id LIMIT 1")).rows[0];if(!row)return null;
      // Worker never needs UPDATE privilege on producer/authority records.
      // Input drift is rechecked and cannot establish current readiness.
      const locked=(await c.query('SELECT * FROM assurance_runs WHERE id=$1'+db.lock,[row.id])).rows[0];if(locked.status!=='QUEUED')return null;
      let ctx,plan,snapshot;
      try{
        ctx=await context(c,row.change_id,row.revision_id);
        plan=await latestPlan(c,row.revision_id);if(plan)await model.validatePlan(c,plan);
        snapshot=await model.validateRun(c,locked);
      }catch(e){
        if(e.code!=='ASSURANCE_INTEGRITY_FAILED')throw e;
        await c.query("UPDATE assurance_runs SET status='FAILED',failure_code='INPUT_INTEGRITY_FAILED',finished_at=$1 WHERE id=$2",[stamp(now()),row.id]);
        return null;
      }
      if(isV2(snapshot)&&!options.generalizationEnabled||!ctx.isCurrent||plan?.id!==row.plan_id||snapshot.scopeDigest!==ctx.scopeDigest||!configured(snapshot)){
        await c.query("UPDATE assurance_runs SET status='FAILED',failure_code='INPUTS_CHANGED_BEFORE_EXECUTION',finished_at=$1 WHERE id=$2",[stamp(now()),row.id]);return null;
      }
      const claimedAt=await currentTime(c),leaseToken=randomBytes(32).toString('hex'),until=claimedAt+120000;
      const claimed=await c.query(`UPDATE assurance_runs SET status='RUNNING',started_at=$1,lease_until=$2,lease_hash=$3,worker_id=$4
        WHERE id=$5 AND status='QUEUED' AND queued_deadline>${acceptanceClock('$6')} AND $2>${acceptanceClock('$6')}`,
      [stamp(claimedAt),until,digest(leaseToken),workerId,row.id,...(testClock?[now()]:[])]);
      if(claimed.rowCount!==1){
        const time=await currentTime(c);
        if(Number(locked.queued_deadline)<=time)await c.query("UPDATE assurance_runs SET status='FAILED',failure_code='QUEUE_DEADLINE_EXCEEDED',finished_at=$1,lease_hash=NULL WHERE id=$2 AND status='QUEUED'",[stamp(time),row.id]);
        return null;
      }
      return {id:row.id,snapshot,leaseToken,leaseUntil:until,workerId};
    });},
    async complete(job,report){
      return db.transaction(async c=>{
        const row=(await c.query('SELECT * FROM assurance_runs WHERE id=$1'+db.lock,[job.id])).rows[0];
        if(!row||row.status!=='RUNNING'||row.lease_hash!==digest(job.leaseToken)||Number(row.lease_until)<=await currentTime(c)||row.worker_id!==job.workerId)fail('LEASE_REJECTED','This worker no longer owns the active run.');
        const storedSnapshot=await model.validateRun(c,row);
        await context(c,row.change_id,row.revision_id);
        if(digest(storedSnapshot)!==digest(job.snapshot))fail('SNAPSHOT_MISMATCH','Job inputs do not match the queued snapshot.');
        validateReport(job.snapshot,report);
        // A later pass does not erase an earlier valid counterexample to the same obligation/target.
        const previous=(await c.query("SELECT r.*,r.id AS run_id,e.manifest,e.digest FROM assurance_runs r LEFT JOIN assurance_evidence e ON r.id=e.run_id WHERE r.revision_id=$1 AND r.status='COMPLETED' ORDER BY r.run_number",[row.revision_id])).rows;
        const counterevidence=[];
        for(const e of previous){
          const oldSnapshot=await model.validateRun(c,e);
          for(const m of mappingsOf(job.snapshot)){
            const old=mappingsOf(oldSnapshot).find(x=>x.obligationId===m.obligationId);
            if(!old||mappedKey(oldSnapshot,old)!==mappedKey(job.snapshot,m))continue;
            if(!e.manifest)throw new Error('PRIOR_EVIDENCE_UNAVAILABLE');
            const prior=JSON.parse(e.manifest);
            if(digest(prior)!==e.digest||prior.runId!==e.run_id||prior.snapshotDigest!==digest(oldSnapshot))throw new Error('PRIOR_EVIDENCE_INTEGRITY_FAILED');
            validateReport(oldSnapshot,prior.report);
            const previousReport=reportFor(oldSnapshot,prior.report,old.obligationId);
            if(previousReport?.outcome==='VIOLATED')counterevidence.push({runId:e.run_id,evidenceDigest:e.digest,obligationId:m.obligationId,reason:previousReport.reason});
          }
        }
        const completedAt=await currentTime(c);
        if(Number(row.lease_until)<=completedAt)fail('LEASE_REJECTED','This worker lease expired before its evidence could be accepted.');
        const manifest={schema:isV2(job.snapshot)?'qivvera.evidence/2':'qivvera.evidence/1',runId:row.id,changeId:row.change_id,revisionId:row.revision_id,planId:row.plan_id,snapshotDigest:digest(job.snapshot),target:job.snapshot.target,...(isV2(job.snapshot)?{verifiers:job.snapshot.mappings.map(m=>({obligationId:m.obligationId,...m.verifier}))}:{verifier:job.snapshot.verifier}),workerId:job.workerId,startedAt:row.started_at,completedAt:stamp(completedAt),report,counterevidence,
          integrityNotice:'SHA-256 binds these serialized observations; no signature, trusted timestamp, or database-admin tamper resistance is claimed.'};
        const serialized=canonical(manifest),hash=digest(manifest);
        await c.query('INSERT INTO assurance_evidence(run_id,manifest,digest,created_at) VALUES($1,$2,$3,$4)',[row.id,serialized,hash,stamp(completedAt)]);
        const accepted=await c.query(`UPDATE assurance_runs SET status='COMPLETED',finished_at=$1,lease_hash=NULL
          WHERE id=$2 AND status='RUNNING' AND lease_hash=$3 AND worker_id=$4 AND lease_until>${acceptanceClock('$5')}`,
        [stamp(completedAt),row.id,digest(job.leaseToken),job.workerId,...(testClock?[now()]:[])]);
        // A rejected terminal transition rolls back the evidence insert in this transaction.
        if(accepted.rowCount!==1)fail('LEASE_REJECTED','This worker no longer owns an unexpired run at evidence acceptance.');
        await audit(c,job.workerId,'ASSURANCE_COMPLETED',row.change_id,`Assessment ${row.id} completed; ${deriveCase(job.snapshot,report,counterevidence).disposition} within its frozen scope.`);
        return {id:row.id,status:'COMPLETED',evidenceDigest:hash};
      });
    }
  };
}
