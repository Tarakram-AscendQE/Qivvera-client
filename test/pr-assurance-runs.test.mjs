import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openPrAssuranceService } from '../backend/server/pr-assurance/service.mjs';
import { SCENARIO } from '../backend/server/pr-assurance/config.mjs';
import { testDatabase } from './postgres-test-database.mjs';

const author = { email: 'run-author@example.test', roles: ['AUTHOR'] };
const viewer = { email: 'run-viewer@example.test', roles: ['VIEWER'] };
const ORIGIN = 'http://127.0.0.1:3028';
const TOKEN = 'github_pat_TEST_ONLY_runs_0123456789';
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
  const state = { dispatches: [], calls: [], runs: new Map(), checkRuns: new Map(), dispatch: 'ok', down: false, statuses: [], comments: [], writes: 'ok' };
  const fetchFn = async (url, init) => {
    const { pathname, searchParams } = new URL(url);
    state.calls.push(`${init.method} ${pathname}`);
    if (state.down && !pathname.includes('/pulls/')) throw new TypeError('fetch failed');
    const pull = pathname.match(/\/repos\/prcheck-live\/vendorpay-app\/pulls\/(\d+)$/);
    if (pull) {
      const repo = { id: SCENARIO.app.repositoryId, full_name: 'prcheck-live/vendorpay-app' };
      return json(200, { number: Number(pull[1]), state: 'open', merged: false, draft: false, title: `PR ${pull[1]}`, body: null,
        head: { sha: HEADS[pull[1]], ref: `feature/${pull[1]}`, repo }, base: { sha: '3'.repeat(40), ref: 'main', repo } });
    }
    const status = pathname.match(/\/repos\/prcheck-live\/vendorpay-app\/statuses\/([0-9a-f]{40})$/);
    if (status) {
      if (state.writes === 'forbidden') return json(403, { message: 'Resource not accessible by personal access token' });
      state.statuses.push({ sha: status[1], ...JSON.parse(init.body) });
      return json(201, {});
    }
    if (pathname === '/user') return json(200, { login: 'qivvera-bot' });
    const issue = pathname.match(/\/repos\/prcheck-live\/vendorpay-app\/issues\/(\d+)\/comments$/);
    if (issue && init.method === 'GET') return json(200, state.comments.filter(c => c.pull === Number(issue[1])).map(c => ({ id: c.id, user: { login: 'qivvera-bot' }, body: c.body })));
    if (issue) { state.comments.push({ id: state.comments.length + 1, pull: Number(issue[1]), body: JSON.parse(init.body).body, edits: 0 }); return json(201, {}); }
    const edit = pathname.match(/\/repos\/prcheck-live\/vendorpay-app\/issues\/comments\/(\d+)$/);
    if (edit) { const c = state.comments.find(x => x.id === Number(edit[1])); c.body = JSON.parse(init.body).body; c.edits += 1; return json(200, {}); }
    if (pathname.endsWith('/dispatches')) {
      if (state.dispatch === 'lost') { state.dispatches.push(JSON.parse(init.body).inputs); throw new TypeError('fetch failed'); }
      if (state.dispatch === 'forbidden') return json(403, { message: 'Resource not accessible by personal access token' });
      state.dispatches.push(JSON.parse(init.body).inputs);
      return json(204, null);
    }
    const workflowRun = (cid, number) => ({ id: number, display_title: `qivvera ${cid}`, head_sha: VERIFIERS_SHA, html_url: `https://github.com/prcheck-live/prcheck-verifiers/actions/runs/${number}`,
      repository: { id: SCENARIO.verifiers.repositoryId }, ...state.runs.get(cid) });
    if (pathname.endsWith('/actions/workflows/qivvera-pr-assessment.yml/runs')) {
      return json(200, { workflow_runs: [...state.runs.keys()].map((cid, i) => workflowRun(cid, 1000 + i)) });
    }
    const one = pathname.match(/\/actions\/runs\/(\d+)$/);
    if (one) {
      const cid = [...state.runs.keys()][Number(one[1]) - 1000];
      return json(200, workflowRun(cid, Number(one[1])));
    }
    if (pathname.endsWith('/check-runs')) {
      const cid = searchParams.get('check_name').replace('qivvera-evidence ', '');
      const text = state.checkRuns.get(cid);
      return json(200, { check_runs: text ? [{ id: 77, name: `qivvera-evidence ${cid}`, status: 'in_progress', conclusion: null, app: { slug: 'github-actions' }, output: { text } }] : [] });
    }
    return json(404, { message: 'Not Found' });
  };
  return { state, fetchFn,
    start: (run, status = 'in_progress', conclusion = null) => state.runs.set(run.id, { status, conclusion }),
    write: (run, text) => state.checkRuns.set(run.id, text) };
}

async function fixture(t, { githubWrite = false } = {}) {
  const database = await testDatabase();
  const workflow = await openWorkflowRepository({ ...database, migrate: true });
  t.after(() => workflow.close());
  const github = fakeGitHub();
  let clock = Date.now();
  const prAssurance = await openPrAssuranceService({ database, migrate: true, fetchFn: github.fetchFn, secretEnv: { [SCENARIO.tokenEnv]: TOKEN }, now: () => clock,
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
  const evaluate = async (number, requestKey = randomUUID()) => {
    await call(`/api/pr-assurance/pulls/${number}/import`, { method: 'POST', session });
    return call(`/api/pr-assurance/pulls/${number}/runs`, { method: 'POST', session, data: { requestKey } });
  };
  const sync = runId => call(`/api/pr-assurance/runs/${runId}/sync`, { method: 'POST', session });
  /** Evaluates a PR all the way to its stored result. */
  const complete = async (number, options) => {
    const { run } = (await evaluate(number)).body;
    github.start(run);
    github.write(run, checkRunText(run, options));
    return (await sync(run.id)).body;
  };
  return { call, login, session, github, evaluate, sync, complete, database, advanceClock: ms => { clock += ms; } };
}

test('pr-assurance runs / evaluating starts GitHub once, with the imported commit and the run id', async t => {
  const h = await fixture(t);
  const started = await h.evaluate(6);
  assert.equal(started.status, 201);
  assert.deepEqual([started.body.run.status, started.body.run.headSha, started.body.run.disposition], ['QUEUED', HEADS[6], null]);
  assert.deepEqual(h.github.state.dispatches, [{ app_sha: HEADS[6], correlation_id: started.body.run.id }]);
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
  const history = (await h.call('/api/pr-assurance/pulls/6/runs', { session: h.session })).body;
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
  const refused = await h.call('/api/pr-assurance/pulls/6/runs', { method: 'POST', session, data: { requestKey: randomUUID() } });
  assert.deepEqual([refused.status, refused.body.error], [403, 'FORBIDDEN']);
});

test('pr-assurance runs / history is newest first and keeps an earlier failed run after a later READY', async t => {
  const h = await fixture(t);
  await h.complete(8, { evidenceFor: 'af51c26' });
  const ready = await h.complete(8);
  const history = (await h.call('/api/pr-assurance/pulls/8/runs', { session: h.session })).body;
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
  const scenario = (await h.call('/api/pr-assurance', { session: h.session })).body;
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
  const scenario = (await h.call('/api/pr-assurance', { session: h.session })).body;
  assert.deepEqual([scenario.pulls[0].latestRun.id, scenario.pulls[0].latestRun.status], [run.id, 'QUEUED']);
  assert.deepEqual([scenario.pulls[0].result.brokenRules, scenario.pulls[1].result], [2, null]);
});

test('pr-assurance runs / with GitHub writing off, nothing is written to the pull request', async t => {
  const h = await fixture(t);
  await h.complete(6);
  assert.deepEqual([h.github.state.statuses, h.github.state.comments], [[], []]);
  assert.equal(h.github.state.calls.some(c => /statuses|comments|\/user$/.test(c)), false);
});

test('pr-assurance runs / with GitHub writing on, a run sets pending, then failure and a comment naming the broken rules', async t => {
  const h = await fixture(t, { githubWrite: true });
  const { run } = (await h.evaluate(6)).body;
  assert.deepEqual(h.github.state.statuses.map(s => [s.sha, s.state, s.context]), [[HEADS[6], 'pending', 'Qivvera']]);
  assert.equal(h.github.state.statuses[0].target_url, `${ORIGIN}/#/pr-assurance/runs/${run.id}`);
  h.github.start(run);
  h.github.write(run, checkRunText(run));
  const done = (await h.sync(run.id)).body;
  assert.deepEqual([done.run.status, done.githubNotice], ['COMPLETED', null]);
  assert.deepEqual(h.github.state.statuses.at(-1), { sha: HEADS[6], state: 'failure', context: 'Qivvera',
    description: 'NOT READY · 2 rules broken · 11 of 14 obligations supported', target_url: `${ORIGIN}/#/pr-assurance/runs/${run.id}` });
  assert.equal(h.github.state.comments.length, 1);
  const { pull, body } = h.github.state.comments[0];
  assert.equal(pull, 6);
  assert.match(body, /^<!-- qivvera-pr-assurance -->\n### ❌ Qivvera: NOT READY · 2 rules broken/);
  assert.match(body, /\*\*FIN-001\*\*/);
  assert.match(body, /\*\*FIN-002\*\*/);
  assert.match(body, /Merging stays blocked until Qivvera reports READY/);
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
  assert.match(notice, /Commit statuses: read and write on vendorpay-app/);
  h.github.start(run);
  h.github.write(run, checkRunText(run));
  const done = (await h.sync(run.id)).body;
  assert.deepEqual([done.run.status, done.run.disposition], ['COMPLETED', 'READY']);
  assert.match(done.githubNotice, /^Qivvera could not update the pull request on GitHub/);
  assert.deepEqual([h.github.state.statuses, h.github.state.comments], [[], []]);
});
