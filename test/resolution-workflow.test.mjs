import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/workflow-store.mjs';
import {openResolutionRepository} from '../server/resolution/repository.mjs';
import {resolutionSetup,author,authority,viewer,anotherAuthority,dual,accounts,err,note} from './resolution-helpers.mjs';

test('resolution / real defect -> correction -> fresh support -> independent verification preserves original evidence',async t=>{
 const h=await resolutionSetup(t);const {item,reassessment}=await h.prepare();
 assert.equal(h.source.disposition,'NOT_READY');assert.equal(reassessment.disposition,'READY');assert.equal(item.comparison.eligible,true,JSON.stringify(item.comparison.blockers));
 const verified=await h.act(item,'VERIFY',{},authority);assert.equal(verified.status,'RESOLVED');assert.equal(verified.effectiveStatus,'RESOLVED');assert.equal(verified.verification.independentActor,true);
 const original=await h.service.getRun(h.source.id);assert.equal(original.disposition,'NOT_READY');assert.equal(original.evidenceDigest,h.source.evidenceDigest);
 assert.equal(verified.history.at(-1).action,'VERIFY');assert.equal(verified.comparison.source.finding.state,'VIOLATED');assert.equal(verified.comparison.candidate.finding.state,'SUPPORTED');
});
test('resolution / same revision evidence gap can be corrected but a task does not change original disposition',async t=>{
 const h=await resolutionSetup(t,{mode:'reject-all'}),{item,reassessment}=await h.prepare({newRevision:false});
 assert.equal(item.kind,'EVIDENCE_GAP');assert.equal(reassessment.disposition,'READY');
 const v=await h.act(item,'VERIFY',{},authority);assert.equal(v.status,'RESOLVED');assert.equal((await h.service.getRun(h.source.id)).disposition,'INDETERMINATE');
});
test('resolution / supported individual correction can close while another obligation still prevents READY',async t=>{
 const h=await resolutionSetup(t),{item,reassessment}=await h.prepare({extraObligation:true});assert.equal(reassessment.disposition,'INDETERMINATE');assert.equal(item.comparison.eligible,true);
 const v=await h.act(item,'VERIFY',{},authority);assert.equal(v.status,'RESOLVED');assert.equal(v.comparison.candidate.disposition,'INDETERMINATE');
});
test('resolution / no item is manufactured from a supported finding',async t=>{
 const h=await resolutionSetup(t,{mode:'correct'});await assert.rejects(h.create(),err('ACTIONABLE_FINDING_REQUIRED'));
});
test('resolution / viewer cannot open or mutate an item',async t=>{
 const h=await resolutionSetup(t);await assert.rejects(h.create(viewer),err('FORBIDDEN'));const i=await h.create();await assert.rejects(h.act(i,'START',{},viewer),err('FORBIDDEN'));
});
test('resolution / unknown, disabled, or viewer-only assignees are rejected',async t=>{
 const h=await resolutionSetup(t);for(const email of ['unknown@example.test',viewer.email,''])await assert.rejects(h.create(author,{assignedTo:email}));
 const list=await h.resolution.listAssignees();assert.ok(!list.some(p=>p.email===viewer.email));assert.ok(list.every(p=>Object.keys(p).every(k=>['email','roles'].includes(k))));
});
test('resolution / caller cannot inject actor, status, disposition, snapshot, or proof',async t=>{
 const h=await resolutionSetup(t);for(const key of ['actor','status','disposition','source_snapshot','verification'])await assert.rejects(h.create(author,{[key]:'READY'}),err('UNKNOWN_FIELD'));
 const i=await h.create();await assert.rejects(h.act(i,'START',{verifiedBy:authority.email}),err('UNKNOWN_FIELD'));
});
test('resolution / duplicate request returns one item; different request cannot silently overwrite it',async t=>{
 const h=await resolutionSetup(t),first=await h.create(),repeat=await h.create();assert.equal(first.id,repeat.id);assert.equal(repeat.replayed,true);assert.equal((await h.resolution.list()).total,1);
 await assert.rejects(h.create(author,{actionPlan:'A different action cannot overwrite this record.'}),err('RESOLUTION_EXISTS'));
});
test('resolution / parallel duplicate creation records one history entry',async t=>{
 const h=await resolutionSetup(t),items=await Promise.all([h.create(),h.create()]);assert.equal(items[0].id,items[1].id);assert.equal((await h.resolution.get(items[0].id)).history.length,1);
});
test('resolution / every action requires a current positive integer version',async t=>{
 const h=await resolutionSetup(t),i=await h.create();for(const v of [undefined,0,-1,1.2,'1'])await assert.rejects(h.resolution.act(i.id,{action:'START',version:v,rationale:note},author),err('INVALID_VERSION'));
});
test('resolution / stale and competing edits do not lose work',async t=>{
 const h=await resolutionSetup(t),i=await h.create();const replies=await Promise.allSettled([h.act(i,'START'),h.act(i,'NOTE')]);assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(replies.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
 assert.equal((await h.resolution.get(i.id)).history.length,2);
});
test('resolution / START and NOTE do not change any evidence or assurance outcome',async t=>{
 const h=await resolutionSetup(t);let i=await h.create();i=await h.act(i,'START');i=await h.act(i,'NOTE');assert.equal(i.status,'IN_PROGRESS');assert.equal((await h.service.getRun(h.source.id)).evidenceDigest,h.source.evidenceDigest);
});
test('resolution / a confirmed violation cannot be resolved through same-revision reproposal',async t=>{
 const h=await resolutionSetup(t),i=await h.create();await assert.rejects(h.propose(i),err('NEW_CORRECTED_REVISION_REQUIRED'));assert.equal((await h.resolution.get(i.id)).version,1);
});
test('resolution / a passing assessment requested before proposal cannot be linked',async t=>{
 const h=await resolutionSetup(t),i=await h.create();await h.correct();const old=await h.assess();const p=await h.propose(i);await assert.rejects(h.act(p,'LINK_ASSESSMENT',{runId:old.id}),err('FRESH_REASSESSMENT_REQUIRED'));
});
test('resolution / timestamp equality cannot make a prior assessment fresh',async t=>{
 const h=await resolutionSetup(t,{clock:()=>2000000000000}),i=await h.create();await h.correct();const old=await h.assess();const p=await h.propose(i);await assert.rejects(h.act(p,'LINK_ASSESSMENT',{runId:old.id}),err('FRESH_REASSESSMENT_REQUIRED'));
});
test('resolution / rejected-all reassessment cannot verify a correction',async t=>{
 const h=await resolutionSetup(t),{item}=await h.prepare({mode:'reject-all'});assert.equal(item.comparison.eligible,false);await assert.rejects(h.act(item,'VERIFY',{},authority),err('RESOLUTION_NOT_VERIFIABLE'));
});
test('resolution / continued violations cannot verify a correction',async t=>{
 const h=await resolutionSetup(t),{item}=await h.prepare({mode:'self-approval-defect'});assert.equal(item.comparison.candidate.finding.state,'VIOLATED');await assert.rejects(h.act(item,'VERIFY',{},authority),err('RESOLUTION_NOT_VERIFIABLE'));
});
test('resolution / changing the requirement cannot disguise a fixed implementation',async t=>{
 const h=await resolutionSetup(t),{item}=await h.prepare({alterRequirement:true});assert.ok(item.comparison.blockers.some(x=>x.code==='REQUIREMENT_CHANGED'));await assert.rejects(h.act(item,'VERIFY',{},authority),err('RESOLUTION_NOT_VERIFIABLE'));
});
test('resolution / unrelated requirement is not a correction lineage even if wording matches',async t=>{
 const h=await resolutionSetup(t),i=await h.create(),c=await h.correct();const o=await h.workflow.addObligation(h.change.id,{revisionId:c.change.revision.id,statement:h.obligation.statement},author);
 await assert.rejects(h.act(i,'PROPOSE_CORRECTION',{revisionId:c.change.revision.id,obligationId:o.id}),err('RELATED_OBLIGATION_REQUIRED'));
});
test('resolution / cross-change revisions cannot scope a correction',async t=>{
 const h=await resolutionSetup(t),i=await h.create();const c=await h.workflow.createChange({applicationId:h.app.id,title:'Other change',sourceRevision:'c'.repeat(40)},author);
 await assert.rejects(h.act(i,'PROPOSE_CORRECTION',{revisionId:c.revision.id,obligationId:h.obligation.id}),err('REVISION_NOT_FOUND'));
});
test('resolution / author cannot verify resolution',async t=>{
 const h=await resolutionSetup(t),{item}=await h.prepare();await assert.rejects(h.act(item,'VERIFY'),err('FORBIDDEN'));
});
test('resolution / policy role does not permit self-verification of an owned correction',async t=>{
 const h=await resolutionSetup(t),{item}=await h.prepare();const changed=await h.act(item,'UPDATE',{assignedTo:authority.email,actionPlan:note,externalReference:'QE-101'});
 await assert.rejects(h.act(changed,'VERIFY',{},authority),err('INDEPENDENT_RESOLUTION_REVIEW_REQUIRED'));
 const v=await h.act(changed,'VERIFY',{},anotherAuthority);assert.equal(v.verification.independentActor,true);
});
test('resolution / creator cannot launder self-verification by reassigning ownership',async t=>{
 const h=await resolutionSetup(t);let i=await h.create(dual,{assignedTo:dual.email});await h.correct();i=await h.act(i,'PROPOSE_CORRECTION',{revisionId:(await h.workflow.getChange(h.change.id)).revision.id,obligationId:(await h.workflow.getChange(h.change.id)).obligations[0].id},dual);
 i=await h.act(i,'UPDATE',{assignedTo:author.email,actionPlan:note,externalReference:''},dual);const run=await h.assess();i=await h.act(i,'LINK_ASSESSMENT',{runId:run.id},dual);
 await assert.rejects(h.act(i,'VERIFY',{},dual),err('INDEPENDENT_RESOLUTION_REVIEW_REQUIRED'));
});
test('resolution / opening a challenge does not invalidate or delete evidence',async t=>{
 const h=await resolutionSetup(t);let i=await h.create();i=await h.act(i,'CHALLENGE');assert.equal(i.challenges[0].state,'OPEN');assert.equal((await h.service.getRun(h.source.id)).disposition,'NOT_READY');assert.equal((await h.service.getRun(h.source.id)).evidenceDigest,h.source.evidenceDigest);
});
test('resolution / pending challenge prevents closure even with fresh support',async t=>{
 const h=await resolutionSetup(t);let {item}=await h.prepare();item=await h.act(item,'CHALLENGE');assert.ok(item.comparison.blockers.some(b=>b.code==='CHALLENGE_PENDING'));await assert.rejects(h.act(item,'VERIFY',{},authority),err('RESOLUTION_NOT_VERIFIABLE'));
});
test('resolution / challenge response is independently reviewed and cannot act as waiver',async t=>{
 const h=await resolutionSetup(t);let i=await h.create();i=await h.act(i,'CHALLENGE',{},authority);const ch=i.challenges[0];
 await assert.rejects(h.act(i,'RESPOND_CHALLENGE',{challengeId:ch.id,response:'FINDING_UPHELD'},authority),err('INDEPENDENT_CHALLENGE_REVIEW_REQUIRED'));
 await assert.rejects(h.act(i,'RESPOND_CHALLENGE',{challengeId:ch.id,response:'DISMISS'},anotherAuthority),err('INVALID_RESPONSE'));
 i=await h.act(i,'RESPOND_CHALLENGE',{challengeId:ch.id,response:'REASSESSMENT_REQUIRED'},anotherAuthority);assert.equal(i.status,'OPEN');assert.equal(i.challenges[0].state,'RESPONDED');assert.equal((await h.service.getRun(h.source.id)).disposition,'NOT_READY');
});
test('resolution / duplicate active challenge and stale response are rejected',async t=>{
 const h=await resolutionSetup(t);let i=await h.create();i=await h.act(i,'CHALLENGE');await assert.rejects(h.act(i,'CHALLENGE'),err('CHALLENGE_ALREADY_OPEN'));
 const old=i;i=await h.act(i,'RESPOND_CHALLENGE',{challengeId:i.challenges[0].id,response:'FINDING_UPHELD'},authority);
 await assert.rejects(h.act(old,'RESPOND_CHALLENGE',{challengeId:old.challenges[0].id,response:'FINDING_UPHELD'},authority),err('VERSION_CONFLICT'));
});
test('resolution / closed item is reopened with its verification preserved in history',async t=>{
 const h=await resolutionSetup(t);let {item}=await h.prepare();item=await h.act(item,'VERIFY',{},authority);const proof=item.verification;item=await h.act(item,'REOPEN');assert.equal(item.status,'OPEN');assert.equal(item.linkedRunId,null);assert.equal(item.verification,null);assert.deepEqual(item.history.find(e=>e.action==='VERIFY').snapshot.verification,proof);
});
test('resolution / changed obligations invalidate current resolution without rewriting its verification',async t=>{
 const h=await resolutionSetup(t);let {item}=await h.prepare();item=await h.act(item,'VERIFY',{},authority);const proof=item.verification;const change=await h.workflow.getChange(h.change.id);
 await h.workflow.addObligation(h.change.id,{revisionId:change.revision.id,statement:'A new required control'},author);
 const now=await h.resolution.get(item.id);assert.equal(now.status,'RESOLVED');assert.equal(now.effectiveStatus,'REASSESSMENT_REQUIRED');assert.deepEqual(now.verification,proof);
});
test('resolution / later assessment invalidates old resolution rather than hiding a regression',async t=>{
 const h=await resolutionSetup(t);let {item}=await h.prepare();item=await h.act(item,'VERIFY',{},authority);await h.assess();const next=await h.resolution.get(item.id);assert.equal(next.effectiveStatus,'REASSESSMENT_REQUIRED');assert.ok(next.comparison.blockers.some(x=>x.code==='NEWER_ASSESSMENT_EXISTS'));
});
test('resolution / missing or corrupt source evidence blocks verification',async t=>{
 const h=await resolutionSetup(t),{item}=await h.prepare(),db=await openDatabase(h.db);try{await db.transaction(c=>c.query("UPDATE assurance_evidence SET digest='sha256:bad' WHERE run_id=$1",[h.source.id]));}finally{await db.close();}
 await assert.rejects(h.act(item,'VERIFY',{},authority),err('RESOLUTION_NOT_VERIFIABLE'));assert.equal((await h.resolution.get(item.id)).comparison.eligible,false);
});
test('resolution / corrupt correction evidence removes effective resolution',async t=>{
 const h=await resolutionSetup(t);let {item,reassessment}=await h.prepare();item=await h.act(item,'VERIFY',{},authority);const db=await openDatabase(h.db);try{await db.transaction(c=>c.query("UPDATE assurance_evidence SET digest='sha256:bad' WHERE run_id=$1",[reassessment.id]));}finally{await db.close();}
 const next=await h.resolution.get(item.id);assert.equal(next.effectiveStatus,'REASSESSMENT_REQUIRED');assert.equal(next.status,'RESOLVED');
});
test('resolution / export carries original and reassessment evidence without rewriting either',async t=>{
 const h=await resolutionSetup(t);let {item}=await h.prepare();item=await h.act(item,'VERIFY',{},authority);const out=await h.resolution.export(item.id);assert.equal(out.originalAssessment.disposition,'NOT_READY');assert.equal(out.reassessment.disposition,'READY');assert.equal(out.resolution.status,'RESOLVED');assert.ok(!JSON.stringify(out).includes(h.makerToken));
});
test('resolution / records and history survive fresh repository instances',async t=>{
 const h=await resolutionSetup(t),i=await h.create();const fresh=await openResolutionRepository({...h.settings,migrate:false});try{assert.equal((await fresh.get(i.id)).history[0].action,'CREATED');assert.equal((await fresh.list()).total,1);}finally{await fresh.close();}
});
test('resolution / pagination boundaries and exact known-change identity',async t=>{
 const h=await resolutionSetup(t);await h.create();assert.equal((await h.resolution.list({limit:1})).items.length,1);assert.equal((await h.resolution.list({offset:1,limit:1})).items.length,0);
 for(const params of [{limit:0},{limit:101},{offset:-1},{limit:1.1},{offset:'0'}])await assert.rejects(h.resolution.list(params),err('INVALID_PAGE'));
 await assert.rejects(h.resolution.list({changeId:randomUUID()}),err('CHANGE_NOT_FOUND'));
});
test('resolution / unsupported actions and short explanations fail without state changes',async t=>{
 const h=await resolutionSetup(t),i=await h.create();for(const action of ['CLOSE','WAIVE','SET_READY','DELETE'])await assert.rejects(h.act(i,action),err('INVALID_ACTION'));
 await assert.rejects(h.act(i,'NOTE',{rationale:'short'}),err('REASON_REQUIRED'));assert.equal((await h.resolution.get(i.id)).version,1);
});
test('resolution / a challenge requiring reassessment cannot be satisfied by the old linked pass',async t=>{
 const h=await resolutionSetup(t);let {item,reassessment}=await h.prepare();item=await h.act(item,'CHALLENGE');item=await h.act(item,'RESPOND_CHALLENGE',{challengeId:item.challenges[0].id,response:'REASSESSMENT_REQUIRED'},authority);
 assert.equal(item.linkedRunId,null);await assert.rejects(h.act(item,'LINK_ASSESSMENT',{runId:reassessment.id}),err('FRESH_REASSESSMENT_REQUIRED'));await assert.rejects(h.act(item,'VERIFY',{},authority),err('RESOLUTION_NOT_VERIFIABLE'));
});
test('resolution / rejection or removed obligation cannot be used as a successful correction',async t=>{
 const h=await resolutionSetup(t),i=await h.create();const c=await h.correct();let o=c.obligation;
 o=await h.workflow.editObligation(o.id,{revisionId:o.revisionId,version:o.version,statement:o.statement,sourceReference:o.sourceReference,sourceVersion:o.sourceVersion,criticality:o.criticality},author);
 o=await h.workflow.transitionObligation(o.id,h.action(o,'SUBMIT'),author);await h.workflow.transitionObligation(o.id,h.action(o,'REJECT'),authority);
 const p=await h.propose(i);assert.ok(p.comparison.blockers.some(b=>b.code==='ACCEPTED_REQUIREMENT_REQUIRED'));
});
test('resolution / copied lineage can be followed through several revisions without inheriting authority',async t=>{
 const h=await resolutionSetup(t),i=await h.create();await h.correct();await h.correct({revisionSource:'c'.repeat(40)});let p=await h.propose(i);const r=await h.assess();p=await h.act(p,'LINK_ASSESSMENT',{runId:r.id});assert.equal(p.comparison.eligible,true);
});
test('resolution / source snapshot alteration fails closed',async t=>{
 const h=await resolutionSetup(t),i=await h.create(),db=await openDatabase(h.db);try{await db.transaction(c=>c.query("UPDATE resolution_items SET source_digest='invalid' WHERE id=$1",[i.id]));}finally{await db.close();}
 const record=await h.resolution.get(i.id);assert.equal(record.sourceIntegrity,'DIGEST_MISMATCH');assert.ok(record.comparison.blockers.some(x=>x.code==='SOURCE_SNAPSHOT_INVALID'));
});
test('resolution / queued and cancelled reassessments never qualify as verified fixes',async t=>{
 const h=await resolutionSetup(t),i=await h.create(),c=await h.correct();let p=await h.propose(i);const ctx=await c.service.getContext(h.change.id,c.change.revision.id);
 const plan=await c.service.approvePlan(h.change.id,{revisionId:c.change.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:0,obligationId:c.obligation.id,targetId:c.target.id,rationale:note,acknowledgeLimits:true},authority);
 const queued=await c.service.requestRun(h.change.id,{revisionId:c.change.revision.id,planId:plan.id,requestKey:randomUUID()},author);p=await h.act(p,'LINK_ASSESSMENT',{runId:queued.id});assert.equal(p.comparison.eligible,false);
 await assert.rejects(h.act(p,'VERIFY',{},authority),err('RESOLUTION_NOT_VERIFIABLE'));await c.service.cancel(queued.id,author);assert.equal((await h.resolution.get(p.id)).comparison.candidate.status,'CANCELLED');
});
test('resolution / explicit founder mode labels same-person verification as not independent',async t=>{
 const h=await resolutionSetup(t,{reviewMode:'founder-review'});let {item}=await h.prepare();item=await h.act(item,'UPDATE',{assignedTo:authority.email,actionPlan:note,externalReference:''});item=await h.act(item,'VERIFY',{},authority);assert.equal(item.verification.independentActor,false);assert.equal(item.reviewMode,'founder-review');
});
test('resolution / removed owner is not silently treated as accountable',async t=>{
 const h=await resolutionSetup(t),i=await h.create();const repo=await openResolutionRepository({...h.settings,migrate:false,accounts:accounts.filter(a=>a.email!==author.email)});
 try{assert.ok((await repo.get(i.id)).comparison.blockers.some(x=>x.code==='ASSIGNEE_UNAVAILABLE'));}finally{await repo.close();}
});
test('resolution / short, oversized, and control-character action text is rejected',async t=>{
 const h=await resolutionSetup(t);for(const actionPlan of ['', 'tiny', 'x'.repeat(2001),'meaningful\u0001plan'])await assert.rejects(h.create(author,{actionPlan}));
 const boundary=await h.create(author,{actionPlan:'x'.repeat(2000),externalReference:'x'.repeat(500)});assert.equal(boundary.actionPlan.length,2000);
 await assert.rejects(h.act(boundary,'UPDATE',{assignedTo:author.email,actionPlan:note,externalReference:'x'.repeat(501)}));
});
test('resolution / missing authority is clarified and verified without hiding other obligations',async t=>{
 const h=await resolutionSetup(t,{mode:'correct'});
 let o=await h.workflow.addObligation(h.change.id,{revisionId:h.change.revision.id,statement:'The requester must be distinct from the approver for this request.',sourceReference:'Approval policy',sourceVersion:'1',criticality:'HIGH'},author);
 const gapRun=await h.run();let item=await h.resolution.create(gapRun.id,{obligationId:o.id,assignedTo:author.email,actionPlan:note},author);assert.equal(item.kind,'AUTHORITY_GAP');
 o=await h.workflow.transitionObligation(o.id,h.action(o,'SUBMIT'),author);o=await h.workflow.transitionObligation(o.id,h.action(o,'ACCEPT'),authority);
 item=await h.act(item,'PROPOSE_CORRECTION',{revisionId:h.change.revision.id,obligationId:o.id});
 const ctx=await h.service.getContext(h.change.id,h.change.revision.id);const plan=await h.service.approvePlan(h.change.id,{revisionId:h.change.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:ctx.plan.version,obligationId:o.id,targetId:h.target.id,rationale:note,acknowledgeLimits:true},authority);
 const queued=await h.service.requestRun(h.change.id,{revisionId:h.change.revision.id,planId:plan.id,requestKey:randomUUID()},author);
 const {workOnce}=await import('../server/assurance/worker.mjs');await workOnce({repository:h.worker,targets:[h.target],workerId:'authority-gap-test',secretEnv:{MAKER_TEST_TOKEN:h.makerToken,CHECKER_TEST_TOKEN:h.checkerToken},allowLoopback:true});
 item=await h.act(item,'LINK_ASSESSMENT',{runId:queued.id});assert.equal(item.comparison.candidate.disposition,'INDETERMINATE');item=await h.act(item,'VERIFY',{},authority);assert.equal(item.status,'RESOLVED');
});
test('resolution / an accepted but unmapped obligation becomes a verification gap',async t=>{
 const h=await resolutionSetup(t,{mode:'correct'});let o=await h.workflow.addObligation(h.change.id,{revisionId:h.change.revision.id,statement:'The requester must be distinct from the approver.',sourceReference:'Policy',sourceVersion:'1'},author);
 o=await h.workflow.transitionObligation(o.id,h.action(o,'SUBMIT'),author);o=await h.workflow.transitionObligation(o.id,h.action(o,'ACCEPT'),authority);
 const run=await h.run();const i=await h.resolution.create(run.id,{obligationId:o.id,assignedTo:author.email,actionPlan:note},author);assert.equal(i.kind,'VERIFICATION_GAP');assert.equal(i.comparison.source.finding.state,'INSUFFICIENT');
});
test('resolution / failed execution can be investigated and verified through a fresh completed run',async t=>{
 let clock=2000000000000;const h=await resolutionSetup(t,{mode:'correct',clock:()=>clock});const queued=await h.queue();clock+=600001;const failed=await h.service.getRun(queued.id);assert.equal(failed.status,'FAILED');
 let item=await h.resolution.create(failed.id,{obligationId:h.obligation.id,assignedTo:author.email,actionPlan:note},author);assert.equal(item.kind,'EXECUTION_FAILURE');assert.equal(item.source.evidenceDigest,null);
 item=await h.propose(item);const run=await h.assess();item=await h.act(item,'LINK_ASSESSMENT',{runId:run.id});item=await h.act(item,'VERIFY',{},authority);assert.equal(item.status,'RESOLVED');assert.equal((await h.service.getRun(failed.id)).status,'FAILED');
});
test('resolution / migration 004 preserves old evidence and checks its own checksum',async t=>{
 const h=await resolutionSetup(t),item=await h.create(),again=await openResolutionRepository({...h.settings,migrate:true});try{assert.equal((await again.get(item.id)).source.evidenceDigest,h.source.evidenceDigest);}finally{await again.close();}
 const db=await openDatabase(h.db);try{await db.transaction(c=>c.query("UPDATE qivvera_migrations SET checksum='changed' WHERE version=4"));}finally{await db.close();}
 await assert.rejects(openResolutionRepository({...h.settings,migrate:true}),/RESOLUTION_MIGRATION_CHECKSUM_MISMATCH/);
 await assert.rejects(openResolutionRepository({...h.settings,migrate:false}),/RESOLUTION_MIGRATION_REQUIRED/);
});
test('resolution / a new revision never inherits a resolved item as current',async t=>{
 const h=await resolutionSetup(t);let {item}=await h.prepare();item=await h.act(item,'VERIFY',{},authority);const change=await h.workflow.getChange(h.change.id);
 await h.workflow.createRevision(h.change.id,{expectedRevisionId:change.revision.id,sourceRevision:'c'.repeat(40),intent:'Next independent change',reason:'New unassessed revision',copyObligations:true},author);
 const current=await h.resolution.get(item.id);assert.equal(current.status,'RESOLVED');assert.equal(current.effectiveStatus,'REASSESSMENT_REQUIRED');assert.ok(current.comparison.blockers.some(b=>b.code==='CORRECTION_NOT_CURRENT'));
});
