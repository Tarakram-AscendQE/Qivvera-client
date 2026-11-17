import {resolve} from 'node:path';
import {loadConfig} from './config.mjs';
import {loadAssuranceConfig} from './assurance/config.mjs';
import {openWorkflowRepository} from './workflow-repository.mjs';
import {openAssuranceRepository} from './assurance/repository.mjs';
import {openResolutionRepository} from './resolution/repository.mjs';
import {createApplicationServer} from './app.mjs';
let repository,assurance,resolution;
try{
 const cfg=loadConfig(),ac=loadAssuranceConfig();
 repository=await openWorkflowRepository(cfg.database);
 if(ac.enabled)assurance=await openAssuranceRepository({...cfg.database,...ac});
 if(process.env.QIVVERA_RESOLUTION_ENABLED==='true'){if(!assurance)throw new Error('RESOLUTION_REQUIRES_ASSURANCE');resolution=await openResolutionRepository({...cfg.database,...ac,accounts:cfg.accounts,reviewMode:cfg.reviewMode});}
 const server=createApplicationServer({repository,assurance,resolution,accounts:cfg.accounts,publicOrigin:cfg.publicOrigin,secureCookies:cfg.hosted,releaseRevision:cfg.releaseRevision,webRoot:resolve('web')});
 server.listen(cfg.port,cfg.host,()=>console.log('Qivvera 0.5.0 started. Assessment requests use a separate worker.'));
 let closing=false;
 for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{
  if(closing)return;closing=true;const timer=setTimeout(()=>process.exit(1),10000);timer.unref();
  server.close(async()=>{await resolution?.close();await assurance?.close();await repository.close();process.exit(0);});
 });
}catch(err){console.error('QIVVERA_STARTUP_FAILED:', err?.stack || err?.message || err);await resolution?.close();await assurance?.close();await repository?.close();process.exitCode=1;}
