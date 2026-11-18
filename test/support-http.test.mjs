import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApplicationServer } from '../server/app.mjs';
import { hashPassword } from '../server/auth.mjs';
import { PRODUCT_VERSION } from '../server/release.mjs';
import { openWorkflowRepository } from '../server/workflow-repository.mjs';
import { openAssuranceRepository } from '../server/assurance/repository.mjs';
import { openResolutionRepository } from '../server/resolution/repository.mjs';
import { openIntakeRepository } from '../server/intake/repository.mjs';
import { setup as setupAssurance } from './assurance-helpers.mjs';

const author = { email: 'support-author@example.test', roles: ['AUTHOR'] };
const authority = { email: 'support-policy@example.test', roles: ['POLICY_AUTHORITY'] };
const viewer = { email: 'support-viewer@example.test', roles: ['VIEWER'] };
const namedAccounts = [author, authority, viewer];
const releaseRevision = 'a'.repeat(40);
const password = randomUUID() + randomUUID();
const passwordHash = hashPassword(password);
const warningCodes = body => body.warnings.map(w => w.code);

async function serve(t, options) {
    const accounts = (options.accounts ?? namedAccounts).map(a => ({ ...a, passwordHash }));
    const origin = options.secureCookies ? 'https://workspace.example.test' : 'http://127.0.0.1:3017';
    const server = createApplicationServer({ releaseRevision, ...options, accounts, publicOrigin: origin });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(path = '/api/support-info', { session, method = 'GET', data, from = origin, csrf, headers = {} } = {}) {
        const response = await fetch(base + path, {
            method,
            headers: {
                ...(method !== 'GET' ? { Origin: from, 'Content-Type': 'application/json' } : {}),
                ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': csrf ?? session.csrfToken } : {}),
                ...headers,
            },
            ...(data === undefined ? {} : { body: JSON.stringify(data) }),
        });
        return { status: response.status, headers: response.headers, body: await response.json() };
    }
    async function login(email = author.email) {
        const response = await call('/api/session', { method: 'POST', data: { email, password } });
        assert.equal(response.status, 200);
        return { cookie: response.headers.get('set-cookie').split(';')[0], csrfToken: response.body.csrfToken };
    }
    return { call, login, accounts };
}

async function fixture(t, options = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'qivvera-support-'));
    const db = { path: join(directory, 'workspace.sqlite'), migrate: true };
    const repository = await openWorkflowRepository({ ...db, reviewMode: options.reviewMode ?? 'independent' });
    const resources = [repository];
    const accounts = options.accounts ?? namedAccounts;
    let assurance, resolution, intake, target;
    const providerRequests = [];
    if (options.assurance) {
        target = {
            id: 'private-target-id', name: 'Private target name', applicationId: randomUUID(), sourceRevision: 'b'.repeat(40),
            artifactDigest: 'sha256:' + 'c'.repeat(64), environmentDigest: 'sha256:' + 'd'.repeat(64), instanceId: 'private-instance',
            origin: 'http://127.0.0.1:31999', requesterId: 'private-maker', approverId: 'private-checker',
            requesterTokenEnv: 'PRIVATE_MAKER_TOKEN', approverTokenEnv: 'PRIVATE_CHECKER_TOKEN',
            bindingStatement: 'Private operator assertion for a bounded synthetic test target.', testOnly: true,
        };
        assurance = await openAssuranceRepository({ ...db, targets: options.targets === false ? [] : [target], allowLocalTargets: true, generalizationEnabled: options.multi === true });
        resources.push(assurance);
    }
    if (options.resolution) {
        resolution = await openResolutionRepository({ ...db, accounts });
        resources.push(resolution);
    }
    if (options.intake) {
        intake = await openIntakeRepository({
            ...db,
            repositories: [{ id: 'private-source', owner: 'private-owner', repo: 'private-repository', repositoryId: 331331, applicationId: randomUUID(), tokenEnv: 'PRIVATE_GITHUB_TOKEN' }],
            secretEnv: { PRIVATE_GITHUB_TOKEN: 'secret-provider-token-never-rendered' },
            fetchFn: async (...args) => { providerRequests.push(args); throw new Error('support must not call provider'); },
        });
        resources.push(intake);
    }
    const http = await serve(t, { repository, assurance, resolution, intake, accounts, releaseRevision: options.releaseRevision ?? releaseRevision, secureCookies: options.secureCookies === true });
    t.after(async () => { for (const resource of resources.reverse()) await resource.close(); rmSync(directory, { recursive: true, force: true }); });
    return { ...http, repository, assurance, resolution, intake, target, db, providerRequests };
}

test('support HTTP / unauthenticated and forged-cookie requests expose no diagnostics', async t => {
    const h = await fixture(t);
    for (const headers of [{}, { Cookie: 'qivvera_session=' + 'a'.repeat(64) }]) {
        const r = await h.call(undefined, { headers });
        assert.equal(r.status, 401);
        assert.equal(r.body.error, 'AUTH_REQUIRED');
        assert.equal(r.body.workspace, undefined);
        assert.equal(r.body.capabilities, undefined);
    }
});

test('support HTTP / signed-in author gets observed schema and explicit disabled-feature guidance', async t => {
    const h = await fixture(t), session = await h.login(), r = await h.call(undefined, { session });
    assert.equal(r.status, 200);
    assert.equal(r.body.schema, 'qivvera.support-info/1');
    assert.equal(r.body.product.version, PRODUCT_VERSION);
    assert.equal(r.body.product.revision, releaseRevision);
    assert.equal(r.body.workspace.schemaVersion, 2);
    assert.equal(r.body.workspace.requiredSchemaVersion, 2);
    assert.equal(r.body.workspace.storageCheck, 'reachable');
    assert.equal(r.body.workspace.reviewMode, 'independent');
    assert.equal(r.body.workspace.secureSession, false);
    assert.deepEqual(r.body.roles, ['AUTHOR']);
    assert.deepEqual(r.body.actions, { createChange: true, reviewObligations: false, approvePlans: false, requestAssessment: false, importSource: false, manageResolution: false, draftObligations: false });
    for (const code of ['LOCAL_REVIEW_STORAGE', 'ASSURANCE_DISABLED', 'RESOLUTION_DISABLED', 'GITHUB_INTAKE_DISABLED']) assert.ok(warningCodes(r.body).includes(code), code);
    assert.ok(r.body.warnings.every(w => w.message.length && w.nextStep.length));
});

test('support HTTP / response has noncached timestamp and matching fresh support reference', async t => {
    const h = await fixture(t), session = await h.login();
    const before = Date.now(), a = await h.call(undefined, { session }), b = await h.call(undefined, { session });
    assert.equal(a.headers.get('cache-control'), 'no-store');
    assert.equal(a.headers.get('x-request-id'), a.body.requestId);
    assert.match(a.body.requestId, /^[a-f0-9-]{36}$/);
    assert.notEqual(a.body.requestId, b.body.requestId);
    assert.ok(Date.parse(a.body.generatedAt) >= before && Date.parse(a.body.generatedAt) <= Date.now());
    assert.equal(a.headers.get('access-control-allow-origin'), null);
});

test('support HTTP / role hints match configured capabilities without replacing authority decisions', async t => {
    const h = await fixture(t, { assurance: true, multi: true, resolution: true, intake: true });
    for (const [identity, expected] of [
        [author, { createChange: true, reviewObligations: false, approvePlans: false, requestAssessment: true, importSource: true, manageResolution: true }],
        [authority, { createChange: false, reviewObligations: true, approvePlans: true, requestAssessment: true, importSource: false, manageResolution: true }],
        [viewer, { createChange: false, reviewObligations: false, approvePlans: false, requestAssessment: false, importSource: false, manageResolution: false }],
    ]) {
        const session = await h.login(identity.email), r = await h.call(undefined, { session });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.actions, { ...expected, draftObligations: false });
        assert.equal(r.body.workspace.schemaVersion, 5);
        assert.equal(r.body.workspace.requiredSchemaVersion, 5);
        assert.equal(r.body.capabilities.multiObligation, true);
        assert.match(r.body.authorizationNotice, /record.*authority checks/);
    }
});

test('support HTTP / combined author and authority roles do not invent independent-review eligibility', async t => {
    const owner = { email: 'owner@example.test', roles: ['AUTHOR', 'POLICY_AUTHORITY'] };
    const h = await fixture(t, { accounts: [owner] }), session = await h.login(owner.email), r = await h.call(undefined, { session });
    assert.deepEqual(r.body.roles, ['AUTHOR', 'POLICY_AUTHORITY']);
    assert.equal(r.body.actions.reviewObligations, true);
    assert.ok(warningCodes(r.body).includes('DISTINCT_REVIEWER_UNAVAILABLE'));
    assert.match(r.body.authorizationNotice, /applicable authority checks/);
});

test('support HTTP / independent named reviewer removes only the configuration warning', async t => {
    const h = await fixture(t), session = await h.login(), r = await h.call(undefined, { session });
    assert.ok(!warningCodes(r.body).includes('DISTINCT_REVIEWER_UNAVAILABLE'));
    assert.equal(r.body.limitations.releaseStatus, 'not-evaluated');
});

test('support HTTP / founder review remains visibly qualified', async t => {
    const owner = { email: 'founder@example.test', roles: ['AUTHOR', 'POLICY_AUTHORITY'] };
    const h = await fixture(t, { accounts: [owner], reviewMode: 'founder-review' });
    const session = await h.login(owner.email), r = await h.call(undefined, { session });
    assert.equal(r.body.workspace.reviewMode, 'founder-review');
    assert.ok(warningCodes(r.body).includes('FOUNDER_REVIEW_MODE'));
    assert.match(r.body.warnings.find(w => w.code === 'FOUNDER_REVIEW_MODE').message, /does not establish independent human approval/);
});

test('support HTTP / unavailable configured author and authority roles produce actionable warnings', async t => {
    const h = await fixture(t, { accounts: [viewer] }), session = await h.login(viewer.email), r = await h.call(undefined, { session });
    for (const code of ['AUTHOR_UNAVAILABLE', 'POLICY_AUTHORITY_UNAVAILABLE']) assert.ok(warningCodes(r.body).includes(code));
    assert.ok(Object.values(r.body.actions).every(v => v === false));
});

test('support HTTP / configured queue with no targets cannot imply executable assessment actions', async t => {
    const h = await fixture(t, { assurance: true, targets: false }), session = await h.login(authority.email), r = await h.call(undefined, { session });
    assert.equal(r.body.capabilities.assessmentQueue, true);
    assert.equal(r.body.capabilities.configuredTargets, false);
    assert.equal(r.body.actions.approvePlans, false);
    assert.equal(r.body.actions.requestAssessment, false);
    assert.ok(warningCodes(r.body).includes('TARGETS_UNAVAILABLE'));
    assert.ok(warningCodes(r.body).includes('GENERALIZATION_DISABLED'));
    assert.ok(warningCodes(r.body).includes('WORKER_NOT_OBSERVED'));
    assert.equal(r.body.workspace.schemaVersion, 3);
});

test('support HTTP / configured multi-obligation mode still does not observe a worker or provider', async t => {
    const h = await fixture(t, { assurance: true, multi: true, intake: true }), session = await h.login(), r = await h.call(undefined, { session });
    assert.equal(r.body.capabilities.multiObligation, true);
    assert.ok(!warningCodes(r.body).includes('GENERALIZATION_DISABLED'));
    assert.equal(r.body.limitations.workerStatus, 'not-observed');
    assert.equal(r.body.limitations.githubConnection, 'not-probed');
    assert.equal(r.body.limitations.releaseStatus, 'not-evaluated');
    assert.equal(r.body.limitations.schemaCheck, 'version-observed-only');
    assert.equal(h.providerRequests.length, 0);
    assert.equal(r.body.ready, undefined);
    assert.equal(r.body.disposition, undefined);
});

test('support HTTP / snapshot excludes identities, credentials, target bindings and repository configuration', async t => {
    const h = await fixture(t, { assurance: true, multi: true, intake: true, resolution: true });
    await h.repository.createApplication({ name: 'Confidential business application', description: '<script>private</script>', repositoryUrl: 'https://sensitive.example.test/private' }, author);
    const session = await h.login(), r = await h.call(undefined, { session }), serialized = JSON.stringify(r.body);
    for (const value of [password, passwordHash, session.csrfToken, session.cookie.split('=')[1], ...namedAccounts.map(a => a.email), ...Object.values(h.target).filter(v => typeof v === 'string' && v.length > 5), 'PRIVATE_GITHUB_TOKEN', 'secret-provider-token-never-rendered', 'private-owner', 'private-repository', 'Confidential business application', 'sensitive.example.test']) assert.ok(!serialized.includes(value), `Unexpected private value in diagnostics: ${value.slice(0,20)}`);
    assert.equal(h.providerRequests.length, 0);
});

test('support HTTP / arbitrary deployed revision text is not copied into support output', async t => {
    const secretRevision = '<script>secret-revision</script> https://token@internal.invalid';
    const h = await fixture(t, { releaseRevision: secretRevision }), session = await h.login(), r = await h.call(undefined, { session });
    assert.equal(r.body.product.revision, 'unrecorded');
    assert.ok(warningCodes(r.body).includes('REVISION_UNRECORDED'));
    assert.ok(!JSON.stringify(r.body).includes(secretRevision));
});

test('support HTTP / unexpected schema errors are sanitized into fixed recovery guidance', async t => {
    const h = await fixture(t), session = await h.login();
    h.repository.getSchemaVersion = async () => { throw new Error('postgresql://owner:secret@internal.test/confidential'); };
    const r = await h.call(undefined, { session });
    assert.equal(r.status, 200);
    assert.equal(r.body.workspace.storageCheck, 'unavailable');
    assert.equal(r.body.workspace.schemaVersion, null);
    assert.ok(warningCodes(r.body).includes('STORAGE_UNAVAILABLE'));
    assert.ok(!JSON.stringify(r.body).includes('internal.test'));
    assert.ok(!JSON.stringify(r.body).includes('secret'));
});

test('support HTTP / a removed required migration is reported without applying or repairing it', async t => {
    const h = await fixture(t, { assurance: true, multi: true }), session = await h.login();
    const d = new DatabaseSync(h.db.path); t.after(() => d.close());
    d.exec('DELETE FROM qivvera_migrations WHERE version=5');
    const r = await h.call(undefined, { session });
    assert.equal(r.body.workspace.schemaVersion, 4);
    assert.equal(r.body.workspace.requiredSchemaVersion, 5);
    assert.ok(warningCodes(r.body).includes('SCHEMA_TOO_OLD'));
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM qivvera_migrations WHERE version=5').get().n, 0);
});

test('support HTTP / an unsupported newer schema is reported without rollback', async t => {
    const h = await fixture(t), session = await h.login();
    const d = new DatabaseSync(h.db.path); t.after(() => d.close());
    d.prepare('INSERT INTO qivvera_migrations(version,checksum,applied_at) VALUES(?,?,?)').run(7, 'test-future-schema', new Date().toISOString());
    const r = await h.call(undefined, { session });
    assert.equal(r.body.workspace.schemaVersion, 7);
    assert.ok(warningCodes(r.body).includes('SCHEMA_TOO_NEW'));
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM qivvera_migrations WHERE version=7').get().n, 1);
});

test('support HTTP / missing schema observation remains unknown instead of a pass', async t => {
    const h = await fixture(t), session = await h.login();
    h.repository.getSchemaVersion = async () => null;
    const r = await h.call(undefined, { session });
    assert.equal(r.body.workspace.schemaVersion, null);
    assert.ok(warningCodes(r.body).includes('SCHEMA_UNAVAILABLE'));
    assert.equal(r.body.limitations.releaseStatus, 'not-evaluated');
});

test('support HTTP / query parameters cannot choose a target, role, secret or diagnostic action', async t => {
    const h = await fixture(t), session = await h.login(viewer.email);
    for (const query of ['?role=POLICY_AUTHORITY', '?target=https://private.invalid', '?probe=worker', '?include=secrets']) {
        const r = await h.call('/api/support-info' + query, { session });
        assert.equal(r.status, 400);
        assert.equal(r.body.error, 'SUPPORT_QUERY_UNSUPPORTED');
        assert.equal(r.body.workspace, undefined);
    }
});

test('support HTTP / unsupported mutations cannot alter configuration or release state', async t => {
    const h = await fixture(t), session = await h.login();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const r = await h.call(undefined, { session, method, data: { ready: true, deploy: true, worker: 'start', migrate: true } });
        assert.equal(r.status, 404);
    }
    const r = await h.call(undefined, { session });
    assert.equal(r.body.workspace.schemaVersion, 2);
    assert.equal(r.body.capabilities.assessmentQueue, false);
});

test('support HTTP / logout revokes access to the support snapshot', async t => {
    const h = await fixture(t), session = await h.login(viewer.email);
    assert.equal((await h.call(undefined, { session })).status, 200);
    assert.equal((await h.call('/api/session', { session, method: 'DELETE' })).status, 200);
    assert.equal((await h.call(undefined, { session })).status, 401);
});

test('support HTTP / support reads do not mutate records, expire queued work or write evidence', async t => {
    let now = Date.now();
    const h = await setupAssurance(t, { clock: () => now });
    const queued = await h.queue();
    now += 700000;
    const http = await serve(t, { repository: h.workflow, assurance: h.service, accounts: namedAccounts });
    const session = await http.login(), d = new DatabaseSync(h.db.path); t.after(() => d.close());
    const dump = () => d.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => ({ name, rows: d.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all() }));
    const before = dump();
    assert.equal((await http.call(undefined, { session })).status, 200);
    assert.equal((await http.call(undefined, { session })).status, 200);
    assert.deepEqual(dump(), before);
    assert.equal(d.prepare('SELECT status FROM assurance_runs WHERE id=?').get(queued.id).status, 'QUEUED');
    assert.equal(d.prepare('SELECT COUNT(*) AS n FROM assurance_evidence').get().n, 0);
});

test('support HTTP / secure-session configuration is reported without claiming hosted browser acceptance', async t => {
    const h = await fixture(t, { secureCookies: true }), session = await h.login(), r = await h.call(undefined, { session });
    assert.equal(r.body.workspace.secureSession, true);
    assert.equal(r.body.limitations.releaseStatus, 'not-evaluated');
    assert.equal(r.headers.get('strict-transport-security'), 'max-age=31536000');
});

test('support HTTP / product version agrees with workspace and health metadata', async t => {
    const h = await fixture(t), session = await h.login();
    const support = await h.call(undefined, { session }), workspace = await h.call('/api/workspace', { session }), health = await h.call('/healthz');
    assert.equal(support.body.product.version, PRODUCT_VERSION);
    assert.equal(workspace.body.release, PRODUCT_VERSION);
    assert.equal(health.body.version, PRODUCT_VERSION);
    assert.equal(health.body.assuranceExecution, false);
});
