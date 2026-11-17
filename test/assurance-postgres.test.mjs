/** This suite is mandatory for release. No remote/customer database can be selected. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setup,author} from './assurance-helpers.mjs';
import {openAssuranceRepository} from '../server/assurance/repository.mjs';
import {openWorkflowRepository} from '../server/workflow-repository.mjs';
const url=process.env.TEST_DATABASE_URL;
if(!url){test('ASSURANCE POSTGRES NOT EXECUTED: isolated database required',{skip:process.env.REQUIRE_POSTGRES!=='true'},()=>{throw new Error('Mandatory assurance PostgreSQL verification did not execute.');});}
else{
 const u=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!/^\/qivvera_test_[a-z0-9_]+$/.test(u.pathname))throw new Error('Only disposable LOOPBACK qivvera_test_* databases are allowed.');
 const {default:pg}=await import('pg');
 async function reset(){const p=new pg.Pool({connectionString:url});try{await p.query('DROP TABLE IF EXISTS resolution_challenges,resolution_history,resolution_items,assurance_evidence,assurance_runs,assurance_plans,obligation_history,obligation_workflow,change_revisions,workspace_sessions,auth_buckets,qivvera_migrations,activity,obligations,changes,applications CASCADE');}finally{await p.end();}}
 for(const [mode,verdict]of [['correct','READY'],['self-approval-defect','NOT_READY'],['reject-all','INDETERMINATE']])test(`POSTGRES assurance / actual target ${mode}`,async t=>{await reset();const h=await setup(t,{mode,postgresURL:url});const r=await h.run();assert.equal(r.disposition,verdict);assert.equal(r.evidenceIntegrity,'DIGEST_MATCH');});
 test('POSTGRES assurance / separate worker connections race for one durable claim',async t=>{await reset();const h=await setup(t,{postgresURL:url});const second=await openAssuranceRepository({...h.options,worker:true,migrate:false});t.after(()=>second.close());await h.queue();const jobs=await Promise.all([h.worker.claim('worker-one'),second.claim('worker-two')]);assert.equal(jobs.filter(Boolean).length,1);});
 test('POSTGRES assurance / workflow schema 2 records survive additive migration 3 and reopen',async t=>{await reset();const h=await setup(t,{postgresURL:url});const first=await h.run();const workflow=await openWorkflowRepository({...h.db,migrate:false}),fresh=await openAssuranceRepository({...h.options,migrate:false});try{assert.equal((await workflow.getChange(h.change.id)).obligations[0].reviewStatus,'ACCEPTED');assert.equal((await fresh.getRun(first.id)).evidenceDigest,first.evidenceDigest);}finally{await fresh.close();await workflow.close();}});
 test('POSTGRES assurance / queue deduplication and changed-scope rejection',async t=>{await reset();const h=await setup(t,{postgresURL:url}),p=await h.plan(),i={revisionId:h.change.revision.id,planId:p.id,requestKey:randomUUID()};const r=await h.service.requestRun(h.change.id,i,author);assert.equal((await h.service.requestRun(h.change.id,i,author)).id,r.id);await h.workflow.addObligation(h.change.id,{revisionId:h.change.revision.id,statement:'New material requirement'},author);assert.equal(await h.worker.claim('worker'),null);assert.equal((await h.service.getRun(r.id)).status,'FAILED');});
 test('POSTGRES assurance / non-owner worker cannot edit policy and can claim and complete',async t=>{
   await reset();const h=await setup(t,{postgresURL:url});
   const owner=new pg.Pool({connectionString:url}),role='qivvera_worker_test_'+randomUUID().replaceAll('-','');
   const password=randomUUID()+randomUUID();let worker;
   try{
     // Disposable loopback database only, ephemeral CI superuser. Never a provider account.
     await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
     await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
     await owner.query(`GRANT SELECT ON applications,changes,change_revisions,obligations,obligation_workflow,obligation_history,qivvera_migrations,assurance_plans,assurance_runs,assurance_evidence TO ${role}`);
     await owner.query(`GRANT UPDATE(status,started_at,finished_at,lease_until,lease_hash,worker_id,failure_code) ON assurance_runs TO ${role}`);
     await owner.query(`GRANT INSERT ON assurance_evidence,activity TO ${role}`);
     const limited=new URL(url);limited.username=role;limited.password=password;
     const check=new pg.Pool({connectionString:limited.toString()});
     try{await assert.rejects(check.query("UPDATE obligations SET statement='changed'"),e=>e.code==='42501');}
     finally{await check.end();}
     worker=await openAssuranceRepository({...h.options,connectionString:limited.toString(),migrate:false,worker:true});
     await h.queue();const job=await worker.claim('limited-worker');assert.ok(job);
     const {executeApprovalSeparation}=await import('../verifiers/approval-separation.mjs');
     const report=await executeApprovalSeparation(h.target,{requesterToken:h.makerToken,approverToken:h.checkerToken,allowLoopback:true,runId:job.id});
     await worker.complete(job,report);assert.equal((await h.service.getRun(job.id)).disposition,'READY');
   }finally{if(worker)await worker.close();await owner.query(`DROP OWNED BY ${role}`);await owner.query(`DROP ROLE ${role}`);await owner.end();}
 });

}
