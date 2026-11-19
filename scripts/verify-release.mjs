import { spawnSync } from 'node:child_process';
import { requireDisposablePostgresURL } from '../test/postgres-safety.mjs';
if (!process.env.TEST_DATABASE_URL) {
    console.error('RELEASE_BLOCKED: mandatory PostgreSQL integration has no disposable database.');
    process.exit(1);
}
try { requireDisposablePostgresURL(process.env.TEST_DATABASE_URL); }
catch { console.error('RELEASE_BLOCKED: PostgreSQL test connection is not an explicitly disposable loopback URL. Query routing overrides are forbidden.'); process.exit(1); }
const result = spawnSync('npm', ['run', 'check'], { stdio: 'inherit', env: { ...process.env, REQUIRE_POSTGRES: 'true' } });
process.exit(result.status ?? 1);
