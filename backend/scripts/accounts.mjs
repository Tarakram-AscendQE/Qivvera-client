/** Operator account administration. Explicitly invoked; never run by the web runtime, build or tests.
 *  Passwords are read from a hidden prompt (or QIVVERA_ACCOUNT_PASSWORD for automation), never argv. */
import { userInfo } from 'node:os';
import { openDatabase } from '../server/workflow-store.mjs';
import { openAccountRepository, accountSql, PASSWORD_MIN_LENGTH } from '../server/accounts/repository.mjs';
import { configuredAccounts as readConfiguredAccounts } from '../server/config.mjs';

const USAGE = `Qivvera account administration

Usage:  npm run accounts -- <command> [arguments]
        npm run accounts:local -- <command> [arguments]   (uses .env.local)

Commands that change the database:
  list                                   Show all accounts (no password hashes)
  add <email> --roles R1,R2 [--name N]   Create an account (password prompted)
  set-password <email>                   Replace a password; signs the user out
  set-roles <email> --roles R1,R2        Replace roles; signs the user out
  disable <email> | enable <email>       Block or restore sign-in (accounts are never deleted)
  import-env                             Copy QIVVERA_ACCOUNTS_JSON / OWNER_* into an EMPTY table

Commands that only PRINT reviewed SQL (no database connection), e.g. for a hosted SQL console:
  sql add <email> --roles R1,R2 [--name N]
  sql set-password <email>
  sql import-env

Roles: AUTHOR, POLICY_AUTHORITY, VIEWER
Database: DATABASE_URL (PostgreSQL).
Operator identity recorded in the activity log: QIVVERA_OPERATOR, else the OS user name.`;

class UsageError extends Error {}
function parse(argv) {
    const positional = [], options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--roles' || arg === '--name') {
            if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value.`);
            options[arg.slice(2)] = argv[++i];
        } else if (arg.startsWith('--')) throw new UsageError(`Unknown option ${arg}.`);
        else positional.push(arg);
    }
    return { positional, roles: options.roles?.split(',').map(r => r.trim().toUpperCase()).filter(Boolean), name: options.name };
}
function requireArgs(positional, count, label) {
    if (positional.length !== count) throw new UsageError(`Expected: ${label}`);
}
function hiddenPrompt(question) {
    const stdin = process.stdin;
    if (!stdin.isTTY) return Promise.reject(new UsageError('No terminal for a hidden password prompt. Set QIVVERA_ACCOUNT_PASSWORD for non-interactive use.'));
    return new Promise((resolve, reject) => {
        let value = '';
        const done = (fn, arg) => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); fn(arg); };
        const onData = chunk => {
            for (const ch of chunk) {
                if (ch === '\r' || ch === '\n') return done(resolve, value);
                if (ch === '\u0003') return done(reject, new UsageError('Cancelled.'));
                if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
                else value += ch;
            }
        };
        process.stdout.write(question);
        stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.resume(); stdin.on('data', onData);
    });
}
async function newPassword() {
    if (process.env.QIVVERA_ACCOUNT_PASSWORD !== undefined) return process.env.QIVVERA_ACCOUNT_PASSWORD;
    const first = await hiddenPrompt(`New password (${PASSWORD_MIN_LENGTH}+ characters): `);
    const second = await hiddenPrompt('Repeat password: ');
    if (first !== second) throw new UsageError('Passwords did not match. Nothing was changed.');
    return first;
}
function configuredAccounts() {
    const accounts = readConfiguredAccounts(process.env);
    if (!accounts) throw new UsageError('No QIVVERA_ACCOUNTS_JSON or OWNER_EMAIL/OWNER_PASSWORD_HASH is configured to import.');
    return accounts;
}
function databaseOptions() {
    if (process.env.DATABASE_URL) return { driver: 'postgres', connectionString: process.env.DATABASE_URL, sslMode: process.env.DATABASE_SSL_MODE ?? 'verify-full', ca: process.env.DATABASE_CA };
    throw new UsageError('Set DATABASE_URL to the PostgreSQL database.');
}
const show = a => `${a.status === 'ACTIVE' ? 'ACTIVE  ' : 'DISABLED'}  ${a.email.padEnd(36)} ${a.roles.join(',').padEnd(32)} last sign-in: ${a.lastLoginAt ?? 'never'}`;

async function main(argv) {
    const [command, ...rest] = argv;
    if (!command || command === 'help' || command === '--help') { console.log(USAGE); return; }
    const actor = process.env.QIVVERA_OPERATOR || `operator:${userInfo().username}`;

    if (command === 'sql') {
        const [sub, ...args] = rest, { positional, roles, name } = parse(args);
        if (sub === 'add') { requireArgs(positional, 1, 'sql add <email> --roles R1,R2'); console.log(await accountSql('add', { email: positional[0], roles, displayName: name, password: await newPassword() }, { actor })); }
        else if (sub === 'set-password') { requireArgs(positional, 1, 'sql set-password <email>'); console.log(await accountSql('set-password', { email: positional[0], password: await newPassword() }, { actor })); }
        else if (sub === 'import-env') { requireArgs(positional, 0, 'sql import-env'); console.log(await accountSql('import', { accounts: configuredAccounts() }, { actor })); }
        else throw new UsageError('Use: sql add | sql set-password | sql import-env');
        return;
    }

    const { positional, roles, name } = parse(rest);
    const db = databaseOptions();
    // Fail before prompting if the database or schema 8 is unavailable.
    const probe = await openDatabase(db); await probe.close();
    const accounts = await openAccountRepository({ ...db, migrate: false });
    try {
        if (command === 'list') { requireArgs(positional, 0, 'list'); const all = await accounts.listAll(); console.log(all.length ? all.map(show).join('\n') : 'No accounts.'); }
        else if (command === 'add') { requireArgs(positional, 1, 'add <email> --roles R1,R2'); console.log('Created:\n' + show(await accounts.create({ email: positional[0], roles, displayName: name, password: await newPassword() }, actor))); }
        else if (command === 'set-password') { requireArgs(positional, 1, 'set-password <email>'); console.log('Password changed; existing sessions signed out:\n' + show(await accounts.setPassword(positional[0], await newPassword(), actor))); }
        else if (command === 'set-roles') { requireArgs(positional, 1, 'set-roles <email> --roles R1,R2'); console.log('Roles changed; existing sessions signed out:\n' + show(await accounts.setRoles(positional[0], roles, actor))); }
        else if (command === 'disable' || command === 'enable') { requireArgs(positional, 1, `${command} <email>`); console.log(show(await accounts.setStatus(positional[0], command === 'disable' ? 'DISABLED' : 'ACTIVE', actor))); }
        else if (command === 'import-env') { requireArgs(positional, 0, 'import-env'); const done = await accounts.importAccounts(configuredAccounts(), actor); console.log(`Imported ${done.length} account(s):\n` + done.map(a => `  ${a.email}  ${a.roles.join(',')}`).join('\n')); }
        else throw new UsageError(`Unknown command "${command}". Run: npm run accounts -- help`);
    } finally { await accounts.close(); }
}

try { await main(process.argv.slice(2)); }
catch (e) {
    // Fixed messages only: never print connection strings, hashes or passwords.
    if (e instanceof UsageError) console.error(e.message);
    else if (e?.code && e?.status) console.error(`${e.code}: ${e.message}`);
    else console.error(`ACCOUNT_COMMAND_FAILED: ${/^[A-Z_]+$/.test(e?.message ?? '') ? e.message : 'inspect the database and configuration'}`);
    process.exitCode = 1;
}
