import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export function hashPassword(password) {
  if(typeof password !== 'string' || password.length<16 || password.length>256) throw new Error('Owner password must be 16–256 characters.');
  const salt=randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export function validatePasswordHash(hash) {
  if(typeof hash!=='string' || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) throw new Error('Configure a valid owner password hash.');
}
export function verifyPassword(password,hash) {
  if(typeof password!=='string' || password.length>256) return false;
  const [,salt,key]=hash.split(':');
  return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex'));
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function createAuth({ownerEmail,passwordHash,accounts=[],secureCookies=false,ttlMs=8*60*60*1000,now=Date.now}) {
  validatePasswordHash(passwordHash);
  if(!ownerEmail || typeof ownerEmail!=='string' || !ownerEmail.includes('@')) throw new Error('Configure owner email.');
  const owner=ownerEmail.trim().toLowerCase(), sessions=new Map(), attempts=new Map();
  const knownAccounts = new Map();
  knownAccounts.set(owner, passwordHash);
  for (const acc of accounts) {
    if (acc && acc.email && acc.passwordHash) {
      knownAccounts.set(acc.email.trim().toLowerCase(), acc.passwordHash);
    }
  }
  const cookieName=secureCookies?'__Host-qivvera_session':'qivvera_session';
  const cookie = (value,age) => `${cookieName}=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${secureCookies?'; Secure':''}`;
  const readToken=req=> (req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)??'';
  function cleanup(){ for(const [k,s] of sessions) if(s.expiresAt<=now()) sessions.delete(k); for(const [k,a] of attempts) if(a.until<=now()) attempts.delete(k); }
  return {
    readToken,
    login(email,password,remoteAddress='unknown') {
      cleanup();
      const key=digest(remoteAddress), a=attempts.get(key);
      if(a && a.count>=5) return {error:'RATE_LIMITED',status:429};
      if(attempts.size>=1000 && !a) return {error:'RATE_LIMITED',status:429};
      const requestedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      const targetHash = knownAccounts.get(requestedEmail) || passwordHash;
      const valid = knownAccounts.has(requestedEmail) && verifyPassword(password, targetHash);
      if(!valid) {
        attempts.set(key,{count:(a?.count??0)+1,until:a?.until??now()+10*60*1000});
        return {error:'INVALID_CREDENTIALS',status:401};
      }
      attempts.delete(key);
      if(sessions.size>=20) sessions.delete(sessions.keys().next().value);
      const token=randomBytes(32).toString('hex'),session={email:requestedEmail,csrfToken:randomBytes(24).toString('hex'),expiresAt:now()+ttlMs};
      sessions.set(digest(token),session);
      return {session,cookie:cookie(token,Math.floor(ttlMs/1000)),token,tokenHash:digest(token)};
    },
    session(req) { const t=readToken(req); if(!/^[a-f0-9]{64}$/.test(t)) return null; const s=sessions.get(digest(t)); if(!s || s.expiresAt<=now()){sessions.delete(digest(t));return null;}return s; },
    setSession(tokenHash, s) { sessions.set(tokenHash, s); },
    logout(req) {sessions.delete(digest(readToken(req)));return cookie('',0);},
    validCsrf(req,session) {const supplied=req.headers['x-csrf-token'];if(typeof supplied!=='string')return false;const a=Buffer.from(supplied),b=Buffer.from(session.csrfToken);return a.length===b.length && timingSafeEqual(a,b);},
  };
}
