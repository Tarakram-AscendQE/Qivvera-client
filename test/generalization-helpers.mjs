import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {randomUUID,randomBytes} from 'node:crypto';
import {openWorkflowRepository} from '../backend/server/workflow-repository.mjs';
import {openAssuranceRepository} from '../backend/server/assurance/repository.mjs';
import {workOnce} from '../backend/server/assurance/worker.mjs';
import {CHECKS} from '../backend/server/assurance/generalization.mjs';
import { testDatabase } from './postgres-test-database.mjs';
export const author={email:'author@example.test',roles:['AUTHOR']},authority={email:'policy@example.test',roles:['POLICY_AUTHORITY']},viewer={email:'viewer@example.test',roles:['VIEWER']};
export const rationale='This fixed control directly exercises the accepted approval expectation within the declared limits.';
export async function setupMulti(t,{adapter='approval-v1',mode='correct',postgresURL,source='a'.repeat(40)}={}){
 const dir=mkdtempSync(join(tmpdir(),'qivvera-multi-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const db=postgresURL?{driver:'postgres',connectionString:postgresURL,sslMode:'disable'}: await testDatabase();
 const workflow=await openWorkflowRepository({...db,migrate:true});t.after(()=>workflow.close());
 const app=await workflow.createApplication({name:'Multi-control '+randomUUID()},author);
 const change=await workflow.createChange({applicationId:app.id,title:'Synthetic approval change',sourceRevision:source,intent:'Maintain separation and finality.'},author);
 const obligations=[];
 for(const check of CHECKS){let o=await workflow.addObligation(change.id,{revisionId:change.revision.id,statement:check.rule,sourceReference:'Approval policy',sourceVersion:'1',criticality:'HIGH'},author);o=await workflow.transitionObligation(o.id,{revisionId:o.revisionId,version:o.version,action:'SUBMIT'},author);o=await workflow.transitionObligation(o.id,{revisionId:o.revisionId,version:o.version,action:'ACCEPT',rationale},authority);obligations.push(o);}
 const maker=randomBytes(24).toString('hex'),checker=randomBytes(24).toString('hex');
 const env={...process.env,FIXTURE_MAKER_TOKEN:maker,FIXTURE_CHECKER_TOKEN:checker,FIXTURE_SOURCE_REVISION:source,FIXTURE_MODE:mode};
 const child=adapter==='expense-v1'?spawn('python3',['fixtures/expense-target/server.py','--database',join(dir,'expense.sqlite'),'--mode',mode],{env,stdio:['ignore','pipe','pipe']}):spawn(process.execPath,['fixtures/approval-controls/server.mjs'],{env,stdio:['ignore','pipe','pipe']});
 t.after(()=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode){resolve();return;}child.once('exit',resolve);child.kill('SIGTERM');}));
 const info=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Fixture startup timeout'));},6000);const lines=createInterface({input:child.stdout});lines.once('line',line=>{clearTimeout(timer);lines.close();try{resolve(JSON.parse(line));}catch(e){reject(e);}});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Fixture exited '+code));});});
 const target={id:'multi-target',name:'Synthetic '+adapter,applicationId:app.id,sourceRevision:source,artifactDigest:info.artifactDigest,environmentDigest:'sha256:'+'e'.repeat(64),instanceId:adapter==='expense-v1'?'expense-instance':'reference-instance',origin:`http://127.0.0.1:${info.port}`,requesterId:'maker',approverId:'checker',requesterTokenEnv:'MULTI_MAKER_TOKEN',approverTokenEnv:'MULTI_CHECKER_TOKEN',bindingStatement:'Operator-controlled synthetic fixture; source reference is a test label, not build attestation.',testOnly:true,adapterId:adapter};
 const options={...db,migrate:true,targets:[target],allowLocalTargets:true,generalizationEnabled:true};
 const service=await openAssuranceRepository(options),worker=await openAssuranceRepository({...options,worker:true});t.after(()=>service.close());t.after(()=>worker.close());
 const mappings=obligations.map((o,i)=>({obligationId:o.id,checkId:CHECKS[i].id,rationale}));
 const input=async(selected=mappings)=>{const ctx=await service.getContext(change.id,change.revision.id);return {revisionId:change.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:ctx.plan?.version??0,targetId:target.id,mappings:selected,rationale,acknowledgeLimits:true};};
 const plan=async selected=>service.approvePlan(change.id,await input(selected),authority);
 const queue=async selected=>{const pl=await plan(selected);return service.requestRun(change.id,{revisionId:change.revision.id,planId:pl.id,requestKey:randomUUID()},author);};
 const secretEnv={MULTI_MAKER_TOKEN:maker,MULTI_CHECKER_TOKEN:checker};
 const run=async selected=>{const r=await queue(selected);await workOnce({repository:worker,targets:[target],workerId:'multi-test-worker',secretEnv,allowLoopback:true,timeoutMs:500});return service.getRun(r.id);};
 return {dir,db,app,change,workflow,obligations,target,options,service,worker,mappings,input,plan,queue,run,secretEnv};
}
export async function separateWorker(h){
 const env={...process.env,...h.secretEnv,QIVVERA_ASSURANCE_ENABLED:'true',QIVVERA_GENERALIZATION_ENABLED:'true',QIVVERA_ALLOW_LOOPBACK_TARGETS:'true',QIVVERA_TARGETS_JSON:JSON.stringify([h.target]),QIVVERA_WORKER_ID:'separate-reference-worker',ASSURANCE_DATABASE_URL:h.db.connectionString,DATABASE_SSL_MODE:'disable'};
 delete env.DATABASE_URL;delete env.VERCEL;delete env.NODE_ENV;
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['backend/scripts/assurance-worker.mjs','--once'],{env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);const timer=setTimeout(()=>{child.kill();reject(new Error('Worker deadline exceeded'));},15000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(output)):reject(new Error('Reference worker failed: '+code));});});
}
