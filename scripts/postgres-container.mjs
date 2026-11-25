/**
 * A throwaway PostgreSQL 17 server for local development and tests, run in Docker.
 *
 * - Image: postgres:17-alpine. Port bound to 127.0.0.1 only (a random free port).
 * - The password is generated per container and never written to disk.
 * - The container is started with --rm, so stopping it deletes it and all its data.
 *
 * Nothing here connects to a hosted database.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export const POSTGRES_IMAGE = 'postgres:17-alpine';

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Starts the container and waits until it accepts connections. Returns the URL of `database` and stop(). */
export async function startPostgresContainer({ label = 'qivvera', database = 'postgres' } = {}) {
  const name = `${label}-pg-${randomBytes(4).toString('hex')}`;
  const password = randomBytes(18).toString('hex');
  docker(['run', '--detach', '--rm', '--name', name, '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_USER=qivvera',
    '--env', `POSTGRES_PASSWORD=${password}`, '--env', `POSTGRES_DB=${database}`, POSTGRES_IMAGE, '-c', 'max_connections=300', '-c', 'fsync=off']);
  const stop = () => { try { docker(['stop', '--time', '1', name]); } catch { /* already gone */ } };
  try {
    const port = docker(['port', name, '5432/tcp']).split('\n')[0].split(':').pop();
    const adminUrl = `postgresql://qivvera:${password}@127.0.0.1:${port}/${database}`;
    await waitUntilReady(adminUrl);
    return { name, adminUrl, stop };
  } catch (error) {
    stop();
    throw error;
  }
}

async function waitUntilReady(adminUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const client = new pg.Client({ connectionString: adminUrl });
    try {
      await client.connect();
      await client.query('SELECT 1');
      return;
    } catch (error) {
      if (Date.now() > deadline) throw new Error('POSTGRES_CONTAINER_NOT_READY: ' + error.message);
      await new Promise(resolve => setTimeout(resolve, 250));
    } finally {
      await client.end().catch(() => {});
    }
  }
}

/** Creates an empty database `qivvera_test_<suffix>` on the container and returns its URL. */
export async function createDatabase(adminUrl, suffix = randomBytes(6).toString('hex')) {
  const name = `qivvera_test_${suffix}`;
  if (!/^qivvera_test_[a-z0-9_]+$/.test(name)) throw new Error('INVALID_TEST_DATABASE_NAME');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${name}`);
  } finally {
    await client.end();
  }
  const url = new URL(adminUrl);
  url.pathname = '/' + name;
  return url.toString();
}

/** Drops a qivvera_test_* database, closing any connection still open to it. */
export async function dropDatabase(adminUrl, databaseUrl) {
  const name = new URL(databaseUrl).pathname.slice(1);
  if (!/^qivvera_test_[a-z0-9_]+$/.test(name)) throw new Error('INVALID_TEST_DATABASE_NAME');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  } finally {
    await client.end();
  }
}
