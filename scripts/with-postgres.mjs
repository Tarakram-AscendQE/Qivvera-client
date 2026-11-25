/**
 * Runs a command with a throwaway PostgreSQL 17 (Docker) and removes it afterwards.
 *
 *   node scripts/with-postgres.mjs node --test test/*.test.mjs
 *
 * The command receives:
 *   QIVVERA_TEST_POSTGRES_URL  admin URL of the container; test/postgres-test-database.mjs uses it to
 *                              create one empty qivvera_test_* database per test
 *   TEST_DATABASE_URL          a disposable database for the release PostgreSQL suites (yours, if set)
 *   REQUIRE_POSTGRES=true      so those suites run instead of being skipped
 */
import { spawn } from 'node:child_process';
import { createDatabase, startPostgresContainer } from './postgres-container.mjs';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/with-postgres.mjs <command> [args...]');
  process.exit(2);
}
// Inside another with-postgres run, reuse its container. A TEST_DATABASE_URL you supply (for example
// for check:release) is kept; otherwise the release suites get a fresh database on the container.
const container = process.env.QIVVERA_TEST_POSTGRES_URL ? null : await startPostgresContainer({ label: 'qivvera-test' });
const adminUrl = container?.adminUrl ?? process.env.QIVVERA_TEST_POSTGRES_URL;
let code = 1;
try {
  const env = { ...process.env, QIVVERA_TEST_POSTGRES_URL: adminUrl, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? await createDatabase(adminUrl), REQUIRE_POSTGRES: 'true' };
  code = await new Promise(resolve => {
    const child = spawn(command, args, { stdio: 'inherit', env });
    child.on('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  });
} finally {
  container?.stop();
}
process.exit(code);
