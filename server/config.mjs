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
        validatePasswordHash(env.OWNER_PASSWORD_HASH.trim());
        return env.OWNER_PASSWORD_HASH.trim();
    }
    if (!env.OWNER_PASSWORD)
        throw new Error('OWNER_CREDENTIAL_REQUIRED');
    // Prefer a precomputed scrypt hash. Raw-password compatibility requires an explicit
    // random stable salt, stored with the secret configuration, never derived from a password.
    if (env.OWNER_PASSWORD.length < 16 || env.OWNER_PASSWORD.length > 256)
        throw new Error('OWNER_PASSWORD_LENGTH_INVALID');
    const salt = env.OWNER_PASSWORD_SALT;
    if (typeof salt !== 'string' || !/^[a-f0-9]{32}$/.test(salt))
        throw new Error('OWNER_PASSWORD_SALT_REQUIRED');
    return `scrypt:${salt}:${scryptSync(env.OWNER_PASSWORD, salt, 64).toString('hex')}`;
}
/** Configured accounts are optional: sign-in uses the database account table. When present they are
 *  validated and only seed an EMPTY local table once (see server/accounts/repository.mjs). */
export function configuredAccounts(env = process.env) {
    let accounts = null;
    if (env.QIVVERA_ACCOUNTS_JSON) {
        try {
            accounts = JSON.parse(env.QIVVERA_ACCOUNTS_JSON);
        }
        catch {
            throw new Error('INVALID_ACCOUNT_JSON');
        }
    }
    else if (env.OWNER_EMAIL) {
        accounts = [{ email: env.OWNER_EMAIL, passwordHash: ownerHash(env), roles: ['AUTHOR', 'POLICY_AUTHORITY'] }];
    }
    if (accounts) normalizeAccounts(accounts);
    return accounts;
}
export function loadConfig(env = process.env) {
    const hosted = env.VERCEL === '1' || env.NODE_ENV === 'production';
    const port = Number(env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('INVALID_PORT');
    const rawOrigin = env.PUBLIC_ORIGIN || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : hosted ? undefined : `http://127.0.0.1:${port}`);
    const publicOrigin = normalizeOrigin(rawOrigin, { hosted });
    const accounts = configuredAccounts(env);
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
