/** Disposable local browser fixture. Never imported by a deployment entrypoint. */
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openAssuranceRepository } from '../backend/server/assurance/repository.mjs';
import { openResolutionRepository } from '../backend/server/resolution/repository.mjs';
import { openIntakeRepository } from '../backend/server/intake/repository.mjs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';

const password = process.env.FIRST_RELEASE_TEST_PASSWORD;
if (typeof password !== 'string' || password.length < 24)
    throw new Error('Supply a generated browser-fixture password through FIRST_RELEASE_TEST_PASSWORD.');
const port = Number(process.env.FIRST_RELEASE_TEST_PORT ?? 3186);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Use an explicit unprivileged test port.');
const mode = process.env.FIRST_RELEASE_TEST_CAPABILITIES ?? 'configured';
if (!['configured', 'disabled'].includes(mode))
    throw new Error('Unknown browser-fixture capability mode.');

const dir = mkdtempSync(join(tmpdir(), 'qivvera-first-release-'));
const db = { path: join(dir, 'workspace.sqlite'), migrate: true };
const passwordHash = hashPassword(password);
const accounts = [
    { email: 'author@example.test', passwordHash, roles: ['AUTHOR'] },
    { email: 'policy@example.test', passwordHash, roles: ['POLICY_AUTHORITY'] },
    { email: 'viewer@example.test', passwordHash, roles: ['VIEWER'] },
];
// Initialize all five additive migrations even when features are intentionally disabled.
// No target or repository is registered; this exercises setup guidance without external calls.
const repository = await openWorkflowRepository({ ...db, reviewMode: 'independent' });
const assurance = await openAssuranceRepository({ ...db, targets: [], generalizationEnabled: true });
const resolution = await openResolutionRepository({ ...db, accounts, targets: [] });
const intake = await openIntakeRepository({ ...db, repositories: [] });
const origin = `http://127.0.0.1:${port}`;
const server = createApplicationServer({
    repository, accounts, publicOrigin: origin,
    releaseRevision: '6'.repeat(40),
    ...(mode === 'configured' ? { assurance, resolution, intake } : {}),
});
// Test-only transport faults around the real application handler. The requests still
// use its actual sessions, authorization, repositories and response bodies.
// Delayed valid bodies expose stale-response races. Malformed 401 bodies exercise
// handling of a genuinely revoked session even when a gateway's body is unreadable.
const latency = Number(process.env.FIRST_RELEASE_TEST_LATENCY_MS ?? 0);
if (!Number.isInteger(latency) || latency < 0 || latency > 5000)
    throw new Error('Test latency must be 0–5000 ms.');
const handler = server.listeners('request')[0];
let dropSaveReply = process.env.FIRST_RELEASE_TEST_DROP_SAVE_REPLY === 'true';
server.removeListener('request', handler);
server.on('request', (req, res) => {
    const path = new URL(req.url, origin).pathname;
    const delayed = path === '/api/support-info' || /^\/api\/obligations\/[a-f0-9-]{36}\/history$/.test(path);
    const end = res.end.bind(res);
    res.end = (data, encoding, callback) => {
        if (dropSaveReply && req.method === 'POST' && path === '/api/applications' && res.statusCode === 201 &&
            typeof data === 'string' && JSON.parse(data).name === 'Lost response application') {
            dropSaveReply = false;
            // The normal handler has already saved the application. Deliver headers,
            // then lose its body, so the browser must warn about an uncertain save.
            res.flushHeaders();
            setTimeout(() => res.destroy(), 25);
            return res;
        }
        if (path === '/api/support-info' && res.statusCode === 401 && process.env.FIRST_RELEASE_TEST_MALFORMED_401 === 'true')
            data = '<html><body>Session ended</body></html>';
        if (delayed && latency) {
            res.flushHeaders();
            setTimeout(() => end(data, encoding, callback), latency);
            return res;
        }
        return end(data, encoding, callback);
    };
    void handler(req, res);
});
server.listen(port, '127.0.0.1', () => {
    console.log(JSON.stringify({ origin, mode, storage: 'sqlite', schemaVersion: 5 }));
});
let closing = false;
async function stop() {
    if (closing) return;
    closing = true;
    await new Promise(resolve => server.close(resolve));
    for (const service of [intake, resolution, assurance, repository]) await service.close();
    rmSync(dir, { recursive: true, force: true });
    process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
