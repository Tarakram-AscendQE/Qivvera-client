/** Engineer-only helper. Reads a password from stdin; emits an account hash, never plaintext.
 * Send output to the secret manager or a restricted file OUTSIDE the repository.
 * Do not run in CI, paste output in chat, or save it in source control.
 */
import { hashPassword } from '../server/auth.mjs';
import { normalizeAccounts } from '../server/workspace-auth.mjs';
try {
    const chunks = [];
    let n = 0;
    for await (const c of process.stdin) {
        n += c.length;
        if (n > 1024)
            throw new Error('INPUT_TOO_LONG');
        chunks.push(c);
    }
    const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
    const account = { email: process.env.ACCOUNT_EMAIL, passwordHash: hashPassword(password), roles: (process.env.ACCOUNT_ROLES ?? 'AUTHOR').split(',') };
    normalizeAccounts([account]);
    process.stdout.write(JSON.stringify(account) + '\n');
}
catch {
    console.error('ACCOUNT_CONFIGURATION_FAILED: provide an email, supported roles and a password of 16–256 characters via stdin.');
    process.exitCode = 1;
}
