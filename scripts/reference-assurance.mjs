/** Complete local demonstration using an actual HTTP application and a SEPARATE worker process.
 * Test-only, loopback, disposable data. Does not call customer systems or claim an authentic AI defect.
 */
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID,randomBytes} from 'node:crypto';
import {openWorkflowRepository} from '../backend/server/workflow-repository.mjs';
import {openAssuranceRepository} from '../backend/server/assurance/repository.mjs';
import {hashPassword} from '../backend/server/auth.mjs';
import {createApplicationServer} from '../dist/api/server.js';
const out=resolve(process.env.QIVVERA_TEST_OUTPUT??'review-test-results');mkdirSync(out,{recursive:true});
const results=[];
for(const mode of ['correct','self-approval-defect','reject-all']){
 const dir=mkdtempSync(join(tmpdir(),'qivvera-assurance-')),db={path:join(dir,'workspace.sqlite')};
 const maker=randomBytes(24).toString('hex'),checker=randomBytes(24).toString('hex');
 const targetProcess=spawn(process.execPath,['fixtures/approval-target/server.mjs'],{env:{...process.env,FIXTURE_MODE:mode,FIXTURE_MAKER_TOKEN:maker,FIXTURE_CHECKER_TOKEN:checker,PORT:'0'},stdio:['ignore','pipe','pipe']});
 let workflow,assurance,server;
 try{
  const metadata=await new Promise((resolveMetadata,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error('TARGET_START_TIMEOUT')),5000);
    targetProcess.stdout.on('data',chunk=>{
      output+=chunk;
      if(output.includes('\n')){
        clearTimeout(timer);
        try{resolveMetadata(JSON.parse(output.split('\n')[0]));}
        catch{reject(new Error('TARGET_START_INVALID'));}
      }
    });
    targetProcess.once('exit',()=>{clearTimeout(timer);reject(new Error('TARGET_STOPPED'));});
  });
  workflow=await openWorkflowRepository({...db,migrate:true});
  const author={email:'author@example.test',roles:['AUTHOR']},policy={email:'policy@example.test',roles:['POLICY_AUTHORITY']};
  const app=await workflow.createApplication({name:`Reference Approval — ${mode}`},author);
  const change=await workflow.createChange({applicationId:app.id,title:'Approval separation evaluation',intent:'Retain transaction-level separation of duties.',sourceRevision:'a'.repeat(40)},author);
  const target={id:'reference-target',name:'Isolated reference approval service',applicationId:app.id,sourceRevision:'a'.repeat(40),artifactDigest:metadata.artifactDigest,environmentDigest:'sha256:'+'e'.repeat(64),instanceId:'reference-instance',origin:`http://127.0.0.1:${metadata.port}`,requesterId:'maker',approverId:'checker',requesterTokenEnv:'REF_MAKER',approverTokenEnv:'REF_CHECKER',testOnly:true,bindingStatement:'Synthetic reference fixture. Source ref is a fixture label; file content digest computed by the running reference process. Not a production attestation.'};
  assurance=await openAssuranceRepository({...db,migrate:true,targets:[target],allowLocalTargets:true});
  const password=randomBytes(24).toString('hex');const accounts=[author,policy].map(a=>({...a,passwordHash:hashPassword(password)}));
  server=createApplicationServer({repository:workflow,assurance,accounts,publicOrigin:'http://127.0.0.1:3199'});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  let session;
  async function api(path,method='GET',data){const r=await fetch(base+path,{method,headers:{...(method!=='GET'?{Origin:'http://127.0.0.1:3199','Content-Type':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},...(data?{body:JSON.stringify(data)}:{})});const b=await r.json();if(!r.ok)throw new Error(b.error);if(path==='/api/session')session={...b,cookie:r.headers.get('set-cookie').split(';')[0]};return b;}
  await api('/api/session','POST',{email:author.email,password});
  let o=await api(`/api/changes/${change.id}/obligations`,'POST',{revisionId:change.revision.id,statement:'The requester cannot approve their own request; a different eligible approver can.',sourceReference:'Approved synthetic policy',sourceVersion:'1',criticality:'CRITICAL'});
  o=await api(`/api/obligations/${o.id}/review`,'POST',{revisionId:o.revisionId,version:o.version,action:'SUBMIT'});
  await api('/api/session','POST',{email:policy.email,password});
  o=await api(`/api/obligations/${o.id}/review`,'POST',{revisionId:o.revisionId,version:o.version,action:'ACCEPT',rationale:'The policy applies to this bounded synthetic approval workflow.'});
  const ctx=await api(`/api/changes/${change.id}/assurance-context?revision=${change.revision.id}`);
  const plan=await api(`/api/changes/${change.id}/assurance-plan`,'POST',{revisionId:change.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:0,obligationId:o.id,targetId:target.id,rationale:'The configured oracle checks self-approval and a different-person positive control.',acknowledgeLimits:true});
  const run=await api(`/api/changes/${change.id}/assessments`,'POST',{revisionId:change.revision.id,planId:plan.id,requestKey:randomUUID()});
  if(run.status!=='QUEUED'||run.disposition!==null)throw new Error('QUEUE_STATE_INVALID');
  const worker=spawn(process.execPath,['backend/scripts/assurance-worker.mjs','--once'],{env:{...process.env,NODE_ENV:'test',QIVVERA_ASSURANCE_ENABLED:'true',QIVVERA_TARGETS_JSON:JSON.stringify([target]),QIVVERA_ALLOW_LOOPBACK_TARGETS:'true',QIVVERA_LOCAL_SQLITE:'true',DATABASE_PATH:db.path,QIVVERA_WORKER_ID:'reference-worker-process',REF_MAKER:maker,REF_CHECKER:checker},stdio:['ignore','pipe','pipe']});
  let workerOutput='';worker.stdout.on('data',b=>workerOutput+=b);const [code]=await once(worker,'exit');if(code!==0)throw new Error('WORKER_FAILED');
  const completed=await api(`/api/assessments/${run.id}`);const expected={correct:'READY','self-approval-defect':'NOT_READY','reject-all':'INDETERMINATE'}[mode];if(completed.disposition!==expected)throw new Error('UNEXPECTED_DISPOSITION');
  writeFileSync(join(out,`case-${mode}.json`),JSON.stringify(completed,null,2));
  const c=await api(`/api/changes/${change.id}`),w=await api('/api/workspace'),context=await api(`/api/changes/${change.id}/assurance-context?revision=${change.revision.id}`);
  writeFileSync(join(out,`ui-${mode}.json`),JSON.stringify({workspace:w,change:c,context,runs:[completed],session:{email:policy.email,roles:policy.roles,csrfToken:'component-only',reviewMode:'independent'}},null,2));
  results.push({mode,expected,actual:completed.disposition,observations:completed.evidence.report.observations.length,evidenceDigest:completed.evidenceDigest,transport:'real local HTTP',targetProcess:'separate Node process',workerProcess:'separate Node process',worker:JSON.parse(workerOutput.trim()).status});
 }finally{if(server)await new Promise(r=>server.close(r));await assurance?.close();await workflow?.close();if(targetProcess.exitCode===null){const ended=once(targetProcess,'exit');targetProcess.kill('SIGTERM');await ended.catch(()=>{});}rmSync(dir,{recursive:true,force:true});}
}
writeFileSync(join(out,'reference-execution-report.json'),JSON.stringify({date:new Date().toISOString(),results,limitations:['Synthetic fixtures with deliberately seeded fault modes; not authentic AI-generated failures.','SQLite review store; no PostgreSQL or hosted deployment verification.','HTTP tests are real, but not native browser/HTTPS end-to-end tests.']},null,2));
console.log(JSON.stringify(results,null,2));
