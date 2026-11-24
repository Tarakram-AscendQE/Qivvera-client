/** Real local HTTP resolution journey with a separate verifier worker process.
 * Synthetic reference applications and isolated SQLite only; never a deployment entry point.
 */
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {resolutionSetup,author,authority,accounts,note} from '../test/resolution-helpers.mjs';
import {createApplicationServer} from '../dist/api/server.js';
import {hashPassword} from '../backend/server/auth.mjs';
const out=resolve(process.env.QIVVERA_TEST_OUTPUT??'review-test-results');mkdirSync(out,{recursive:true});
const cleanup=[];let server;const checks=[];
try{
 const h=await resolutionSetup({after:f=>cleanup.push(f)}),corrected=await h.correct();
 const password=randomBytes(24).toString('hex');
 server=createApplicationServer({repository:h.workflow,assurance:corrected.service,resolution:h.resolution,publicOrigin:'http://127.0.0.1:3181',accounts:accounts.map(a=>({...a,passwordHash:hashPassword(password)}))});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 let session;
 async function api(path,method='GET',data){const res=await fetch(base+path,{method,headers:{...(method!=='GET'?{'Content-Type':'application/json',Origin:'http://127.0.0.1:3181'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},...(data?{body:JSON.stringify(data)}:{})});const b=await res.json();if(!res.ok)throw new Error(`${res.status} ${b.error}: ${b.message}`);if(path==='/api/session')session={...b,cookie:res.headers.get('set-cookie').split(';')[0]};return b;}
 async function login(who){await api('/api/session','POST',{email:who.email,password});}
 await login(author);
 let item=await api(`/api/assessments/${h.source.id}/resolutions`,'POST',{obligationId:h.obligation.id,assignedTo:author.email,actionPlan:'Correct the self-approval guard and verify both prohibited and legitimate approvals.',externalReference:'SYNTHETIC-QE-004'});
 const act=async(action,more={})=>item=await api(`/api/resolutions/${item.id}/actions`,'POST',{action,version:item.version,rationale:note,...more});
 await act('START');checks.push('Authenticated user created and started a resolution from an actual VIOLATED finding.');
 await act('CHALLENGE');const challenge=item.challenges[0];await login(authority);await act('RESPOND_CHALLENGE',{challengeId:challenge.id,response:'FINDING_UPHELD'});checks.push('A separate authority responded without deleting the original evidence.');
 await login(author);await act('PROPOSE_CORRECTION',{revisionId:corrected.change.revision.id,obligationId:corrected.obligation.id});checks.push('Correction links to an explicitly copied and reaccepted requirement on a new source/artifact revision.');
 async function capture(label){
  const current=await api('/api/changes/'+h.change.id),workspace=await api('/api/workspace'),context=await api(`/api/changes/${h.change.id}/assurance-context?revision=${current.revision.id}`),runs=await api(`/api/changes/${h.change.id}/assessments?revision=${current.revision.id}`);
  const res=await api('/api/resolutions/'+item.id),resolutions=await api('/api/resolutions');
  writeFileSync(join(out,`resolution-ui-${label}.json`),JSON.stringify({session:{email:session.email,roles:session.roles,csrfToken:'offline-component-only',reviewMode:'independent'},workspace,change:current,context,runs,item:res,resolutions,assignees:await api('/api/resolution-assignees'),source:h.source},null,2));
 }
 await capture('awaiting');
 await login(authority);const ctx=await api(`/api/changes/${h.change.id}/assurance-context?revision=${corrected.change.revision.id}`);
 const plan=await api(`/api/changes/${h.change.id}/assurance-plan`,'POST',{revisionId:corrected.change.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:0,obligationId:corrected.obligation.id,targetId:corrected.target.id,rationale:note,acknowledgeLimits:true});
 await login(author);const queued=await api(`/api/changes/${h.change.id}/assessments`,'POST',{revisionId:corrected.change.revision.id,planId:plan.id,requestKey:randomUUID()});
 await act('LINK_ASSESSMENT',{runId:queued.id});
 if(item.comparison.eligible)throw new Error('QUEUED_RUN_MUST_NOT_VERIFY_CORRECTION');checks.push('A queued reassessment cannot verify the correction.');
 const worker=spawn(process.execPath,['backend/scripts/assurance-worker.mjs','--once'],{env:{...process.env,NODE_ENV:'test',QIVVERA_ASSURANCE_ENABLED:'true',QIVVERA_TARGETS_JSON:JSON.stringify([corrected.target]),QIVVERA_ALLOW_LOOPBACK_TARGETS:'true',QIVVERA_LOCAL_SQLITE:'true',DATABASE_PATH:h.db.path,QIVVERA_WORKER_ID:'resolution-reference-worker',MAKER_TEST_TOKEN:h.makerToken,CHECKER_TEST_TOKEN:h.checkerToken},stdio:['ignore','pipe','pipe']});
 const deadline=setTimeout(()=>worker.kill('SIGTERM'),15000);const [code]=await once(worker,'exit');clearTimeout(deadline);if(code!==0)throw new Error('REFERENCE_WORKER_FAILED');
 item=await api('/api/resolutions/'+item.id);if(!item.comparison.eligible)throw new Error(JSON.stringify(item.comparison.blockers));checks.push('Separate worker executed real HTTP verification of the corrected target; linked finding is SUPPORTED.');
 await login(authority);await capture('review');await act('VERIFY');
 if(item.effectiveStatus!=='RESOLVED'||!item.verification.independentActor)throw new Error('EXPECTED_INDEPENDENT_VERIFIED_RESOLUTION');checks.push('Different policy authority verified the correction, with run and evidence digests recorded.');
 const exported=await api('/api/resolutions/'+item.id+'/export');
 if(exported.originalAssessment.disposition!=='NOT_READY'||exported.reassessment.disposition!=='READY'||exported.originalAssessment.evidenceDigest!==h.source.evidenceDigest)throw new Error('HISTORY_OR_OUTCOME_CHANGED');
 writeFileSync(join(out,'resolution-case.json'),JSON.stringify(exported,null,2));await capture('verified');checks.push('Export retains original NOT_READY evidence and the distinct corrected READY assessment.');
 const proof=JSON.stringify(item.verification);await login(author);await api(`/api/changes/${h.change.id}/obligations`,'POST',{revisionId:corrected.change.revision.id,statement:'Additional declared control needs verification.',sourceReference:'Synthetic audit policy',sourceVersion:'1'});
 item=await api('/api/resolutions/'+item.id);if(item.effectiveStatus!=='REASSESSMENT_REQUIRED'||JSON.stringify(item.verification)!==proof)throw new Error('CURRENT_APPLICABILITY_FAILED');
 await capture('stale');checks.push('Changed obligations invalidate current resolution without rewriting its historical verification.');
 await act('REOPEN');if(item.status!=='OPEN'||!item.history.some(e=>e.action==='VERIFY'))throw new Error('REOPEN_LOST_HISTORY');checks.push('Reopening preserves the earlier independent verification in the timeline.');
 const report={passed:true,date:new Date().toISOString(),checks,count:checks.length,transport:'real local HTTP',worker:'separate Node process',target:'real synthetic HTTP service; deliberately seeded defect and source-level correction',storage:'SQLite',limitations:['Source references are fixture labels, not actual repository commits.','No hosted Vercel, real PostgreSQL, production-data or native-browser claim.']};
 writeFileSync(join(out,'resolution-reference-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(server)await new Promise(r=>server.close(r));for(const f of cleanup)await f();}
