import {loadIntakeConfig} from './intake/github.mjs';
import {openIntakeRepository} from './intake/repository.mjs';
import {fileURLToPath} from 'node:url';
import {loadConfig} from './config.mjs';
import {loadAssuranceConfig} from './assurance/config.mjs';
import {openWorkflowRepository} from './workflow-repository.mjs';
import {openAssuranceRepository} from './assurance/repository.mjs';
import {openResolutionRepository} from './resolution/repository.mjs';
import {createApplicationServer} from './app.mjs';
import {PRODUCT_VERSION} from './release.mjs';
import {loadDraftingConfig} from './drafting/generator.mjs';
import {openWorkspaceAccounts} from './accounts/repository.mjs';
let repository,accounts,assurance,resolution,intake;
try{
 const cfg=loadConfig(),ac=loadAssuranceConfig();
 repository=await openWorkflowRepository({...cfg.database,drafting:loadDraftingConfig(),impact:{...ac,assuranceEnabled:ac.enabled}});
 accounts=await openWorkspaceAccounts(cfg);
 if(ac.enabled)assurance=await openAssuranceRepository({...cfg.database,...ac});
 if(process.env.QIVVERA_RESOLUTION_ENABLED==='true'){if(!assurance)throw new Error('RESOLUTION_REQUIRES_ASSURANCE');resolution=await openResolutionRepository({...cfg.database,...ac,directory:accounts,reviewMode:cfg.reviewMode});}
 const ic=loadIntakeConfig();if(ic.enabled)intake=await openIntakeRepository({...cfg.database,...ic,migrate:false});
 const server=createApplicationServer({repository,assurance,resolution,intake,accountDirectory:accounts,publicOrigin:cfg.publicOrigin,secureCookies:cfg.hosted,releaseRevision:cfg.releaseRevision,webRoot:fileURLToPath(new URL('../../frontend/public',import.meta.url))});
 server.listen(cfg.port,cfg.host,()=>console.log(`Qivvera ${PRODUCT_VERSION} started. Assessment requests use a separate worker.`));
 let closing=false;
 for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{
  if(closing)return;closing=true;const timer=setTimeout(()=>process.exit(1),10000);timer.unref();
  server.close(async()=>{await intake?.close();await resolution?.close();await assurance?.close();await accounts?.close();await repository.close();process.exit(0);});
 });
}catch(err){console.error('QIVVERA_STARTUP_FAILED:', err?.stack || err?.message || err);await intake?.close();await resolution?.close();await assurance?.close();await accounts?.close();await repository?.close();process.exitCode=1;}
