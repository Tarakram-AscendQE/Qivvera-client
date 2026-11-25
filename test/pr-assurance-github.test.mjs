import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient } from '../backend/server/pr-assurance/github.mjs';
import { SCENARIO, loadPrAssuranceConfig } from '../backend/server/pr-assurance/config.mjs';

const TOKEN = 'github_pat_TEST_ONLY_0123456789abcdef';
const SHA = 'af51c26b0b9f94894cccfaa5b0fb893221952c65';
const CORRELATION = '6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const reply = (status, body = null, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** A stand-in for fetch: records every request and answers from the list, in order. */
function github(...answers) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, client: createGitHubClient({ secretEnv: { [SCENARIO.tokenEnv]: TOKEN }, fetchFn }) };
}
const workflowRun = (overrides = {}) => ({
  id: 42, display_title: `qivvera ${CORRELATION}`, status: 'in_progress', conclusion: null, head_sha: 'b'.repeat(40),
  html_url: 'https://github.com/prcheck-live/prcheck-verifiers/actions/runs/42', created_at: '2026-11-26T10:00:05Z',
  repository: { id: SCENARIO.verifiers.repositoryId }, ...overrides,
});

test('pr-assurance github / the feature is off unless switched on, and the scenario is fixed', () => {
  assert.equal(loadPrAssuranceConfig({}).enabled, false);
  assert.equal(loadPrAssuranceConfig({ QIVVERA_PR_ASSURANCE_ENABLED: 'true' }).enabled, true);
  assert.deepEqual(SCENARIO.pulls, [6, 7, 8]);
  assert.deepEqual([SCENARIO.app.repositoryId, SCENARIO.verifiers.repositoryId], [1440617142, 1440617261]);
});

test('pr-assurance github / without a token nothing is sent to GitHub', async () => {
  let called = false;
  const client = createGitHubClient({ secretEnv: {}, fetchFn: async () => { called = true; } });
  assert.equal(client.tokenConfigured(), false);
  await assert.rejects(client.dispatch({ appSha: SHA, correlationId: CORRELATION }), { code: 'GITHUB_TOKEN_NOT_CONFIGURED' });
  assert.equal(called, false);
});

test('pr-assurance github / starting the workflow sends only the fixed workflow, commit and run id', async () => {
  const { calls, client } = github(reply(204));
  await client.dispatch({ appSha: SHA, correlationId: CORRELATION });
  assert.equal(calls[0].url, 'https://api.github.com/repos/prcheck-live/prcheck-verifiers/actions/workflows/qivvera-pr-assessment.yml/dispatches');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].redirect, 'manual');
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(calls[0].body, { ref: 'main', inputs: { app_sha: SHA, correlation_id: CORRELATION } });
});

test('pr-assurance github / a malformed commit or run id never reaches GitHub', async () => {
  const { calls, client } = github();
  await assert.rejects(client.dispatch({ appSha: 'af51c26', correlationId: CORRELATION }), { code: 'INVALID_COMMIT' });
  await assert.rejects(client.dispatch({ appSha: SHA, correlationId: 'x; rm -rf /' }), { code: 'INVALID_ID' });
  assert.equal(calls.length, 0);
});

test('pr-assurance github / when GitHub does not answer a start request, the outcome is uncertain', async () => {
  const { client } = github(new TypeError('fetch failed'));
  await assert.rejects(client.dispatch({ appSha: SHA, correlationId: CORRELATION }), { code: 'GITHUB_DISPATCH_UNCERTAIN' });
});

test('pr-assurance github / refusals name what is wrong without exposing the token', async () => {
  const cases = [
    [reply(401, { message: 'Bad credentials' }), 'GITHUB_TOKEN_REJECTED', /QIVVERA_PR_ASSURANCE_GITHUB_TOKEN/],
    [reply(403, { message: 'Resource not accessible' }), 'GITHUB_PERMISSION_MISSING', /Actions: read and write/],
    [reply(404, { message: 'Not Found' }), 'GITHUB_PERMISSION_MISSING', /Actions: read and write/],
    [reply(429, {}, { 'retry-after': '60' }), 'GITHUB_RATE_LIMITED', /limit/],
    [reply(302, null, { location: 'https://elsewhere.example' }), 'GITHUB_REDIRECT_REFUSED', /redirect/],
    [reply(502, {}), 'GITHUB_UNAVAILABLE', /GitHub/],
  ];
  for (const [answer, code, message] of cases) {
    const { client } = github(answer);
    const error = await client.dispatch({ appSha: SHA, correlationId: CORRELATION }).catch(e => e);
    assert.equal(error.code, code);
    assert.match(error.message, message);
    assert.doesNotMatch(JSON.stringify({ ...error, message: error.message, stack: error.stack }), new RegExp(TOKEN));
  }
});

test('pr-assurance github / the run Qivvera started is found by its correlation id, recent runs only', async () => {
  const { calls, client } = github(reply(200, { workflow_runs: [workflowRun({ id: 41, display_title: 'qivvera someone-else-0001' }), workflowRun()] }));
  const run = await client.findRun(CORRELATION, '2026-11-26T10:00:00.000Z');
  assert.deepEqual(run, { id: 42, status: 'in_progress', conclusion: null, url: 'https://github.com/prcheck-live/prcheck-verifiers/actions/runs/42', headSha: 'b'.repeat(40) });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/repos/prcheck-live/prcheck-verifiers/actions/workflows/qivvera-pr-assessment.yml/runs');
  assert.equal(url.searchParams.get('event'), 'workflow_dispatch');
  assert.equal(url.searchParams.get('created'), '>=2026-11-26T09:59:00Z');
});

test('pr-assurance github / no matching run yet is not an error', async () => {
  const { client } = github(reply(200, { workflow_runs: [] }));
  assert.equal(await client.findRun(CORRELATION, '2026-11-26T10:00:00.000Z'), null);
});

test('pr-assurance github / a run from another repository or with another title is refused', async () => {
  const { client } = github(reply(200, workflowRun({ repository: { id: 1 } })), reply(200, workflowRun({ display_title: 'something else' })));
  await assert.rejects(client.getRun(42, CORRELATION), { code: 'GITHUB_UNEXPECTED_RUN' });
  await assert.rejects(client.getRun(42, CORRELATION), { code: 'GITHUB_UNEXPECTED_RUN' });
});

test('pr-assurance github / only a check run written by GitHub Actions is read', async () => {
  const forged = { id: 9, name: `qivvera-evidence ${CORRELATION}`, status: 'completed', conclusion: 'success', app: { slug: 'someone-elses-app' }, output: { text: 'forged' } };
  const real = { ...forged, id: 10, app: { slug: 'github-actions' }, output: { text: '{"kind":"qivvera.pr-assessment/v1"}' } };
  const { calls, client } = github(reply(200, { check_runs: [forged, real] }));
  const checkRun = await client.findCheckRun('b'.repeat(40), CORRELATION);
  assert.deepEqual(checkRun, { id: 10, status: 'completed', conclusion: 'success', text: '{"kind":"qivvera.pr-assessment/v1"}' });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, `/repos/prcheck-live/prcheck-verifiers/commits/${'b'.repeat(40)}/check-runs`);
  assert.equal(url.searchParams.get('check_name'), `qivvera-evidence ${CORRELATION}`);
});

test('pr-assurance github / importing a PR reads only the pinned repository and the three demo PRs', async () => {
  const pr = {
    number: 6, state: 'open', merged: false, title: 'VP-184: bank-change request and approval', body: null, draft: false,
    head: { sha: SHA, ref: 'feature/VP-184-v1-initial', repo: { id: SCENARIO.app.repositoryId, full_name: 'prcheck-live/vendorpay-app' } },
    base: { sha: 'c'.repeat(40), ref: 'main', repo: { id: SCENARIO.app.repositoryId, full_name: 'prcheck-live/vendorpay-app' } },
  };
  const { calls, client } = github(reply(200, pr));
  const pull = await client.readPull(6);
  assert.deepEqual([pull.pullNumber, pull.headSha, pull.headRef, pull.repository], [6, SHA, 'feature/VP-184-v1-initial', 'prcheck-live/vendorpay-app']);
  assert.equal(calls[0].url, 'https://api.github.com/repos/prcheck-live/vendorpay-app/pulls/6');
  await assert.rejects(client.readPull(5), { code: 'PULL_NOT_IN_SCENARIO' });
});
