import {resolve} from 'node:path';
import {loadConfig} from './config.mjs';
import {loadAssuranceConfig} from './assurance/config.mjs';
import {openWorkflowRepository} from './workflow-repository.mjs';
import {openAssuranceRepository} from './assurance/repository.mjs';
import {createApplicationServer} from './app.mjs';
let repository,assurance;
try{
 const cfg=loadConfig(),ac=loadAssuranceConfig();
 repository=await openWorkflowRepository(cfg.database);
 if(ac.enabled)assurance=await openAssuranceRepository({...cfg.database,...ac});
 const server=createApplicationServer({repository,assurance,accounts:cfg.accounts,publicOrigin:cfg.publicOrigin,secureCookies:cfg.hosted,releaseRevision:cfg.releaseRevision,webRoot:resolve('web')});
 server.listen(cfg.port,cfg.host,()=>console.log('Qivvera 0.4.0 started. Assessment requests use a separate worker.'));
 let closing=false;
 for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{
  if(closing)return;closing=true;const timer=setTimeout(()=>process.exit(1),10000);timer.unref();
  server.close(async()=>{await assurance?.close();await repository.close();process.exit(0);});
 });
}catch{console.error('QIVVERA_STARTUP_FAILED: verify protected configuration and migrations.');await assurance?.close();await repository?.close();process.exitCode=1;}
