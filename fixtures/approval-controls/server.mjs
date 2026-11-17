/** Synthetic reference application. Deliberately seeded fault modes are TEST FIXTURES,
 * not authentic AI-generated defects or production payment behaviour. Loopback only.
 */
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const artifactDigest='sha256:'+createHash('sha256').update(readFileSync(new URL('./server.mjs',import.meta.url))).digest('hex');
export function createApprovalTarget({mode='correct',sourceRevision='a'.repeat(40),requesterToken,approverToken,instanceId='reference-instance',environmentDigest='sha256:'+'e'.repeat(64)}={}){
  if(!['correct','self-approval-defect','reject-all','deny-but-mutate','unavailable','malformed','redirect','changing-identity','intermittent','repeat-approval-defect'].includes(mode))throw new Error('UNKNOWN_FIXTURE_MODE');
  if(!requesterToken||!approverToken||requesterToken===approverToken)throw new Error('EXPLICIT_DISTINCT_TEST_CREDENTIALS_REQUIRED');
  const records=new Map();let identityCalls=0,selfAttempts=0;
  return http.createServer(async(req,res)=>{
    const json=(status,b)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
    const auth=req.headers.authorization;
    const subject=auth===`Bearer ${requesterToken}`?'maker':auth===`Bearer ${approverToken}`?'checker':null;
    if(!subject)return json(401,{error:'UNAUTHENTICATED'});
    if(mode==='unavailable')return json(503,{error:'TEMPORARILY_UNAVAILABLE'});
    if(mode==='redirect'){res.writeHead(302,{Location:'http://169.254.169.254/'});res.end();return;}
    if(mode==='malformed'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{broken');return;}
    const path=new URL(req.url,'http://local').pathname;
    if(req.method==='GET'&&path==='/identity'){
      identityCalls++;return json(200,{contract:'qivvera.approval-http/1',sourceRevision:mode==='changing-identity'&&identityCalls>1?'b'.repeat(40):sourceRevision,artifactDigest,environmentDigest,instanceId});
    }
    if(req.method==='GET'&&path==='/me')return json(200,{subject});
    if(req.method==='POST'&&path==='/requests'){
      let data='',tooLarge=false;for await(const chunk of req){data+=chunk;if(data.length>4096)tooLarge=true;}
      if(tooLarge)return json(413,{error:'TOO_LARGE'});
      let b;try{b=JSON.parse(data);}catch{return json(400,{error:'INVALID_JSON'});}
      if(subject!=='maker'||typeof b.correlationId!=='string')return json(403,{error:'REQUEST_DENIED'});
      const r={id:randomUUID(),requesterId:subject,approverId:null,status:'PENDING',correlationId:b.correlationId};records.set(r.id,r);return json(201,r);
    }
    const m=path.match(/^\/requests\/([a-f0-9-]{36})(\/approve)?$/);
    if(m){const r=records.get(m[1]);if(!r)return json(404,{error:'NOT_FOUND'});
      if(req.method==='GET'&&!m[2])return json(200,r);
      if(req.method==='POST'&&m[2]){
        req.resume();
        if(r.status!=='PENDING'&&mode!=='repeat-approval-defect')return json(409,{error:'NOT_PENDING'});
        if(mode==='reject-all'||subject===r.requesterId&&mode!=='self-approval-defect'&&mode!=='deny-but-mutate'&&(mode!=='intermittent'||selfAttempts++>0))return json(403,{error:'SELF_APPROVAL_NOT_ALLOWED'});
        r.status='APPROVED';r.approverId=subject;
        if(mode==='deny-but-mutate'&&subject===r.requesterId)return json(403,{error:'SELF_APPROVAL_NOT_ALLOWED'});
        return json(200,r);
      }
    }
    return json(404,{error:'NOT_FOUND'});
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createApprovalTarget({mode:process.env.FIXTURE_MODE??'correct',sourceRevision:process.env.FIXTURE_SOURCE_REVISION??'a'.repeat(40),requesterToken:process.env.FIXTURE_MAKER_TOKEN,approverToken:process.env.FIXTURE_CHECKER_TOKEN});
 server.listen(Number(process.env.PORT??0),'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,artifactDigest})));
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
