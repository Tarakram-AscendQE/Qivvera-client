/** Real local drafting application with disposable storage and test-only transport faults. */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { createApplicationServer } from '../backend/server/app.mjs';
import { hashPassword } from '../backend/server/auth.mjs';

const password = process.env.DRAFTING_TEST_PASSWORD;
if (typeof password !== 'string' || password.length < 24)
    throw new Error('Supply a generated password through DRAFTING_TEST_PASSWORD.');
const port = Number(process.env.DRAFTING_TEST_PORT ?? 3188);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Use an explicit unprivileged test port.');
const latency = Number(process.env.DRAFTING_TEST_LATENCY_MS ?? 0);
if (!Number.isInteger(latency) || latency < 0 || latency > 5000)
    throw new Error('Test latency must be 0–5000 ms.');

const dir = mkdtempSync(join(tmpdir(), 'qivvera-drafting-browser-'));
const repository = await openWorkflowRepository({
    path: join(dir, 'workspace.sqlite'), migrate: true, reviewMode: 'independent',
    drafting: { enabled: true, openaiEnabled: false },
});
const passwordHash = hashPassword(password);
const accounts = [
    { email: 'author@example.test', passwordHash, roles: ['AUTHOR'] },
    { email: 'other-author@example.test', passwordHash, roles: ['AUTHOR'] },
    { email: 'policy@example.test', passwordHash, roles: ['POLICY_AUTHORITY'] },
    { email: 'viewer@example.test', passwordHash, roles: ['VIEWER'] },
];
const origin = `http://127.0.0.1:${port}`;
const server = createApplicationServer({ repository, accounts, publicOrigin: origin, releaseRevision: '7'.repeat(40) });
const handler = server.listeners('request')[0];
let dropSavedCandidate = process.env.DRAFTING_TEST_DROP_SAVE_REPLY === 'true';
server.removeListener('request', handler);
server.on('request', (req, res) => {
    const path = new URL(req.url, origin).pathname;
    const delayed = req.method === 'GET' && /^\/api\/drafting-runs\/[a-f0-9-]{36}$/.test(path);
    const end = res.end.bind(res);
    res.end = (data, encoding, callback) => {
        if (dropSavedCandidate && req.method === 'POST' && /\/suggestions\/[^/]+\/actions$/.test(path) &&
            res.statusCode === 200 && typeof data === 'string') {
            const body = JSON.parse(data);
            if (body.source?.reference === 'Lost response source' && body.suggestions?.some(s => s.status === 'CANDIDATE_CREATED')) {
                // Actual API authorization and atomic save have already succeeded. Drop
                // only the reply body to verify honest recovery from uncertain delivery.
                dropSavedCandidate = false;
                res.flushHeaders();
                setTimeout(() => res.destroy(), 25);
                return res;
            }
        }
        if (delayed && latency) {
            res.flushHeaders();
            setTimeout(() => end(data, encoding, callback), latency);
            return res;
        }
        return end(data, encoding, callback);
    };
    void handler(req, res);
});
const schemaVersion = await repository.getSchemaVersion();
server.listen(port, '127.0.0.1', () => {
    console.log(JSON.stringify({ origin, storage: 'sqlite', schemaVersion, liveModel: false }));
});
let closing = false;
async function stop() {
    if (closing) return;
    closing = true;
    await new Promise(resolve => server.close(resolve));
    await repository.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
