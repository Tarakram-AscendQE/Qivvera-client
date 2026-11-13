import { spawnSync } from 'node:child_process';
if (!process.env.TEST_DATABASE_URL) {
    console.error('RELEASE_BLOCKED: mandatory PostgreSQL integration has no disposable database.');
    process.exit(1);
}
const result = spawnSync('npm', ['run', 'check'], { stdio: 'inherit', env: { ...process.env, REQUIRE_POSTGRES: 'true' } });
process.exit(result.status ?? 1);
