import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openPrAssuranceService } from '../backend/server/pr-assurance/service.mjs';
import { testDatabase } from './postgres-test-database.mjs';

const author = { email: 'pr-author@example.test', roles: ['AUTHOR'] };
const authority = { email: 'pr-authority@example.test', roles: ['POLICY_AUTHORITY'] };
const viewer = { email: 'pr-viewer@example.test', roles: ['VIEWER'] };
const ORIGIN = 'http://127.0.0.1:3027';
const HEADS = { 6: 'af51c26b0b9f94894cccfaa5b0fb893221952c65', 7: 'ae50debcd01bcc47fc137855cbc21b0e72107f1e', 8: 'b62db000bfef1449fa64588542bdb45d5abe9589' };
const IDS = { 'prcheck-live/vendorpay-app': 1440617142, 'prcheck-live/prcheck-verifiers': 1440617261, 'prcheck-live/vendorpay-policies': 1440617000 };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const githubPull = number => {
  const repo = { id: IDS['prcheck-live/vendorpay-app'], full_name: 'prcheck-live/vendorpay-app' };
  return { number, state: 'open', merged: false, draft: false, title: `VP-184 v${number - 5}`, body: null,
    head: { sha: HEADS[number], ref: `feature/VP-184-v${number - 5}`, repo }, base: { sha: '3'.repeat(40), ref: 'main', repo } };
};
const CONNECTION = {
  repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', testRepositoryUrl: 'https://github.com/prcheck-live/prcheck-verifiers',
  profilesRepositoryUrl: 'https://github.com/prcheck-live/vendorpay-policies',
};

/** A real server on a random port, one application (VendorPay, connected unless asked not to) and a stand-in GitHub. */
async function fixture(t, { withFeature = true, connected = true } = {}) {
  const database = await testDatabase();
  const workflow = await openWorkflowRepository({ ...database, migrate: true });
  t.after(() => workflow.close());
  const token = `github_pat_${randomBytes(24).toString('hex')}`;
  const requests = [];
  const fetchFn = async (url, init) => {
    const { pathname } = new URL(url);
    requests.push(pathname);
    if (init.headers.Authorization !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
    const [, , owner, name, ...rest] = pathname.split('/'), full = `${owner}/${name}`;
    if (!IDS[full]) return json(404, { message: 'Not Found' });
    if (!rest.length) return json(200, { id: IDS[full], full_name: full, default_branch: 'main' });
    if (rest[0] === 'pulls' && rest[1]) return json(200, githubPull(Number(rest[1])));
    if (rest[0] === 'pulls') return json(200, []);
    if (rest[0] === 'actions') return json(200, { state: 'active' });
    if (rest[0] === 'git') return json(200, { object: { sha: 'e'.repeat(40) } });
    if (rest[0] === 'commits') return json(200, { check_runs: [] });
    return json(404, { message: 'Not Found' });
  };
  const prAssurance = withFeature ? await openPrAssuranceService({ database, migrate: true, fetchFn, secretEnv: { QIVVERA_CREDENTIAL_KEY: randomBytes(32).toString('base64') } }) : null;
  if (prAssurance) t.after(() => prAssurance.close());
  const app = await workflow.createApplication({ name: 'VendorPay', description: 'Supplier payments' }, author);
  if (prAssurance && connected) await prAssurance.connect(app.id, { ...CONNECTION, githubToken: token }, author);
  requests.length = 0;
  const password = randomUUID() + randomUUID();
  const server = createApplicationServer({ repository: workflow, prAssurance, publicOrigin: ORIGIN,
    accounts: [author, authority, viewer].map(a => ({ ...a, passwordHash: hashPassword(password) })) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', session, from = ORIGIN, csrf, data } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(method !== 'GET' ? { Origin: from, 'Content-Type': 'application/json' } : {}),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': csrf ?? session.csrfToken } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const login = async account => {
    const response = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password }) });
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrfToken: (await response.json()).csrfToken };
  };
  return { call, login, requests, token, app, appPath: `/api/pr-assurance/applications/${app.id}` };
}

test('pr-assurance HTTP / switched off: no routes, and the workspace says so', async t => {
  const h = await fixture(t, { withFeature: false }), session = await h.login(author);
  assert.equal((await h.call('/api/pr-assurance', { session })).status, 404);
  assert.equal((await h.call(h.appPath, { session })).status, 404);
  assert.equal((await h.call(`/api/applications/${h.app.id}/github`, { method: 'POST', session, data: {} })).status, 404);
  const workspace = (await h.call('/api/workspace', { session })).body;
  assert.equal(workspace.capabilities.prAssurance, false);
  assert.equal('github' in workspace.applications[0], false);
});

test('pr-assurance HTTP / the overview lists applications with their connection, and never the token', async t => {
  const h = await fixture(t), session = await h.login(author);
  const { status, body } = await h.call('/api/pr-assurance', { session });
  assert.equal(status, 200);
  assert.deepEqual(body.applications.map(a => [a.name, a.connection.app.repository, a.connection.rules.obligations]), [['VendorPay', 'prcheck-live/vendorpay-app', 14]]);
  assert.deepEqual([body.canEvaluate, body.credentialsReady], [true, true]);
  assert.equal(JSON.stringify(body).includes(h.token), false);
  assert.deepEqual(h.requests, [], 'listing never contacts GitHub');
});

test('pr-assurance HTTP / an application\'s page shows its rules and imported PRs, and never the token', async t => {
  const h = await fixture(t), session = await h.login(author);
  const { status, body } = await h.call(h.appPath, { session });
  assert.equal(status, 200);
  assert.deepEqual([body.application.name, body.repository, body.pulls.length], ['VendorPay', 'prcheck-live/vendorpay-app', 0]);
  assert.deepEqual([body.rules.policies, body.rules.obligations, body.rules.profile.id, body.rules.source], [6, 14, 'payments-critical', 'BUNDLED']);
  assert.deepEqual([body.githubTokenConfigured, body.canEvaluate, body.obligations.length], [true, true, 14]);
  assert.equal(JSON.stringify(body).includes(h.token), false);
  assert.equal((await h.call(`/api/pr-assurance/applications/${randomUUID()}`, { session })).status, 404);
  assert.equal((await h.call('/api/pr-assurance/applications/not-an-id', { session })).status, 404);
});

test('pr-assurance HTTP / an author imports PR #6 with its exact head commit, using the application\'s repository', async t => {
  const h = await fixture(t), session = await h.login(author);
  const imported = await h.call(`${h.appPath}/pulls/6/import`, { method: 'POST', session });
  assert.equal(imported.status, 200);
  assert.deepEqual([imported.body.pullNumber, imported.body.headSha, imported.body.headRef, imported.body.importedBy, imported.body.applicationId],
    [6, HEADS[6], 'feature/VP-184-v1', author.email, h.app.id]);
  assert.deepEqual(h.requests, ['/repos/prcheck-live/vendorpay-app/pulls/6']);
  assert.equal((await h.call(h.appPath, { session })).body.pulls[0].pull.headSha, HEADS[6]);
});

test('pr-assurance HTTP / a policy authority may import; a viewer may read but not import', async t => {
  const h = await fixture(t);
  assert.equal((await h.call(`${h.appPath}/pulls/7/import`, { method: 'POST', session: await h.login(authority) })).status, 200);
  const session = await h.login(viewer);
  assert.equal((await h.call(h.appPath, { session })).body.canEvaluate, false);
  const refused = await h.call(`${h.appPath}/pulls/8/import`, { method: 'POST', session });
  assert.deepEqual([refused.status, refused.body.error], [403, 'FORBIDDEN']);
});

test('pr-assurance HTTP / any PR of the application\'s repository can be imported; malformed numbers never reach GitHub', async t => {
  const h = await fixture(t), session = await h.login(author);
  assert.equal((await h.call(`${h.appPath}/pulls/6abc/import`, { method: 'POST', session })).status, 404);
  assert.equal((await h.call(`${h.appPath}/pulls/0/import`, { method: 'POST', session })).status, 404);
  assert.deepEqual(h.requests, []);
});

test('pr-assurance HTTP / reads need a session; writes need the workspace origin and the CSRF token', async t => {
  const h = await fixture(t), session = await h.login(author);
  assert.equal((await h.call('/api/pr-assurance')).status, 401);
  assert.equal((await h.call(h.appPath)).status, 401);
  assert.equal((await h.call(`${h.appPath}/pulls/6/import`, { method: 'POST', session, from: 'https://evil.invalid' })).status, 403);
  assert.equal((await h.call(`${h.appPath}/pulls/6/import`, { method: 'POST', session, csrf: 'wrong' })).status, 403);
  assert.equal((await h.call(`/api/applications/${h.app.id}/github`, { method: 'POST', session, csrf: 'wrong', data: { ...CONNECTION, githubToken: h.token } })).status, 403);
  assert.deepEqual(h.requests, []);
});

test('pr-assurance HTTP / an application that is not connected says so, and GitHub is not called', async t => {
  const h = await fixture(t, { connected: false }), session = await h.login(author);
  const page = (await h.call(h.appPath, { session })).body;
  assert.deepEqual([page.githubTokenConfigured, page.connection, page.rules], [false, null, null]);
  assert.equal((await h.call('/api/pr-assurance', { session })).body.applications[0].connection, null);
  const refused = await h.call(`${h.appPath}/pulls/6/import`, { method: 'POST', session });
  assert.deepEqual([refused.status, refused.body.error], [409, 'APPLICATION_NOT_CONNECTED']);
  assert.deepEqual(h.requests, []);
});

test('pr-assurance HTTP / an archived application cannot be connected or imported into', async t => {
  const h = await fixture(t), session = await h.login(author);
  assert.equal((await h.call(`/api/applications/${h.app.id}/archive`, { method: 'POST', session, data: {} })).status, 200);
  const connect = await h.call(`/api/applications/${h.app.id}/github`, { method: 'POST', session, data: { ...CONNECTION, githubToken: h.token } });
  assert.deepEqual([connect.status, connect.body.error], [409, 'APPLICATION_ARCHIVED']);
  assert.equal((await h.call(`${h.appPath}/pulls/6/import`, { method: 'POST', session })).body.error, 'APPLICATION_ARCHIVED');
  assert.deepEqual((await h.call('/api/pr-assurance', { session })).body.applications, []);
  assert.deepEqual(h.requests, []);
});
