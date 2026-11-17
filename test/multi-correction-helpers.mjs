import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {once} from 'node:events';import {randomUUID} from 'node:crypto';
import {setupMulti,author,authority,rationale} from './generalization-helpers.mjs';
import {openResolutionRepository} from '../server/resolution/repository.mjs';import {openAssuranceRepository} from '../server/assurance/repository.mjs';import {workOnce} from '../server/assurance/worker.mjs';
export async function correctionJourney(t,{postgresURL}={}){
 const h=await setupMulti(t,{mode:'repeat-approval-defect',postgresURL}),source=await h.run();
 const accounts=[author,authority];const original=await openResolutionRepository({...h.options,accounts});t.after(()=>original.close());
 let item=await original.create(source.id,{obligationId:h.obligations[1].id,assignedTo:author.email,actionPlan:rationale},author);
 const change=await h.workflow.createRevision(h.change.id,{expectedRevisionId:h.change.revision.id,sourceRevision:'b'.repeat(40),intent:'Correct repeated approval while retaining both accepted controls.',reason:rationale,copyObligations:true},author);
 const obligations=[];for(const old of h.obligations){let o=change.obligations.find(x=>x.copiedFrom===old.id);o=await h.workflow.transitionObligation(o.id,{revisionId:change.revision.id,version:o.version,action:'SUBMIT'},author);o=await h.workflow.transitionObligation(o.id,{revisionId:change.revision.id,version:o.version,action:'ACCEPT',rationale},authority);obligations.push(o);}
 const folder=join(h.dir,'corrected');mkdirSync(folder);const code=readFileSync(new URL('../fixtures/approval-controls/server.mjs',import.meta.url),'utf8').replace("r.status!=='PENDING'&&mode!=='repeat-approval-defect'", "r.status!=='PENDING' /* corrected finality guard */");writeFileSync(join(folder,'server.mjs'),code);
 const module=await import(pathToFileURL(join(folder,'server.mjs')).href);const targetServer=module.createApprovalTarget({mode:'repeat-approval-defect',sourceRevision:change.sourceRevision,requesterToken:h.secretEnv.MULTI_MAKER_TOKEN,approverToken:h.secretEnv.MULTI_CHECKER_TOKEN});targetServer.listen(0,'127.0.0.1');await once(targetServer,'listening');t.after(()=>new Promise(resolve=>targetServer.close(resolve)));
 const target={...h.target,sourceRevision:change.sourceRevision,artifactDigest:module.artifactDigest,origin:`http://127.0.0.1:${targetServer.address().port}`};
 const options={...h.options,targets:[target],migrate:false};const service=await openAssuranceRepository(options),worker=await openAssuranceRepository({...options,worker:true}),resolution=await openResolutionRepository({...options,accounts});t.after(()=>service.close());t.after(()=>worker.close());t.after(()=>resolution.close());
 item=await resolution.act(item.id,{action:'PROPOSE_CORRECTION',version:item.version,rationale,revisionId:change.revision.id,obligationId:obligations[1].id},author);
 const ctx=await service.getContext(h.change.id,change.revision.id);const plan=await service.approvePlan(h.change.id,{revisionId:change.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:0,targetId:target.id,mappings:obligations.map((o,i)=>({obligationId:o.id,checkId:i?'finality':'separation',rationale})),rationale,acknowledgeLimits:true},authority);
 const queued=await service.requestRun(h.change.id,{revisionId:change.revision.id,planId:plan.id,requestKey:randomUUID()},author);item=await resolution.act(item.id,{action:'LINK_ASSESSMENT',version:item.version,rationale,runId:queued.id},author);
 if(item.comparison.eligible)throw new Error('Queued evidence incorrectly eligible');
 await workOnce({repository:worker,targets:[target],workerId:'correction-worker',secretEnv:h.secretEnv,allowLoopback:true,timeoutMs:500});
 item=await resolution.act(item.id,{action:'VERIFY',version:item.version,rationale},authority);
 return {item,source,corrected:await service.getRun(queued.id),exported:await resolution.export(item.id)};
}
