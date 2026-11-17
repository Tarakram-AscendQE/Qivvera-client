/** GitHub REST pull metadata reader. No code execution, repository writes or result publication. */
import {InputError,fields,identifier,text} from '../workflow-input.mjs';
import {digest} from '../assurance/contracts.mjs';
export const API_VERSION='2026-03-10';
const fail=(code,message,status=400)=>{throw new InputError(code,message,status);};
const fullSHA=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
export function pullNumber(n){if(!Number.isSafeInteger(n)||n<1||n>2147483647)fail('INVALID_PULL_NUMBER','Enter a positive pull-request number.');return n;}
export function validateRepositories(raw){
 if(!Array.isArray(raw)||raw.length>20)throw new Error('INVALID_GITHUB_CATALOGUE');
 const keys=new Set(),bindings=new Set();
 return raw.map(x=>{
  fields(x,['id','owner','repo','repositoryId','applicationId','tokenEnv']);
  if(typeof x.id!=='string'||!/^[a-zA-Z0-9_-]{1,60}$/.test(x.id)||keys.has(x.id))throw new Error('INVALID_REPOSITORY_KEY');keys.add(x.id);
  if(typeof x.owner!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(x.owner)||typeof x.repo!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(x.repo)||['.','..'].includes(x.repo))throw new Error('INVALID_REPOSITORY_NAME');
  if(!Number.isSafeInteger(x.repositoryId)||x.repositoryId<1||!/^[A-Z][A-Z0-9_]{2,79}$/.test(x.tokenEnv))throw new Error('INVALID_GITHUB_CONFIGURATION');
  const applicationId=identifier(x.applicationId),key=`${x.repositoryId}:${applicationId}`;
  if(bindings.has(key))throw new Error('DUPLICATE_REPOSITORY_BINDING');bindings.add(key);
  return Object.freeze({...x,applicationId});
 });
}
export const publicRepository=({tokenEnv,...r})=>r;
export function loadIntakeConfig(env=process.env){
 const enabled=env.QIVVERA_GITHUB_INTAKE_ENABLED==='true';let raw=[];
 if(enabled){try{raw=JSON.parse(env.QIVVERA_GITHUB_REPOSITORIES_JSON??'[]');}catch{throw new Error('INVALID_GITHUB_CATALOGUE_JSON');}}
 return {enabled,repositories:validateRepositories(raw)};
}
export function normalizePull(raw,config,number){
 if(!raw||raw.number!==number||raw.base?.repo?.id!==config.repositoryId||raw.base?.repo?.full_name?.toLowerCase()!==`${config.owner}/${config.repo}`.toLowerCase())fail('GITHUB_REPOSITORY_MISMATCH','The provider returned a different repository or pull request.',502);
 if(raw.state!=='open'||raw.merged===true)fail('PULL_NOT_OPEN','Only an open pull request can be imported in this release.',409);
 if(!fullSHA(raw.head?.sha)||!fullSHA(raw.base?.sha)||!Number.isSafeInteger(raw.head?.repo?.id)||raw.head.repo.id<1)fail('PULL_SOURCE_UNAVAILABLE','The pull request does not have an available exact head and base.',409);
 const title=text(raw.title,'Pull-request title',256),body=raw.body===null?'':text(raw.body,'Pull-request body',65000,false);
 const snapshot={provider:'github',repositoryId:config.repositoryId,repository:`${config.owner}/${config.repo}`,pullNumber:number,
  url:`https://github.com/${config.owner}/${config.repo}/pull/${number}`,headSha:raw.head.sha,baseSha:raw.base.sha,
  headRepositoryId:raw.head.repo.id,headRepository:text(raw.head.repo.full_name,'Head repository',200),
  headRef:text(raw.head.ref,'Head ref',255),baseRef:text(raw.base.ref,'Base ref',255),title,body,draft:raw.draft===true,
  importedTitle:title.slice(0,160),binding:'PROVIDER_OBSERVED_HEAD_NOT_DEPLOYMENT_ATTESTATION',notice:'Pull-request text is untrusted context, never an accepted requirement, executable instruction or assurance result.'};
 return {...snapshot,fingerprint:digest(snapshot)};
}
export async function readPull(config,number,{secretEnv=process.env,fetchFn=fetch}={}){
 pullNumber(number);
 const token=secretEnv[config.tokenEnv];
 if(typeof token!=='string'||token.length<16||token.length>2048||/[\r\n]/.test(token))fail('GITHUB_CREDENTIAL_UNAVAILABLE','Ask the integration owner to configure repository read access.',503);
 let response;
 try{response=await fetchFn(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/pulls/${number}`,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':API_VERSION,'User-Agent':'Qivvera-source-intake','Authorization':`Bearer ${token}`}});}
 catch{fail('GITHUB_UNAVAILABLE','Source metadata could not be fetched. No change was imported.',503);}
 if(response.status===429||response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||response.headers.has('retry-after'))){
  const error=new InputError('GITHUB_RATE_LIMITED','Provider request limit reached. Retry later; no change was imported.',429);
  const retry=Number(response.headers.get('retry-after')),reset=Number(response.headers.get('x-ratelimit-reset'))*1000-Date.now();
  const requested=Number.isFinite(retry)&&retry>0?retry*1000:Number.isFinite(reset)&&reset>0?reset:60000;
  error.retryMs=Math.max(60000,Math.min(Number.MAX_SAFE_INTEGER-Date.now()-60000,requested));await response.body?.cancel();throw error;
 }
 if(response.status>=300&&response.status<400){await response.body?.cancel();fail('GITHUB_REPOSITORY_MOVED','The repository location changed. The integration owner must reauthorize its configured location.',409);}
 if(response.status!==200){await response.body?.cancel();fail(response.status===404?'PULL_NOT_ACCESSIBLE':'GITHUB_ACCESS_FAILED','Source metadata is unavailable with the configured access. No change was imported.',response.status===404?404:503);}
 if(!response.headers.get('content-type')?.includes('json')){await response.body?.cancel();fail('GITHUB_INVALID_RESPONSE','The provider returned an unexpected response.',502);}
 const reader=response.body?.getReader();if(!reader)fail('GITHUB_INVALID_RESPONSE','The provider returned no metadata.',502);
 let size=0,chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();fail('GITHUB_RESPONSE_TOO_LARGE','Source metadata exceeds the supported size.',502);}chunks.push(Buffer.from(value));}}
 catch(e){if(e instanceof InputError)throw e;fail('GITHUB_RESPONSE_INTERRUPTED','Provider metadata was interrupted; retry later.',503);}
 let raw;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('GITHUB_INVALID_RESPONSE','The provider returned invalid JSON.',502);}
 return normalizePull(raw,config,number);
}
