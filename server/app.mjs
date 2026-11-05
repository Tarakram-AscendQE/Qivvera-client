import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createAuth, digest } from './auth.mjs';
import { fields, InputError } from './errors.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
async function body(req) {
  if(!(req.headers['content-type']??'').startsWith('application/json')) throw new InputError('JSON_REQUIRED','Send JSON.',415);
  if(Number(req.headers['content-length']??0)>16384){req.resume();throw new InputError('BODY_TOO_LARGE','Request exceeds 16 KB.',413);}
  return new Promise((resolveBody,reject)=>{
    let n=0,chunks=[],oversize=false;
    req.on('data',chunk=>{n+=chunk.length;if(n>16384){if(!oversize)reject(new InputError('BODY_TOO_LARGE','Request exceeds 16 KB.',413));oversize=true;chunks=[];return;}if(!oversize)chunks.push(chunk);});
    req.on('end',()=>{if(oversize)return;try{resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new InputError('INVALID_JSON','The request is not valid JSON.'));}});
    req.on('error',reject);
    req.on('aborted',()=>reject(new InputError('REQUEST_ABORTED','The request was interrupted.')));
  });
}
export function createApplicationServer({repository,ownerEmail,passwordHash,publicOrigin,secureCookies=false,webRoot=resolve('web')}) {
  let normalizedOrigin = '';
  try {
    let s = (publicOrigin || '').trim();
    if (s && !s.startsWith('http://') && !s.startsWith('https://')) s = 'https://' + s;
    if (s) normalizedOrigin = new URL(s).origin;
  } catch {}
  const effectiveSecureCookies = Boolean(secureCookies && normalizedOrigin.startsWith('https://'));
  const auth=createAuth({ownerEmail,passwordHash,secureCookies:effectiveSecureCookies});
  function loadAsset(filename) {
    const candidates = [
      resolve(webRoot, filename),
      resolve(process.cwd(), 'web', filename),
      resolve(process.cwd(), 'public', filename),
      resolve(__dirname, '..', 'web', filename),
      resolve(__dirname, '..', 'public', filename)
    ];
    for (const p of candidates) {
      try { return readFileSync(p); } catch {}
    }
    return Buffer.from('');
  }
  const assets=new Map([
    ['/',[loadAsset('index.html'),'text/html; charset=utf-8']],
    ['/app.js',[loadAsset('app.js'),'text/javascript; charset=utf-8']],
    ['/app.css',[loadAsset('app.css'),'text/css; charset=utf-8']],
    ['/logo.svg',[loadAsset('logo.svg'),'image/svg+xml; charset=utf-8']],
  ]);
  return http.createServer({requestTimeout:15000,headersTimeout:10000,maxHeaderSize:16384},async(req,res)=>{
    const requestId=randomUUID();
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Request-ID',requestId);
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if(secureCookies)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      let rawPath = req.url;
      if (req.headers['x-matched-path'] && !req.headers['x-matched-path'].includes('/api/index')) {
        rawPath = req.headers['x-matched-path'];
      } else if (req.headers['x-forwarded-url']) {
        rawPath = req.headers['x-forwarded-url'];
      }
      const path=new URL(rawPath,'http://internal').pathname;
      if(req.method==='GET' && path==='/healthz') return json(res,(await repository.healthy())?200:503,{service:'qivvera-registry',version:'0.1.0',process:'running',storage:repository.isAsync?'postgresql':'local-review',assuranceExecution:false});
      if(req.method==='GET' && assets.has(path)){const[a,type]=assets.get(path);res.writeHead(200,{'Content-Type':type});res.end(a);return;}
      let originHost = '';
      try { if (req.headers.origin) originHost = new URL(req.headers.origin).host; } catch {}
      const originAllowed = !normalizedOrigin || req.headers.origin === normalizedOrigin ||
        (originHost && (originHost === req.headers.host || originHost.endsWith('.vercel.app'))) ||
        (req.headers.origin === `http://localhost:${process.env.PORT || 3000}`) ||
        (req.headers.origin === `http://127.0.0.1:${process.env.PORT || 3000}`);
      if(req.method!=='GET' && !originAllowed) return json(res,403,{error:'ORIGIN_REJECTED',message:'This request did not originate from this workspace.',requestId});
      if(req.method==='POST' && path==='/api/session'){
        const b=await body(req);fields(b,['email','password']);
        const r=auth.login(b.email,b.password,req.socket.remoteAddress);
        if(r.error) return json(res,r.status,{error:r.error,message:r.status===429?'Too many sign-in attempts. Try again in 10 minutes.':'Email or password not recognized.',requestId});
        if(repository.saveSession && r.tokenHash) {
          await repository.saveSession(r.tokenHash, r.session.email, r.session.csrfToken, r.session.expiresAt);
        }
        res.setHeader('Set-Cookie',r.cookie);return json(res,200,{email:r.session.email,csrfToken:r.session.csrfToken});
      }
      let session=auth.session(req);
      if(!session && repository.getSession) {
        const rawToken = auth.readToken(req);
        if(/^[a-f0-9]{64}$/.test(rawToken)) {
          const dbSession = await repository.getSession(digest(rawToken));
          if(dbSession) {
            auth.setSession(digest(rawToken), dbSession);
            session = dbSession;
          }
        }
      }
      if(!session) return json(res,401,{error:'AUTH_REQUIRED',message:'Sign in to your workspace.',requestId});
      if(req.method==='GET' && path==='/api/session')return json(res,200,{email:session.email,csrfToken:session.csrfToken});
      if(req.method!=='GET' && !auth.validCsrf(req,session))return json(res,403,{error:'CSRF_REJECTED',message:'Reload the page before submitting this request.',requestId});
      if(req.method==='DELETE' && path==='/api/session'){
        if(repository.deleteSession) {
          const rawToken = auth.readToken(req);
          if(/^[a-f0-9]{64}$/.test(rawToken)) {
            await repository.deleteSession(digest(rawToken));
          }
        }
        res.setHeader('Set-Cookie',auth.logout(req));
        return json(res,200,{signedOut:true});
      }
      if(req.method==='GET' && path==='/api/workspace')return json(res,200,{applications:await repository.listApplications(),changes:await repository.listChanges(),activity:await repository.listActivity(),capabilities:{registry:true,authorityDecisions:false,verifierExecution:false,evidenceCollection:false,assuranceDisposition:false},storage:repository.isAsync?'postgresql':'local-review'});
      if(req.method==='GET' && path==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="qivvera-workspace.json"');return json(res,200,await repository.exportWorkspace());}
      if(req.method==='GET' && path==='/api/applications')return json(res,200,await repository.listApplications());
      if(req.method==='POST' && path==='/api/applications')return json(res,201,await repository.createApplication(await body(req),session.email));
      const aMatch=path.match(/^\/api\/applications\/([a-f0-9-]{36})$/);
      if(req.method==='GET' && aMatch){const app=await repository.getApplication(aMatch[1]);if(!app)throw new InputError('APPLICATION_NOT_FOUND','This application was not found.',404);return json(res,200,app);}
      if(req.method==='POST' && path==='/api/changes')return json(res,201,await repository.createChange(await body(req),session.email));
      const c=path.match(/^\/api\/changes\/([a-f0-9-]{36})$/);
      if(req.method==='GET' && c){const change=await repository.getChange(c[1]);if(!change)throw new InputError('CHANGE_NOT_FOUND','This change was not found.',404);return json(res,200,change);}
      const o=path.match(/^\/api\/changes\/([a-f0-9-]{36})\/obligations$/);
      if(req.method==='POST' && o)return json(res,201,await repository.addObligation(o[1],await body(req),session.email));
      const edit=path.match(/^\/api\/obligations\/([a-f0-9-]{36})$/);
      if(req.method==='PATCH' && edit)return json(res,200,await repository.editObligation(edit[1],await body(req),session.email));
      return json(res,404,{error:'NOT_FOUND',message:'This capability is not available in this release.',requestId});
    }catch(error){
      if(error instanceof InputError)return json(res,error.status,{error:error.code,message:error.message,requestId});
      // Do not log request bodies, source text, account credentials or database internals.
      console.error(JSON.stringify({event:'request_failed',requestId}));
      return json(res,500,{error:'INTERNAL_ERROR',message:'The request could not be completed. Your previous saved data is unchanged.',requestId});
    }
  });
}
