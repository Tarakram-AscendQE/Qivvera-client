/** Authorized worker process. Never run in a Vercel request handler. No secrets printed. */
import {setTimeout as sleep} from 'node:timers/promises';
import {openAssuranceRepository} from '../server/assurance/repository.mjs';
import {loadAssuranceConfig} from '../server/assurance/config.mjs';
import {workOnce} from '../server/assurance/worker.mjs';
let repository,stopping=false;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
try{
 if(process.argv.length!==3||!['--once','--poll'].includes(process.argv[2]))throw new Error('EXPLICIT_WORKER_MODE_REQUIRED');
 const poll=process.argv[2]==='--poll',interval=Number(process.env.QIVVERA_WORKER_POLL_MS??2000);
 if(!Number.isInteger(interval)||interval<1000||interval>60000)throw new Error('INVALID_POLL_INTERVAL');
 const config=loadAssuranceConfig();if(!config.enabled)throw new Error('ASSURANCE_NOT_ENABLED');
 const connectionString=process.env.ASSURANCE_DATABASE_URL;
 if(!connectionString)throw new Error('WORKER_DATABASE_REQUIRED');
 if(!process.env.QIVVERA_WORKER_ID)throw new Error('WORKER_IDENTITY_REQUIRED');
 // Template preparation belongs to the web service; shared environment settings must not
 // grant the worker template access or make it require template-table privileges.
 repository=await openAssuranceRepository({driver:'postgres',connectionString,sslMode:process.env.DATABASE_SSL_MODE??'verify-full',ca:process.env.DATABASE_CA,...config,templatesEnabled:false,worker:true,migrate:false});
 do{
  const result=await workOnce({repository,...config,workerId:process.env.QIVVERA_WORKER_ID,allowLoopback:config.allowLocalTargets});
  if(result.worked||!poll)console.log(JSON.stringify(result));
  if(!poll||stopping)break;
  await sleep(interval);
 }while(!stopping);
}catch{console.error('ASSURANCE_WORKER_FAILED: inspect approved configuration without logging secrets.');process.exitCode=1;}finally{await repository?.close();}
