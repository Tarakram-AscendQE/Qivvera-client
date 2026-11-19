/** Creates only a newly named disposable loopback destination; never drops/resets databases. */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rehearseRecovery } from '../server/operations/recovery.mjs';
import { safeFailure, fail } from '../server/operations/common.mjs';
let report;
try {
    if (process.argv.length !== 2) fail('OPERATIONS_ENV_CONFIGURATION_REQUIRED');
    const revision = process.env.QIVVERA_RELEASE_SHA ?? process.env.GITHUB_SHA;
    if (!revision) fail('RELEASE_REVISION_REQUIRED');
    report = await rehearseRecovery({ sourceConnectionString: process.env.QIVVERA_RECOVERY_SOURCE_DATABASE_URL,
        destinationAdminConnectionString: process.env.QIVVERA_RECOVERY_ADMIN_DATABASE_URL,
        destinationDatabase: process.env.QIVVERA_RECOVERY_DESTINATION,
        binaryDirectory: process.env.QIVVERA_PG_BIN_DIR, releaseRevision: revision });
} catch (error) { report = { ...(error.receipt ?? { schema: 'qivvera.recovery-rehearsal/1', releaseAcceptance: 'not-evaluated' }),
    passed: false, error: safeFailure(error, 'RECOVERY_REHEARSAL_FAILED') }; process.exitCode = 1; }
console.log(JSON.stringify(report, null, 2));
if (process.env.QIVVERA_TEST_OUTPUT) {
    try { await mkdir(process.env.QIVVERA_TEST_OUTPUT, { recursive: true });
        await writeFile(join(process.env.QIVVERA_TEST_OUTPUT, 'recovery-rehearsal-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
    catch { console.error('OPERATIONS_REPORT_WRITE_FAILED'); process.exitCode = 1; }
}
