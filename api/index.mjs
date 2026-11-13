/** Requests only. Never runs verification inside a Vercel invocation. */
import {loadConfig} from '../server/config.mjs';
import {loadAssuranceConfig} from '../server/assurance/config.mjs';
import {openWorkflowRepository} from '../server/workflow-repository.mjs';
import {openAssuranceRepository} from '../server/assurance/repository.mjs';
import {createApplicationServer} from '../server/app.mjs';
import {fileURLToPath} from 'node:url';
let initialising;
async function getHandler(){
 if(!initialising)initialising=(async()=>{
  const cfg=loadConfig({...process.env,NODE_ENV:'production'}),ac=loadAssuranceConfig({...process.env,NODE_ENV:'production'});
  const repository=await openWorkflowRepository({...cfg.database,migrate:false});let assurance;
  try{if(ac.enabled)assurance=await openAssuranceRepository({...cfg.database,...ac,migrate:false});
   const server=createApplicationServer({repository,assurance,accounts:cfg.accounts,publicOrigin:cfg.publicOrigin,secureCookies:true,releaseRevision:cfg.releaseRevision,webRoot:fileURLToPath(new URL('../web',import.meta.url))});
   return server.listeners('request')[0];
  }catch(e){await assurance?.close();await repository.close();throw e;}
 })().catch(e=>{initialising=undefined;throw e;});
 return initialising;
}
export default async function handler(req,res){try{return await(await getHandler())(req,res);}catch{
 console.error('QIVVERA_FUNCTION_INITIALISATION_FAILED');res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'SERVICE_UNAVAILABLE',message:'The workspace is unavailable. Contact the deployment owner.'}));
}}
