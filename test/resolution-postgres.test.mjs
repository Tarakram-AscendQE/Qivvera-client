import { requireDisposablePostgresURL } from './postgres-safety.mjs';
/** Mandatory release tests. Destructive reset is restricted to disposable loopback databases. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolutionSetup,author,authority,accounts,note} from './resolution-helpers.mjs';
import {openResolutionRepository} from '../server/resolution/repository.mjs';
const url=process.env.TEST_DATABASE_URL;
if(!url){test('RESOLUTION POSTGRES NOT EXECUTED: disposable database required',{skip:process.env.REQUIRE_POSTGRES!=='true'},()=>{throw new Error('Mandatory resolution PostgreSQL tests did not execute.');});}
else{
 requireDisposablePostgresURL(url);
 const {default:pg}=await import('pg');
 async function reset(){const pool=new pg.Pool({connectionString:url});try{await pool.query('DROP TABLE IF EXISTS drafting_suggestions,drafting_runs,source_previews,source_imports,source_backoff,resolution_challenges,resolution_history,resolution_items,assurance_evidence,assurance_runs,assurance_plans,obligation_history,obligation_workflow,change_revisions,workspace_sessions,auth_buckets,qivvera_migrations,activity,obligations,changes,applications CASCADE');}finally{await pool.end();}}
 test('POSTGRES resolution / full correction preserves original evidence and resolution history',async t=>{
  await reset();const h=await resolutionSetup(t,{postgresURL:url});let {item}=await h.prepare();item=await h.act(item,'VERIFY',{},authority);assert.equal(item.status,'RESOLVED');assert.equal(item.effectiveStatus,'RESOLVED');assert.equal((await h.service.getRun(h.source.id)).evidenceDigest,h.source.evidenceDigest);
 });
 test('POSTGRES resolution / migration preserves schema-3 evidence and is repeatable',async t=>{
  await reset();const h=await resolutionSetup(t,{postgresURL:url}),i=await h.create();const again=await openResolutionRepository({...h.settings,migrate:true});try{assert.equal((await again.get(i.id)).source.evidenceDigest,h.source.evidenceDigest);assert.equal((await again.get(i.id)).history.length,1);}finally{await again.close();}
 });
 test('POSTGRES resolution / two repository connections cannot overwrite a version',async t=>{
  await reset();const h=await resolutionSetup(t,{postgresURL:url}),i=await h.create(),other=await openResolutionRepository({...h.settings,migrate:false});
  try{const result=await Promise.allSettled([h.act(i,'START'),other.act(i.id,{action:'NOTE',version:i.version,rationale:note},author)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');}finally{await other.close();}
 });
 test('POSTGRES resolution / duplicate findings serialize to one item',async t=>{
  await reset();const h=await resolutionSetup(t,{postgresURL:url}),other=await openResolutionRepository({...h.settings,migrate:false});
  try{const input={obligationId:h.obligation.id,assignedTo:author.email,actionPlan:note,externalReference:'QE-101'};const out=await Promise.all([h.resolution.create(h.source.id,input,author),other.create(h.source.id,input,author)]);assert.equal(out[0].id,out[1].id);assert.equal((await h.resolution.list()).total,1);}finally{await other.close();}
 });
 test('POSTGRES resolution / restricted web role can resolve but cannot rewrite evidence',async t=>{
  await reset();const h=await resolutionSetup(t,{postgresURL:url}),owner=new pg.Pool({connectionString:url}),role='qivvera_resolution_'+randomUUID().replaceAll('-',''),password=randomUUID()+randomUUID();let repo;
  try{
   await owner.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
   await owner.query(`GRANT SELECT ON applications,changes,change_revisions,obligations,obligation_workflow,obligation_history,qivvera_migrations,assurance_plans,assurance_runs,assurance_evidence,resolution_items,resolution_history,resolution_challenges TO ${role}`);
   await owner.query(`GRANT UPDATE(id) ON changes TO ${role}`);
   await owner.query(`GRANT INSERT,UPDATE ON resolution_items,resolution_challenges TO ${role}`);await owner.query(`GRANT INSERT ON resolution_history,activity TO ${role}`);
   const limited=new URL(url);limited.username=role;limited.password=password;const check=new pg.Pool({connectionString:limited.toString()});
   try{for(const table of ['assurance_evidence','resolution_history'])await assert.rejects(check.query(`DELETE FROM ${table}`),e=>e.code==='42501');}finally{await check.end();}
   repo=await openResolutionRepository({...h.settings,connectionString:limited.toString(),migrate:false});const i=await repo.create(h.source.id,{obligationId:h.obligation.id,assignedTo:author.email,actionPlan:note},author);assert.equal(i.status,'OPEN');const moved=await repo.act(i.id,{action:'START',version:i.version,rationale:note},author);assert.equal(moved.status,'IN_PROGRESS');
  }finally{await repo?.close();await owner.query(`DROP OWNED BY ${role}`);await owner.query(`DROP ROLE ${role}`);await owner.end();}
 });
 test('POSTGRES resolution / shared challenge closure and current-evidence validation',async t=>{
  await reset();const h=await resolutionSetup(t,{postgresURL:url});let {item}=await h.prepare();item=await h.act(item,'CHALLENGE');await assert.rejects(h.act(item,'VERIFY',{},authority),e=>e.code==='RESOLUTION_NOT_VERIFIABLE');item=await h.act(item,'RESPOND_CHALLENGE',{challengeId:item.challenges[0].id,response:'FINDING_UPHELD'},authority);item=await h.act(item,'VERIFY',{},authority);assert.equal(item.status,'RESOLVED');
 });
}
