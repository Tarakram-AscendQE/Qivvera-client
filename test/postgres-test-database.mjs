/**
 * One empty PostgreSQL database per test.
 *
 * Tests run under `node scripts/with-postgres.mjs` (npm test does this), which starts a throwaway Docker
 * PostgreSQL 17 and sets QIVVERA_TEST_POSTGRES_URL. `testDatabase()` creates a fresh qivvera_test_*
 * database there; pass it where repositories take database options:
 *
 *   const r = await openWorkflowRepository({ ...await testDatabase(), migrate: true });
 *
 * The databases are dropped after the last test of the file, when every repository has closed.
 * (node:test runs `t.after` hooks in registration order, so a per-test drop would run too early.)
 */
import { after } from 'node:test';
import { createDisposableDatabase } from './postgres-fixture-database.mjs';

const created = [];
// Only inside a node:test process. Fixtures and demos import the same helpers; their databases are
// removed with the container when `with-postgres` stops it.
if (process.env.NODE_TEST_CONTEXT) {
  after(async () => {
    for (const database of created.splice(0)) await database.drop();
  });
}

export async function testDatabase() {
  const database = await createDisposableDatabase();
  created.push(database);
  return database.db;
}

/**
 * SQL for a deliberate failure: any INSERT into `activity` with this action raises `message`, so a test
 * can prove that the surrounding transaction rolls back completely.
 */
export function failActivityInsert(name, action, message) {
  if (!/^[a-z_]+$/.test(name) || !/^[A-Z_]+$/.test(action) || !/^[a-z -]+$/.test(message)) throw new Error('INVALID_TEST_FAULT');
  return `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '${message}'; END $$;
CREATE TRIGGER ${name} BEFORE INSERT ON activity FOR EACH ROW WHEN (NEW.action = '${action}') EXECUTE FUNCTION ${name}();`;
}
