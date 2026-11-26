import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createGitHubClient } from '../backend/server/pr-assurance/github.mjs';
import { loadPrAssuranceConfig } from '../backend/server/pr-assurance/config.mjs';
import { connectionInput, inspectConnection, parseRepositoryUrl } from '../backend/server/pr-assurance/connect.mjs';
import { CREDENTIAL_KEY_ENV, loadCredentialKey } from '../backend/server/pr-assurance/credentials.mjs';
import { loadBundledSnapshots } from '../backend/server/pr-assurance/rules.mjs';

const TOKEN = 'github_pat_TEST_ONLY_0123456789abcdef';
const SHA = 'af51c26b0b9f94894cccfaa5b0fb893221952c65';
const CORRELATION = '6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const APP_ID = 1440617142, TESTS_ID = 1440617261, PROFILES_ID = 1440617000;
const CONNECTION = Object.freeze({
  app: { repository: 'prcheck-live/vendorpay-app', repositoryId: APP_ID },
  tests: { repository: 'prcheck-live/prcheck-verifiers', repositoryId: TESTS_ID, ref: 'main' },
});
const reply = (status, body = null, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const leaks = (error, token = TOKEN) => JSON.stringify({ ...error, message: error.message, stack: error.stack }).includes(token);

/** A stand-in for fetch: records every request and answers from the list, in order. */
function github(...answers) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, client: createGitHubClient({ token: TOKEN, connection: CONNECTION, fetchFn }) };
}
const workflowRun = (overrides = {}) => ({
  id: 42, display_title: `qivvera ${CORRELATION}`, status: 'in_progress', conclusion: null, head_sha: 'b'.repeat(40),
  html_url: 'https://github.com/prcheck-live/prcheck-verifiers/actions/runs/42', created_at: '2026-11-26T10:00:05Z',
  repository: { id: TESTS_ID }, ...overrides,
});

test('pr-assurance github / the feature is off unless switched on', () => {
  assert.equal(loadPrAssuranceConfig({}).enabled, false);
  assert.equal(loadPrAssuranceConfig({ QIVVERA_PR_ASSURANCE_ENABLED: 'true' }).enabled, true);
});

test('pr-assurance github / without a usable token nothing is sent to GitHub', () => {
  for (const token of [undefined, '', 'short', `${TOKEN}\n`, 'has spaces in it 0123456789']) {
    assert.throws(() => createGitHubClient({ token, connection: CONNECTION, fetchFn: async () => assert.fail('called') }), { code: 'GITHUB_TOKEN_NOT_CONFIGURED' });
  }
});

test('pr-assurance github / starting the workflow uses the application\'s test repository, its branch, and its own token', async () => {
  const { calls, client } = github(reply(204));
  await client.dispatch({ appSha: SHA, correlationId: CORRELATION });
  assert.equal(calls[0].url, 'https://api.github.com/repos/prcheck-live/prcheck-verifiers/actions/workflows/qivvera-pr-assessment.yml/dispatches');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].redirect, 'manual');
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(calls[0].body, { ref: 'main', inputs: { app_sha: SHA, correlation_id: CORRELATION } });

  const other = [];
  const project = createGitHubClient({ token: 'ghp_ProjectB_token_00000000000', fetchFn: async (url, init) => { other.push([url, init.headers.Authorization, JSON.parse(init.body).ref]); return reply(204); },
    connection: { app: { repository: 'acme/b-app', repositoryId: 7 }, tests: { repository: 'acme/b-tests', repositoryId: 8, ref: 'release' } } });
  await project.dispatch({ appSha: SHA, correlationId: CORRELATION });
  assert.deepEqual(other, [['https://api.github.com/repos/acme/b-tests/actions/workflows/qivvera-pr-assessment.yml/dispatches', 'Bearer ghp_ProjectB_token_00000000000', 'release']]);
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
    [reply(401, { message: 'Bad credentials' }), 'GITHUB_TOKEN_REJECTED', /application's GitHub settings/],
    [reply(403, { message: 'Resource not accessible' }), 'GITHUB_PERMISSION_MISSING', /Actions: read and write on prcheck-live\/prcheck-verifiers/],
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
    assert.equal(leaks(error), false);
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

const githubPull = (number, repoId = APP_ID, fullName = 'prcheck-live/vendorpay-app') => ({
  number, state: 'open', merged: false, title: 'VP-184: bank-change request and approval', body: null, draft: false, user: { login: 'dev' }, updated_at: '2026-11-25T10:00:00Z',
  head: { sha: SHA, ref: 'feature/VP-184-v1-initial', repo: { id: repoId, full_name: fullName } },
  base: { sha: 'c'.repeat(40), ref: 'main', repo: { id: repoId, full_name: fullName } },
});

test('pr-assurance github / importing reads any open PR, but only from the application\'s own repository', async () => {
  const { calls, client } = github(reply(200, githubPull(12)), reply(200, githubPull(13, 999, 'someone/else')));
  const pull = await client.readPull(12);
  assert.deepEqual([pull.pullNumber, pull.headSha, pull.headRef, pull.repository], [12, SHA, 'feature/VP-184-v1-initial', 'prcheck-live/vendorpay-app']);
  assert.equal(calls[0].url, 'https://api.github.com/repos/prcheck-live/vendorpay-app/pulls/12');
  await assert.rejects(client.readPull(13), { code: 'GITHUB_REPOSITORY_MISMATCH' });
  await assert.rejects(client.readPull(0), { code: 'INVALID_PULL_NUMBER' });
});

test('pr-assurance github / the open PR list is read from the application\'s repository', async () => {
  const { calls, client } = github(reply(200, [githubPull(8), githubPull(7), githubPull(6)]));
  assert.deepEqual((await client.listOpenPulls()).map(p => p.number), [8, 7, 6]);
  const url = new URL(calls[0].url);
  assert.deepEqual([url.pathname, url.searchParams.get('state')], ['/repos/prcheck-live/vendorpay-app/pulls', 'open']);
});

test('pr-assurance github / a run link that is not this application\'s Actions address is dropped', async () => {
  for (const html_url of ['javascript:alert(1)', 'https://evil.example/actions/runs/42', 'https://github.com/someone/else/actions/runs/42', 'https://github.com/prcheck-live/prcheckXverifiers/actions/runs/42']) {
    const { client } = github(reply(200, workflowRun({ html_url })));
    assert.equal((await client.getRun(42, CORRELATION)).url, null);
  }
  const { client } = github(reply(200, workflowRun()));
  assert.equal((await client.getRun(42, CORRELATION)).url, 'https://github.com/prcheck-live/prcheck-verifiers/actions/runs/42');
});

// ---- Token encryption ------------------------------------------------------------------------------
const KEY = randomBytes(32).toString('base64');

test('pr-assurance credentials / the token is encrypted per application and decrypts only for that application', () => {
  const credentials = loadCredentialKey({ [CREDENTIAL_KEY_ENV]: KEY });
  const a = randomUUID(), b = randomUUID();
  const sealed = credentials.seal(TOKEN, a);
  assert.equal(sealed.ciphertext.includes(TOKEN), false);
  assert.equal(Buffer.from(sealed.ciphertext.split('.')[3], 'base64').toString('utf8').includes(TOKEN), false);
  assert.notEqual(credentials.seal(TOKEN, a).ciphertext, sealed.ciphertext, 'a fresh nonce every time');
  assert.equal(credentials.open(sealed, a), TOKEN);
  assert.throws(() => credentials.open(sealed, b), { code: 'GITHUB_TOKEN_UNREADABLE' });
  const [format, nonce, tag, body] = sealed.ciphertext.split('.');
  const flipped = Buffer.from(body, 'base64'); flipped[0] ^= 1;
  assert.throws(() => credentials.open({ ...sealed, ciphertext: [format, nonce, tag, flipped.toString('base64')].join('.') }, a), { code: 'GITHUB_TOKEN_UNREADABLE' });
});

test('pr-assurance credentials / a replaced key asks for the token again; a missing key is allowed; a malformed key is refused', () => {
  const sealed = loadCredentialKey({ [CREDENTIAL_KEY_ENV]: KEY }).seal(TOKEN, CORRELATION);
  const replaced = loadCredentialKey({ [CREDENTIAL_KEY_ENV]: randomBytes(32).toString('base64') });
  const error = (() => { try { replaced.open(sealed, CORRELATION); } catch (e) { return e; } })();
  assert.equal(error.code, 'GITHUB_TOKEN_KEY_CHANGED');
  assert.equal(leaks(error), false);
  assert.equal(loadCredentialKey({}), null);
  for (const bad of ['not-base64!', randomBytes(16).toString('base64'), 'a'.repeat(44)]) assert.throws(() => loadCredentialKey({ [CREDENTIAL_KEY_ENV]: bad }), /INVALID_CREDENTIAL_KEY/);
});

// ---- Connecting an application (registration checks) ------------------------------------------------
test('pr-assurance connect / repository URLs must be plain https://github.com/<owner>/<repo> addresses', () => {
  assert.equal(parseRepositoryUrl('https://github.com/prcheck-live/vendorpay-app', 'X'), 'prcheck-live/vendorpay-app');
  assert.equal(parseRepositoryUrl('https://github.com/prcheck-live/vendorpay-app.git', 'X'), 'prcheck-live/vendorpay-app');
  assert.equal(parseRepositoryUrl('https://github.com/prcheck-live/vendorpay-app/', 'X'), 'prcheck-live/vendorpay-app');
  for (const bad of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'https://token@github.com/a/b', 'https://github.com/a', 'https://github.com/a/b/tree/main',
    'https://github.com/a/b?x=1', 'https://github.com:8443/a/b', 'https://github.com/../b', 'not a url', 'https://github.com/a/..']) {
    assert.throws(() => parseRepositoryUrl(bad, 'Application repository URL'), { code: 'INVALID_URL' }, bad);
  }
});

test('pr-assurance connect / every field is required, the token is checked for shape, and no error repeats it', () => {
  const ok = { repositoryUrl: 'https://github.com/a/app', testRepositoryUrl: 'https://github.com/a/tests', profilesRepositoryUrl: 'https://github.com/a/profiles', githubToken: ` ${TOKEN} ` };
  assert.deepEqual(connectionInput(ok), { app: 'a/app', tests: 'a/tests', profiles: 'a/profiles', token: TOKEN });
  for (const key of Object.keys(ok)) {
    const error = (() => { try { connectionInput({ ...ok, [key]: '' }); } catch (e) { return e; } })();
    assert.ok(error, key);
    assert.equal(leaks(error), false);
  }
  const bad = 'github_pat with a space 0123456789';
  const error = (() => { try { connectionInput({ ...ok, githubToken: bad }); } catch (e) { return e; } })();
  assert.equal(error.code, 'INVALID_GITHUB_TOKEN');
  assert.equal(leaks(error, bad), false);
  assert.throws(() => connectionInput({ ...ok, extra: 1 }), { code: 'UNKNOWN_FIELD' });
});

/** A stand-in GitHub for connecting: three repositories, each answer overridable by path. */
function connectGitHub(overrides = {}) {
  const repos = { 'acme/app': 101, 'acme/tests': 102, 'acme/profiles': 103 };
  const calls = [];
  const fetchFn = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    calls.push({ path: pathname, query: searchParams.toString(), auth: init.headers.Authorization, accept: init.headers.Accept });
    for (const [pattern, answer] of Object.entries(overrides)) if (new RegExp(pattern).test(pathname)) return typeof answer === 'function' ? answer() : answer;
    const [, , owner, repo, ...rest] = pathname.split('/');
    const full = `${owner}/${repo}`, id = repos[full];
    if (!id) return reply(404, { message: 'Not Found' });
    if (!rest.length) return reply(200, { id, full_name: full, default_branch: 'main' });
    if (rest[0] === 'pulls') return reply(200, []);
    if (rest[0] === 'actions') return reply(200, { id: 5, state: 'active', path: '.github/workflows/qivvera-pr-assessment.yml' });
    if (rest[0] === 'git') return reply(200, { object: { sha: (full === 'acme/profiles' ? 'a' : 'b').repeat(40) } });
    if (rest[0] === 'commits') return reply(200, { check_runs: [] });
    if (rest[0] === 'contents') return reply(404, { message: 'Not Found' });
    return reply(404, {});
  };
  return { calls, fetchFn };
}
const input = { app: 'acme/app', tests: 'acme/tests', profiles: 'acme/profiles', token: TOKEN };
const bundled = loadBundledSnapshots();

test('pr-assurance connect / a valid token and three reachable repositories are recorded with their GitHub ids', async () => {
  const { calls, fetchFn } = connectGitHub();
  const result = await inspectConnection(input, { fetchFn, bundled });
  assert.deepEqual(result, {
    app: { repository: 'acme/app', repositoryId: 101 }, tests: { repository: 'acme/tests', repositoryId: 102, ref: 'main' },
    profiles: { repository: 'acme/profiles', repositoryId: 103, commit: 'a'.repeat(40) }, rules: null, rulesSource: null,
  });
  assert.ok(calls.every(c => c.auth === `Bearer ${TOKEN}`));
  assert.deepEqual(new Set(calls.map(c => c.path)), new Set([
    '/repos/acme/app', '/repos/acme/app/pulls', '/repos/acme/tests', '/repos/acme/tests/actions/workflows/qivvera-pr-assessment.yml',
    '/repos/acme/tests/git/ref/heads/main', `/repos/acme/tests/commits/${'b'.repeat(40)}/check-runs`,
    '/repos/acme/profiles', '/repos/acme/profiles/git/ref/heads/main', '/repos/acme/profiles/contents/.qivvera/rules-snapshot.json']));
  assert.equal(calls.find(c => c.path.endsWith('rules-snapshot.json')).query, `ref=${'a'.repeat(40)}`);
});

test('pr-assurance connect / an invalid token, an inaccessible repository or a missing permission is reported, never saved', async () => {
  const cases = [
    [{ '^/repos/acme/app$': reply(401, { message: 'Bad credentials' }) }, 'GITHUB_TOKEN_REJECTED', /wrong, expired or revoked/],
    [{ '^/repos/acme/profiles$': reply(404, { message: 'Not Found' }) }, 'GITHUB_REPOSITORY_INACCESSIBLE', /Profiles repository URL: acme\/profiles was not found, or this token has no access/],
    [{ '/pulls$': reply(403, { message: 'Resource not accessible by personal access token' }) }, 'GITHUB_PERMISSION_MISSING', /Pull requests: read on acme\/app/],
    [{ '/check-runs$': reply(403, { message: 'Resource not accessible' }) }, 'GITHUB_PERMISSION_MISSING', /Checks: read on acme\/tests/],
    [{ '/actions/workflows/': reply(404, { message: 'Not Found' }) }, 'TEST_WORKFLOW_NOT_FOUND', /acme\/tests has no .github\/workflows\/qivvera-pr-assessment.yml/],
    [{ '/actions/workflows/': reply(200, { state: 'disabled_manually' }) }, 'TEST_WORKFLOW_DISABLED', /disabled/],
    [{ '^/repos/acme/tests$': reply(200, { id: 102, full_name: 'acme/renamed', default_branch: 'main' }) }, 'GITHUB_REPOSITORY_MISMATCH', /different repository/],
    [{ '^/repos/acme/app$': () => { throw new TypeError('fetch failed'); } }, 'GITHUB_UNAVAILABLE', /could not be reached/],
  ];
  for (const [overrides, code, message] of cases) {
    const { fetchFn } = connectGitHub(overrides);
    const error = await inspectConnection(input, { fetchFn, bundled }).catch(e => e);
    assert.equal(error.code, code, code);
    assert.match(error.message, message);
    if (code === 'GITHUB_PERMISSION_MISSING') assert.equal(error.status, 400);
    assert.equal(leaks(error), false);
  }
});

const snapshot = JSON.parse(readFileSync(new URL('../fixtures/pr-assurance/vendorpay-policies-e408884.json', import.meta.url), 'utf8'));

test('pr-assurance connect / rules come from the profiles repository\'s published snapshot, if it names that repository', async () => {
  const published = structuredClone(snapshot);
  const fromRepo = connectGitHub({
    '^/repos/prcheck-live/vendorpay-policies$': reply(200, { id: 103, full_name: 'prcheck-live/vendorpay-policies', default_branch: 'main' }),
    '^/repos/prcheck-live/vendorpay-policies/git/': reply(200, { object: { sha: 'e'.repeat(40) } }),
    '/contents/': reply(200, published),
  });
  const result = await inspectConnection({ ...input, profiles: 'prcheck-live/vendorpay-policies' }, { fetchFn: fromRepo.fetchFn, bundled });
  assert.deepEqual([result.rulesSource, result.rules.snapshotDigest, result.profiles.commit], ['REPOSITORY', snapshot.snapshotDigest, 'e'.repeat(40)]);
  assert.equal(fromRepo.calls.find(c => c.path.includes('/contents/')).accept, 'application/vnd.github.raw+json');

  // A valid snapshot published in a repository it was not taken from is refused, and so is an altered one.

  const elsewhere = connectGitHub({ '/contents/': reply(200, published) });
  await assert.rejects(inspectConnection(input, { fetchFn: elsewhere.fetchFn, bundled }), error => error.code === 'RULES_SNAPSHOT_INVALID' && /taken from prcheck-live\/vendorpay-policies, not from this repository/.test(error.message));
  const tampered = connectGitHub({
    '^/repos/prcheck-live/vendorpay-policies$': reply(200, { id: 103, full_name: 'prcheck-live/vendorpay-policies', default_branch: 'main' }),
    '^/repos/prcheck-live/vendorpay-policies/git/': reply(200, { object: { sha: 'e'.repeat(40) } }),
    '/contents/': reply(200, { ...published, policies: published.policies.slice(1) }),
  });
  await assert.rejects(inspectConnection({ ...input, profiles: 'prcheck-live/vendorpay-policies' }, { fetchFn: tampered.fetchFn, bundled }), { code: 'RULES_SNAPSHOT_INVALID' });
});

test('pr-assurance connect / without a published snapshot, the shipped one is used for the repository it was taken from', async () => {
  const { fetchFn } = connectGitHub({
    '^/repos/prcheck-live/vendorpay-policies$': reply(200, { id: 103, full_name: 'prcheck-live/vendorpay-policies', default_branch: 'main' }),
    '^/repos/prcheck-live/vendorpay-policies/git/': reply(200, { object: { sha: 'e'.repeat(40) } }),
  });
  const result = await inspectConnection({ ...input, profiles: 'prcheck-live/vendorpay-policies' }, { fetchFn, bundled });
  assert.deepEqual([result.rulesSource, result.rules.snapshotDigest], ['BUNDLED', snapshot.snapshotDigest]);
});

// ---- Writing to GitHub (commit status and one PR comment), with the application's own token ---------
test('pr-assurance github / writing to GitHub is off unless switched on exactly', () => {
  assert.equal(loadPrAssuranceConfig({}).githubWrite, false);
  assert.equal(loadPrAssuranceConfig({ QIVVERA_PR_ASSURANCE_GITHUB_WRITE: 'yes' }).githubWrite, false);
  assert.equal(loadPrAssuranceConfig({ QIVVERA_PR_ASSURANCE_GITHUB_WRITE: 'true' }).githubWrite, true);
});

test('pr-assurance github / the commit status goes only to the application\'s repository under the name "Qivvera"', async () => {
  const { calls, client } = github(reply(201, {}));
  await client.setCommitStatus(SHA, { state: 'failure', description: 'x'.repeat(200), targetUrl: 'https://qivvera.example/#/pr-assurance/runs/1' });
  assert.equal(calls[0].url, `https://api.github.com/repos/prcheck-live/vendorpay-app/statuses/${SHA}`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(calls[0].body, { state: 'failure', context: 'Qivvera', description: 'x'.repeat(140), target_url: 'https://qivvera.example/#/pr-assurance/runs/1' });

  const other = [];
  const project = createGitHubClient({ token: 'ghp_ProjectB_token_00000000000', fetchFn: async (url, init) => { other.push([url, init.headers.Authorization]); return reply(201, {}); },
    connection: { app: { repository: 'acme/b-app', repositoryId: 7 }, tests: { repository: 'acme/b-tests', repositoryId: 8, ref: 'main' } } });
  await project.setCommitStatus(SHA, { state: 'pending', description: 'x' });
  assert.deepEqual(other, [[`https://api.github.com/repos/acme/b-app/statuses/${SHA}`, 'Bearer ghp_ProjectB_token_00000000000']]);
});

test('pr-assurance github / a bad commit, state or link never reaches GitHub as given', async () => {
  const { calls, client } = github(reply(201, {}));
  await assert.rejects(client.setCommitStatus('af51c26', { state: 'success', description: 'ok' }), { code: 'INVALID_COMMIT' });
  await assert.rejects(client.setCommitStatus(SHA, { state: 'merged', description: 'ok' }), { code: 'INVALID_STATUS' });
  await client.setCommitStatus(SHA, { state: 'success', description: 'ok', targetUrl: 'javascript:alert(1)' });
  assert.equal(calls.length, 1);
  assert.equal('target_url' in calls[0].body, false);
});

test('pr-assurance github / a missing write permission is named, without the token', async () => {
  const { client } = github(reply(403, { message: 'Resource not accessible' }));
  const error = await client.setCommitStatus(SHA, { state: 'pending', description: 'x' }).catch(e => e);
  assert.equal(error.code, 'GITHUB_PERMISSION_MISSING');
  assert.match(error.message, /Commit statuses: read and write on prcheck-live\/vendorpay-app/);
  assert.equal(leaks(error), false);
});

test('pr-assurance github / the first PR comment is added with the marker', async () => {
  const { calls, client } = github(reply(200, { login: 'qivvera-bot' }), reply(200, [{ id: 5, user: { login: 'dev' }, body: 'Looks good' }]), reply(201, { id: 9 }));
  assert.deepEqual(await client.upsertPullComment(6, 'Result'), { updated: false });
  assert.equal(calls[1].url, 'https://api.github.com/repos/prcheck-live/vendorpay-app/issues/6/comments?per_page=100');
  assert.equal(calls[2].method, 'POST');
  assert.equal(calls[2].url, 'https://api.github.com/repos/prcheck-live/vendorpay-app/issues/6/comments');
  assert.deepEqual(calls[2].body, { body: '<!-- qivvera-pr-assurance -->\nResult' });
});

test('pr-assurance github / a later result edits Qivvera\'s own comment, never someone else\'s marked comment', async () => {
  const marked = '<!-- qivvera-pr-assurance -->\nOld';
  const { calls, client } = github(reply(200, { login: 'qivvera-bot' }),
    reply(200, [{ id: 5, user: { login: 'dev' }, body: marked }, { id: 7, user: { login: 'qivvera-bot' }, body: marked }]), reply(200, { id: 7 }));
  assert.deepEqual(await client.upsertPullComment(7, 'New'), { updated: true });
  assert.equal(calls[2].method, 'PATCH');
  assert.equal(calls[2].url, 'https://api.github.com/repos/prcheck-live/vendorpay-app/issues/comments/7');
});

test('pr-assurance github / a malformed pull-request number never reaches GitHub for a comment', async () => {
  const { calls, client } = github();
  for (const bad of [0, -1, 1.5, '6']) await assert.rejects(client.upsertPullComment(bad, 'x'), { code: 'INVALID_PULL_NUMBER' });
  assert.equal(calls.length, 0);
});

test('pr-assurance github / a request GitHub finds invalid names GitHub\'s own reason', async () => {
  const { client } = github(reply(422, { message: 'Validation Failed', errors: [{ resource: 'Status', field: 'target_url', code: 'invalid', message: 'target_url is not a valid URL' }] }));
  const error = await client.setCommitStatus(SHA, { state: 'pending', description: 'x' }).catch(e => e);
  assert.equal(error.code, 'GITHUB_REQUEST_INVALID');
  assert.equal(error.message, 'GitHub did not accept the request: Validation Failed: target_url is not a valid URL');
});
