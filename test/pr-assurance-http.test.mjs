import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openPrAssuranceService } from '../backend/server/pr-assurance/service.mjs';
import { SCENARIO } from '../backend/server/pr-assurance/config.mjs';
import { testDatabase } from './postgres-test-database.mjs';

const author = { email: 'pr-author@example.test', roles: ['AUTHOR'] };
const authority = { email: 'pr-authority@example.test', roles: ['POLICY_AUTHORITY'] };
const viewer = { email: 'pr-viewer@example.test', roles: ['VIEWER'] };
const ORIGIN = 'http://127.0.0.1:3027';
const HEADS = { 6: 'af51c26b0b9f94894cccfaa5b0fb893221952c65', 7: 'ae50debcd01bcc47fc137855cbc21b0e72107f1e', 8: 'b62db000bfef1449fa64588542bdb45d5abe9589' };
const repo = { id: SCENARIO.app.repositoryId, full_name: 'prcheck-live/vendorpay-app' };
const githubPull = number => ({
  number, state: 'open', merged: false, draft: false, title: `VP-184 v${number - 5}`, body: null,
  head: { sha: HEADS[number], ref: `feature/VP-184-v${number - 5}`, repo }, base: { sha: '3'.repeat(40), ref: 'main', repo },
});

/** A real server on a random port, with a stand-in GitHub that answers PR reads. */
async function fixture(t, { token = randomBytes(24).toString('hex'), withFeature = true } = {}) {
  const database = await testDatabase();
  const workflow = await openWorkflowRepository({ ...database, migrate: true });
  t.after(() => workflow.close());
  const requests = [];
  const fetchFn = async url => {
    requests.push(url);
    const number = Number(new URL(url).pathname.split('/').pop());
    return new Response(JSON.stringify(githubPull(number)), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const prAssurance = withFeature
    ? await openPrAssuranceService({ database, migrate: true, fetchFn, secretEnv: token ? { [SCENARIO.tokenEnv]: token } : {} })
    : null;
  if (prAssurance) t.after(() => prAssurance.close());
  const password = randomUUID() + randomUUID();
  const server = createApplicationServer({ repository: workflow, prAssurance, publicOrigin: ORIGIN,
    accounts: [author, authority, viewer].map(a => ({ ...a, passwordHash: hashPassword(password) })) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', session, from = ORIGIN, csrf } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(method !== 'GET' ? { Origin: from, 'Content-Type': 'application/json' } : {}),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': csrf ?? session.csrfToken } : {}) } });
    return { status: response.status, body: await response.json() };
  };
  const login = async account => {
    const response = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password }) });
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrfToken: (await response.json()).csrfToken };
  };
  return { call, login, requests, token };
}

test('pr-assurance HTTP / switched off: no routes, and the workspace says so', async t => {
  const h = await fixture(t, { withFeature: false }), session = await h.login(author);
  assert.equal((await h.call('/api/pr-assurance', { session })).status, 404);
  assert.equal((await h.call('/api/workspace', { session })).body.capabilities.prAssurance, false);
});

test('pr-assurance HTTP / the scenario lists the three PRs and the rules, and never the token', async t => {
  const h = await fixture(t), session = await h.login(author);
  const { status, body } = await h.call('/api/pr-assurance', { session });
  assert.equal(status, 200);
  assert.deepEqual(body.pulls.map(p => [p.number, p.pull, p.latestRun]), [[6, null, null], [7, null, null], [8, null, null]]);
  assert.deepEqual([body.rules.policies, body.rules.obligations, body.rules.profile.id], [6, 14, 'payments-critical']);
  assert.deepEqual([body.githubTokenConfigured, body.canEvaluate], [true, true]);
  assert.equal(JSON.stringify(body).includes(h.token), false);
  assert.equal((await h.call('/api/workspace', { session })).body.capabilities.prAssurance, true);
});

test('pr-assurance HTTP / an author imports PR #6 with its exact head commit from GitHub', async t => {
  const h = await fixture(t), session = await h.login(author);
  const imported = await h.call('/api/pr-assurance/pulls/6/import', { method: 'POST', session });
  assert.equal(imported.status, 200);
  assert.deepEqual([imported.body.pullNumber, imported.body.headSha, imported.body.headRef, imported.body.importedBy], [6, HEADS[6], 'feature/VP-184-v1', author.email]);
  assert.deepEqual(h.requests, ['https://api.github.com/repos/prcheck-live/vendorpay-app/pulls/6']);
  const scenario = (await h.call('/api/pr-assurance', { session })).body;
  assert.equal(scenario.pulls[0].pull.headSha, HEADS[6]);
});

test('pr-assurance HTTP / a policy authority may import; a viewer may read but not import', async t => {
  const h = await fixture(t);
  assert.equal((await h.call('/api/pr-assurance/pulls/7/import', { method: 'POST', session: await h.login(authority) })).status, 200);
  const session = await h.login(viewer);
  assert.equal((await h.call('/api/pr-assurance', { session })).body.canEvaluate, false);
  const refused = await h.call('/api/pr-assurance/pulls/8/import', { method: 'POST', session });
  assert.deepEqual([refused.status, refused.body.error], [403, 'FORBIDDEN']);
});

test('pr-assurance HTTP / only the demo PRs #6, #7 and #8 can be imported', async t => {
  const h = await fixture(t), session = await h.login(author);
  const other = await h.call('/api/pr-assurance/pulls/5/import', { method: 'POST', session });
  assert.deepEqual([other.status, other.body.error], [400, 'PULL_NOT_IN_SCENARIO']);
  assert.equal((await h.call('/api/pr-assurance/pulls/6abc/import', { method: 'POST', session })).status, 404);
  assert.deepEqual(h.requests, []);
});

test('pr-assurance HTTP / reads need a session; imports need the workspace origin and the CSRF token', async t => {
  const h = await fixture(t), session = await h.login(author);
  assert.equal((await h.call('/api/pr-assurance')).status, 401);
  assert.equal((await h.call('/api/pr-assurance/pulls/6/import', { method: 'POST', session, from: 'https://evil.invalid' })).status, 403);
  assert.equal((await h.call('/api/pr-assurance/pulls/6/import', { method: 'POST', session, csrf: 'wrong' })).status, 403);
  assert.deepEqual(h.requests, []);
});

test('pr-assurance HTTP / without a token, importing says what is missing and GitHub is not called', async t => {
  const h = await fixture(t, { token: null }), session = await h.login(author);
  assert.equal((await h.call('/api/pr-assurance', { session })).body.githubTokenConfigured, false);
  const refused = await h.call('/api/pr-assurance/pulls/6/import', { method: 'POST', session });
  assert.equal(refused.body.error, 'GITHUB_CREDENTIAL_UNAVAILABLE');
  assert.equal(refused.status, 503);
  assert.deepEqual(h.requests, []);
});
