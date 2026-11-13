/** Restricted transport for an operator-registered origin, never a URL from an API request.
 * IPv4 only in this bounded release. DNS addresses are vetted and pinned per connection.
 * Redirects, credentials in URLs, arbitrary paths and unbounded responses are rejected.
 */
import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
export class TransportError extends Error {constructor(code){super(code);this.code=code;}}
export function permittedAddress(address,{allowLoopback=false}={}) {
  if(isIP(address)!==4)return false;
  const [a,b,c]=address.split('.').map(Number);
  if(a===127)return allowLoopback;
  if(a===0||a===10||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a>=224)return false;
  if(a===192&&b===0||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)return false;
  return true;
}
export function createTransport(target,{allowLoopback=false,timeoutMs=2500,lookupFn=lookup}={}) {
  const origin=new URL(target.origin);
  if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new TransportError('TARGET_ORIGIN_INVALID');
  const loop=['localhost','127.0.0.1'].includes(origin.hostname);
  if(origin.protocol!=='https:'&&!(allowLoopback&&loop&&origin.protocol==='http:'))throw new TransportError('TARGET_HTTPS_REQUIRED');
  return async function request(method,path,{token,data}={}) {
    if(!['GET','POST'].includes(method)||!/^\/(identity|me|requests(?:\/[a-zA-Z0-9_-]{1,80}(?:\/approve)?)?)$/.test(path))throw new TransportError('TARGET_PATH_REJECTED');
    if(typeof token!=='string'||token.length<16||token.length>1024||/[\r\n]/.test(token))throw new TransportError('TARGET_CREDENTIAL_MISSING');
    let addresses;
    let dnsTimer;
    try {addresses=isIP(origin.hostname)?[{address:origin.hostname,family:4}]:await Promise.race([lookupFn(origin.hostname,{all:true,family:4}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new Error()),timeoutMs);})]);}
    catch{throw new TransportError('TARGET_DNS_FAILED');}
    finally{clearTimeout(dnsTimer);}
    if(!addresses.length||addresses.some(x=>!permittedAddress(x.address,{allowLoopback:allowLoopback&&loop})))throw new TransportError('TARGET_ADDRESS_REJECTED');
    const address=addresses[0].address;
    const payload=data===undefined?null:JSON.stringify(data);
    if(payload&&Buffer.byteLength(payload)>8192)throw new TransportError('TARGET_REQUEST_TOO_LARGE');
    return await new Promise((resolve,reject)=>{
      let settled=false,timer;
      const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
      const client=origin.protocol==='https:'?https:http;
      const req=client.request({protocol:origin.protocol,hostname:origin.hostname,port:origin.port||undefined,path,method,agent:false,rejectUnauthorized:true,
        lookup:(_h,opts,cb)=>opts?.all?cb(null,[{address,family:4}]):cb(null,address,4),
        headers:{'Accept':'application/json','Authorization':`Bearer ${token}`,...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{
          if(res.statusCode>=300&&res.statusCode<400){res.resume();return done(new TransportError('TARGET_REDIRECT_REJECTED'));}
          let size=0,chunks=[];
          res.on('data',chunk=>{size+=chunk.length;if(size>32768){done(new TransportError('TARGET_RESPONSE_TOO_LARGE'));res.destroy();req.destroy();}else chunks.push(chunk);});
          res.on('error',()=>done(new TransportError('TARGET_RESPONSE_INTERRUPTED')));
          res.on('end',()=>{
            if(settled)return;
            if(!(res.headers['content-type']??'').toLowerCase().startsWith('application/json'))return done(new TransportError('TARGET_NON_JSON_RESPONSE'));
            try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();done(null,{status:res.statusCode,body});}
            catch{done(new TransportError('TARGET_MALFORMED_JSON'));}
          });
        });
      timer=setTimeout(()=>{done(new TransportError('TARGET_TIMEOUT'));req.destroy();},timeoutMs);
      req.on('error',()=>done(new TransportError('TARGET_CONNECTION_FAILED')));
      if(payload)req.write(payload);req.end();
    });
  };
}
