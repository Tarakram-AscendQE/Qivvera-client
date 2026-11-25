import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../backend/server/workflow-store.mjs';
import { migratePrAssurance, requirePrAssurance, prAssuranceChecksum } from '../backend/server/pr-assurance/migration.mjs';
import { testDatabase } from './postgres-test-database.mjs';

const HEAD = 'af51c26b0b9f94894cccfaa5b0fb893221952c65';
const BASE = '3299770'.padEnd(40, '0');
const SNAPSHOT = `sha256:${'f'.repeat(64)}`;

async function freshDatabase(t) {
  const db = await openDatabase(await testDatabase());
  t.after(() => db.close());
  return db;
}
const query = (db, sql, params = []) => db.transaction(c => c.query(sql, params));
const tables = async db => (await query(db, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map(r => r.tablename);

async function insertPullAndRun(db, status = 'QUEUED') {
  const now = new Date().toISOString(), id = randomUUID();
  await query(db, `INSERT INTO pr_assurance_pulls VALUES (6,'prcheck-live/vendorpay-app',$1,$2,'feature/x','main','t','u','f','a@example.test',$3)
                   ON CONFLICT (pull_number) DO NOTHING`, [HEAD, BASE, now]);
  await query(db, `INSERT INTO pr_assurance_runs (id,pull_number,head_sha,rules_snapshot_digest,requested_by,request_key,status,created_at,updated_at)
                   VALUES ($1,6,$2,$3,'a@example.test',$4,$5,$6,$6)`, [id, HEAD, SNAPSHOT, randomUUID(), status, now]);
  return id;
}

test('pr-assurance / migration creates only the add-on tables and is safe to run twice', async t => {
  const db = await freshDatabase(t);
  await migratePrAssurance(db);
  await migratePrAssurance(db);
  assert.deepEqual(await tables(db), ['pr_assurance_migrations', 'pr_assurance_pulls', 'pr_assurance_run_events', 'pr_assurance_runs']);
  const ledger = (await query(db, 'SELECT version, checksum FROM pr_assurance_migrations')).rows;
  assert.deepEqual(ledger.map(r => [Number(r.version), r.checksum]), [[1, prAssuranceChecksum]]);
  await requirePrAssurance(db);
});

test('pr-assurance / the server refuses to start on a database without the add-on tables', async t => {
  const db = await freshDatabase(t);
  await assert.rejects(requirePrAssurance(db), /PR_ASSURANCE_MIGRATION_REQUIRED/);
});

test('pr-assurance / an altered migration record or a newer version is refused', async t => {
  const db = await freshDatabase(t);
  await migratePrAssurance(db);
  await query(db, "UPDATE pr_assurance_migrations SET checksum = 'sha256:altered'");
  await assert.rejects(migratePrAssurance(db), /PR_ASSURANCE_MIGRATION_CHECKSUM_MISMATCH/);
  await assert.rejects(requirePrAssurance(db), /PR_ASSURANCE_MIGRATION_REQUIRED/);
  await query(db, "INSERT INTO pr_assurance_migrations VALUES (2, 'future', '2027-01-01')");
  await assert.rejects(migratePrAssurance(db), /PR_ASSURANCE_SCHEMA_NEWER_THAN_APPLICATION/);
});

test('pr-assurance / a finished run can never change, and no run is deleted', async t => {
  const db = await freshDatabase(t);
  await migratePrAssurance(db);
  const id = await insertPullAndRun(db);
  await query(db, "UPDATE pr_assurance_runs SET status = 'FAILED', failure_code = 'GITHUB_RUN_FAILED', finished_at = $2 WHERE id = $1", [id, new Date().toISOString()]);
  await assert.rejects(query(db, "UPDATE pr_assurance_runs SET status = 'QUEUED', finished_at = NULL WHERE id = $1", [id]), /PR_ASSURANCE_RUN_FINAL/);
  await assert.rejects(query(db, 'DELETE FROM pr_assurance_runs WHERE id = $1', [id]), /PR_ASSURANCE_HISTORY_KEPT/);
});

test('pr-assurance / a completed run needs evidence and a disposition; others may not have one', async t => {
  const db = await freshDatabase(t);
  await migratePrAssurance(db);
  const id = await insertPullAndRun(db);
  await assert.rejects(query(db, "UPDATE pr_assurance_runs SET status = 'COMPLETED', finished_at = $2 WHERE id = $1", [id, new Date().toISOString()]), /check constraint/);
  await assert.rejects(query(db, "UPDATE pr_assurance_runs SET disposition = 'READY' WHERE id = $1", [id]), /check constraint/);
});

test('pr-assurance / progress events are append-only', async t => {
  const db = await freshDatabase(t);
  await migratePrAssurance(db);
  const id = await insertPullAndRun(db);
  await query(db, "INSERT INTO pr_assurance_run_events VALUES ($1, 1, 'queued', 'Waiting for GitHub', $2)", [id, new Date().toISOString()]);
  await assert.rejects(query(db, "UPDATE pr_assurance_run_events SET message = 'changed' WHERE run_id = $1", [id]), /PR_ASSURANCE_HISTORY_KEPT/);
  await assert.rejects(query(db, 'DELETE FROM pr_assurance_run_events WHERE run_id = $1', [id]), /PR_ASSURANCE_HISTORY_KEPT/);
});

// ---- Repository (Task 4) -------------------------------------------------------------------------
const { openPrAssuranceRepository } = await import('../backend/server/pr-assurance/repository.mjs');
const actor = { email: 'author@example.test', roles: ['AUTHOR'] };
const pull = (number, headSha = HEAD) => ({
  repository: 'prcheck-live/vendorpay-app', pullNumber: number, url: `https://github.com/prcheck-live/vendorpay-app/pull/${number}`,
  headSha, baseSha: BASE, headRef: `feature/VP-184-v${number}`, baseRef: 'main', title: `VP-184 v${number}`, fingerprint: `sha256:${'a'.repeat(64)}`,
});
async function repository(t) {
  const repo = await openPrAssuranceRepository({ ...await testDatabase(), migrate: true });
  t.after(() => repo.close());
  return repo;
}
const startRun = (repo, pullNumber = 6, requestKey = randomUUID(), who = actor) =>
  repo.createRun({ pullNumber, requestKey, rulesSnapshotDigest: SNAPSHOT }, who);
const evidence = { evidenceText: '{"kind":"qivvra.evidence/v1"}', evidenceSha256: 'b'.repeat(64), teamTests: { total: 25, passed: 25, failed: 0, flaky: 0, skipped: 0 }, disposition: 'NOT_READY' };

test('pr-assurance repository / an import is stored, and a re-import moves the PR to its new head', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(7), actor);
  await repo.savePull(pull(6), actor);
  const moved = await repo.savePull(pull(6, 'c'.repeat(40)), actor);
  assert.equal(moved.headSha, 'c'.repeat(40));
  assert.deepEqual((await repo.listPulls()).map(p => [p.pullNumber, p.headSha.slice(0, 1)]), [[6, 'c'], [7, 'a']]);
});

test('pr-assurance repository / a run assesses the imported head commit; the caller cannot choose it', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor);
  const { run, created } = await startRun(repo);
  assert.equal(created, true);
  assert.deepEqual([run.pullNumber, run.headSha, run.status, run.requestedBy, run.disposition], [6, HEAD, 'QUEUED', actor.email, null]);
  await assert.rejects(repo.createRun({ pullNumber: 6, requestKey: randomUUID(), rulesSnapshotDigest: SNAPSHOT, headSha: 'd'.repeat(40) }, actor), { code: 'UNKNOWN_FIELD' });
});

test('pr-assurance repository / the same request key returns the same run instead of a second one', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor);
  const key = randomUUID();
  const first = await startRun(repo, 6, key), again = await startRun(repo, 6, key);
  assert.deepEqual([again.created, again.run.id], [false, first.run.id]);
  assert.equal((await repo.listRuns(6)).length, 1);
});

test('pr-assurance repository / a request key cannot be reused for another PR', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor); await repo.savePull(pull(7), actor);
  const key = randomUUID();
  await startRun(repo, 6, key);
  await assert.rejects(startRun(repo, 7, key), { code: 'REQUEST_KEY_REUSED' });
});

test('pr-assurance repository / a PR with an active run cannot start a second one', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor);
  const { run } = await startRun(repo);
  await assert.rejects(startRun(repo), error => error.code === 'RUN_ALREADY_ACTIVE' && error.status === 409 && error.activeRunId === run.id);
});

test('pr-assurance repository / a PR that was never imported cannot be evaluated', async t => {
  const repo = await repository(t);
  await assert.rejects(startRun(repo, 8), error => error.code === 'PULL_NOT_IMPORTED' && error.status === 409);
  await assert.rejects(startRun(repo, 6, 'not-a-key'), { code: 'INVALID_ID' });
});

test('pr-assurance repository / progress moves the run to RUNNING and logs a stage only when it changes', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor);
  const { run } = await startRun(repo);
  await repo.recordProgress(run.id, { githubRunId: 42, githubRunUrl: 'https://github.com/prcheck-live/prcheck-verifiers/actions/runs/42' });
  await repo.recordProgress(run.id, { status: 'RUNNING', stage: 'running-checks', message: "Running Qivvera's checks", progress: { checks: [] }, checkRunId: 7 });
  const updated = await repo.recordProgress(run.id, { status: 'RUNNING', stage: 'running-checks', message: "Running Qivvera's checks", progress: { checks: [{ check: 'V1/x' }] } });
  assert.deepEqual([updated.status, updated.githubRunId, updated.checkRunId, updated.progress.checks.length], ['RUNNING', 42, 7, 1]);
  assert.deepEqual((await repo.events(run.id)).map(e => [e.seq, e.stage]), [[1, 'running-checks']]);
});

test('pr-assurance repository / two parallel completions store the evidence once', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor);
  const { run } = await startRun(repo);
  const results = await Promise.all([repo.completeRun(run.id, evidence), repo.completeRun(run.id, evidence)]);
  assert.deepEqual(results.map(r => r.changed).sort(), [false, true]);
  const stored = await repo.getRun(run.id);
  assert.deepEqual([stored.status, stored.disposition, stored.evidenceSha256, stored.teamTests.passed], ['COMPLETED', 'NOT_READY', 'b'.repeat(64), 25]);
  assert.equal((await repo.failRun(run.id, { status: 'FAILED', code: 'LATE', message: 'late' })).changed, false);
});

test('pr-assurance repository / history is newest first and a failed run has no disposition', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor);
  const first = (await startRun(repo)).run;
  const failed = await repo.failRun(first.id, { status: 'TIMED_OUT', code: 'RUN_TIMED_OUT', message: 'GitHub did not finish within 15 minutes.' });
  assert.deepEqual([failed.changed, failed.run.status, failed.run.disposition, failed.run.failure.code], [true, 'TIMED_OUT', null, 'RUN_TIMED_OUT']);
  const second = (await startRun(repo)).run;
  assert.deepEqual((await repo.listRuns(6)).map(r => r.id), [second.id, first.id]);
  assert.equal('evidenceText' in (await repo.listRuns(6))[0], false);
});

test('pr-assurance repository / two parallel requests with the same key create one run', async t => {
  const repo = await repository(t);
  await repo.savePull(pull(6), actor);
  const key = randomUUID();
  const results = await Promise.all([startRun(repo, 6, key), startRun(repo, 6, key)]);
  assert.deepEqual(results.map(r => r.created).sort(), [false, true]);
  assert.equal(results[0].run.id, results[1].run.id);
});

// ---- Demo reset (operator command, outside the app) ----------------------------------------------
const { resetDemoData, countDemoData } = await import('../backend/server/pr-assurance/reset.mjs');

test('pr-assurance reset / empties only the demo tables, even finished runs, and keeps the history rules', async t => {
  const db = await freshDatabase(t);
  await migratePrAssurance(db);
  const id = await insertPullAndRun(db);
  await query(db, "INSERT INTO pr_assurance_run_events VALUES ($1, 1, 'queued', 'Waiting', $2)", [id, new Date().toISOString()]);
  await query(db, "UPDATE pr_assurance_runs SET status = 'FAILED', failure_code = 'X', finished_at = $2 WHERE id = $1", [id, new Date().toISOString()]);
  await query(db, 'CREATE TABLE unrelated_table (id INT)');
  await query(db, 'INSERT INTO unrelated_table VALUES (1)');

  assert.deepEqual(await countDemoData(db), { pulls: 1, runs: 1, events: 1 });
  assert.deepEqual(await resetDemoData(db), { pulls: 1, runs: 1, events: 1 });
  assert.deepEqual(await countDemoData(db), { pulls: 0, runs: 0, events: 0 });
  assert.equal((await query(db, 'SELECT count(*)::int AS n FROM unrelated_table')).rows[0].n, 1);
  await requirePrAssurance(db);

  const again = await insertPullAndRun(db);
  await query(db, "UPDATE pr_assurance_runs SET status = 'FAILED', failure_code = 'X', finished_at = $2 WHERE id = $1", [again, new Date().toISOString()]);
  await assert.rejects(query(db, 'DELETE FROM pr_assurance_runs WHERE id = $1', [again]), /PR_ASSURANCE_HISTORY_KEPT/);
});

test('pr-assurance reset / refuses a database without the demo tables', async t => {
  const db = await freshDatabase(t);
  await assert.rejects(resetDemoData(db), /PR_ASSURANCE_MIGRATION_REQUIRED/);
});
