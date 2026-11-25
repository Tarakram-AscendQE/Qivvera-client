import { randomBytes, createHash, timingSafeEqual, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { validatePasswordHash } from './auth.mjs';
const kdf = promisify(scrypt);
const hash = s => createHash('sha256').update(s).digest('hex');
export const roles = Object.freeze(['AUTHOR', 'POLICY_AUTHORITY', 'VIEWER']);
/** Changes whenever the email, password hash or role set changes; a stored session must match it. */
export const credentialVersionOf = (email, passwordHash, accountRoles) => hash(`${email}\n${passwordHash}\n${[...new Set(accountRoles)].sort().join(',')}`);
export function normalizeAccounts(accounts) {
    if (!Array.isArray(accounts) || !accounts.length || accounts.length > 30)
        throw new Error('NAMED_ACCOUNTS_REQUIRED');
    const byEmail = new Map();
    for (const a of accounts) {
        if (!a || typeof a.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email) || !Array.isArray(a.roles) || !a.roles.length || a.roles.some(x => !roles.includes(x)))
            throw new Error('INVALID_ACCOUNT_CONFIGURATION');
        validatePasswordHash(a.passwordHash);
        const email = a.email.trim().toLowerCase();
        if (byEmail.has(email))
            throw new Error('DUPLICATE_ACCOUNT');
        const r = [...new Set(a.roles)].sort();
        byEmail.set(email, { email, passwordHash: a.passwordHash, roles: r, credentialVersion: credentialVersionOf(email, a.passwordHash, r) });
    }
    return byEmail;
}
/** Fixed, configuration-held accounts (tests and legacy single-process setups). */
export function staticAccountDirectory(accounts) {
    const configured = normalizeAccounts(accounts);
    return Object.freeze({
        source: 'configuration',
        find: async email => (typeof email === 'string' && configured.get(email.trim().toLowerCase())) || null,
        list: async () => [...configured.values()].map(a => ({ email: a.email, roles: [...a.roles] }))
    });
}
export function createWorkspaceAuth({ accounts, directory, repository, secureCookies = true, ttlMs = 8 * 60 * 60 * 1000, now = Date.now }) {
    const accountDirectory = directory ?? staticAccountDirectory(accounts);
    if (typeof accountDirectory?.find !== 'function')
        throw new Error('ACCOUNT_DIRECTORY_REQUIRED');
    // Unknown emails still run the full key derivation against a random hash, so timing does not reveal accounts.
    const dummy = `scrypt:${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`;
    if (!repository?.saveSession || !repository?.getSession || !repository?.consumeLoginAttempt)
        throw new Error('SHARED_SESSION_STORE_REQUIRED');
    const name = secureCookies ? '__Host-qivvera_session' : 'qivvera_session';
    const cookie = (token, age) => `${name}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
    const tokenFrom = req => (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) ?? '';
    const publicUser = a => ({ email: a.email, roles: [...a.roles] });
    return {
        async login(email, password) {
            const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
            const a = await accountDirectory.find(normalized);
            const allowed = await repository.consumeLoginAttempt(hash(a ? a.email : 'unknown-account'), now());
            if (!allowed)
                return { error: 'RATE_LIMITED', status: 429 };
            const target = a?.passwordHash ?? dummy;
            const [, salt, key] = target.split(':');
            const value = typeof password === 'string' && password.length <= 256 ? password : '';
            const computed = await kdf(value, salt, 64);
            const valid = timingSafeEqual(computed, Buffer.from(key, 'hex'));
            if (!a || !valid)
                return { error: 'INVALID_CREDENTIALS', status: 401 };
            const token = randomBytes(32).toString('hex'), session = { ...publicUser(a), csrfToken: randomBytes(24).toString('hex'), expiresAt: now() + ttlMs };
            await repository.saveSession(hash(token), a.email, session.csrfToken, session.expiresAt, a.credentialVersion);
            await accountDirectory.recordLogin?.(a.email);
            return { session, cookie: cookie(token, Math.floor(ttlMs / 1000)) };
        },
        async session(req) { const token = tokenFrom(req); if (!/^[a-f0-9]{64}$/.test(token))
            return null; const s = await repository.getSession(hash(token), now()); if (!s)
            return null; const a = await accountDirectory.find(s.email); if (!a || a.credentialVersion !== s.credentialVersion) {
            await repository.deleteSession(hash(token));
            return null;
        } return { ...publicUser(a), csrfToken: s.csrfToken, expiresAt: s.expiresAt }; },
        async logout(req) { const t = tokenFrom(req); if (/^[a-f0-9]{64}$/.test(t))
            await repository.deleteSession(hash(t)); return cookie('', 0); },
        validCsrf(req, session) { const supplied = req.headers['x-csrf-token']; if (typeof supplied !== 'string')
            return false; const a = Buffer.from(supplied), b = Buffer.from(session.csrfToken); return a.length === b.length && timingSafeEqual(a, b); },
    };
}
