/** Disposable UI-race fixture. Genuine application handlers, sessions and stored records.
 * Only delivery of selected genuine HTTP bodies is delayed. GitHub metadata is synthetic
 * provider input; this fixture does not contact GitHub or establish a live integration.
 */
import {randomBytes,randomUUID} from 'node:crypto';
import {resolutionSetup,author,accounts,note} from './resolution-helpers.mjs';
import {openIntakeRepository} from '../backend/server/intake/repository.mjs';
import {createApplicationServer} from '../dist/api/server.js';
import {hashPassword} from '../backend/server/auth.mjs';

const password=process.env.NAVIGATION_TEST_PASSWORD;
if(typeof password!=='string'||password.length<24)throw new Error('Supply a generated fixture password.');
const port=Number(process.env.NAVIGATION_TEST_PORT??3286);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Use an unprivileged fixture port.');

const cleanup=[];
const h=await resolutionSetup({after:fn=>cleanup.push(fn)},{extraObligation:true});
const first=await h.create();
const sourceChange=await h.workflow.getChange(h.change.id);
const gap=sourceChange.obligations.find(obligation=>obligation.id!==h.obligation.id);
const second=await h.resolution.create(h.source.id,{
  obligationId:gap.id,assignedTo:author.email,actionPlan:note,externalReference:'NAVIGATION-SECOND',
},author);
const other=await h.workflow.createChange({
  applicationId:h.app.id,title:'Second change for navigation',sourceRevision:'c'.repeat(40),
  intent:'Keep a separate change to verify that no record context transfers.',
},author);
const repository={id:'navigation-source',owner:'example',repo:'navigation',repositoryId:12345,
  applicationId:h.app.id,tokenEnv:'NAVIGATION_FIXTURE_SOURCE_TOKEN'};
const intake=await openIntakeRepository({...h.db,migrate:true,repositories:[repository],
  secretEnv:{NAVIGATION_FIXTURE_SOURCE_TOKEN:randomBytes(24).toString('hex')},
  fetchFn:async url=>{
    const number=Number(new URL(url).pathname.split('/').at(-1));
    return new Response(JSON.stringify({number,state:'open',merged:false,draft:false,
      title:`Synthetic pull ${number}`,body:'Synthetic provider metadata for navigation tests only.',
      base:{sha:'d'.repeat(40),ref:'main',repo:{id:12345,full_name:'example/navigation'}},
      head:{sha:'e'.repeat(40),ref:`fix-${number}`,repo:{id:12345,full_name:'example/navigation'}},
    }),{status:200,headers:{'content-type':'application/json'}});
  },
});
cleanup.push(()=>intake.close());
const origin=`http://127.0.0.1:${port}`;
const passwordHash=hashPassword(password);
const server=createApplicationServer({repository:h.workflow,assurance:h.service,resolution:h.resolution,
  intake,accounts:accounts.map(account=>({...account,passwordHash})),publicOrigin:origin});
// These controls exist only in this disposable loopback fixture. They hold delivery of
// an actual application response after its handler has read or saved the real record.
const controlToken=randomBytes(32).toString('hex'),barriers=new Map();
const keys=new Set(['resolution-a','change-a-resolutions','resolution-assignees','obligation-save-a','preview-12']);
const controlPrefix='/_navigation_test/barriers';
const respond=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function control(req,res,path){
  if(req.headers['x-navigation-fixture-control']!==controlToken)return respond(res,403,{error:'FIXTURE_CONTROL_REQUIRED'});
  const parts=path.slice(controlPrefix.length).split('/').filter(Boolean);
  if(req.method==='POST'&&parts.length===1&&parts[0]==='arm'){
    let bytes=0,raw='';
    for await(const chunk of req){bytes+=chunk.length;if(bytes>1024)return respond(res,413,{error:'FIXTURE_BODY_TOO_LARGE'});raw+=chunk;}
    let input;try{input=JSON.parse(raw);}catch{return respond(res,400,{error:'FIXTURE_JSON_REQUIRED'});}
    if(!input||Object.keys(input).length!==1||!keys.has(input.key))return respond(res,400,{error:'FIXTURE_BARRIER_UNKNOWN'});
    if([...barriers.values()].some(b=>b.key===input.key&&['armed','pending'].includes(b.state)))return respond(res,409,{error:'FIXTURE_BARRIER_ALREADY_ARMED'});
    const barrier={id:randomUUID(),key:input.key,state:'armed',release:null,response:null};
    // An unmet test synchronization condition fails visibly; it is never auto-released.
    barrier.timer=setTimeout(()=>{barrier.state='expired';barrier.release=null;barrier.response?.destroy();},30000);
    barriers.set(barrier.id,barrier);
    return respond(res,201,{id:barrier.id,state:barrier.state});
  }
  const barrier=barriers.get(parts[0]);
  if(!barrier)return respond(res,404,{error:'FIXTURE_BARRIER_NOT_FOUND'});
  if(req.method==='GET'&&parts.length===1)return respond(res,200,{id:barrier.id,key:barrier.key,state:barrier.state});
  if(req.method==='POST'&&parts.length===2&&parts[1]==='release'){
    if(barrier.state!=='pending'||!barrier.release)return respond(res,409,{error:'FIXTURE_RESPONSE_NOT_PENDING',state:barrier.state});
    const release=barrier.release;barrier.release=null;barrier.state='released';clearTimeout(barrier.timer);release();
    return respond(res,200,{id:barrier.id,state:barrier.state});
  }
  return respond(res,404,{error:'FIXTURE_CONTROL_NOT_FOUND'});
}
const handler=server.listeners('request')[0];
server.removeListener('request',handler);
server.on('request',(req,res)=>{
  const path=new URL(req.url,origin).pathname,end=res.end.bind(res);
  if(path===controlPrefix||path.startsWith(controlPrefix+'/')){
    void control(req,res,path).catch(()=>{if(!res.headersSent)respond(res,500,{error:'FIXTURE_CONTROL_FAILED'});else res.destroy();});
    return;
  }
  res.end=(data,encoding,callback)=>{
    const body=typeof data==='string'&&data.startsWith('{')?JSON.parse(data):null;
    const key=req.method==='GET'?
      path===`/api/resolutions/${first.id}`?'resolution-a':
      path===`/api/changes/${h.change.id}/resolutions`?'change-a-resolutions':
      path==='/api/resolution-assignees'?'resolution-assignees':null:
      req.method==='POST'&&path===`/api/changes/${h.change.id}/obligations`&&body?.statement==='Delayed save stays with the first change.'?'obligation-save-a':
      req.method==='POST'&&path==='/api/source-previews'&&body?.source?.pullNumber===12?'preview-12':null;
    const barrier=key&&[...barriers.values()].find(b=>b.key===key&&b.state==='armed');
    if(barrier){
      barrier.state='pending';barrier.response=res;barrier.release=()=>end(data,encoding,callback);
      res.once('finish',()=>{barrier.state='completed';barrier.response=null;clearTimeout(barrier.timer);});
      res.once('close',()=>{if(barrier.state!=='completed'){barrier.state='aborted';barrier.release=null;barrier.response=null;clearTimeout(barrier.timer);}});
      res.flushHeaders();return res;
    }
    return end(data,encoding,callback);
  };
  void handler(req,res);
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({origin,controlToken,
  changeId:h.change.id,changeTitle:h.change.title,revisionId:h.change.revision.id,
  otherChangeId:other.id,otherChangeTitle:other.title,
  firstResolutionId:first.id,firstStatement:h.obligation.statement,
  secondResolutionId:second.id,secondStatement:gap.statement,
})));
let closing=false;
async function stop(){
  if(closing)return;closing=true;
  for(const barrier of barriers.values()){clearTimeout(barrier.timer);barrier.response?.destroy();}
  await new Promise(resolve=>server.close(resolve));
  for(const close of cleanup.reverse())await close();
  process.exit(0);
}
process.on('SIGTERM',stop);
process.on('SIGINT',stop);
