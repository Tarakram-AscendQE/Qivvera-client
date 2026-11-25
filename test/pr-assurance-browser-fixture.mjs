/**
 * Disposable native-browser harness for the PR assurance demo: real HTTP, authentication, PostgreSQL and
 * service code, with a stand-in for GitHub only. Each started run plays out over successive syncs
 * (machine started → VendorPay starting → checks finishing → team tests → done) using the real check
 * names and the evidence prcheck-verifiers recorded for each PR commit.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openWorkflowRepository } from '../backend/server/workflow-repository.mjs';
import { openPrAssuranceService } from '../backend/server/pr-assurance/service.mjs';
import { SCENARIO } from '../backend/server/pr-assurance/config.mjs';
import { createApplicationServer } from '../dist/api/server.js';
import { hashPassword } from '../backend/server/auth.mjs';
import { testDatabase } from './postgres-test-database.mjs';

const password = process.env.PR_TEST_PASSWORD;
if (typeof password !== 'string' || password.length < 24) throw new Error('Supply a generated password through PR_TEST_PASSWORD.');
const port = Number(process.env.PR_TEST_PORT ?? 3196);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use an explicit unprivileged test port.');

const author = { email: 'author@example.test', roles: ['AUTHOR'] };
const viewer = { email: 'viewer@example.test', roles: ['VIEWER'] };
/** PR #8's code commit is 3f6e20d; its recorded evidence is bound to that commit. */
const PULLS = {
  6: { head: 'af51c26b0b9f94894cccfaa5b0fb893221952c65', title: 'VP-184: bank-change request and approval', ref: 'feature/VP-184-v1-initial', team: 25 },
  7: { head: 'ae50debcd01bcc47fc137855cbc21b0e72107f1e', title: 'VP-184: block self-approval of bank changes', ref: 'feature/VP-184-v2-partial-fix', team: 26 },
  8: { head: '3f6e20da8e085a401d8c1ec67368fbeae3cc46b5', title: 'VP-184: hold scheduled payments on bank change', ref: 'feature/VP-184-v3-approved', team: 29 },
};
const sha256 = text => createHash('sha256').update(text).digest('hex');
const evidenceOf = head => readFileSync(new URL(`../fixtures/pr-assurance/evidence/${head.slice(0, 7)}.json`, import.meta.url), 'utf8');
const json = (status, body) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Started runs by correlation id: the commit, the run number and how far it has got. */
const runs = new Map();
function checkRunText(cid, run) {
  const evidence = evidenceOf(run.head);
  const checks = Object.values(JSON.parse(evidence).checks).map(c => ({ check: c.check, outcome: c.state === 'VIOLATED' ? 'failed' : 'passed', durationMs: c.durationMs }));
  const team = PULLS[run.pull].team;
  const steps = [
    { stage: 'starting-app', message: `Starting VendorPay at ${run.head.slice(0, 7)}`, done: 0 },
    { stage: 'running-checks', message: "Running Qivvera's checks", done: 4 },
    { stage: 'running-checks', message: "Running Qivvera's checks", done: 9 },
    { stage: 'running-checks', message: "Running Qivvera's checks", done: 14 },
    { stage: 'running-team-tests', message: "Running the VendorPay team's own tests", done: 14 },
  ];
  const base = { kind: 'qivvera.pr-assessment/v1', correlationId: cid, appSha: run.head, checksTotal: 14 };
  if (run.step < steps.length) {
    const step = steps[run.step];
    return JSON.stringify({ ...base, stage: step.stage, message: step.message, checks: checks.slice(0, step.done), teamTests: null });
  }
  return JSON.stringify({ ...base, stage: 'done', message: 'Assessment complete', checks, teamTests: { total: team, passed: team, failed: 0, flaky: 0, skipped: 0 }, evidence, evidenceSha256: sha256(evidence) });
}
const FINAL_STEP = 5;

async function github(url, init) {
  const { pathname, searchParams } = new URL(url);
  const pull = pathname.match(/\/repos\/prcheck-live\/vendorpay-app\/pulls\/(\d+)$/);
  if (pull) {
    const p = PULLS[pull[1]], repo = { id: SCENARIO.app.repositoryId, full_name: 'prcheck-live/vendorpay-app' };
    return json(200, { number: Number(pull[1]), state: 'open', merged: false, draft: false, title: p.title, body: null,
      head: { sha: p.head, ref: p.ref, repo }, base: { sha: '3299770'.padEnd(40, '0'), ref: 'main', repo } });
  }
  if (pathname.endsWith('/dispatches')) {
    const { app_sha: head, correlation_id: cid } = JSON.parse(init.body).inputs;
    const number = Object.keys(PULLS).find(n => PULLS[n].head === head);
    runs.set(cid, { head, pull: Number(number), id: 2000 + runs.size, step: -1 });
    return json(204, null);
  }
  const workflowRun = (cid, run) => ({ id: run.id, display_title: `qivvera ${cid}`, head_sha: '9'.repeat(40),
    status: run.step > FINAL_STEP ? 'completed' : 'in_progress', conclusion: run.step > FINAL_STEP ? 'success' : null,
    html_url: `https://github.com/prcheck-live/prcheck-verifiers/actions/runs/${run.id}`, repository: { id: SCENARIO.verifiers.repositoryId } });
  if (pathname.endsWith('/actions/workflows/qivvera-pr-assessment.yml/runs')) return json(200, { workflow_runs: [...runs].map(([cid, run]) => workflowRun(cid, run)) });
  const one = pathname.match(/\/actions\/runs\/(\d+)$/);
  if (one) { const entry = [...runs].find(([, run]) => run.id === Number(one[1])); return json(200, workflowRun(entry[0], entry[1])); }
  if (pathname.endsWith('/check-runs')) {
    const cid = searchParams.get('check_name').replace('qivvera-evidence ', ''), run = runs.get(cid);
    run.step += 1;
    if (run.step < 0) return json(200, { check_runs: [] });
    return json(200, { check_runs: [{ id: 50 + run.id, name: `qivvera-evidence ${cid}`, status: 'in_progress', conclusion: null, app: { slug: 'github-actions' }, output: { text: checkRunText(cid, run) } }] });
  }
  return json(404, { message: 'Not Found' });
}

const database = await testDatabase();
const repository = await openWorkflowRepository({ ...database, migrate: true });
const prAssurance = await openPrAssuranceService({ database, migrate: true, fetchFn: github, secretEnv: { [SCENARIO.tokenEnv]: `fixture-${randomUUID()}` } });
const origin = `http://127.0.0.1:${port}`, passwordHash = hashPassword(password);
const server = createApplicationServer({ repository, prAssurance, publicOrigin: origin, releaseRevision: '9'.repeat(40),
  accounts: [author, viewer].map(actor => ({ ...actor, passwordHash })) });
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ origin, pulls: Object.fromEntries(Object.entries(PULLS).map(([n, p]) => [n, p.head])) })));

let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await new Promise(resolve => server.close(resolve));
  await prAssurance.close();
  await repository.close();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
