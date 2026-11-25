/** Disposable native-browser fixture. No production account or data is used. */
import {resolutionSetup,author,authority,accounts,note} from './resolution-helpers.mjs';
import {createApplicationServer} from '../dist/api/server.js';
import {hashPassword} from '../backend/server/auth.mjs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const cleanup=[];
const h=await resolutionSetup({after:f=>cleanup.push(f)}),fixed=await h.correct();
const ctx=await fixed.service.getContext(h.change.id,fixed.change.revision.id);
await fixed.service.approvePlan(h.change.id,{revisionId:fixed.change.revision.id,scopeDigest:ctx.scopeDigest,expectedPlanVersion:0,obligationId:fixed.obligation.id,targetId:fixed.target.id,rationale:note,acknowledgeLimits:true},authority);
const port=Number(process.env.TEST_PORT??3148),password='synthetic-browser-only-password';
const server=createApplicationServer({repository:h.workflow,assurance:fixed.service,resolution:h.resolution,publicOrigin:`http://127.0.0.1:${port}`,accounts:accounts.map(a=>({...a,passwordHash:hashPassword(password)}))});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({port,changeId:h.change.id,sourceRevisionId:h.change.revision.id,sourceRunId:h.source.id,obligation:h.obligation.statement})));
let active=false,child,closing=false;
const timer=setInterval(async()=>{
 if(active||closing)return;active=true;
 try{
  child=spawn(process.execPath,['backend/scripts/assurance-worker.mjs','--once'],{env:{...process.env,NODE_ENV:'test',QIVVERA_ASSURANCE_ENABLED:'true',QIVVERA_TARGETS_JSON:JSON.stringify([fixed.target]),QIVVERA_ALLOW_LOOPBACK_TARGETS:'true',ASSURANCE_DATABASE_URL:h.db.connectionString,DATABASE_SSL_MODE:'disable',QIVVERA_WORKER_ID:'browser-resolution-worker',MAKER_TEST_TOKEN:h.makerToken,CHECKER_TEST_TOKEN:h.checkerToken},stdio:['ignore','ignore','ignore']});await once(child,'exit');
 }finally{active=false;}
},500);
process.on('SIGTERM',async()=>{closing=true;clearInterval(timer);if(child&&child.exitCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;}await new Promise(r=>server.close(r));for(const f of cleanup)await f();process.exit(0);});
