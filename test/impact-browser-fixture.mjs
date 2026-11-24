/** Disposable native-browser harness with genuine worker evidence and delayed genuine replies. */
import { setup, author, authority, viewer } from './assurance-helpers.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { createApplicationServer } from '../backend/server/app.mjs';
import { hashPassword } from '../backend/server/auth.mjs';

const password = process.env.IMPACT_TEST_PASSWORD;
if (typeof password !== 'string' || password.length < 24)
    throw new Error('Supply a generated password through IMPACT_TEST_PASSWORD.');
const port = Number(process.env.IMPACT_TEST_PORT ?? 3189);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Use an explicit unprivileged test port.');
const latency = Number(process.env.IMPACT_TEST_LATENCY_MS ?? 0);
if (!Number.isInteger(latency) || latency < 0 || latency > 5000)
    throw new Error('Test latency must be 0–5000 ms.');

const cleanup = [];
const h = await setup({ after: callback => cleanup.push(callback) });
const repository = await openWorkflowRepository({ ...h.db, migrate: true,
    drafting: { enabled: true, openaiEnabled: false },
    impact: { ...h.options, assuranceEnabled: true } });
const baselineRun = await h.run();
if (baselineRun.status !== 'COMPLETED' || baselineRun.disposition !== 'READY' || baselineRun.evidenceIntegrity !== 'DIGEST_MATCH')
    throw new Error('The native impact fixture requires genuine completed worker evidence.');
const empty = await repository.createChange({ applicationId: h.app.id,
    title: 'Empty impact declaration', sourceRevision: 'c'.repeat(40), intent: 'Inspect an initial empty scope.' }, author);
const origin = `http://127.0.0.1:${port}`, passwordHash = hashPassword(password);
const server = createApplicationServer({ repository, assurance: h.service, publicOrigin: origin,
    releaseRevision: '8'.repeat(40), accounts: [author, authority, viewer].map(actor => ({ ...actor, passwordHash })) });
const handler = server.listeners('request')[0];
server.removeListener('request', handler);
server.on('request', (req, res) => {
    const path = new URL(req.url, origin).pathname;
    const delayed = req.method === 'GET' && /^\/api\/changes\/[a-f0-9-]{36}\/impact$/.test(path);
    const end = res.end.bind(res);
    res.end = (data, encoding, callback) => {
        if (delayed && latency) {
            // Authentication and the database read already ran normally. Delay only
            // the real response body to exercise navigation/session race handling.
            res.flushHeaders();
            setTimeout(() => end(data, encoding, callback), latency);
            return res;
        }
        return end(data, encoding, callback);
    };
    void handler(req, res);
});
const schemaVersion = await repository.getSchemaVersion();
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ origin, schemaVersion,
    changeId: h.change.id, revisionId: h.change.revision.id, obligationId: h.obligation.id,
    runId: baselineRun.id, evidenceDigest: baselineRun.evidenceDigest,
    emptyChangeId: empty.id, emptyRevisionId: empty.revision.id })));
let closing = false;
async function stop() {
    if (closing) return;
    closing = true;
    await new Promise(resolve => server.close(resolve));
    await repository.close();
    for (const callback of cleanup) await callback();
    process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
