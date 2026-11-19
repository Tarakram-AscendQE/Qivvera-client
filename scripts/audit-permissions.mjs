/** Explicit read-only operator command; no grants, migrations or account changes. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { auditRuntimePermissions } from '../server/operations/permissions.mjs';
import { safeFailure, fail } from '../server/operations/common.mjs';
let report;
try {
    if (process.argv.length !== 2) fail('OPERATIONS_ENV_CONFIGURATION_REQUIRED');
    const revision = process.env.QIVVERA_RELEASE_SHA ?? process.env.GITHUB_SHA;
    if (!revision) fail('RELEASE_REVISION_REQUIRED');
    report = await auditRuntimePermissions({ webConnectionString: process.env.QIVVERA_AUDIT_WEB_DATABASE_URL,
        workerConnectionString: process.env.QIVVERA_AUDIT_WORKER_DATABASE_URL,
        sslMode: process.env.DATABASE_SSL_MODE ?? 'verify-full', ca: process.env.DATABASE_CA, releaseRevision: revision });
    if (!report.passed) process.exitCode = 1;
} catch (error) { report = { schema: 'qivvera.runtime-permissions/1', passed: false, error: safeFailure(error, 'PERMISSION_AUDIT_FAILED'),
    readOnly: true, releaseAcceptance: 'not-evaluated' }; process.exitCode = 1; }
console.log(JSON.stringify(report, null, 2));
if (process.env.QIVVERA_TEST_OUTPUT) {
    try { await mkdir(process.env.QIVVERA_TEST_OUTPUT, { recursive: true });
        await writeFile(join(process.env.QIVVERA_TEST_OUTPUT, 'runtime-permissions-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
    catch { console.error('OPERATIONS_REPORT_WRITE_FAILED'); process.exitCode = 1; }
}
