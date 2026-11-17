import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createApplicationServer} from '../server/app.mjs';
import {hashPassword} from '../server/auth.mjs';
import {resolutionSetup,author,authority,viewer,accounts,note} from './resolution-helpers.mjs';
async function httpSetup(t){
 const h=await resolutionSetup(t);const corrected=await h.correct();const password=randomUUID()+randomUUID();
 const server=createApplicationServer({repository:h.workflow,assurance:corrected.service,resolution:h.resolution,publicOrigin:'http://127.0.0.1:3177',accounts:accounts.map(a=>({...a,passwordHash:hashPassword(password)}))});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 async function call(path,{method='GET',data,session,origin='http://127.0.0.1:3177',csrf}={}){
  const response=await fetch(base+path,{method,headers:{...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':csrf??session.csrfToken}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});return {status:response.status,body:await response.json(),headers:response.headers};
 }
 async function login(email){const r=await call('/api/session',{method:'POST',data:{email,password}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrfToken:r.body.csrfToken};}
 return {...h,call,login};
}
test('resolution HTTP / authenticated finding-to-verified-resolution journey through actual sockets',async t=>{
 const h=await httpSetup(t),a=await h.login(author.email),p=await h.login(authority.email);
 let r=await h.call(`/api/assessments/${h.source.id}/resolutions`,{method:'POST',session:a,data:{obligationId:h.obligation.id,assignedTo:author.email,actionPlan:note}});assert.equal(r.status,201);let item=r.body;
 const change=await h.workflow.getChange(h.change.id);
 const act=async(action,extra={},session=a)=>{const r=await h.call(`/api/resolutions/${item.id}/actions`,{method:'POST',session,data:{action,version:item.version,rationale:note,...extra}});assert.equal(r.status,200,JSON.stringify(r.body));item=r.body;return item;};
 await act('START');await act('PROPOSE_CORRECTION',{revisionId:change.revision.id,obligationId:change.obligations[0].id});const outcome=await h.assess();await act('LINK_ASSESSMENT',{runId:outcome.id});await act('VERIFY',{},p);
 assert.equal(item.effectiveStatus,'RESOLVED');const exported=await h.call(`/api/resolutions/${item.id}/export`,{session:a});assert.equal(exported.status,200);assert.ok(exported.headers.get('content-disposition').includes('attachment'));assert.equal(exported.body.originalAssessment.disposition,'NOT_READY');assert.equal(exported.body.reassessment.disposition,'READY');
});
test('resolution HTTP / all read and mutation routes require sign-in',async t=>{
 const h=await httpSetup(t),id=randomUUID();for(const path of ['/api/resolutions','/api/resolution-assignees',`/api/resolutions/${id}`,`/api/resolutions/${id}/export`,`/api/changes/${h.change.id}/resolutions`])assert.equal((await h.call(path)).status,401);
 assert.equal((await h.call(`/api/assessments/${h.source.id}/resolutions`,{method:'POST',data:{}})).status,401);
});
test('resolution HTTP / viewer can read but cannot change accountability',async t=>{
 const h=await httpSetup(t),i=await h.create(),v=await h.login(viewer.email);assert.equal((await h.call(`/api/resolutions/${i.id}`,{session:v})).status,200);
 assert.equal((await h.call(`/api/resolutions/${i.id}/actions`,{method:'POST',session:v,data:{action:'START',version:i.version,rationale:note}})).status,403);
});
test('resolution HTTP / origin and CSRF are enforced on resolution actions',async t=>{
 const h=await httpSetup(t),i=await h.create(),a=await h.login(author.email),data={action:'START',version:i.version,rationale:note};
 for(const more of [{origin:'https://untrusted.example'},{csrf:'wrong'}])assert.equal((await h.call(`/api/resolutions/${i.id}/actions`,{method:'POST',session:a,data,...more})).status,403);
 assert.equal((await h.resolution.get(i.id)).version,i.version);
});
test('resolution HTTP / unknown fields and forged authority cannot be submitted',async t=>{
 const h=await httpSetup(t),i=await h.create(),a=await h.login(author.email);
 const r=await h.call(`/api/resolutions/${i.id}/actions`,{method:'POST',session:a,data:{action:'VERIFY',version:i.version,rationale:note,roles:['POLICY_AUTHORITY']}});assert.equal(r.status,400);assert.equal(r.body.error,'UNKNOWN_FIELD');
});
test('resolution HTTP / no delete, waiver, verdict-edit, or direct evidence mutation endpoints',async t=>{
 const h=await httpSetup(t),i=await h.create(),a=await h.login(author.email);for(const method of ['DELETE','PATCH'])assert.equal((await h.call(`/api/resolutions/${i.id}`,{method,session:a,data:{status:'RESOLVED'}})).status,404);
 for(const endpoint of ['waive','resolve','set-ready'])assert.equal((await h.call(`/api/resolutions/${i.id}/${endpoint}`,{method:'POST',session:a,data:{}})).status,404);
});
test('resolution HTTP / concurrent stale requests return explicit conflict',async t=>{
 const h=await httpSetup(t),i=await h.create(),a=await h.login(author.email),args={method:'POST',session:a,data:{action:'START',version:i.version,rationale:note}};
 assert.equal((await h.call(`/api/resolutions/${i.id}/actions`,args)).status,200);const stale=await h.call(`/api/resolutions/${i.id}/actions`,args);assert.equal(stale.status,409);assert.equal(stale.body.error,'VERSION_CONFLICT');
});
test('resolution HTTP / capability and directory expose no credentials',async t=>{
 const h=await httpSetup(t),a=await h.login(author.email);const w=await h.call('/api/workspace',{session:a});assert.equal(w.body.capabilities.resolutionWorkflow,true);assert.equal(w.body.release,'0.5.0');
 const users=await h.call('/api/resolution-assignees',{session:a});assert.ok(users.body.every(u=>Object.keys(u).sort().join(',')==='email,roles'));
});
