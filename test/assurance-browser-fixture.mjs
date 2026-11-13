/** Test harness only. Loopback and disposable state; never a deployment entrypoint. */
import {setup,author,authority} from './assurance-helpers.mjs';
import {createApplicationServer} from '../server/app.mjs';
import {hashPassword} from '../server/auth.mjs';
import {workOnce} from '../server/assurance/worker.mjs';
const cleanup=[];
const h=await setup({after:f=>cleanup.push(f)},{mode:'self-approval-defect'});
const port=Number(process.env.TEST_PORT??3138);
const server=createApplicationServer({repository:h.workflow,assurance:h.service,publicOrigin:`http://127.0.0.1:${port}`,accounts:[author,authority].map(a=>({...a,passwordHash:hashPassword('synthetic-browser-only-password')}))});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({port,changeId:h.change.id})));
let active=false;
const timer=setInterval(async()=>{if(active)return;active=true;try{await workOnce({repository:h.worker,targets:[h.target],workerId:'browser-test-worker',secretEnv:{MAKER_TEST_TOKEN:h.makerToken,CHECKER_TEST_TOKEN:h.checkerToken},allowLoopback:true});}finally{active=false;}},300);
process.on('SIGTERM',async()=>{clearInterval(timer);await new Promise(r=>server.close(r));for(const f of cleanup)await f();process.exit(0);});
