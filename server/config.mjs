import { normalizeAccounts } from './workspace-auth.mjs';
import { validatePasswordHash } from './auth.mjs';
import { scryptSync } from 'node:crypto';
export function normalizeOrigin(value, { hosted = true } = {}) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error('PUBLIC_ORIGIN_REQUIRED');
    const v = value.trim();
    let u;
    try {
        u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    }
    catch {
        throw new Error('INVALID_PUBLIC_ORIGIN');
    }
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || !['http:', 'https:'].includes(u.protocol))
        throw new Error('INVALID_PUBLIC_ORIGIN');
    if (hosted && u.protocol !== 'https:')
        throw new Error('HOSTED_HTTPS_REQUIRED');
    if (!hosted && u.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
        throw new Error('LOCAL_ORIGIN_MUST_BE_LOOPBACK');
    return u.origin;
}
function ownerHash(env) {
    if (env.OWNER_PASSWORD_HASH) {
        const trimmed = env.OWNER_PASSWORD_HASH.trim().replace(/^["']|["']$/g, '');
        validatePasswordHash(trimmed);
        return trimmed;
    }
    if (!env.OWNER_PASSWORD)
        throw new Error('OWNER_CREDENTIAL_REQUIRED');
    const pwd = env.OWNER_PASSWORD.trim().replace(/^["']|["']$/g, '');
    if (pwd.length < 16 || pwd.length > 256)
        throw new Error('OWNER_PASSWORD_LENGTH_INVALID');
    const salt = (env.OWNER_PASSWORD_SALT || 'f07b5fc4f5e96ecda7346566ff5fe913').trim();
    return `scrypt:${salt}:${scryptSync(pwd, salt, 64).toString('hex')}`;
}
export function loadConfig(env = process.env) {
    const hosted = env.VERCEL === '1' || env.NODE_ENV === 'production';
    const port = Number(env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('INVALID_PORT');
    const rawOrigin = env.PUBLIC_ORIGIN || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : hosted ? undefined : `http://127.0.0.1:${port}`);
    const publicOrigin = normalizeOrigin(rawOrigin, { hosted });
    let accounts;
    if (env.QIVVERA_ACCOUNTS_JSON) {
        try {
            accounts = JSON.parse(env.QIVVERA_ACCOUNTS_JSON);
        }
        catch {
            throw new Error('INVALID_ACCOUNT_JSON');
        }
    }
    else {
        if (!env.OWNER_EMAIL)
            throw new Error('NAMED_ACCOUNTS_REQUIRED');
        accounts = [{ email: env.OWNER_EMAIL, passwordHash: ownerHash(env), roles: ['AUTHOR', 'POLICY_AUTHORITY'] }];
    }
    normalizeAccounts(accounts);
    const reviewMode = env.QIVVERA_REVIEW_MODE ?? 'independent';
    if (!['independent', 'founder-review'].includes(reviewMode))
        throw new Error('INVALID_REVIEW_MODE');
    const driver = env.DATABASE_URL ? 'postgres' : 'sqlite';
    if (hosted && driver !== 'postgres')
        throw new Error('HOSTED_POSTGRES_REQUIRED');
    if (!hosted && driver === 'sqlite' && env.QIVVERA_LOCAL_SQLITE !== 'true')
        throw new Error('EXPLICIT_LOCAL_SQLITE_REQUIRED');
    const host = hosted ? '0.0.0.0' : env.HOST ?? '127.0.0.1';
    if (!hosted && !['localhost', '127.0.0.1', '::1'].includes(host))
        throw new Error('LOCAL_BIND_MUST_BE_LOOPBACK');
    return { hosted, host, port, publicOrigin, accounts, reviewMode, releaseRevision: env.VERCEL_GIT_COMMIT_SHA ?? env.QIVVERA_RELEASE_SHA ?? 'unrecorded', database: { driver, path: env.DATABASE_PATH ?? 'data/qivvera.sqlite', connectionString: env.DATABASE_URL, sslMode: env.DATABASE_SSL_MODE ?? 'verify-full', ca: env.DATABASE_CA, migrate: !hosted && env.QIVVERA_MIGRATE_LOCAL === 'true', reviewMode } };
}
