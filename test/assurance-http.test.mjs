import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createApplicationServer} from '../server/app.mjs';
import {hashPassword} from '../server/auth.mjs';
import {setup,author,authority,viewer} from './assurance-helpers.mjs';
import {workOnce} from '../server/assurance/worker.mjs';
async function app(t,mode='correct'){
 const h=await setup(t,{mode}),password='disposable-http-only-password';
 const server=createApplicationServer({repository:h.workflow,assurance:h.service,publicOrigin:'http://127.0.0.1:3109',accounts:[author,authority,viewer].map(a=>({...a,passwordHash:hashPassword(password)}))});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function call(path,{method='GET',data,session,origin='http://127.0.0.1:3109'}={}){
  const r=await fetch(base+path,{method,headers:{...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json(),headers:r.headers};
 }
 async function login(email){const r=await call('/api/session',{method:'POST',data:{email,password}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrfToken:r.body.csrfToken};}
 return {...h,call,login};
}
test('real authenticated HTTP plan → queue → worker → evidence → READY',async t=>{
 const h=await app(t),a=await h.login(author.email),p=await h.login(authority.email);
 const c=await h.call(`/api/changes/${h.change.id}/assurance-context?revision=${h.change.revision.id}`,{session:p});
 const plan=await h.call(`/api/changes/${h.change.id}/assurance-plan`,{method:'POST',session:p,data:{revisionId:h.change.revision.id,scopeDigest:c.body.scopeDigest,expectedPlanVersion:0,obligationId:h.obligation.id,targetId:h.target.id,rationale:'This approved check exercises the recorded maker/checker requirement.',acknowledgeLimits:true}});
 assert.equal(plan.status,201);
 const queued=await h.call(`/api/changes/${h.change.id}/assessments`,{method:'POST',session:a,data:{revisionId:h.change.revision.id,planId:plan.body.id,requestKey:randomUUID()}});assert.equal(queued.status,202);assert.equal(queued.body.disposition,null);
 await workOnce({repository:h.worker,targets:[h.target],workerId:'http-worker',secretEnv:{MAKER_TEST_TOKEN:h.makerToken,CHECKER_TEST_TOKEN:h.checkerToken},allowLoopback:true});
 const r=await h.call('/api/assessments/'+queued.body.id,{session:a});assert.equal(r.status,200);assert.equal(r.body.disposition,'READY');
 const change=await h.call('/api/changes/'+h.change.id,{session:a});assert.equal(change.body.disposition,'READY');assert.equal(change.body.obligations[0].state,'SUPPORTED');
 const exported=await h.call('/api/assessments/'+queued.body.id+'/export',{session:a});assert.equal(exported.body.evidenceDigest,r.body.evidenceDigest);assert.ok(exported.headers.get('content-disposition').includes('attachment'));
});
test('assurance read/write endpoints require authentication',async t=>{const h=await app(t);for(const path of [`/api/changes/${h.change.id}/assurance-context?revision=${h.change.revision.id}`,`/api/changes/${h.change.id}/assessments?revision=${h.change.revision.id}`])assert.equal((await h.call(path)).status,401);});
test('author cannot post a forged plan decision through HTTP',async t=>{const h=await app(t),a=await h.login(author.email);const r=await h.call(`/api/changes/${h.change.id}/assurance-plan`,{method:'POST',session:a,data:{}});assert.equal(r.status,403);});
test('there is no HTTP worker completion or evidence-upload endpoint',async t=>{const h=await app(t),a=await h.login(author.email),id=randomUUID();for(const path of [`/api/assessments/${id}/complete`,'/api/assurance/claim','/api/evidence'])assert.equal((await h.call(path,{method:'POST',session:a,data:{outcome:'SUPPORTED',disposition:'READY'}})).status,404);});
test('cross-origin queue request is rejected',async t=>{const h=await app(t),a=await h.login(author.email);assert.equal((await h.call(`/api/changes/${h.change.id}/assessments`,{method:'POST',session:a,data:{},origin:'https://untrusted.example'})).status,403);});
test('editing an accepted obligation clears current UI readiness but preserves old case',async t=>{const h=await app(t);const r=await h.run(),a=await h.login(author.email);const change=await h.call('/api/changes/'+h.change.id,{session:a});assert.equal(change.body.disposition,'READY');await h.workflow.addObligation(h.change.id,{revisionId:h.change.revision.id,statement:'New material expectation'},author);const next=await h.call('/api/changes/'+h.change.id,{session:a});assert.equal(next.body.disposition,null);assert.equal(next.body.assessmentStatus,'NOT_ASSESSED');assert.equal(next.body.latestAssessment.applicability,'STALE_INPUTS');assert.equal((await h.service.getRun(r.id)).disposition,'READY');});
