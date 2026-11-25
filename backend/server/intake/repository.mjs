/** Transactional preview/import. Only operator-authorized repositories can enter a workspace. */
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../workflow-store.mjs';
import {fields,InputError,identifier,text,actorEmail,requireRole,obligationView} from '../workflow-input.mjs';
import {canonical,digest} from '../assurance/contracts.mjs';
import {migrateIntake,requireIntake} from './migration.mjs';
import {validateRepositories,publicRepository,pullNumber,readPull} from './github.mjs';
const fail=(code,message,status=409)=>{throw new InputError(code,message,status);};
const iso=n=>new Date(n).toISOString();
export async function openIntakeRepository(options={}){
 const catalogue=validateRepositories(options.repositories??[]),now=options.now??Date.now;
 const db=await openDatabase(options);
 try{if(options.migrate)await migrateIntake(db);else await requireIntake(db);}catch(e){await db.close();throw e;}
 const getConfig=id=>{const c=catalogue.find(r=>r.id===id);if(!c)fail('REPOSITORY_NOT_CONFIGURED','Select an operator-authorized repository.',400);return c;};
 const record=r=>{if(!r)fail('SOURCE_IMPORT_NOT_FOUND','Source import is unavailable.',404);let source;try{source=JSON.parse(r.snapshot);}catch{fail('SOURCE_INTEGRITY_FAILED','Saved source metadata is invalid.');}if(digest(source)!==r.snapshot_digest)fail('SOURCE_INTEGRITY_FAILED','Saved source metadata failed integrity validation.');return {id:r.id,applicationId:r.application_id,changeId:r.change_id,revisionId:r.revision_id,source,sourceDigest:r.snapshot_digest,importedBy:r.imported_by,importedAt:r.imported_at};};
 async function fetchSource(config,number){
  const wait=await db.transaction(async c=>(await c.query('SELECT retry_after FROM source_backoff WHERE repository_key=$1',[config.id])).rows[0],true);
  if(wait&&Number(wait.retry_after)>now())fail('GITHUB_RATE_LIMITED','Provider cooldown is active. Retry later.',429);
  try{return await readPull(config,number,{secretEnv:options.secretEnv??process.env,...(options.fetchFn?{fetchFn:options.fetchFn}:{})});}
  catch(e){if(e.code==='GITHUB_RATE_LIMITED')await db.transaction(c=>c.query('INSERT INTO source_backoff(repository_key,retry_after) VALUES($1,$2) ON CONFLICT(repository_key) DO UPDATE SET retry_after=$2',[config.id,now()+e.retryMs]));throw e;}
 }
 async function previewRow(c,id,email){const row=(await c.query('SELECT * FROM source_previews WHERE id=$1',[id])).rows[0];if(!row||row.actor!==email)fail('PREVIEW_NOT_FOUND','Preview not found for this identity.',404);return row;}
 function fresh(row,config){if(Number(row.expires_at)<=now())fail('PREVIEW_EXPIRED','Preview expired. Fetch current source metadata.');if(row.configuration_digest!==digest(config))fail('REPOSITORY_CONFIGURATION_CHANGED','Repository authorization changed. Preview again.');const s=JSON.parse(row.snapshot);if(digest(s)!==row.snapshot_digest)fail('PREVIEW_INTEGRITY_FAILED','The saved preview is invalid.');return s;}
 const audit=(c,email,action,id,note)=>c.query('INSERT INTO activity(id,actor,action,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),email,action,id,note,iso(now())]);
 return {
  close:()=>db.close(),healthy:()=>db.healthy(),listRepositories:async()=>catalogue.map(publicRepository),
  async preview(input,actor){
   requireRole(actor,'AUTHOR');fields(input,['repositoryKey','pullNumber']);const config=getConfig(input.repositoryKey),number=pullNumber(input.pullNumber),email=actorEmail(actor);
   await db.transaction(async c=>{if(!(await c.query('SELECT id FROM applications WHERE id=$1',[config.applicationId])).rows[0])fail('APPLICATION_NOT_FOUND','The configured application is unavailable.',404);},true);
   const source=await fetchSource(config,number),id=randomUUID(),expires=now()+300000;
   await db.transaction(async c=>{await c.query('DELETE FROM source_previews WHERE expires_at<$1 AND import_id IS NULL',[now()-86400000]);await c.query('INSERT INTO source_previews(id,actor,repository_key,configuration_digest,snapshot,snapshot_digest,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,email,config.id,digest(config),canonical(source),digest(source),iso(now()),expires]);});
   return {id,applicationId:config.applicationId,source,expiresAt:iso(expires),notice:'Preview is not an import, accepted obligation or assurance result.'};
  },
  async importPreview(input,actor){
   requireRole(actor,'AUTHOR');fields(input,['previewId','changeId','expectedRevisionId','copyObligations','reason']);
   const id=identifier(input.previewId),email=actorEmail(actor),changeId=input.changeId?identifier(input.changeId):null;
   const expected=changeId?identifier(input.expectedRevisionId):null;
   if(!changeId&&input.expectedRevisionId)fail('INVALID_IMPORT_TARGET','A new change cannot name an existing revision.',400);
   if(typeof input.copyObligations!=='boolean'||!changeId&&input.copyObligations)fail('INVALID_COPY_CHOICE','Choose whether to copy candidates for an existing change.',400);
   const reason=text(input.reason,'Import reason',2000);if(reason.length<10)fail('IMPORT_REASON_REQUIRED','Explain why this source belongs to the application/change.',400);
   const requestDigest=digest({previewId:id,changeId,expected,copyObligations:input.copyObligations,reason,email});
   const saved=await db.transaction(c=>previewRow(c,id,email),true);
   if(saved.import_id){if(saved.request_digest!==requestDigest)fail('IMPORT_CONFLICT','This preview was consumed with different import choices.');return db.transaction(async c=>({...record((await c.query('SELECT * FROM source_imports WHERE id=$1',[saved.import_id])).rows[0]),replayed:true}),true);}
   const config=getConfig(saved.repository_key),source=fresh(saved,config),live=await fetchSource(config,source.pullNumber);
   if(live.fingerprint!==source.fingerprint)fail('SOURCE_CHANGED','Pull-request source or metadata changed after preview. Preview again.');
   return db.transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(78124424)');
    const row=await previewRow(c,id,email);
    if(row.import_id){if(row.request_digest!==requestDigest)fail('IMPORT_CONFLICT','Preview was already used differently.');return {...record((await c.query('SELECT * FROM source_imports WHERE id=$1',[row.import_id])).rows[0]),replayed:true};}
    fresh(row,config);
    if(!(await c.query('SELECT id FROM applications WHERE id=$1',[config.applicationId])).rows[0])fail('APPLICATION_NOT_FOUND','Configured application not found.',404);
    const old=(await c.query('SELECT * FROM source_imports WHERE application_id=$1 AND repository_id=$2 AND pull_number=$3 AND head_sha=$4',[config.applicationId,config.repositoryId,source.pullNumber,source.headSha])).rows[0];
    if(old){if(changeId&&old.change_id!==changeId)fail('SOURCE_ALREADY_LINKED','This exact pull head is already linked to another change.');await c.query('UPDATE source_previews SET import_id=$1,request_digest=$2 WHERE id=$3',[old.id,requestDigest,id]);return {...record(old),replayed:true};}
    const time=iso(now()),revisionId=randomUUID();let targetChange=changeId,previous=null,number=1;
    if(changeId){
      const change=(await c.query('SELECT * FROM changes WHERE id=$1'+db.lock,[changeId])).rows[0];
      if(!change||change.application_id!==config.applicationId)fail('APPLICATION_CHANGE_MISMATCH','Choose a change in the configured application.');
      previous=(await c.query('SELECT * FROM change_revisions WHERE change_id=$1 ORDER BY revision_number DESC LIMIT 1',[changeId])).rows[0];
      if(previous?.id!==expected)fail('REVISION_CONFLICT','The change advanced. Review the latest revision before importing.');
      if((await c.query('SELECT id FROM change_revisions WHERE change_id=$1 AND source_revision=$2',[changeId,source.headSha])).rows.length)fail('SOURCE_REVISION_EXISTS','This source reference already exists in the change.');
      const origins=(await c.query('SELECT repository_id,pull_number FROM source_imports WHERE change_id=$1',[changeId])).rows;
      if(origins.some(x=>Number(x.repository_id)!==config.repositoryId||Number(x.pull_number)!==source.pullNumber))fail('PULL_CHANGE_MISMATCH','A different pull request is already linked to this change.');
      number=Number(previous.revision_number)+1;
    }else{targetChange=randomUUID();await c.query('INSERT INTO changes(id,application_id,title,intent,source_revision,producer,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[targetChange,config.applicationId,source.importedTitle,reason,source.headSha,'UNSPECIFIED',time]);}
    await c.query('INSERT INTO change_revisions(id,change_id,revision_number,parent_revision_id,source_revision,intent,producer,reason,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[revisionId,targetChange,number,previous?.id??null,source.headSha,reason,previous?.producer??'UNSPECIFIED','Imported reviewed GitHub source context. '+reason,email,time]);
    if(previous&&input.copyObligations){
      const originals=(await c.query("SELECT o.*,w.source_version FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id WHERE w.revision_id=$1 AND w.review_state<>'REJECTED'",[previous.id])).rows;
      for(const o of originals){
        const oid=randomUUID();await c.query('INSERT INTO obligations(id,change_id,statement,source_reference,criticality,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,1,$6,$6)',[oid,targetChange,o.statement,o.source_reference,o.criticality,time]);
        await c.query("INSERT INTO obligation_workflow(obligation_id,revision_id,source_version,review_state,proposed_by,last_edited_by,imported,copied_from) VALUES($1,$2,$3,'DRAFT',$4,$4,0,$5)",[oid,revisionId,o.source_version,email,o.id]);
        const copy=(await c.query('SELECT o.*,w.* FROM obligations o JOIN obligation_workflow w ON w.obligation_id=o.id WHERE o.id=$1',[oid])).rows[0];
        await c.query('INSERT INTO obligation_history(id,obligation_id,version,revision_id,action,actor,rationale,independent_actor,snapshot,created_at) VALUES($1,$2,1,$3,$4,$5,$6,0,$7,$8)',[randomUUID(),oid,revisionId,'COPIED_TO_REVISION',email,'Source import copies candidates only; prior authority and evidence do not transfer.',JSON.stringify(obligationView(copy)),time]);
      }
    }
    const importId=randomUUID();await c.query('INSERT INTO source_imports(id,application_id,change_id,revision_id,repository_id,pull_number,head_sha,snapshot,snapshot_digest,imported_by,imported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[importId,config.applicationId,targetChange,revisionId,config.repositoryId,source.pullNumber,source.headSha,canonical(source),digest(source),email,time]);
    await c.query('UPDATE source_previews SET import_id=$1,request_digest=$2 WHERE id=$3',[importId,requestDigest,id]);
    await audit(c,email,'GITHUB_SOURCE_IMPORTED',targetChange,`Imported ${source.repository}#${source.pullNumber} at ${source.headSha}; context only, not assurance.`);
    return {...record((await c.query('SELECT * FROM source_imports WHERE id=$1',[importId])).rows[0]),replayed:false};
   });
  },
  async list(changeId){identifier(changeId);return db.transaction(async c=>{
   if(!(await c.query('SELECT id FROM changes WHERE id=$1',[changeId])).rows[0])fail('CHANGE_NOT_FOUND','Change not found.',404);
   return (await c.query('SELECT * FROM source_imports WHERE change_id=$1 ORDER BY imported_at,id',[changeId])).rows.map(r=>{if(digest(JSON.parse(r.snapshot))!==r.snapshot_digest)fail('SOURCE_INTEGRITY_FAILED','An import record failed integrity validation.');return record(r);});
  },true);}
 };
}
