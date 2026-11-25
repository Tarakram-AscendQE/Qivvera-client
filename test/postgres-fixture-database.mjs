/**
 * A disposable PostgreSQL database for fixtures and demos that are not node:test files
 * (node:test files use test/postgres-test-database.mjs). Needs QIVVERA_TEST_POSTGRES_URL, which
 * `node scripts/with-postgres.mjs` sets. Call `drop()` when finished.
 */
import { createDatabase, dropDatabase } from '../scripts/postgres-container.mjs';
import { requireDisposablePostgresURL } from './postgres-safety.mjs';

export async function createDisposableDatabase() {
  const admin = process.env.QIVVERA_TEST_POSTGRES_URL;
  if (!admin) throw new Error('No test PostgreSQL. Run through `node scripts/with-postgres.mjs` (npm test does this).');
  const connectionString = requireDisposablePostgresURL(await createDatabase(admin));
  return { db: { driver: 'postgres', connectionString, sslMode: 'disable' }, drop: () => dropDatabase(admin, connectionString) };
}

/**
 * The database `qivvera_test_<name>`, created on first use and reused afterwards — for a fixture that is
 * restarted against the same records (for example to check that sessions survive a restart).
 */
export async function namedDisposableDatabase(name) {
  const admin = process.env.QIVVERA_TEST_POSTGRES_URL;
  if (!admin) throw new Error('No test PostgreSQL. Run through `node scripts/with-postgres.mjs`.');
  if (!/^[a-z0-9_]{1,40}$/.test(name)) throw new Error('INVALID_TEST_DATABASE_NAME');
  const url = new URL(admin);
  url.pathname = '/qivvera_test_' + name;
  if (!(await databaseExists(admin, 'qivvera_test_' + name))) await createDatabase(admin, name);
  return { driver: 'postgres', connectionString: requireDisposablePostgresURL(url.toString()), sslMode: 'disable' };
}

async function databaseExists(admin, database) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  try {
    return (await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount === 1;
  } finally {
    await client.end();
  }
}
