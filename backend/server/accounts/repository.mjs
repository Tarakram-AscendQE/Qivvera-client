/** Database-held workspace accounts. Sign-in and every session check read this directory.
 *  Passwords are accepted only to be hashed; hashes never leave this module through list views. */
import { randomUUID, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { openDatabase } from '../workflow-store.mjs';
import { InputError, text } from '../workflow-input.mjs';
import { validatePasswordHash } from '../auth.mjs';
import { roles as ROLES, credentialVersionOf, normalizeAccounts } from '../workspace-auth.mjs';
import { migrateAccounts, requireAccounts } from './migration.mjs';

const kdf = promisify(scrypt);
const fail = (code, message, status = 400) => { throw new InputError(code, message, status); };
const stamp = t => new Date(t).toISOString();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;
const MAX_ACCOUNTS = 1000;
const STATUSES = ['ACTIVE', 'DISABLED'];

export function accountEmail(value) {
    const email = text(value, 'Email', 254).toLowerCase();
    if (!EMAIL.test(email)) fail('INVALID_EMAIL', 'Use a valid email address.');
    return email;
}
export function accountRoles(value) {
    if (!Array.isArray(value) || !value.length || value.some(r => !ROLES.includes(r)))
        fail('INVALID_ROLES', `Choose one or more roles from: ${ROLES.join(', ')}.`);
    return [...new Set(value)].sort();
}
export function accountPassword(value) {
    if (typeof value !== 'string' || value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH || /[\r\n]/.test(value))
        fail('WEAK_PASSWORD', `Use a password of ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters on one line.`);
    return value;
}
const displayName = value => text(value, 'Display name', 100, false) || null;
/** Same scrypt format as the configuration-held hashes (scrypt:<32 hex salt>:<128 hex key>). */
export async function hashAccountPassword(password) {
    accountPassword(password);
    const salt = randomBytes(16).toString('hex');
    return `scrypt:${salt}:${(await kdf(password, salt, 64)).toString('hex')}`;
}
const operator = value => text(value, 'Operator identity', 120);
const uniqueViolation = e => e?.code === '23505' || /UNIQUE constraint failed/i.test(e?.message ?? '');

/** SQL text for a database console. Values are validated first and single quotes are doubled. */
const literal = v => v === null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`;
function insertSql(id, account, actor, time) {
    return [
        `INSERT INTO workspace_users (id,email,display_name,password_hash,status,created_by,created_at,updated_at,password_changed_at) VALUES (${[id, account.email, account.displayName, account.passwordHash, 'ACTIVE', actor, time, time, time].map(literal).join(',')});`,
        ...account.roles.map(role => `INSERT INTO workspace_user_roles (user_id,role,granted_by,granted_at) VALUES (${[id, role, actor, time].map(literal).join(',')});`),
        `INSERT INTO activity (id,actor,action,entity_id,detail,created_at) VALUES (${[randomUUID(), actor, 'ACCOUNT_CREATED', id, `${account.email} roles ${account.roles.join(',')}`, time].map(literal).join(',')});`
    ];
}
export async function accountSql(command, input, { actor, now = Date.now } = {}) {
    const who = operator(actor), time = stamp(now());
    if (command === 'add') {
        const account = { email: accountEmail(input.email), displayName: displayName(input.displayName), roles: accountRoles(input.roles), passwordHash: await hashAccountPassword(input.password) };
        return ['BEGIN;', ...insertSql(randomUUID(), account, who, time), 'COMMIT;'].join('\n');
    }
    if (command === 'set-password') {
        const email = accountEmail(input.email), hash = await hashAccountPassword(input.password), id = `(SELECT id FROM workspace_users WHERE email=${literal(email)})`;
        return ['BEGIN;',
            `UPDATE workspace_users SET password_hash=${literal(hash)},password_changed_at=${literal(time)},updated_at=${literal(time)} WHERE email=${literal(email)};`,
            `DELETE FROM workspace_sessions WHERE email=${literal(email)};`,
            `INSERT INTO activity (id,actor,action,entity_id,detail,created_at) SELECT ${literal(randomUUID())},${literal(who)},'ACCOUNT_PASSWORD_CHANGED',${id},${literal(email)},${literal(time)} WHERE EXISTS ${id.replace('SELECT id', 'SELECT 1')};`,
            'COMMIT;'].join('\n');
    }
    if (command === 'import') {
        const accounts = [...normalizeAccounts(input.accounts).values()];
        return ['BEGIN;', ...accounts.flatMap(a => insertSql(randomUUID(), { email: a.email, displayName: null, roles: a.roles, passwordHash: a.passwordHash }, who, time)), 'COMMIT;'].join('\n');
    }
    throw new Error('UNSUPPORTED_ACCOUNT_SQL_COMMAND');
}

export async function openAccountRepository(options = {}) {
    const now = options.now ?? Date.now;
    const db = await openDatabase(options);
    try { if (options.migrate) await migrateAccounts(db); else await requireAccounts(db); }
    catch (e) { await db.close(); throw e; }
    const read = fn => db.transaction(fn, true);
    const audit = (c, actor, action, id, detail) => c.query('INSERT INTO activity (id,actor,action,entity_id,detail,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), actor, action, id, detail, stamp(now())]);
    const rolesOf = async (c, id) => (await c.query('SELECT role FROM workspace_user_roles WHERE user_id=$1 ORDER BY role', [id])).rows.map(r => r.role);
    async function userRow(c, email, lock = false) {
        const row = (await c.query('SELECT * FROM workspace_users WHERE email=$1' + (lock ? db.lock : ''), [accountEmail(email)])).rows[0];
        if (!row) fail('ACCOUNT_NOT_FOUND', 'No account exists for this email.', 404);
        return row;
    }
    async function activeAccounts(c) {
        const rows = (await c.query(`SELECT u.email,r.role FROM workspace_users u JOIN workspace_user_roles r ON r.user_id=u.id WHERE u.status='ACTIVE' ORDER BY u.email,r.role LIMIT ${MAX_ACCOUNTS * ROLES.length}`)).rows;
        const byEmail = new Map();
        for (const r of rows) byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r.role]);
        return [...byEmail].map(([email, roles]) => ({ email, roles }));
    }
    /** Refuse a change that would leave the workspace without any active, role-bearing account. */
    async function keepOneActive(c) {
        if (!(await activeAccounts(c)).length) fail('LAST_ACTIVE_ACCOUNT', 'At least one active account with a role must remain.', 409);
    }
    const revokeSessions = (c, email) => c.query('DELETE FROM workspace_sessions WHERE email=$1', [email]);
    async function insertAccount(c, id, account, actor) {
        const time = stamp(now());
        try {
            await c.query('INSERT INTO workspace_users (id,email,display_name,password_hash,status,created_by,created_at,updated_at,password_changed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7)',
                [id, account.email, account.displayName, account.passwordHash, 'ACTIVE', actor, time]);
        } catch (e) {
            if (uniqueViolation(e)) fail('ACCOUNT_EXISTS', 'An account already exists for this email.', 409);
            throw e;
        }
        for (const role of account.roles)
            await c.query('INSERT INTO workspace_user_roles (user_id,role,granted_by,granted_at) VALUES ($1,$2,$3,$4)', [id, role, actor, time]);
        await audit(c, actor, 'ACCOUNT_CREATED', id, `${account.email} roles ${account.roles.join(',')}`);
    }
    const view = async (c, row) => ({ email: row.email, displayName: row.display_name ?? null, status: row.status, roles: await rolesOf(c, row.id),
        createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, passwordChangedAt: row.password_changed_at, lastLoginAt: row.last_login_at ?? null });

    return {
        source: 'database',
        close: () => db.close(),
        healthy: () => db.healthy(),

        // ---- Sign-in directory (used by every login and session check) ----
        /** Active account with its hash and roles, or null. Invalid input is a non-match, never an error. */
        async find(value) {
            if (typeof value !== 'string' || value.length > 254 || !EMAIL.test(value.trim())) return null;
            const email = value.trim().toLowerCase();
            return read(async c => {
                const row = (await c.query('SELECT id,email,password_hash,status FROM workspace_users WHERE email=$1', [email])).rows[0];
                if (!row || row.status !== 'ACTIVE') return null;
                const roles = await rolesOf(c, row.id);
                if (!roles.length) return null;
                try { validatePasswordHash(row.password_hash); }
                catch { console.error('ACCOUNT_PASSWORD_HASH_INVALID'); return null; }
                return { email: row.email, passwordHash: row.password_hash, roles, credentialVersion: credentialVersionOf(row.email, row.password_hash, roles) };
            });
        },
        /** Active identities and roles only: no hashes, statuses or timestamps. */
        list: () => read(activeAccounts),
        async recordLogin(email) {
            try { await db.transaction(c => c.query('UPDATE workspace_users SET last_login_at=$1 WHERE email=$2', [stamp(now()), email])); }
            catch { console.error('ACCOUNT_LOGIN_RECORD_FAILED'); }
        },
        countActive: () => read(async c => (await activeAccounts(c)).length),
        countAll: () => read(async c => Number((await c.query('SELECT COUNT(*) AS n FROM workspace_users')).rows[0].n)),

        // ---- Operator administration (CLI; requires write access the web runtime does not need) ----
        // Sequential on purpose: one database client must not run overlapping queries.
        listAll: () => read(async c => {
            const views = [];
            for (const row of (await c.query(`SELECT * FROM workspace_users ORDER BY email LIMIT ${MAX_ACCOUNTS}`)).rows) views.push(await view(c, row));
            return views;
        }),
        async create(input, actor) {
            const who = operator(actor);
            const account = { email: accountEmail(input.email), displayName: displayName(input.displayName), roles: accountRoles(input.roles), passwordHash: await hashAccountPassword(input.password) };
            return db.transaction(async c => {
                if ((await c.query('SELECT id FROM workspace_users WHERE email=$1', [account.email])).rows[0]) fail('ACCOUNT_EXISTS', 'An account already exists for this email.', 409);
                const id = randomUUID();
                await insertAccount(c, id, account, who);
                return view(c, (await c.query('SELECT * FROM workspace_users WHERE id=$1', [id])).rows[0]);
            });
        },
        async setPassword(email, password, actor) {
            const who = operator(actor), hash = await hashAccountPassword(password), time = stamp(now());
            return db.transaction(async c => {
                const row = await userRow(c, email, true);
                await c.query('UPDATE workspace_users SET password_hash=$1,password_changed_at=$2,updated_at=$2 WHERE id=$3', [hash, time, row.id]);
                await revokeSessions(c, row.email);
                await audit(c, who, 'ACCOUNT_PASSWORD_CHANGED', row.id, row.email);
                return view(c, (await c.query('SELECT * FROM workspace_users WHERE id=$1', [row.id])).rows[0]);
            });
        },
        async setRoles(email, roles, actor) {
            const who = operator(actor), next = accountRoles(roles), time = stamp(now());
            return db.transaction(async c => {
                const row = await userRow(c, email, true);
                await c.query('DELETE FROM workspace_user_roles WHERE user_id=$1', [row.id]);
                for (const role of next) await c.query('INSERT INTO workspace_user_roles (user_id,role,granted_by,granted_at) VALUES ($1,$2,$3,$4)', [row.id, role, who, time]);
                await c.query('UPDATE workspace_users SET updated_at=$1 WHERE id=$2', [time, row.id]);
                await keepOneActive(c);
                await revokeSessions(c, row.email);
                await audit(c, who, 'ACCOUNT_ROLES_CHANGED', row.id, `${row.email} roles ${next.join(',')}`);
                return view(c, (await c.query('SELECT * FROM workspace_users WHERE id=$1', [row.id])).rows[0]);
            });
        },
        async setStatus(email, status, actor) {
            const who = operator(actor);
            if (!STATUSES.includes(status)) fail('INVALID_STATUS', 'Choose ACTIVE or DISABLED.');
            return db.transaction(async c => {
                const row = await userRow(c, email, true);
                if (row.status !== status) {
                    await c.query('UPDATE workspace_users SET status=$1,updated_at=$2 WHERE id=$3', [status, stamp(now()), row.id]);
                    if (status === 'DISABLED') { await keepOneActive(c); await revokeSessions(c, row.email); }
                    await audit(c, who, status === 'DISABLED' ? 'ACCOUNT_DISABLED' : 'ACCOUNT_ENABLED', row.id, row.email);
                }
                return view(c, (await c.query('SELECT * FROM workspace_users WHERE id=$1', [row.id])).rows[0]);
            });
        },
        /** One-time move of configuration-held accounts (already-hashed) into an EMPTY account table. */
        async importAccounts(accounts, actor) {
            const who = operator(actor), list = [...normalizeAccounts(accounts).values()];
            return db.transaction(async c => {
                if (db.driver === 'postgres') await c.query('SELECT pg_advisory_xact_lock(78124425)');
                if (Number((await c.query('SELECT COUNT(*) AS n FROM workspace_users')).rows[0].n) > 0) fail('ACCOUNTS_ALREADY_PRESENT', 'The account table already contains accounts; nothing was imported.', 409);
                for (const a of list) await insertAccount(c, randomUUID(), { email: a.email, displayName: null, roles: a.roles, passwordHash: a.passwordHash }, who);
                return list.map(a => ({ email: a.email, roles: a.roles }));
            });
        }
    };
}

/** Runtime wiring shared by the long-running server and the serverless entry.
 *  Local review storage may seed an empty table once from configuration; hosted storage never writes accounts. */
export async function openWorkspaceAccounts(cfg, { log = console } = {}) {
    const accounts = await openAccountRepository({ ...cfg.database, migrate: cfg.database.migrate === true });
    try {
        if (cfg.database.migrate === true && cfg.accounts && await accounts.countAll() === 0) {
            const imported = await accounts.importAccounts(cfg.accounts, 'bootstrap:local-configuration');
            log.log(`Imported ${imported.length} configured account(s) into the local account table. Sign-in now uses the database.`);
        } else if (cfg.accounts) {
            log.warn('ACCOUNT_CONFIGURATION_IGNORED: sign-in uses database accounts; QIVVERA_ACCOUNTS_JSON / OWNER_* are not used.');
        }
        if (await accounts.countActive() === 0) throw new Error('NAMED_ACCOUNTS_REQUIRED');
        return accounts;
    } catch (e) { await accounts.close(); throw e; }
}
