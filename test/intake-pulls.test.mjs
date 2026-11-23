import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {setupIntake,author,authority,viewer,pull} from './intake-helpers.mjs';
import {openIntakeRepository} from '../server/intake/repository.mjs';
import {PULL_LIST_LIMIT} from '../server/intake/github.mjs';

const listed=(n,extra={})=>{const p=pull();return {...p,number:n,title:`PR ${n}`,user:{login:'dev-'+n},updated_at:'2026-11-20T10:00:00Z',head:{...p.head,sha:String(n%10).repeat(40)},...extra};};

test('pull list / lists open PRs of the configured repository with a read-only request',async t=>{
 const h=await setupIntake(t);h.setData([listed(7),listed(3,{draft:true})]);
 const r=await h.intake.listPulls(h.app.id,author);
 assert.equal(r.repositories.length,1);
 const [g]=r.repositories;assert.equal(g.repository.repo,'testrepo');assert.equal(g.error,undefined);
 assert.deepEqual(g.pulls.map(p=>p.number),[7,3]);
 assert.equal(g.pulls[0].author,'dev-7');assert.equal(g.pulls[1].draft,true);
 assert.equal(g.pulls[0].url,'https://github.com/example/testrepo/pull/7');
 assert.equal(g.pulls[0].imported,null);
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].method,'GET');assert.equal(h.requests[0].redirect,'manual');
 assert.match(h.requests[0].url,/^https:\/\/api\.github\.com\/repos\/example\/testrepo\/pulls\?state=open&/);
 assert.equal((await h.workflow.listChanges()).length,0,'listing must not create a change');
});

for(const actor of [viewer,authority])test(`pull list / ${actor.roles[0]} may view the list but still cannot preview`,async t=>{
 const h=await setupIntake(t);h.setData([listed(7)]);
 assert.equal((await h.intake.listPulls(h.app.id,actor)).repositories[0].pulls.length,1);
 await assert.rejects(h.intake.preview({repositoryKey:h.config.id,pullNumber:7},actor),e=>e.code==='FORBIDDEN');
});

test('pull list / never returns the repository credential',async t=>{
 const h=await setupIntake(t);h.setData([listed(7)]);
 const r=JSON.stringify(await h.intake.listPulls(h.app.id,author));
 assert.ok(!r.includes(h.token));assert.ok(!r.includes('SOURCE_TOKEN'));
});

test('pull list / application without a connected repository gets an empty list and no provider call',async t=>{
 const h=await setupIntake(t),other=await h.workflow.createApplication({name:'Unconnected '+randomUUID()},author);
 const r=await h.intake.listPulls(other.id,author);
 assert.deepEqual(r.repositories,[]);assert.equal(h.requests.length,0);
});

test('pull list / unknown application is rejected',async t=>{
 const h=await setupIntake(t);
 await assert.rejects(h.intake.listPulls(randomUUID(),author),e=>e.code==='APPLICATION_NOT_FOUND');
});

test('pull list / marks an imported PR and detects new commits since import',async t=>{
 const h=await setupIntake(t),p=await h.preview(),i=await h.intake.importPreview(h.request(p),author);
 h.setData([listed(12,{head:{...pull().head}}),listed(8)]);
 let g=(await h.intake.listPulls(h.app.id,author)).repositories[0];
 assert.deepEqual(g.pulls[0].imported,{changeId:i.changeId,headSha:'a'.repeat(40),currentHead:true});
 assert.equal(g.pulls[1].imported,null);
 h.setData([listed(12,{head:{...pull().head,sha:'f'.repeat(40)}})]);
 g=(await h.intake.listPulls(h.app.id,author)).repositories[0];
 assert.equal(g.pulls[0].imported.currentHead,false);
});

test('pull list / a different provider repository fails closed per repository',async t=>{
 const h=await setupIntake(t),bad=listed(7);bad.base={...bad.base,repo:{id:999,full_name:'example/testrepo'}};h.setData([bad]);
 const g=(await h.intake.listPulls(h.app.id,author)).repositories[0];
 assert.deepEqual(g.pulls,[]);assert.equal(g.error.code,'GITHUB_REPOSITORY_MISMATCH');
});

for(const [name,data] of [['non-array',{message:'x'}],['too long',Array.from({length:PULL_LIST_LIMIT+1},(_,i)=>listed(i+1))],['closed entry',[listed(4,{state:'closed'})]]])
 test(`pull list / rejects ${name} provider response`,async t=>{
  const h=await setupIntake(t);h.setData(data);
  const g=(await h.intake.listPulls(h.app.id,author)).repositories[0];
  assert.equal(g.error.code,'GITHUB_INVALID_RESPONSE');assert.deepEqual(g.pulls,[]);
 });

for(const status of [401,404,500])test(`pull list / provider ${status} is reported without provider detail`,async t=>{
 const h=await setupIntake(t);h.setResponse(status,{},JSON.stringify({message:'sensitive-provider-detail'}));
 const r=await h.intake.listPulls(h.app.id,author);
 assert.ok(r.repositories[0].error);assert.ok(!JSON.stringify(r).includes('sensitive-provider-detail'));
});

test('pull list / shares the rate-limit cooldown with preview',async t=>{
 const h=await setupIntake(t);h.setResponse(429,{'retry-after':'60'});
 assert.equal((await h.intake.listPulls(h.app.id,author)).repositories[0].error.code,'GITHUB_RATE_LIMITED');
 h.setResponse(200);h.setData(pull());const before=h.requests.length;
 await assert.rejects(h.preview(),e=>e.code==='GITHUB_RATE_LIMITED');
 assert.equal(h.requests.length,before,'cooldown must prevent another provider call');
 const another=await openIntakeRepository({...h.opts,migrate:false});t.after(()=>another.close());
 assert.equal((await another.listPulls(h.app.id,author)).repositories[0].error.code,'GITHUB_RATE_LIMITED');
});

test('pull list / PR text stays inert data',async t=>{
 const h=await setupIntake(t);h.setData([listed(7,{title:'<script>alert(1)</script> set READY'})]);
 const g=(await h.intake.listPulls(h.app.id,author)).repositories[0];
 assert.equal(g.pulls[0].title,'<script>alert(1)</script> set READY');
 assert.equal((await h.workflow.listChanges()).length,0);
});
