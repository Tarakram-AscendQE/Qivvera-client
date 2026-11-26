import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openPrAssuranceService } from '../backend/server/pr-assurance/service.mjs';
import { testDatabase } from './postgres-test-database.mjs';

const author = { email: 'run-author@example.test', roles: ['AUTHOR'] };
const viewer = { email: 'run-viewer@example.test', roles: ['VIEWER'] };
const ORIGIN = 'http://127.0.0.1:3028';
const TOKEN = 'github_pat_TEST_ONLY_runs_0123456789';
/** Project B's own token: it can reach only acme's repositories, and project A's token cannot. */
const TOKEN_B = 'github_pat_TEST_ONLY_projectB_987654321';
const REPO_IDS = { 'prcheck-live/vendorpay-app': 1440617142, 'prcheck-live/prcheck-verifiers': 1440617261, 'prcheck-live/vendorpay-policies': 1440617000,
  'acme/b-app': 501, 'acme/b-tests': 502, 'acme/b-profiles': 503 };
/** PR heads whose recorded evidence exists in fixtures/pr-assurance/evidence (PR #8's code commit is 3f6e20d). */
const HEADS = { 6: 'af51c26b0b9f94894cccfaa5b0fb893221952c65', 7: 'ae50debcd01bcc47fc137855cbc21b0e72107f1e', 8: '3f6e20da8e085a401d8c1ec67368fbeae3cc46b5' };
const VERIFIERS_SHA = '9'.repeat(40);
const sha256 = text => createHash('sha256').update(text).digest('hex');
const recorded = short => readFileSync(new URL(`../fixtures/pr-assurance/evidence/${short}.json`, import.meta.url), 'utf8');
const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The check-run text prcheck-verifiers' reporter writes, for one run. */
function checkRunText(run, { stage = 'done', evidenceFor = run.headSha.slice(0, 7), checks = 14, team = { total: 25, passed: 25, failed: 0, flaky: 0, skipped: 0 } } = {}) {
  const base = { kind: 'qivvera.pr-assessment/v1', correlationId: run.id, appSha: run.headSha, stage, message: stage === 'done' ? 'Assessment complete' : `At ${stage}`,
    checksTotal: 14, checks: Array.from({ length: checks }, (_, i) => ({ check: `V${i}/check`, outcome: 'passed', durationMs: 10 })), teamTests: stage === 'done' ? team : null };
  if (stage !== 'done') return JSON.stringify(base);
  const evidence = recorded(evidenceFor);
  return JSON.stringify({ ...base, evidence, evidenceSha256: sha256(evidence) });
}

/** A stand-in GitHub: PR reads, workflow starts, runs and check runs, each programmable per test. */
function fakeGitHub() {
  const state = { dispatches: [], calls: [], auth: [], revoked: new Set(), runs: new Map(), checkRuns: new Map(), dispatch: 'ok', down: false, statuses: [], comments: [], writes: 'ok' };
  const githubPull = (full, number) => ({ number, state: 'open', title: `PR ${number}`, user: { login: 'dev' }, draft: false, updated_at: '2026-11-25T10:00:00Z',
    head: { sha: HEADS[number], ref: `feature/${number}` }, base: { ref: 'main', repo: { id: REPO_IDS[full], full_name: full } } });
  const fetchFn = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    const [, , owner, name, ...rest] = pathname.split('/'), full = `${owner}/${name}`;
    state.calls.push(`${init.method} ${pathname}`);
    state.auth.push([full, init.headers.Authorization]);
    if (state.revoked.has(init.headers.Authorization)) return json(401, { message: 'Bad credentials' });
    if (pathname === '/user') return json(200, { login: init.headers.Authorization === `Bearer ${TOKEN_B}` ? 'b-bot' : 'qivvera-bot' });
    // Each token reaches only its own organisation's repositories.
    if (init.headers.Authorization !== `Bearer ${owner === 'acme' ? TOKEN_B : TOKEN}` || !REPO_IDS[full]) return json(404, { message: 'Not Found' });
    if (state.down && !pathname.includes('/pulls/')) throw new TypeError('fetch failed');
    if (!rest.length) return json(200, { id: REPO_IDS[full], full_name: full, default_branch: 'main' });
    if (rest[0] === 'statuses') {
      if (state.writes === 'forbidden') return json(403, { message: 'Resource not accessible by personal access token' });
      state.statuses.push({ repository: full, sha: rest[1], ...JSON.parse(init.body) });
      return json(201, {});
    }
    if (rest[0] === 'issues' && rest[2] === 'comments' && init.method === 'GET') {
      return json(200, state.comments.filter(c => c.pull === Number(rest[1])).map(c => ({ id: c.id, user: { login: 'qivvera-bot' }, body: c.body })));
    }
    if (rest[0] === 'issues' && rest[2] === 'comments') { state.comments.push({ id: state.comments.length + 1, repository: full, pull: Number(rest[1]), body: JSON.parse(init.body).body, edits: 0 }); return json(201, {}); }
    if (rest[0] === 'issues' && rest[1] === 'comments') { const c = state.comments.find(x => x.id === Number(rest[2])); c.body = JSON.parse(init.body).body; c.edits += 1; return json(200, {}); }
    if (rest[0] === 'git') return json(200, { object: { sha: VERIFIERS_SHA } });
    if (rest[0] === 'contents') return json(404, { message: 'Not Found' });
    if (pathname.endsWith('/actions/workflows/qivvera-pr-assessment.yml')) return json(200, { id: 1, state: 'active' });
    if (rest[0] === 'pulls' && rest.length === 1) return json(200, Object.keys(HEADS).map(n => githubPull(full, Number(n))));
    const pull = pathname.match(/\/repos\/[^/]+\/[^/]+\/pulls\/(\d+)$/);
    if (pull) {
      const repo = { id: REPO_IDS[full], full_name: full };
      return json(200, { number: Number(pull[1]), state: 'open', merged: false, draft: false, title: `PR ${pull[1]}`, body: null,
        head: { sha: HEADS[pull[1]], ref: `feature/${pull[1]}`, repo }, base: { sha: '3'.repeat(40), ref: 'main', repo } });
    }
    if (pathname.endsWith('/dispatches')) {
      if (state.dispatch === 'lost') { state.dispatches.push({ ...JSON.parse(init.body).inputs, repository: full }); throw new TypeError('fetch failed'); }
      if (state.dispatch === 'forbidden') return json(403, { message: 'Resource not accessible by personal access token' });
      state.dispatches.push({ ...JSON.parse(init.body).inputs, repository: full });
      return json(204, null);
    }
    const workflowRun = (cid, number) => ({ id: number, display_title: `qivvera ${cid}`, head_sha: VERIFIERS_SHA, html_url: `https://github.com/prcheck-live/prcheck-verifiers/actions/runs/${number}`,
      repository: { id: REPO_IDS['prcheck-live/prcheck-verifiers'] }, ...state.runs.get(cid) });
    if (pathname.endsWith('/actions/workflows/qivvera-pr-assessment.yml/runs')) {
      return json(200, { workflow_runs: [...state.runs.keys()].map((cid, i) => workflowRun(cid, 1000 + i)) });
    }
    const one = pathname.match(/\/actions\/runs\/(\d+)$/);
    if (one) {
      const cid = [...state.runs.keys()][Number(one[1]) - 1000];
      return json(200, workflowRun(cid, Number(one[1])));
    }
    if (pathname.endsWith('/check-runs')) {
      const cid = (searchParams.get('check_name') ?? '').replace('qivvera-evidence ', '');
      const text = state.checkRuns.get(cid);
      return json(200, { check_runs: text ? [{ id: 77, name: `qivvera-evidence ${cid}`, status: 'in_progress', conclusion: null, app: { slug: 'github-actions' }, output: { text } }] : [] });
    }
    return json(404, { message: 'Not Found' });
  };
  return { state, fetchFn,
    start: (run, status = 'in_progress', conclusion = null) => state.runs.set(run.id, { status, conclusion }),
    write: (run, text) => state.checkRuns.set(run.id, text) };
}

async function fixture(t, { credentialKey = randomBytes(32).toString('base64'), githubWrite = false, serverToken = null } = {}) {
  const database = await testDatabase();
  const workflow = await openWorkflowRepository({ ...database, migrate: true });
  t.after(() => workflow.close());
  const github = fakeGitHub();
  let clock = Date.now();
  const prAssurance = await openPrAssuranceService({ database, migrate: true, fetchFn: github.fetchFn, secretEnv: { ...(credentialKey ? { QIVVERA_CREDENTIAL_KEY: credentialKey } : {}), ...(serverToken ? { QIVVERA_PR_ASSURANCE_GITHUB_TOKEN: serverToken } : {}) }, now: () => clock,
    githubWrite, publicOrigin: ORIGIN });
  t.after(() => prAssurance.close());
  const password = randomUUID() + randomUUID();
  const server = createApplicationServer({ repository: workflow, prAssurance, publicOrigin: ORIGIN, accounts: [author, viewer].map(a => ({ ...a, passwordHash: hashPassword(password) })) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', session, data } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(method !== 'GET' ? { Origin: ORIGIN, 'Content-Type': 'application/json' } : {}),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const login = async account => {
    const response = await fetch(`${base}/api/session`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password }) });
    return { cookie: response.headers.get('set-cookie').split(';')[0], csrfToken: (await response.json()).csrfToken };
  };
  const session = await login(author);
  /** Registers an application with its three repositories and its own token, through the real API. */
  const register = (name, { token = TOKEN, org = 'prcheck-live', app = 'vendorpay-app', tests = 'prcheck-verifiers', profiles = 'vendorpay-policies' } = {}) =>
    call('/api/applications', { method: 'POST', session, data: { name, description: '', repositoryUrl: `https://github.com/${org}/${app}`,
      testRepositoryUrl: `https://github.com/${org}/${tests}`, profilesRepositoryUrl: `https://github.com/${org}/${profiles}`, githubToken: token } });
  const registered = credentialKey ? await register('VendorPay') : null;
  const appPath = registered ? `/api/pr-assurance/applications/${registered.body.id}` : null;
  const evaluate = async (number, requestKey = randomUUID(), path = appPath) => {
    await call(`${path}/pulls/${number}/import`, { method: 'POST', session });
    return call(`${path}/pulls/${number}/runs`, { method: 'POST', session, data: { requestKey } });
  };
  const sync = runId => call(`/api/pr-assurance/runs/${runId}/sync`, { method: 'POST', session });
  /** Evaluates a PR all the way to its stored result. */
  const complete = async (number, options) => {
    const { run } = (await evaluate(number)).body;
    github.start(run);
    github.write(run, checkRunText(run, options));
    return (await sync(run.id)).body;
  };
  return { call, login, session, github, register, evaluate, sync, complete, database, appPath, application: registered?.body, advanceClock: ms => { clock += ms; } };
}

test('pr-assurance runs / evaluating starts GitHub once, with the imported commit and the run id', async t => {
  const h = await fixture(t);
  const started = await h.evaluate(6);
  assert.equal(started.status, 201);
  assert.deepEqual([started.body.run.status, started.body.run.headSha, started.body.run.disposition], ['QUEUED', HEADS[6], null]);
  assert.deepEqual(h.github.state.dispatches, [{ app_sha: HEADS[6], correlation_id: started.body.run.id, repository: 'prcheck-live/prcheck-verifiers' }]);
});

test('pr-assurance runs / the same request key returns the same run and does not start GitHub again', async t => {
  const h = await fixture(t), key = randomUUID();
  const first = await h.evaluate(6, key), again = await h.evaluate(6, key);
  assert.deepEqual([again.status, again.body.run.id], [200, first.body.run.id]);
  assert.equal(h.github.state.dispatches.length, 1);
});

test('pr-assurance runs / a second evaluation while one is active is refused with the active run', async t => {
  const h = await fixture(t);
  const first = await h.evaluate(6), second = await h.evaluate(6);
  assert.deepEqual([second.status, second.body.error], [409, 'RUN_ALREADY_ACTIVE']);
  assert.equal(h.github.state.dispatches.length, 1);
  assert.equal(first.status, 201);
});

test('pr-assurance runs / sync shows the stage and the checks finished so far', async t => {
  const h = await fixture(t);
  const { run } = (await h.evaluate(6)).body;
  assert.equal((await h.sync(run.id)).body.run.status, 'QUEUED');
  h.github.start(run);
  h.github.write(run, checkRunText(run, { stage: 'running-checks', checks: 5 }));
  const synced = (await h.sync(run.id)).body;
  assert.deepEqual([synced.run.status, synced.run.progress.stage, synced.run.progress.checks.length, synced.run.progress.checksTotal], ['RUNNING', 'running-checks', 5, 14]);
  assert.match(synced.run.githubRunUrl, /^https:\/\/github\.com\/prcheck-live\/prcheck-verifiers\/actions\/runs\/\d+$/);
  assert.deepEqual(synced.events.map(e => e.stage), ['queued', 'running-checks']);
});

test('pr-assurance runs / PR #6 finishes NOT READY with 2 broken rules, and the report comes from its evidence', async t => {
  const h = await fixture(t);
  const done = await h.complete(6);
  assert.deepEqual([done.run.status, done.run.disposition, done.run.teamTests.passed], ['COMPLETED', 'NOT_READY', 25]);
  assert.equal(done.report.summary, 'NOT READY · 2 rules broken · 11 of 14 obligations supported');
  assert.deepEqual(done.report.rules.filter(r => r.broken).map(r => r.id), ['FIN-001', 'FIN-002']);
  assert.equal(done.report.comparison, null);
  assert.equal(done.report.proof.evidenceSha256, sha256(recorded('af51c26')));
});

test('pr-assurance runs / reading a run never contacts GitHub', async t => {
  const h = await fixture(t);
  const done = await h.complete(6), calls = h.github.state.calls.length;
  const read = await h.call(`/api/pr-assurance/runs/${done.run.id}`, { session: h.session });
  assert.deepEqual([read.status, read.body.report.summary], [200, done.report.summary]);
  assert.equal(h.github.state.calls.length, calls);
});

test('pr-assurance runs / PR #7 compared with PR #6: FIN-001 fixed, FIN-002 still broken; PR #8 is READY', async t => {
  const h = await fixture(t);
  await h.complete(6);
  const seven = await h.complete(7, { team: { total: 26, passed: 26, failed: 0, flaky: 0, skipped: 0 } });
  assert.deepEqual(seven.report.comparison, { previousPull: 6, fixed: ['FIN-001'], stillBroken: ['FIN-002'], newlyBroken: [] });
  const eight = await h.complete(8);
  assert.deepEqual([eight.run.disposition, eight.report.summary], ['READY', 'READY · no rules broken · 14 of 14 obligations supported']);
  assert.deepEqual(eight.report.comparison.fixed, ['FIN-002']);
});

test('pr-assurance runs / evidence about another commit fails the run, with no disposition', async t => {
  const h = await fixture(t);
  const done = await h.complete(6, { evidenceFor: 'ae50deb' });
  assert.deepEqual([done.run.status, done.run.disposition, done.run.failure.code], ['FAILED', null, 'EVIDENCE_FOR_ANOTHER_COMMIT']);
  assert.equal(done.report, null);
});

test('pr-assurance runs / a GitHub run that ends without evidence fails; a cancelled one is CANCELLED', async t => {
  const h = await fixture(t);
  const failed = (await h.evaluate(6)).body.run;
  h.github.start(failed, 'completed', 'failure');
  assert.deepEqual((await h.sync(failed.id)).body.run.failure.code, 'GITHUB_RUN_FAILED');
  const cancelled = (await h.evaluate(6)).body.run;
  h.github.start(cancelled, 'completed', 'cancelled');
  assert.equal((await h.sync(cancelled.id)).body.run.status, 'CANCELLED');
});

test('pr-assurance runs / a run with no result after 15 minutes is TIMED_OUT', async t => {
  const h = await fixture(t);
  const { run } = (await h.evaluate(6)).body;
  h.advanceClock(16 * 60 * 1000);
  const synced = (await h.sync(run.id)).body.run;
  assert.deepEqual([synced.status, synced.failure.code, synced.disposition], ['TIMED_OUT', 'RUN_TIMED_OUT', null]);
});

test('pr-assurance runs / an unanswered start request keeps the run and finds it instead of starting again', async t => {
  const h = await fixture(t);
  h.github.state.dispatch = 'lost';
  const started = await h.evaluate(6);
  assert.deepEqual([started.status, started.body.run.status], [201, 'QUEUED']);
  assert.match(started.body.notice, /look for it/);
  h.github.state.dispatch = 'ok';
  h.github.start(started.body.run);
  h.github.write(started.body.run, checkRunText(started.body.run));
  assert.equal((await h.sync(started.body.run.id)).body.run.disposition, 'NOT_READY');
  assert.equal(h.github.state.dispatches.length, 1);
});

test('pr-assurance runs / a refused start request fails the run and names the missing permission', async t => {
  const h = await fixture(t);
  h.github.state.dispatch = 'forbidden';
  const refused = await h.evaluate(6);
  assert.deepEqual([refused.status, refused.body.error], [503, 'GITHUB_PERMISSION_MISSING']);
  assert.match(refused.body.message, /Actions: read and write/);
  const history = (await h.call(`${h.appPath}/pulls/6/runs`, { session: h.session })).body;
  assert.deepEqual(history.map(r => [r.status, r.failure.code]), [['FAILED', 'GITHUB_PERMISSION_MISSING']]);
});

test('pr-assurance runs / when GitHub cannot be reached during sync, the run is unchanged and a notice says so', async t => {
  const h = await fixture(t);
  const { run } = (await h.evaluate(6)).body;
  h.github.state.down = true;
  const synced = (await h.sync(run.id)).body;
  assert.deepEqual([synced.run.status, typeof synced.githubNotice], ['QUEUED', 'string']);
});

test('pr-assurance runs / a viewer can watch a run but not start one', async t => {
  const h = await fixture(t);
  const { run } = (await h.evaluate(6)).body;
  const session = await h.login(viewer);
  assert.equal((await h.call(`/api/pr-assurance/runs/${run.id}`, { session })).status, 200);
  assert.equal((await h.call(`/api/pr-assurance/runs/${run.id}/sync`, { method: 'POST', session })).status, 200);
  const refused = await h.call(`${h.appPath}/pulls/6/runs`, { method: 'POST', session, data: { requestKey: randomUUID() } });
  assert.deepEqual([refused.status, refused.body.error], [403, 'FORBIDDEN']);
});

test('pr-assurance runs / history is newest first and keeps an earlier failed run after a later READY', async t => {
  const h = await fixture(t);
  await h.complete(8, { evidenceFor: 'af51c26' });
  const ready = await h.complete(8);
  const history = (await h.call(`${h.appPath}/pulls/8/runs`, { session: h.session })).body;
  assert.equal(history[0].id, ready.run.id);
  assert.deepEqual(history.map(r => r.status), ['COMPLETED', 'FAILED']);
});

test('pr-assurance runs / evidence altered in the database afterwards is reported, never shown as a result', async t => {
  const h = await fixture(t);
  const done = await h.complete(6);
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: h.database.connectionString });
  await client.connect();
  try {
    await client.query('ALTER TABLE pr_assurance_runs DISABLE TRIGGER pr_assurance_runs_history');
    await client.query(`UPDATE pr_assurance_runs SET evidence_text = replace(evidence_text, '"VIOLATED"', '"SUPPORTED"') WHERE id = $1`, [done.run.id]);
    await client.query('ALTER TABLE pr_assurance_runs ENABLE TRIGGER pr_assurance_runs_history');
  } finally { await client.end(); }
  const read = (await h.call(`/api/pr-assurance/runs/${done.run.id}`, { session: h.session })).body;
  assert.deepEqual([read.run.disposition, read.report.ok, read.report.reason], ['NOT_READY', false, 'EVIDENCE_DIGEST_MISMATCH']);
});

test('pr-assurance runs / a check run written for another run is refused and ends this run', async t => {
  const h = await fixture(t);
  const { run } = (await h.evaluate(6)).body;
  h.github.start(run);
  h.github.write(run, checkRunText({ ...run, id: randomUUID() }));
  const synced = (await h.sync(run.id)).body.run;
  assert.deepEqual([synced.status, synced.failure.code, synced.disposition], ['FAILED', 'OUTPUT_FOR_ANOTHER_RUN', null]);
});

// ---- Progression across the three PRs (Task 10) ---------------------------------------------------
test('pr-assurance runs / the scenario shows 2 → 1 → 0 broken rules from each PR\'s latest completed run', async t => {
  const h = await fixture(t);
  await h.complete(6); await h.complete(7); await h.complete(8);
  const scenario = (await h.call(h.appPath, { session: h.session })).body;
  assert.deepEqual(scenario.pulls.map(p => [p.number, p.result.disposition, p.result.brokenRules, p.result.brokenRuleIds]),
    [[6, 'NOT_READY', 2, ['FIN-001', 'FIN-002']], [7, 'NOT_READY', 1, ['FIN-002']], [8, 'READY', 0, []]]);
  assert.equal(scenario.obligations.length, 14);
  assert.deepEqual(scenario.pulls.map(p => p.result.states['FIN-001.1']), ['VIOLATED', 'SUPPORTED', 'SUPPORTED']);
  assert.deepEqual(scenario.pulls.map(p => p.result.states['FIN-002.1']), ['VIOLATED', 'VIOLATED', 'SUPPORTED']);
});

test('pr-assurance runs / a PR without a completed run shows no count; a running or failed run does not replace the last result', async t => {
  const h = await fixture(t);
  await h.complete(6);
  await h.complete(6, { evidenceFor: 'ae50deb' });
  const { run } = (await h.evaluate(6)).body;
  await h.call(`${h.appPath}/pulls/7/import`, { method: 'POST', session: h.session });
  const scenario = (await h.call(h.appPath, { session: h.session })).body;
  assert.deepEqual(scenario.pulls.map(p => p.number), [6, 7], 'only imported pull requests are listed, in number order');
  assert.deepEqual([scenario.pulls[0].latestRun.id, scenario.pulls[0].latestRun.status], [run.id, 'QUEUED']);
  assert.deepEqual([scenario.pulls[0].result.brokenRules, scenario.pulls[1].result], [2, null]);
});

// ---- Per-application GitHub access --------------------------------------------------------------
test('pr-assurance apps / each application uses only its own token and its own repositories', async t => {
  const h = await fixture(t);
  const b = await h.register('Project B', { token: TOKEN_B, org: 'acme', app: 'b-app', tests: 'b-tests', profiles: 'b-profiles' });
  assert.equal(b.status, 201);
  const pathB = `/api/pr-assurance/applications/${b.body.id}`;
  h.github.state.auth.length = 0;
  await h.call(`${h.appPath}/pulls/6/import`, { method: 'POST', session: h.session });
  const importedB = await h.call(`${pathB}/pulls/6/import`, { method: 'POST', session: h.session });
  assert.deepEqual([importedB.status, importedB.body.repository, importedB.body.applicationId], [200, 'acme/b-app', b.body.id]);
  assert.deepEqual(h.github.state.auth, [['prcheck-live/vendorpay-app', `Bearer ${TOKEN}`], ['acme/b-app', `Bearer ${TOKEN_B}`]]);
  // Same PR number, two applications, two separate records.
  const [a, bb] = await Promise.all([h.call(h.appPath, { session: h.session }), h.call(pathB, { session: h.session })]);
  assert.deepEqual([a.body.pulls.map(p => p.pull.repository), bb.body.pulls.map(p => p.pull.repository)], [['prcheck-live/vendorpay-app'], ['acme/b-app']]);
  // B's profiles repository publishes no rules and none are shipped for it: it can import but not evaluate.
  assert.equal(bb.body.rules, null);
  const refused = await h.call(`${pathB}/pulls/6/runs`, { method: 'POST', session: h.session, data: { requestKey: randomUUID() } });
  assert.deepEqual([refused.status, refused.body.error], [409, 'RULES_NOT_AVAILABLE']);
  assert.equal(h.github.state.dispatches.length, 0);
});

test('pr-assurance apps / registration checks the token against all three repositories first; a failed check saves nothing', async t => {
  const h = await fixture(t);
  const before = (await h.call('/api/workspace', { session: h.session })).body.applications.length;
  // Project B's token cannot see prcheck-live's repositories.
  const wrongToken = await h.register('Project C', { token: TOKEN_B });
  assert.equal(wrongToken.status, 400);
  assert.equal(wrongToken.body.error, 'GITHUB_REPOSITORY_INACCESSIBLE');
  h.github.state.revoked.add(`Bearer ${TOKEN_B}`);
  const revoked = await h.register('Project D', { token: TOKEN_B, org: 'acme', app: 'b-app', tests: 'b-tests', profiles: 'b-profiles' });
  assert.deepEqual([revoked.status, revoked.body.error], [400, 'GITHUB_TOKEN_REJECTED']);
  const missing = await h.call('/api/applications', { method: 'POST', session: h.session, data: { name: 'Project E', repositoryUrl: 'https://github.com/acme/b-app' } });
  assert.equal(missing.status, 400);
  const badUrl = await h.register('Project F', { org: 'acme', app: 'b-app/tree/main' });
  assert.deepEqual([badUrl.status, badUrl.body.error], [400, 'INVALID_URL']);
  assert.equal((await h.call('/api/workspace', { session: h.session })).body.applications.length, before);
});

test('pr-assurance apps / the token is stored only encrypted and is never returned', async t => {
  const h = await fixture(t);
  assert.equal(JSON.stringify(h.application).includes(TOKEN), false);
  assert.deepEqual([h.application.github.app.repository, h.application.github.rules.source, h.application.github.rules.obligations], ['prcheck-live/vendorpay-app', 'BUNDLED', 14]);
  for (const path of ['/api/workspace', '/api/pr-assurance', h.appPath, `/api/applications/${h.application.id}`]) {
    const answer = await h.call(path, { session: h.session });
    assert.equal(answer.status, 200, path);
    assert.equal(JSON.stringify(answer.body).includes(TOKEN), false, path);
  }
  const workspace = (await h.call('/api/workspace', { session: h.session })).body;
  assert.equal(workspace.applications.find(a => a.id === h.application.id).github.tests.repository, 'prcheck-live/prcheck-verifiers');
  assert.equal(workspace.activity.some(a => a.action === 'APPLICATION_GITHUB_CONNECTED'), true);
  // Nothing in the database holds the token in clear text.
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: h.database.connectionString });
  await client.connect();
  try {
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows.map(r => r.tablename);
    for (const table of tables) {
      const dump = JSON.stringify((await client.query(`SELECT * FROM "${table}"`)).rows);
      assert.equal(dump.includes(TOKEN), false, table);
    }
    const row = (await client.query('SELECT token_ciphertext, token_key_id FROM pr_assurance_connections')).rows[0];
    assert.match(row.token_ciphertext, /^v1\./);
    assert.match(row.token_key_id, /^k:[0-9a-f]{16}$/);
  } finally { await client.end(); }
});

test('pr-assurance apps / an expired token is reported; saving a new token for the application fixes it', async t => {
  const h = await fixture(t);
  const { run } = (await h.evaluate(6)).body;
  h.github.state.revoked.add(`Bearer ${TOKEN}`);
  const synced = (await h.sync(run.id)).body;
  assert.deepEqual([synced.run.status, /rejected this application's token/.test(synced.githubNotice)], ['QUEUED', true]);
  const refused = await h.call(`${h.appPath}/pulls/7/import`, { method: 'POST', session: h.session });
  assert.equal(refused.body.error, 'GITHUB_TOKEN_REJECTED');
  // Saving the same, still revoked, token again is refused.
  const rejected = await h.call(`/api/applications/${h.application.id}/github`, { method: 'POST', session: h.session, data: {
    repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', testRepositoryUrl: 'https://github.com/prcheck-live/prcheck-verifiers',
    profilesRepositoryUrl: 'https://github.com/prcheck-live/vendorpay-policies', githubToken: TOKEN } });
  assert.deepEqual([rejected.status, rejected.body.error], [400, 'GITHUB_TOKEN_REJECTED']);
  // GitHub accepts the token again (in reality: a new token); saving it restores access.
  h.github.state.revoked.clear();
  const saved = await h.call(`/api/applications/${h.application.id}/github`, { method: 'POST', session: h.session, data: {
    repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', testRepositoryUrl: 'https://github.com/prcheck-live/prcheck-verifiers',
    profilesRepositoryUrl: 'https://github.com/prcheck-live/vendorpay-policies', githubToken: TOKEN } });
  assert.equal(saved.status, 200);
  assert.equal(JSON.stringify(saved.body).includes(TOKEN), false);
  assert.equal((await h.call(`${h.appPath}/pulls/7/import`, { method: 'POST', session: h.session })).status, 200);
});

test('pr-assurance apps / a viewer cannot connect an application or list its GitHub pull requests', async t => {
  const h = await fixture(t);
  const session = await h.login(viewer);
  const connect = await h.call(`/api/applications/${h.application.id}/github`, { method: 'POST', session, data: {} });
  assert.deepEqual([connect.status, connect.body.error], [403, 'FORBIDDEN']);
  assert.equal((await h.call(`${h.appPath}/github-pulls`, { session })).status, 403);
  const listed = await h.call(`${h.appPath}/github-pulls`, { session: h.session });
  assert.deepEqual(listed.body.map(p => [p.number, p.imported]), [[6, false], [7, false], [8, false]]);
});

test('pr-assurance apps / without the encryption key, registration with GitHub refuses and saves nothing', async t => {
  const h = await fixture(t, { credentialKey: null });
  const refused = await h.register('VendorPay');
  assert.deepEqual([refused.status, refused.body.error], [503, 'CREDENTIAL_KEY_NOT_CONFIGURED']);
  assert.match(refused.body.message, /QIVVERA_CREDENTIAL_KEY/);
  assert.equal((await h.call('/api/workspace', { session: h.session })).body.applications.length, 0);
  assert.equal((await h.call('/api/workspace', { session: h.session })).body.capabilities.githubCredentials, false);
});

// ---- Telling the pull request on GitHub (QIVVERA_PR_ASSURANCE_GITHUB_WRITE) --------------------------
test('pr-assurance runs / with GitHub writing off, nothing is written to the pull request', async t => {
  const h = await fixture(t);
  await h.complete(6);
  assert.deepEqual([h.github.state.statuses, h.github.state.comments], [[], []]);
  assert.equal(h.github.state.calls.some(c => /statuses|comments|\/user$/.test(c)), false);
});

test('pr-assurance runs / with GitHub writing on, a run sets pending, then failure and a comment naming the broken rules, on the application\'s own repository', async t => {
  const h = await fixture(t, { githubWrite: true });
  const { run } = (await h.evaluate(6)).body;
  assert.deepEqual(h.github.state.statuses.map(s => [s.repository, s.sha, s.state, s.context]), [['prcheck-live/vendorpay-app', HEADS[6], 'pending', 'Qivvera']]);
  assert.equal(h.github.state.statuses[0].target_url, `${ORIGIN}/#/pr-assurance/runs/${run.id}`);
  h.github.start(run);
  h.github.write(run, checkRunText(run));
  const done = (await h.sync(run.id)).body;
  assert.deepEqual([done.run.status, done.githubNotice], ['COMPLETED', null]);
  assert.deepEqual(h.github.state.statuses.at(-1), { repository: 'prcheck-live/vendorpay-app', sha: HEADS[6], state: 'failure', context: 'Qivvera',
    description: 'NOT READY · 2 rules broken · 11 of 14 obligations supported', target_url: `${ORIGIN}/#/pr-assurance/runs/${run.id}` });
  assert.equal(h.github.state.comments.length, 1);
  const { pull, body, repository } = h.github.state.comments[0];
  assert.deepEqual([pull, repository], [6, 'prcheck-live/vendorpay-app']);
  assert.match(body, /^<!-- qivvera-pr-assurance -->\n### ❌ Qivvera: NOT READY · 2 rules broken/);
  assert.match(body, /\*\*FIN-001\*\*/);
  assert.match(body, /\*\*FIN-002\*\*/);
  assert.match(body, /Merging stays blocked until Qivvera reports READY/);
  // Every write used this application's own token.
  assert.ok(h.github.state.auth.filter(([repo]) => repo === 'prcheck-live/vendorpay-app').every(([, auth]) => auth === `Bearer ${TOKEN}`));
  // A later sync of the finished run writes nothing more.
  await h.sync(run.id);
  assert.equal(h.github.state.statuses.length, 2);
  assert.equal(h.github.state.comments.length, 1);
});

test('pr-assurance runs / a READY result is the only success; evaluating again edits the same comment', async t => {
  const h = await fixture(t, { githubWrite: true });
  await h.complete(7);
  await h.complete(8);
  assert.deepEqual(h.github.state.statuses.filter(s => s.sha === HEADS[8]).map(s => s.state), ['pending', 'success']);
  const eight = h.github.state.comments.find(c => c.pull === 8);
  assert.match(eight.body, /✅ Qivvera: READY · no rules broken/);
  assert.match(eight.body, /Since PR #7:\*\* fixed FIN-002/);
  await h.complete(8);
  assert.deepEqual([h.github.state.comments.filter(c => c.pull === 8).length, h.github.state.comments.find(c => c.pull === 8).edits], [1, 1]);
});

test('pr-assurance runs / a run that ends without a result sets an error status and posts no comment', async t => {
  const h = await fixture(t, { githubWrite: true });
  const { run } = (await h.evaluate(6)).body;
  h.github.start(run, 'completed', 'cancelled');
  assert.equal((await h.sync(run.id)).body.run.status, 'CANCELLED');
  assert.deepEqual(h.github.state.statuses.map(s => s.state), ['pending', 'error']);
  assert.deepEqual(h.github.state.comments, []);
});

test('pr-assurance runs / when GitHub refuses the write, the result is kept, no success is set and a notice names the permission', async t => {
  const h = await fixture(t, { githubWrite: true });
  h.github.state.writes = 'forbidden';
  const { run, notice } = (await h.evaluate(8)).body;
  assert.match(notice, /Commit statuses: read and write on prcheck-live\/vendorpay-app/);
  h.github.start(run);
  h.github.write(run, checkRunText(run));
  const done = (await h.sync(run.id)).body;
  assert.deepEqual([done.run.status, done.run.disposition], ['COMPLETED', 'READY']);
  assert.match(done.githubNotice, /^Qivvera could not update the pull request on GitHub/);
  assert.deepEqual([h.github.state.statuses, h.github.state.comments], [[], []]);
});

test('pr-assurance apps / with a server token, an application connects without a token and every GitHub call uses the server token', async t => {
  const WRONG = 'github_pat_TEST_ONLY_wrong_0123456789';
  const h = await fixture(t, { serverToken: TOKEN });
  assert.equal((await h.call('/api/workspace', { session: h.session })).body.capabilities.githubServerToken, true);
  // No token in the form: accepted, because the server token is used.
  const repos = { description: '', repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', testRepositoryUrl: 'https://github.com/prcheck-live/prcheck-verifiers',
    profilesRepositoryUrl: 'https://github.com/prcheck-live/vendorpay-policies' };
  const noToken = await h.call('/api/applications', { method: 'POST', session: h.session, data: { name: 'VendorPay without token', ...repos } });
  assert.equal(noToken.status, 201, JSON.stringify(noToken.body));
  // A different token typed into the form is ignored: GitHub only ever sees the server token.
  const wrong = await h.call(`/api/applications/${noToken.body.id}/github`, { method: 'POST', session: h.session, data: { ...repos, description: undefined, githubToken: WRONG } });
  assert.equal(wrong.status, 200, JSON.stringify(wrong.body));
  const imported = await h.call(`/api/pr-assurance/applications/${noToken.body.id}/pulls/6/import`, { method: 'POST', session: h.session });
  assert.equal(imported.status, 200, JSON.stringify(imported.body));
  const used = new Set(h.github.state.auth.map(([, auth]) => auth));
  assert.deepEqual([...used], [`Bearer ${TOKEN}`]);
});

test('pr-assurance apps / without a server token, the form still requires a token', async t => {
  const h = await fixture(t);
  assert.equal((await h.call('/api/workspace', { session: h.session })).body.capabilities.githubServerToken, false);
  const refused = await h.call('/api/applications', { method: 'POST', session: h.session, data: { name: 'No token', description: '',
    repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', testRepositoryUrl: 'https://github.com/prcheck-live/prcheck-verifiers',
    profilesRepositoryUrl: 'https://github.com/prcheck-live/vendorpay-policies' } });
  assert.deepEqual([refused.status, refused.body.error], [400, 'INVALID_GITHUB_TOKEN']);
});
