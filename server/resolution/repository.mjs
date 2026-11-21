import {validateTargets as validateCatalogue,mappingOf,sameExecutionContract} from '../assurance/generalization.mjs';
/** Finding resolution. No operation writes an assessment, plan, obligation or evidence row. */
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../workflow-store.mjs';
import {InputError,fields,text,identifier,version,actorEmail,requireRole} from '../workflow-input.mjs';
import {canonical,digest,fullRevision} from '../assurance/contracts.mjs';
import {createAssuranceReadModel} from '../assurance/read-model.mjs';
import {migrateResolution,requireResolution} from './migration.mjs';
import {directoryOf,reason,kindOf,sameExpectation,expectationOf,RESOLUTION_NOTICE} from './contracts.mjs';
const fail=(code,message,status=409)=>{throw new InputError(code,message,status);};
const stamp=t=>new Date(t).toISOString();
const parse=s=>s?JSON.parse(s):null;
const writable=actor=>{actorEmail(actor);if(!actor.roles.some(r=>['AUTHOR','POLICY_AUTHORITY'].includes(r)))fail('FORBIDDEN','Your role cannot manage resolutions.',403);};
const basic=r=>({id:r.id,changeId:r.change_id,sourceRunId:r.source_run_id,sourceRevisionId:r.source_revision_id,sourceObligationId:r.source_obligation_id,kind:r.kind,assignedTo:r.assigned_to,actionPlan:r.action_plan,externalReference:r.external_reference,status:r.status,version:Number(r.version),correctionRevisionId:r.correction_revision_id,correctionObligationId:r.correction_obligation_id,correctionNote:r.correction_note,correctionProposedBy:r.correction_proposed_by,correctionProposedAt:r.correction_proposed_at,correctionRunFloor:r.correction_run_floor===null?null:Number(r.correction_run_floor),linkedRunId:r.linked_run_id,verifiedBy:r.verified_by,verifiedAt:r.verified_at,verification:parse(r.verification_snapshot),createdBy:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at});
const challengeView=r=>({id:r.id,itemId:r.item_id,state:r.state,raisedBy:r.raised_by,rationale:r.rationale,createdAt:r.created_at,response:r.response,respondedBy:r.responded_by,responseReason:r.response_reason,independentActor:r.independent_actor===null?null:!!Number(r.independent_actor),respondedAt:r.responded_at});
export async function openResolutionRepository(options={}){
  // Database-held accounts are read live so added/disabled people are reflected without a restart.
  const fixedPeople=options.directory?null:directoryOf(options.accounts??[]);
  const people=async()=>fixedPeople??directoryOf(await options.directory.list());
  const catalogue=validateCatalogue(options.targets??[],{local:options.allowLocalTargets===true});
  const db=await openDatabase(options);
  try{if(options.migrate)await migrateResolution(db);else await requireResolution(db);}catch(e){await db.close();throw e;}
  const views=createAssuranceReadModel(db,catalogue),now=options.now??Date.now;
  const reviewMode=options.reviewMode??'independent';
  if(!['independent','founder-review'].includes(reviewMode)){await db.close();throw new Error('INVALID_REVIEW_MODE');}
  const read=fn=>db.transaction(fn,true);
  async function assignee(value){const email=text(value,'Assignee email',254).toLowerCase();if(!(await people()).some(p=>p.email===email&&p.roles.some(r=>['AUTHOR','POLICY_AUTHORITY'].includes(r))))fail('ASSIGNEE_UNAVAILABLE','Choose an active configured author or policy authority.',400);return email;}
  const assignees=async()=>(await people()).filter(p=>p.roles.some(r=>['AUTHOR','POLICY_AUTHORITY'].includes(r)));
  const challenges=async(c,id)=>(await c.query('SELECT * FROM resolution_challenges WHERE item_id=$1 ORDER BY created_at,id',[id])).rows;
  async function itemRow(c,id){const r=(await c.query('SELECT * FROM resolution_items WHERE id=$1',[identifier(id)])).rows[0];if(!r)fail('RESOLUTION_NOT_FOUND','Resolution item not found.',404);return r;}
  async function run(c,id){const r=(await c.query('SELECT * FROM assurance_runs WHERE id=$1',[id])).rows[0];if(!r)fail('RUN_NOT_FOUND','Assessment not found.',404);return views.viewRun(c,r,await views.context(c,r.change_id,r.revision_id));}
  async function locked(c,id){let r=await itemRow(c,id);await c.query('SELECT id FROM changes WHERE id=$1'+db.lock,[r.change_id]);r=(await c.query('SELECT * FROM resolution_items WHERE id=$1'+db.lock,[id])).rows[0];return r;}
  async function record(c,r,action,email,note){
    const time=stamp(now());
    await c.query('INSERT INTO resolution_history(id,item_id,version,action,actor,rationale,snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),r.id,r.version,action,email,note,canonical(basic(r)),time]);
    await c.query('INSERT INTO activity(id,actor,action,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),email,'RESOLUTION_'+action,r.change_id,`${r.id}: ${note}`,time]);
  }
  // Only this fixed allowlist can be written; all identifiers/values remain parameters.
  const mutable=new Set(['assigned_to','action_plan','external_reference','status','correction_revision_id','correction_obligation_id','correction_note','correction_proposed_by','correction_proposed_at','correction_run_floor','linked_run_id','verification_snapshot','verified_by','verified_at']);
  async function update(c,r,patch,action,email,note){
    const entries=Object.entries(patch);if(entries.some(([k])=>!mutable.has(k)))throw new Error('INVALID_RESOLUTION_PATCH');
    const values=entries.map(([,v])=>v);values.push(stamp(now()),r.id,r.version);
    const set=entries.map(([k],i)=>`${k}=$${i+1}`);
    set.push(`updated_at=$${entries.length+1}`,'version=version+1');
    const result=await c.query(`UPDATE resolution_items SET ${set.join(',')} WHERE id=$${entries.length+2} AND version=$${entries.length+3}`,values);
    if(result.rowCount!==1)fail('VERSION_CONFLICT','This resolution changed. Reload before saving.');
    const next=await itemRow(c,r.id);await record(c,next,action,email,note);return next;
  }
  async function isDescendant(c,id,ancestor){
    const seen=new Set();for(let i=0;id&&i<1000;i++){
      if(id===ancestor)return true;if(seen.has(id))return false;seen.add(id);
      id=(await c.query('SELECT copied_from FROM obligation_workflow WHERE obligation_id=$1',[id])).rows[0]?.copied_from;
    }return false;
  }
  async function correction(c,r,revisionId,obligationId){
    const ctx=await views.context(c,r.change_id,revisionId);
    if(!ctx.isCurrent)fail('CURRENT_REVISION_REQUIRED','Choose the current revision of this change.');
    const o=ctx.scope.obligations.find(x=>x.id===obligationId);
    if(!o||!await isDescendant(c,obligationId,r.source_obligation_id))fail('RELATED_OBLIGATION_REQUIRED','Choose the original obligation or its explicitly copied descendant.');
    return {ctx,o};
  }
  async function eligibility(c,r){
    const blockers=[],add=(code,message)=>blockers.push({code,message});
    const source=parse(r.source_snapshot);
    if(digest(source)!==r.source_digest)add('SOURCE_SNAPSHOT_INVALID','The saved source snapshot failed its integrity check.');
    const sourceRun=await run(c,r.source_run_id);
    if(source.evidenceDigest && (sourceRun.evidenceIntegrity!=='DIGEST_MATCH'||sourceRun.evidenceDigest!==source.evidenceDigest))add('SOURCE_EVIDENCE_INVALID','Original evidence is missing or altered. Restore/investigate it; do not close this item.');
    if(digest(sourceRun.snapshot)!==source.assessmentSnapshotDigest)add('SOURCE_ASSESSMENT_CHANGED','The original assessment identity changed.');
    if(!(await people()).some(p=>p.email===r.assigned_to&&p.roles.some(role=>['AUTHOR','POLICY_AUTHORITY'].includes(role))))add('ASSIGNEE_UNAVAILABLE','Assign an active configured owner before verifying resolution.');
    const pending=(await challenges(c,r.id)).some(x=>x.state==='OPEN');
    if(pending)add('CHALLENGE_PENDING','A policy authority must respond to the open challenge.');
    if(!r.correction_revision_id||!r.correction_obligation_id)add('CORRECTION_REQUIRED','Propose a correction and its related requirement first.');
    if(!r.linked_run_id)add('REASSESSMENT_REQUIRED','Link a fresh reassessment requested after the correction proposal.');
    let candidate=null,finding=null,obligation=null,ctx=null;
    if(r.correction_revision_id){
      ctx=await views.context(c,r.change_id,r.correction_revision_id);
      if(!ctx.isCurrent)add('CORRECTION_NOT_CURRENT','The correction revision is no longer current.');
      obligation=ctx.scope.obligations.find(x=>x.id===r.correction_obligation_id);
      if(!obligation||!await isDescendant(c,r.correction_obligation_id,r.source_obligation_id))add('UNRELATED_REQUIREMENT','The correction is not linked through the original requirement lineage.');
      else{
        if(!sameExpectation(source.obligation,obligation,{authorityGap:r.kind==='AUTHORITY_GAP'}))add('REQUIREMENT_CHANGED','The requirement or its authority changed. A weaker/different rule cannot demonstrate this correction.');
        if(obligation.reviewStatus!=='ACCEPTED')add('ACCEPTED_REQUIREMENT_REQUIRED','The correction requirement needs a current acceptance decision.');
      }
    }
    if(r.linked_run_id){
      candidate=await run(c,r.linked_run_id);
      if(candidate.changeId!==r.change_id||candidate.revisionId!==r.correction_revision_id)add('REASSESSMENT_SCOPE_MISMATCH','The run belongs to another change or correction revision.');
      if(candidate.id===r.source_run_id||!r.correction_proposed_at||candidate.number<=Number(r.correction_run_floor??0)||Date.parse(candidate.queuedAt)<Date.parse(r.correction_proposed_at))add('FRESH_REASSESSMENT_REQUIRED','Evidence collected before the correction proposal cannot close it.');
      if(candidate.status!=='COMPLETED')add('COMPLETED_REASSESSMENT_REQUIRED','Wait for an actual completed reassessment, not a queued, failed or cancelled run.');
      if(candidate.evidenceIntegrity!=='DIGEST_MATCH')add('VALID_EVIDENCE_REQUIRED','The reassessment evidence and referenced counterevidence must pass integrity checks.');
      if(candidate.applicability!=='CURRENT')add('CURRENT_EVIDENCE_REQUIRED','The reassessment no longer applies to the current scope, mapping, revision or target.');
      if(!mappingOf(candidate.snapshot,r.correction_obligation_id))add('MAPPED_REQUIREMENT_REQUIRED','This run did not execute verification for the correction requirement.');
      finding=candidate.case?.findings.find(f=>f.obligationId===r.correction_obligation_id)??null;
      if(finding?.state!=='SUPPORTED')add('SUPPORTED_FINDING_REQUIRED','The linked requirement is not supported. A prior counterexample or gap cannot be waived here.');
      if(!sameExecutionContract(sourceRun.snapshot,candidate.snapshot,r.source_obligation_id,r.correction_obligation_id))add('VERIFICATION_CONTRACT_CHANGED','A changed verifier or profile requires separate qualification; it cannot establish this correction automatically.');
      const latest=(await c.query('SELECT id FROM assurance_runs WHERE revision_id=$1 ORDER BY run_number DESC LIMIT 1',[candidate.revisionId])).rows[0];
      if(latest?.id!==candidate.id)add('NEWER_ASSESSMENT_EXISTS','Review the latest assessment. Older passing evidence cannot mask a later run.');
      if((await c.query("SELECT id FROM assurance_runs WHERE change_id=$1 AND status IN ('QUEUED','RUNNING')",[r.change_id])).rows.length)add('ASSESSMENT_IN_PROGRESS','Wait for queued or running verification before confirming resolution.');
      if(r.kind==='VIOLATION'){
        if(candidate.revisionId===r.source_revision_id||candidate.snapshot.target.sourceRevision===sourceRun.snapshot.target.sourceRevision||candidate.snapshot.target.artifactDigest===sourceRun.snapshot.target.artifactDigest)add('NEW_CORRECTED_ARTIFACT_REQUIRED','A behaviour violation requires a new declared source revision and artifact, followed by fresh verification.');
      }
    }
    return {eligible:blockers.length===0,blockers,source:{runId:sourceRun.id,revisionId:sourceRun.revisionId,sourceRevision:sourceRun.snapshot.target.sourceRevision,finding:source.finding,disposition:sourceRun.disposition,evidenceDigest:sourceRun.evidenceDigest},candidate:candidate?{runId:candidate.id,revisionId:candidate.revisionId,sourceRevision:candidate.snapshot.target.sourceRevision,status:candidate.status,applicability:candidate.applicability,evidenceIntegrity:candidate.evidenceIntegrity,evidenceDigest:candidate.evidenceDigest,assessmentSnapshotDigest:digest(candidate.snapshot),finding,disposition:candidate.disposition}:null,expectations:{original:expectationOf(source.obligation),correction:obligation?expectationOf(obligation):null},notice:RESOLUTION_NOTICE};
  }
  async function view(c,r,detail=false){
    const comparison=await eligibility(c,r),source=parse(r.source_snapshot);
    const proof=parse(r.verification_snapshot);
    const unchangedProof=proof&&comparison.candidate&&proof.runId===comparison.candidate.runId&&proof.evidenceDigest===comparison.candidate.evidenceDigest&&proof.assessmentSnapshotDigest===comparison.candidate.assessmentSnapshotDigest;
    const effectiveStatus=r.status==='RESOLVED'&&(!comparison.eligible||!unchangedProof)?'REASSESSMENT_REQUIRED':r.status;
    const result={...basic(r),source,sourceIntegrity:digest(source)===r.source_digest?'DIGEST_MATCH':'DIGEST_MISMATCH',effectiveStatus,comparison,reviewMode,notice:RESOLUTION_NOTICE};
    if(detail){result.challenges=(await challenges(c,r.id)).map(challengeView);result.history=(await c.query('SELECT * FROM resolution_history WHERE item_id=$1 ORDER BY version',[r.id])).rows.map(h=>({id:h.id,version:Number(h.version),action:h.action,actor:h.actor,rationale:h.rationale,snapshot:parse(h.snapshot),createdAt:h.created_at}));}
    return result;
  }
  const api={
    close:()=>db.close(),healthy:()=>db.healthy(),listAssignees:()=>assignees(),
    async create(runId,input,actor){
      writable(actor);identifier(runId);fields(input,['obligationId','assignedTo','actionPlan','externalReference']);
      const obligationId=identifier(input.obligationId),email=actorEmail(actor),assigned=await assignee(input.assignedTo),plan=reason(input.actionPlan),external=text(input.externalReference,'External reference',500,false);
      return db.transaction(async c=>{
        const initial=await run(c,runId);await c.query('SELECT id FROM changes WHERE id=$1'+db.lock,[initial.changeId]);
        const old=(await c.query('SELECT * FROM resolution_items WHERE source_run_id=$1 AND source_obligation_id=$2',[runId,obligationId])).rows[0];
        if(old){if(old.assigned_to!==assigned||old.action_plan!==plan||old.external_reference!==external)fail('RESOLUTION_EXISTS','This finding already has a resolution item. Open it instead of creating a duplicate.');return {...await view(c,old,true),replayed:true};}
        const sourceRun=await run(c,runId),obligation=sourceRun.snapshot.scope.obligations.find(o=>o.id===obligationId);
        if(!obligation)fail('SOURCE_OBLIGATION_REQUIRED','The requirement is not in this assessment.',400);
        if(!['COMPLETED','FAILED'].includes(sourceRun.status))fail('TERMINAL_ASSESSMENT_REQUIRED','Only a completed finding or failed assessment can open a resolution.');
        if(sourceRun.status==='COMPLETED'&&sourceRun.evidenceIntegrity!=='DIGEST_MATCH')fail('SOURCE_EVIDENCE_INVALID','Restore or investigate missing/invalid evidence before creating a verified finding resolution.');
        if(sourceRun.status==='FAILED'&&!mappingOf(sourceRun.snapshot,obligationId))fail('SOURCE_OBLIGATION_REQUIRED','Use the planned obligation for this execution failure.',400);
        const finding=sourceRun.case?.findings.find(f=>f.obligationId===obligationId)??{obligationId,state:'NOT_ASSESSED',statement:obligation.statement,reason:sourceRun.failureCode};
        const kind=kindOf(finding,sourceRun.status),id=randomUUID(),time=stamp(now());
        const source={schema:'qivvera.resolution-source/1',runId,obligation, finding,assessmentSnapshotDigest:digest(sourceRun.snapshot),evidenceDigest:sourceRun.evidenceDigest,disposition:sourceRun.disposition,target:sourceRun.snapshot.target,createdFromStatus:sourceRun.status};
        await c.query('INSERT INTO resolution_items(id,change_id,source_run_id,source_revision_id,source_obligation_id,kind,source_snapshot,source_digest,assigned_to,action_plan,external_reference,status,version,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,\'OPEN\',1,$12,$13,$13)',[id,sourceRun.changeId,runId,sourceRun.revisionId,obligationId,kind,canonical(source),digest(source),assigned,plan,external,email,time]);
        const row=await itemRow(c,id);await record(c,row,'CREATED',email,plan);return view(c,row,true);
      });
    },
    async get(id){return read(async c=>view(c,await itemRow(c,id),true));},
    async list({changeId=null,offset=0,limit=50}={}){
      if(changeId)identifier(changeId);
      if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_PAGE','Use a non-negative offset and limit from 1 to 100.',400);
      return read(async c=>{
        if(changeId&&!(await c.query('SELECT id FROM changes WHERE id=$1',[changeId])).rows[0])fail('CHANGE_NOT_FOUND','Change not found.',404);
        const where=changeId?' WHERE change_id=$1':'',params=changeId?[changeId]:[];
        const total=Number((await c.query('SELECT COUNT(*) AS n FROM resolution_items'+where,params)).rows[0].n);
        const rows=(await c.query(`SELECT * FROM resolution_items${where} ORDER BY created_at DESC,id LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,limit,offset])).rows;
        const items=[];for(const row of rows)items.push(await view(c,row));return {items,total,offset,limit,hasMore:offset+items.length<total};
      });
    },
    async act(id,input,actor){
      writable(actor);fields(input,['action','version','rationale','assignedTo','actionPlan','externalReference','revisionId','obligationId','runId','challengeId','response']);version(input.version);
      const email=actorEmail(actor),action=input.action;
      const allowed={START:[],UPDATE:['assignedTo','actionPlan','externalReference'],PROPOSE_CORRECTION:['revisionId','obligationId'],LINK_ASSESSMENT:['runId'],VERIFY:[],REOPEN:[],NOTE:[],CHALLENGE:[],RESPOND_CHALLENGE:['challengeId','response']};
      if(!Object.hasOwn(allowed,action))fail('INVALID_ACTION','Choose a supported resolution action.',400);
      fields(input,['action','version','rationale',...allowed[action]]);const note=reason(input.rationale);
      return db.transaction(async c=>{
        let r=await locked(c,id);if(Number(r.version)!==input.version)fail('VERSION_CONFLICT','This resolution changed. Reload before acting.');
        if(r.status==='RESOLVED'&&!['REOPEN','NOTE','CHALLENGE','RESPOND_CHALLENGE'].includes(action))fail('RESOLUTION_CLOSED','Reopen the item before making another correction.');
        let patch={};
        if(action==='START'){if(r.status!=='OPEN')fail('INVALID_TRANSITION','Only an open item can be started.');patch={status:'IN_PROGRESS'};}
        if(action==='UPDATE'){patch={assigned_to:await assignee(input.assignedTo),action_plan:reason(input.actionPlan),external_reference:text(input.externalReference,'External reference',500,false)};}
        if(action==='PROPOSE_CORRECTION'){
          const rev=identifier(input.revisionId),o=identifier(input.obligationId);const {ctx}=await correction(c,r,rev,o);fullRevision(ctx.revision.source_revision);
          if(r.kind==='VIOLATION'&&(rev===r.source_revision_id||ctx.revision.source_revision===parse(r.source_snapshot).target.sourceRevision))fail('NEW_CORRECTED_REVISION_REQUIRED','A confirmed behavioural violation needs a new source revision, not a task-status change.');
          const floor=Number((await c.query('SELECT COALESCE(MAX(run_number),0) AS n FROM assurance_runs WHERE revision_id=$1',[rev])).rows[0].n);
          patch={correction_run_floor:floor,status:'AWAITING_REASSESSMENT',correction_revision_id:rev,correction_obligation_id:o,correction_note:note,correction_proposed_by:email,correction_proposed_at:stamp(now()),linked_run_id:null,verification_snapshot:null,verified_by:null,verified_at:null};
        }
        if(action==='LINK_ASSESSMENT'){
          if(r.status!=='AWAITING_REASSESSMENT')fail('CORRECTION_REQUIRED','Propose the correction before linking its reassessment.');
          const selected=await run(c,identifier(input.runId));
          if(selected.changeId!==r.change_id||selected.revisionId!==r.correction_revision_id||!mappingOf(selected.snapshot,r.correction_obligation_id))fail('REASSESSMENT_SCOPE_MISMATCH','Choose a run of this correction revision and its mapped requirement.');
          if(selected.id===r.source_run_id||selected.number<=Number(r.correction_run_floor??0)||Date.parse(selected.queuedAt)<Date.parse(r.correction_proposed_at))fail('FRESH_REASSESSMENT_REQUIRED','Request fresh assurance after proposing the correction.');
          patch={linked_run_id:selected.id};
        }
        if(action==='VERIFY'){
          requireRole(actor,'POLICY_AUTHORITY');if(r.status!=='AWAITING_REASSESSMENT')fail('INVALID_TRANSITION','Only a correction awaiting reassessment can be verified.');
          const contributions=(await c.query("SELECT DISTINCT actor FROM resolution_history WHERE item_id=$1 AND action IN ('CREATED','PROPOSE_CORRECTION')",[id])).rows.map(x=>x.actor);
          const independent=email!==r.assigned_to&&!contributions.includes(email);
          if(reviewMode==='independent'&&!independent)fail('INDEPENDENT_RESOLUTION_REVIEW_REQUIRED','A different policy authority must verify this correction.',403);
          const comparison=await eligibility(c,r);if(!comparison.eligible)fail('RESOLUTION_NOT_VERIFIABLE',comparison.blockers.map(b=>b.message).join(' '));
          const candidate=comparison.candidate;
          const proof={schema:'qivvera.resolution-verification/1',...candidate,verifiedBy:email,verifiedAt:stamp(now()),rationale:note,independentActor:independent,sourceRunId:r.source_run_id,sourceEvidenceDigest:parse(r.source_snapshot).evidenceDigest,expectations:comparison.expectations,notice:RESOLUTION_NOTICE};
          patch={status:'RESOLVED',verified_by:email,verified_at:proof.verifiedAt,verification_snapshot:canonical(proof)};
        }
        if(action==='REOPEN'){
          if(r.status!=='RESOLVED')fail('INVALID_TRANSITION','Only a resolved item can be reopened.');
          patch={status:'OPEN',correction_revision_id:null,correction_obligation_id:null,correction_note:null,correction_proposed_by:null,correction_proposed_at:null,correction_run_floor:null,linked_run_id:null,verification_snapshot:null,verified_by:null,verified_at:null};
        }
        if(action==='CHALLENGE'){
          if((await challenges(c,id)).some(x=>x.state==='OPEN'))fail('CHALLENGE_ALREADY_OPEN','Respond to the existing challenge first.');
          await c.query('INSERT INTO resolution_challenges(id,item_id,state,raised_by,rationale,created_at) VALUES($1,$2,\'OPEN\',$3,$4,$5)',[randomUUID(),id,email,note,stamp(now())]);
        }
        if(action==='RESPOND_CHALLENGE'){
          requireRole(actor,'POLICY_AUTHORITY');identifier(input.challengeId);
          if(!['FINDING_UPHELD','REASSESSMENT_REQUIRED'].includes(input.response))fail('INVALID_RESPONSE','A challenge cannot dismiss evidence or waive a finding.',400);
          const ch=(await c.query('SELECT * FROM resolution_challenges WHERE id=$1 AND item_id=$2',[input.challengeId,id])).rows[0];
          if(!ch||ch.state!=='OPEN')fail('CHALLENGE_NOT_OPEN','The challenge is not open for this item.');
          const independent=email!==ch.raised_by;
          if(reviewMode==='independent'&&!independent)fail('INDEPENDENT_CHALLENGE_REVIEW_REQUIRED','A different policy authority must respond.',403);
          await c.query("UPDATE resolution_challenges SET state='RESPONDED',response=$1,responded_by=$2,response_reason=$3,independent_actor=$4,responded_at=$5 WHERE id=$6",[input.response,email,note,independent?1:0,stamp(now()),ch.id]);
          // A request for reassessment must remain actionable even after the challenge is answered.
          if(r.status==='AWAITING_REASSESSMENT'&&input.response==='REASSESSMENT_REQUIRED'){
            const floor=Number((await c.query('SELECT COALESCE(MAX(run_number),0) AS n FROM assurance_runs WHERE revision_id=$1',[r.correction_revision_id])).rows[0].n);
            patch={linked_run_id:null,correction_run_floor:floor,correction_proposed_at:stamp(now())};
          }
          if(r.status==='RESOLVED'&&input.response==='REASSESSMENT_REQUIRED')patch={status:'OPEN',correction_revision_id:null,correction_obligation_id:null,correction_note:null,correction_proposed_by:null,correction_proposed_at:null,correction_run_floor:null,linked_run_id:null,verification_snapshot:null,verified_by:null,verified_at:null};
        }
        r=await update(c,r,patch,action,email,note);return view(c,r,true);
      });
    },
    async export(id){return read(async c=>{const item=await itemRow(c,id);return {schema:'qivvera.resolution-case/1',exportedAt:stamp(now()),resolution:await view(c,item,true),originalAssessment:await run(c,item.source_run_id),reassessment:item.linked_run_id?await run(c,item.linked_run_id):null,notice:RESOLUTION_NOTICE};});}
  };
  return api;
}
