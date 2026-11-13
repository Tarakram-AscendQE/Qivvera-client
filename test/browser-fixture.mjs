// Disposable UI fixture. Never used by a deployment entrypoint.
import { openWorkflowRepository } from '../server/workflow-repository.mjs';
import { createApplicationServer } from '../server/app.mjs';
const path = process.env.TEST_SQLITE_PATH;
if (!path || !path.startsWith('/tmp/qivvera-'))
    throw new Error('Disposable fixture path required');
// Stable test-only salt makes restart a session-persistence test, not a credential-rotation test.
const { scryptSync } = await import('node:crypto');
const salt = 'a'.repeat(32);
const hash = `scrypt:${salt}:${scryptSync('synthetic-browser-only-password', salt, 64).toString('hex')}`;
const accounts = [{ email: 'author@example.test', passwordHash: hash, roles: ['AUTHOR'] }, { email: 'reviewer@example.test', passwordHash: hash, roles: ['POLICY_AUTHORITY'] }, { email: 'viewer@example.test', passwordHash: hash, roles: ['VIEWER'] }];
const repository = await openWorkflowRepository({ path, migrate: true });
const port = Number(process.env.TEST_PORT ?? 3127), origin = `http://127.0.0.1:${port}`;
const server = createApplicationServer({ repository, accounts, publicOrigin: origin, releaseRevision: 'increment-2-local-test' });
server.listen(port, '127.0.0.1', () => console.log('READY ' + origin));
process.on('SIGTERM', () => server.close(async () => { await repository.close(); process.exit(0); }));
