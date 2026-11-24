import {loadIntakeConfig} from '../backend/server/intake/github.mjs';
import {openIntakeRepository} from '../backend/server/intake/repository.mjs';
/** Requests only. Never runs verification inside a Vercel invocation. */
import {loadConfig} from '../backend/server/config.mjs';
import {loadAssuranceConfig} from '../backend/server/assurance/config.mjs';
import {openWorkflowRepository} from '../backend/server/workflow-repository.mjs';
import {openAssuranceRepository} from '../backend/server/assurance/repository.mjs';
import {openResolutionRepository} from '../backend/server/resolution/repository.mjs';
import {createApplicationServer} from '../backend/server/app.mjs';
import {fileURLToPath} from 'node:url';
import {loadDraftingConfig} from '../backend/server/drafting/generator.mjs';
import {openWorkspaceAccounts} from '../backend/server/accounts/repository.mjs';
let initialising;
async function getHandler(){
 if(!initialising)initialising=(async()=>{
  const cfg=loadConfig({...process.env,NODE_ENV:'production'}),ac=loadAssuranceConfig({...process.env,NODE_ENV:'production'});
  const repository=await openWorkflowRepository({...cfg.database,migrate:false,drafting:loadDraftingConfig(),impact:{...ac,assuranceEnabled:ac.enabled}});let accounts,assurance,resolution,intake;
  try{accounts=await openWorkspaceAccounts({...cfg,database:{...cfg.database,migrate:false}});
   if(ac.enabled)assurance=await openAssuranceRepository({...cfg.database,...ac,migrate:false});
   if(process.env.QIVVERA_RESOLUTION_ENABLED==='true'){if(!assurance)throw new Error('RESOLUTION_REQUIRES_ASSURANCE');resolution=await openResolutionRepository({...cfg.database,...ac,directory:accounts,reviewMode:cfg.reviewMode,migrate:false});}
 const ic=loadIntakeConfig();if(ic.enabled)intake=await openIntakeRepository({...cfg.database,...ic,migrate:false});
   const server=createApplicationServer({repository,assurance,resolution,intake,accountDirectory:accounts,publicOrigin:cfg.publicOrigin,secureCookies:true,releaseRevision:cfg.releaseRevision,webRoot:fileURLToPath(new URL('../frontend/public',import.meta.url))});
   return server.listeners('request')[0];
  }catch(e){await intake?.close();await resolution?.close();await assurance?.close();await accounts?.close();await repository.close();throw e;}
 })().catch(e=>{initialising=undefined;throw e;});
 return initialising;
}
export default async function handler(req,res){try{return await(await getHandler())(req,res);}catch(err){
 console.error('QIVVERA_FUNCTION_INITIALISATION_FAILED:', err?.stack || err?.message || err);res.statusCode=503;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:'SERVICE_UNAVAILABLE',message:'The workspace is unavailable. Contact the deployment owner.'}));
}}
