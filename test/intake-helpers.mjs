import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID,randomBytes} from 'node:crypto';
import {openWorkflowRepository} from '../backend/server/workflow-repository.mjs';
import {openIntakeRepository} from '../backend/server/intake/repository.mjs';
export const author={email:'source-author@example.test',roles:['AUTHOR']},other={email:'other@example.test',roles:['AUTHOR']},authority={email:'policy@example.test',roles:['POLICY_AUTHORITY']},viewer={email:'viewer@example.test',roles:['VIEWER']};
export function pull(){return {number:12,state:'open',merged:false,draft:false,title:'Approval correction',body:'Untrusted description; not a requirement.',base:{sha:'b'.repeat(40),ref:'main',repo:{id:12345,full_name:'example/testrepo'}},head:{sha:'a'.repeat(40),ref:'fix',repo:{id:54321,full_name:'contributor/testrepo'}}};}
export async function setupIntake(t,{postgresURL,clock}={}){
 const dir=mkdtempSync(join(tmpdir(),'qivvera-intake-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const db=postgresURL?{driver:'postgres',connectionString:postgresURL,sslMode:'disable'}:{path:join(dir,'workspace.sqlite')};
 const workflow=await openWorkflowRepository({...db,migrate:true});t.after(()=>workflow.close());
 const app=await workflow.createApplication({name:'Intake '+randomUUID()},author);
 const config={id:'configured-repo',owner:'example',repo:'testrepo',repositoryId:12345,applicationId:app.id,tokenEnv:'SOURCE_TOKEN'};
 let data=pull(),status=200,headers={'content-type':'application/json'},raw=null;const requests=[];
 const token=randomBytes(32).toString('hex');
 const fetchFn=async(url,options)=>{requests.push({url,method:options.method,redirect:options.redirect});return new Response(raw??JSON.stringify(data),{status,headers});};
 const opts={...db,migrate:true,repositories:[config],fetchFn,secretEnv:{SOURCE_TOKEN:token},...(clock?{now:clock}:{})};
 const intake=await openIntakeRepository(opts);t.after(()=>intake.close());
 const preview=()=>intake.preview({repositoryKey:config.id,pullNumber:12},author);
 const request=pr=>({previewId:pr.id,changeId:null,expectedRevisionId:null,copyObligations:false,reason:'This pull request implements the intended change for this application.'});
 return {app,db,dir,workflow,intake,config,token,opts,requests,preview,request,data:()=>data,setData:v=>{data=v;},setResponse:(s,h={},r=null)=>{status=s;headers={'content-type':'application/json',...h};raw=r;}};
}
