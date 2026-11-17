/** Synthetic targets and disposable databases only. No user credentials or customer services. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {setup,author,authority,viewer} from './assurance-helpers.mjs';
import {openResolutionRepository} from '../server/resolution/repository.mjs';
import {openAssuranceRepository} from '../server/assurance/repository.mjs';
import {workOnce} from '../server/assurance/worker.mjs';
export {author,authority,viewer};
export const anotherAuthority={email:'reviewer@example.test',roles:['POLICY_AUTHORITY']};
export const otherAuthor={email:'engineer@example.test',roles:['AUTHOR']};
export const dual={email:'dual@example.test',roles:['AUTHOR','POLICY_AUTHORITY']};
export const accounts=[author,authority,viewer,anotherAuthority,otherAuthor,dual];
export const note='The correction is linked to the original requirement and must be verified with fresh evidence.';
export const err=code=>e=>e.code===code;
export async function resolutionSetup(t,options={}){
 const h=await setup(t,{mode:'self-approval-defect',...options});
 const settings={...h.options,accounts,reviewMode:options.reviewMode??'independent'};
 let resolution=await openResolutionRepository(settings);t.after(()=>resolution.close());
 const source=await h.run();
 let target=h.target,currentService=h.service,currentWorker=h.worker,currentChange=h.change,currentObligation=h.obligation,currentResolution=resolution;
 const result={...h,source,resolution,settings};
 result.create=(actor=author,changes={})=>currentResolution.create(source.id,{obligationId:h.obligation.id,assignedTo:author.email,actionPlan:note,externalReference:'QE-101',...changes},actor);
 result.act=(item,action,extra={},actor=author)=>currentResolution.act(item.id,{action,version:item.version,rationale:note,...extra},actor);
 result.correct=async({newRevision=true,mode='correct',extraObligation=false,alterRequirement=false,revisionSource='b'.repeat(40)}={})=>{
   if(newRevision){
    currentChange=await h.workflow.createRevision(h.change.id,{expectedRevisionId:(await h.workflow.getChange(h.change.id)).revision.id,sourceRevision:revisionSource,intent:'Retain the accepted separation rule while correcting the implementation.',reason:'Synthetic code correction, not an authentic AI-generated defect.',copyObligations:true},author);
    currentObligation=currentChange.obligations.find(o=>o.copiedFrom===currentObligation.id)??currentChange.obligations[0];
    if(alterRequirement)currentObligation=await h.workflow.editObligation(currentObligation.id,{revisionId:currentChange.revision.id,version:currentObligation.version,statement:'Any authorized actor may approve requests.',sourceReference:currentObligation.sourceReference,sourceVersion:currentObligation.sourceVersion,criticality:currentObligation.criticality},author);
    currentObligation=await h.workflow.transitionObligation(currentObligation.id,h.action(currentObligation,'SUBMIT'),author);
    currentObligation=await h.workflow.transitionObligation(currentObligation.id,h.action(currentObligation,'ACCEPT'),authority);
   }
   // This is a real source alteration to the reference fixture. The new process reports
   // a digest computed from its own changed file, not a fabricated build attestation.
   const folder=join(h.dir,'correction-'+randomUUID());mkdirSync(folder);
   let code=readFileSync(new URL('../fixtures/approval-target/server.mjs',import.meta.url),'utf8');
   if(newRevision&&mode==='correct')code=code.replace("mode!=='self-approval-defect'","true /* corrected self-approval guard */");
   writeFileSync(join(folder,'server.mjs'),code);
   const module=await import(pathToFileURL(join(folder,'server.mjs')).href);
   const server=module.createApprovalTarget({mode:mode==='correct'&&newRevision?'self-approval-defect':mode,sourceRevision:currentChange.sourceRevision,requesterToken:h.makerToken,approverToken:h.checkerToken});
   server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
   target={...h.target,sourceRevision:currentChange.sourceRevision,artifactDigest:module.artifactDigest,origin:`http://127.0.0.1:${server.address().port}`};
   const opts={...h.options,migrate:false,targets:[target]};
   currentService=await openAssuranceRepository(opts);currentWorker=await openAssuranceRepository({...opts,worker:true});
   currentResolution=await openResolutionRepository({...opts,accounts,reviewMode:options.reviewMode??'independent'});
   const closingResolution=currentResolution,closingWorker=currentWorker,closingService=currentService;
   t.after(async()=>{await closingResolution.close();await closingWorker.close();await closingService.close();});
   result.resolution=currentResolution;
   if(extraObligation)await h.workflow.addObligation(h.change.id,{revisionId:currentChange.revision.id,statement:'An additional audit record must exist.',sourceReference:'Audit policy',sourceVersion:'1'},author);
   return {change:currentChange,obligation:currentObligation,target,service:currentService,worker:currentWorker,resolution:currentResolution};
 };
 result.propose=item=>result.act(item,'PROPOSE_CORRECTION',{revisionId:currentChange.revision.id,obligationId:currentObligation.id});
 result.assess=async()=>{
   const ctx=await currentService.getContext(h.change.id,currentChange.revision.id);
   const plan=await currentService.approvePlan(h.change.id,{revisionId:currentChange.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:ctx.plan?.version??0,obligationId:currentObligation.id,targetId:target.id,rationale:note,acknowledgeLimits:true},authority);
   const queued=await currentService.requestRun(h.change.id,{revisionId:currentChange.revision.id,planId:plan.id,requestKey:randomUUID()},author);
   await workOnce({repository:currentWorker,targets:[target],workerId:'resolution-test-worker',secretEnv:{MAKER_TEST_TOKEN:h.makerToken,CHECKER_TEST_TOKEN:h.checkerToken},allowLoopback:true});
   return currentService.getRun(queued.id);
 };
 result.prepare=async correctionOptions=>{
   let item=await result.create();item=await result.act(item,'START');await result.correct(correctionOptions);
   item=await result.propose(item);const reassessment=await result.assess();item=await result.act(item,'LINK_ASSESSMENT',{runId:reassessment.id});
   return {item,reassessment};
 };
 return result;
}
