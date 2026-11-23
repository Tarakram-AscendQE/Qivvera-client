/** GitHub REST pull metadata reader. No code execution, repository writes or result publication. */
import {InputError,fields,identifier,text} from '../workflow-input.mjs';
import {digest} from '../assurance/contracts.mjs';
import {webhookSecret} from './webhook.mjs';
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
 // Webhook receipt is enabled by its shared secret and is bound to the same operator-configured repositories.
 const secret=webhookSecret(env.QIVVERA_GITHUB_WEBHOOK_SECRET);
 if(secret&&!enabled)throw new Error('GITHUB_WEBHOOK_REQUIRES_INTAKE');
 return {enabled,repositories:validateRepositories(raw),webhook:{enabled:!!secret,secret}};
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
/** Bounded read-only GET of one GitHub REST path for a configured repository. */
async function requestJson(config,path,{secretEnv=process.env,fetchFn=fetch}={}){
 const token=secretEnv[config.tokenEnv];
 if(typeof token!=='string'||token.length<16||token.length>2048||/[\r\n]/.test(token))fail('GITHUB_CREDENTIAL_UNAVAILABLE','Ask the integration owner to configure repository read access.',503);
 let response;
 try{response=await fetchFn(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':API_VERSION,'User-Agent':'Qivvera-source-intake','Authorization':`Bearer ${token}`}});}
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
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('GITHUB_INVALID_RESPONSE','The provider returned invalid JSON.',502);}
}
export async function readPull(config,number,options={}){
 pullNumber(number);
 return normalizePull(await requestJson(config,`/pulls/${number}`,options),config,number);
}
export const PULL_LIST_LIMIT=30;
/** Display-only summary of an open pull request. Not an import, requirement or assurance input. */
export function normalizePullSummary(raw,config){
 if(!raw||!Number.isSafeInteger(raw.number)||raw.number<1||raw.base?.repo?.id!==config.repositoryId||raw.base?.repo?.full_name?.toLowerCase()!==`${config.owner}/${config.repo}`.toLowerCase())fail('GITHUB_REPOSITORY_MISMATCH','The provider returned a different repository or pull request.',502);
 if(raw.state!=='open')fail('GITHUB_INVALID_RESPONSE','The provider listed a pull request that is not open.',502);
 const updated=Date.parse(raw.updated_at);
 return {number:raw.number,title:text(raw.title,'Pull-request title',256),author:typeof raw.user?.login==='string'?raw.user.login.slice(0,100):'unknown',
  draft:raw.draft===true,headRef:text(raw.head?.ref,'Head ref',255),baseRef:text(raw.base?.ref,'Base ref',255),headSha:fullSHA(raw.head?.sha)?raw.head.sha:null,
  updatedAt:Number.isFinite(updated)?new Date(updated).toISOString():null,url:`https://github.com/${config.owner}/${config.repo}/pull/${raw.number}`};
}
export async function listOpenPulls(config,options={}){
 const raw=await requestJson(config,`/pulls?state=open&sort=updated&direction=desc&per_page=${PULL_LIST_LIMIT}`,options);
 if(!Array.isArray(raw)||raw.length>PULL_LIST_LIMIT)fail('GITHUB_INVALID_RESPONSE','The provider returned an unexpected pull-request list.',502);
 return raw.map(p=>normalizePullSummary(p,config));
}
