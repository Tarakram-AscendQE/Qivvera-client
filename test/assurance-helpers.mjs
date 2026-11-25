import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {openWorkflowRepository} from '../backend/server/workflow-repository.mjs';
import {openAssuranceRepository} from '../backend/server/assurance/repository.mjs';
import {createApprovalTarget,artifactDigest} from '../fixtures/approval-target/server.mjs';
import {workOnce} from '../backend/server/assurance/worker.mjs';
import { testDatabase } from './postgres-test-database.mjs';
export const author={email:'author@example.test',roles:['AUTHOR']},authority={email:'policy@example.test',roles:['POLICY_AUTHORITY']},viewer={email:'viewer@example.test',roles:['VIEWER']};
export async function setup(t,{mode='correct',extraObligation=false,clock,postgresURL}={}){
 const dir=mkdtempSync(join(tmpdir(),'qivvera-assurance-'));
 const db=postgresURL?{driver:'postgres',connectionString:postgresURL,sslMode:'disable'}: await testDatabase();
 const workflow=await openWorkflowRepository({...db,migrate:true});
 const app=await workflow.createApplication({name:'Reference approval '+randomUUID()},author);
 const change=await workflow.createChange({applicationId:app.id,title:'Approval change',sourceRevision:'a'.repeat(40),intent:'Maintain distinct requester and approver'},author);
 let obligation=await workflow.addObligation(change.id,{revisionId:change.revision.id,statement:'A requester cannot approve their own request; a different eligible approver can.',sourceReference:'Approval policy',sourceVersion:'1',criticality:'CRITICAL'},author);
 const action=(o,name)=>({revisionId:o.revisionId,version:o.version,action:name,rationale:'Approved business requirement for separation of duties.'});
 obligation=await workflow.transitionObligation(obligation.id,action(obligation,'SUBMIT'),author);
 obligation=await workflow.transitionObligation(obligation.id,action(obligation,'ACCEPT'),authority);
 if(extraObligation)await workflow.addObligation(change.id,{revisionId:change.revision.id,statement:'Required audit trail exists.',sourceReference:'Audit policy',sourceVersion:'1',criticality:'HIGH'},author);
 const makerToken=randomBytes(24).toString('hex'),checkerToken=randomBytes(24).toString('hex');
 const server=createApprovalTarget({mode,requesterToken:makerToken,approverToken:checkerToken});server.listen(0,'127.0.0.1');await once(server,'listening');
 const target={id:'local-approved-target',name:'Synthetic approval target',applicationId:app.id,sourceRevision:'a'.repeat(40),artifactDigest,environmentDigest:'sha256:'+'e'.repeat(64),instanceId:'reference-instance',origin:`http://127.0.0.1:${server.address().port}`,requesterId:'maker',approverId:'checker',requesterTokenEnv:'MAKER_TEST_TOKEN',approverTokenEnv:'CHECKER_TEST_TOKEN',bindingStatement:'Operator-controlled synthetic test process; source refs are fixture labels, not a production attestation.',testOnly:true};
 const options={...db,migrate:true,targets:[target],allowLocalTargets:true,...(clock?{now:clock}:{})};
 const service=await openAssuranceRepository(options),worker=await openAssuranceRepository({...options,worker:true});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await worker.close();await service.close();await workflow.close();rmSync(dir,{recursive:true,force:true});});
 async function plan(){const context=await service.getContext(change.id,change.revision.id);return service.approvePlan(change.id,{revisionId:change.revision.id,scopeDigest:context.scopeDigest,expectedPlanVersion:context.plan?.version??0,obligationId:obligation.id,targetId:target.id,rationale:'This behavioural oracle exercises the accepted approval rule through the real target interface.',acknowledgeLimits:true},authority);}
 async function queue(p){return service.requestRun(change.id,{revisionId:change.revision.id,planId:(p??await plan()).id,requestKey:randomUUID()},author);}
 async function run(){const r=await queue();await workOnce({repository:worker,targets:[target],workerId:'local-test-worker',secretEnv:{MAKER_TEST_TOKEN:makerToken,CHECKER_TEST_TOKEN:checkerToken},allowLoopback:true,timeoutMs:500});return service.getRun(r.id);}
 return {dir,db,workflow,service,worker,app,change,obligation,target,plan,queue,run,action,makerToken,checkerToken,options};
}
