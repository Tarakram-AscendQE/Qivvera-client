/** Cumulative engineering verification. This command never deploys or approves a release. */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { requireDisposablePostgresURL } from '../test/postgres-safety.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.QIVVERA_TEST_OUTPUT || resolve(root, 'review-test-results'));
mkdirSync(output, { recursive: true });
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}
const commit = git(['rev-parse', 'HEAD']);
const cleanAtStart = git(['status', '--porcelain', '--untracked-files=normal']) === '';
const browserPython = process.env.QIVVERA_BROWSER_PYTHON ||
  (existsSync(resolve(root, '.venv-browser/bin/python3')) ? resolve(root, '.venv-browser/bin/python3') : 'python3');
const report = {
  schema: 'qivvera.engineering-verification/1',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  source: { commit, cleanAtStart, cleanAtEnd: null, exactCommitVerified: false },
  runtime: { node: process.version },
  passed: false,
  gates: [],
  releaseAcceptance: {
    hostedHttpsAndPersistence: 'not-performed-by-this-command',
    actualDeploymentPermissions: 'not-performed-by-this-command',
    actualHostedBackupRecovery: 'not-performed-by-this-command',
    independentHumanQE: 'not-performed-by-this-command',
    customerAcceptance: 'not-performed-by-this-command',
    decision: 'not-issued'
  }
};
const reportPath = resolve(output, 'engineering-verification.json');
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const stages = [
  ['package-identity', process.execPath, ['scripts/selfcheck.mjs']],
  ['automated-and-postgresql', 'npm', ['run', 'check:release']],
  ['assurance-reference', 'npm', ['run', 'demo:assurance']],
  ['resolution-reference', 'npm', ['run', 'demo:resolution']],
  ['two-application-reference', 'npm', ['run', 'demo:generalization']],
  ['native-browser-journeys', browserPython, ['test/run-browser-suites.py']],
  ['canonical-public-assets', 'git', ['diff', '--exit-code', '--', 'frontend/public/']]
];
let databaseSafetyError = null;
try { requireDisposablePostgresURL(process.env.TEST_DATABASE_URL); }
catch { databaseSafetyError = process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL_UNSAFE' : 'TEST_DATABASE_URL_REQUIRED'; }
if (databaseSafetyError) {
  report.gates.push({ name: 'disposable-postgresql', status: 'blocked', reason: databaseSafetyError });
  report.finishedAt = new Date().toISOString();
  save();
  console.error('ENGINEERING_BLOCKED: configure an explicitly disposable loopback PostgreSQL test database without query options or fragments.');
  process.exit(1);
}
let failed = false;
for (const [name, command, args] of stages) {
  if (failed) { report.gates.push({ name, status: 'not-run' }); continue; }
  const logPath = resolve(output, 'engineering-' + name + '.log');
  const fd = openSync(logPath, 'w', 0o600);
  const startedAt = new Date().toISOString();
  console.log('Engineering gate: ' + name);
  let result;
  try {
    result = spawnSync(command, args, {
      cwd: root,
      env: { ...process.env, REQUIRE_POSTGRES: 'true', QIVVERA_TEST_OUTPUT: output },
      stdio: ['ignore', fd, fd],
      timeout: name === 'native-browser-journeys' ? 30 * 60_000 : 15 * 60_000
    });
  } finally { closeSync(fd); }
  const passed = result.status === 0 && !result.error && !result.signal;
  report.gates.push({ name, startedAt, finishedAt: new Date().toISOString(), status: passed ? 'passed' : 'failed',
    exitCode: result.status, signal: result.signal || null, errorCode: result.error?.code || null,
    logFile: 'engineering-' + name + '.log' });
  console.log(readFileSync(logPath, 'utf8').slice(-7000));
  failed = !passed;
  save();
}
report.source.cleanAtEnd = git(['status', '--porcelain', '--untracked-files=normal']) === '';
report.passed = !failed && report.gates.length === stages.length && report.gates.every(gate => gate.status === 'passed');
report.source.exactCommitVerified = report.passed && Boolean(commit) && cleanAtStart && report.source.cleanAtEnd && git(['rev-parse', 'HEAD']) === commit;
report.finishedAt = new Date().toISOString();
save();
console.log(JSON.stringify(report, null, 2));
process.exit(report.passed ? 0 : 1);
