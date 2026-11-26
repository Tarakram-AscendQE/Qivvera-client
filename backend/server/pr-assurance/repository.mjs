/**
 * PostgreSQL access for the PR assurance add-on: each application's GitHub connection, rules
 * snapshots, imported pull requests, assessment runs and their progress events.
 *
 * Pull requests and runs belong to one application. A run always assesses the head commit Qivvera
 * imported, never one the caller supplies. A request key creates at most one run. A finished run never
 * changes; completing or failing it again returns it as it is. Everything that reads-then-writes a run
 * locks its row first, so parallel polls are safe.
 *
 * The stored token is ciphertext (see credentials.mjs). Only getConnection returns it, for the service
 * to decrypt just before a GitHub call; listConnections and every other read leave it out.
 */
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../workflow-store.mjs';
import { InputError, fields, identifier } from '../workflow-input.mjs';
import { migratePrAssurance, requirePrAssurance } from './migration.mjs';

const ACTIVE = ['QUEUED', 'RUNNING'];
const FAILURES = ['FAILED', 'TIMED_OUT', 'CANCELLED'];
const DISPOSITIONS = ['READY', 'NOT_READY', 'INDETERMINATE'];
const json = text => (text === null || text === undefined ? null : JSON.parse(text));

function conflict(code, message, extra = {}) {
    return Object.assign(new InputError(code, message, 409), extra);
}

const toPull = row => ({
    applicationId: row.application_id, pullNumber: Number(row.pull_number), repository: row.repository, headSha: row.head_sha, baseSha: row.base_sha,
    headRef: row.head_ref, baseRef: row.base_ref, title: row.title, url: row.url, fingerprint: row.fingerprint,
    importedBy: row.imported_by, importedAt: row.imported_at,
});

/** The run as the API reads it. The evidence text is included only when asked for (it is ~10 KB). */
function toRun(row, withEvidence = false) {
    const run = {
        id: row.id, applicationId: row.application_id, pullNumber: Number(row.pull_number), headSha: row.head_sha, rulesSnapshotDigest: row.rules_snapshot_digest,
        requestedBy: row.requested_by, status: row.status,
        githubRunId: row.github_run_id === null ? null : Number(row.github_run_id), githubRunUrl: row.github_run_url,
        checkRunId: row.check_run_id === null ? null : Number(row.check_run_id),
        progress: json(row.progress), teamTests: json(row.team_tests), disposition: row.disposition,
        evidenceSha256: row.evidence_sha256,
        failure: row.failure_code ? { code: row.failure_code, message: row.failure_message } : null,
        createdAt: row.created_at, updatedAt: row.updated_at, finishedAt: row.finished_at,
    };
    return withEvidence ? { ...run, evidenceText: row.evidence_text } : run;
}

/** A connection without its token: safe to return to any signed-in person. */
const toConnection = row => row && ({
    applicationId: row.application_id,
    app: { repository: row.app_repository, repositoryId: Number(row.app_repository_id) },
    tests: { repository: row.tests_repository, repositoryId: Number(row.tests_repository_id), ref: row.tests_ref },
    profiles: { repository: row.profiles_repository, repositoryId: Number(row.profiles_repository_id), commit: row.profiles_commit },
    rules: row.rules_snapshot_digest ? { digest: row.rules_snapshot_digest, source: row.rules_source } : null,
    configuredBy: row.configured_by, configuredAt: row.configured_at,
});

/**
 * Saves (or replaces) an application's connection with an already-encrypted token, on the caller's
 * transaction client: registration saves the application and its connection in one transaction.
 */
export async function writeConnection(c, { applicationId, connection, sealed, actor }) {
    const at = new Date().toISOString();
    await c.query(
        `INSERT INTO pr_assurance_connections (application_id, app_repository, app_repository_id, tests_repository, tests_repository_id, tests_ref,
           profiles_repository, profiles_repository_id, profiles_commit, rules_snapshot_digest, rules_source, token_ciphertext, token_key_id, configured_by, configured_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (application_id) DO UPDATE SET app_repository = EXCLUDED.app_repository, app_repository_id = EXCLUDED.app_repository_id,
           tests_repository = EXCLUDED.tests_repository, tests_repository_id = EXCLUDED.tests_repository_id, tests_ref = EXCLUDED.tests_ref,
           profiles_repository = EXCLUDED.profiles_repository, profiles_repository_id = EXCLUDED.profiles_repository_id, profiles_commit = EXCLUDED.profiles_commit,
           rules_snapshot_digest = EXCLUDED.rules_snapshot_digest, rules_source = EXCLUDED.rules_source, token_ciphertext = EXCLUDED.token_ciphertext,
           token_key_id = EXCLUDED.token_key_id, configured_by = EXCLUDED.configured_by, configured_at = EXCLUDED.configured_at`,
        [identifier(applicationId, 'Application'), connection.app.repository, connection.app.repositoryId, connection.tests.repository, connection.tests.repositoryId,
            connection.tests.ref, connection.profiles.repository, connection.profiles.repositoryId, connection.profiles.commit,
            connection.rules?.snapshotDigest ?? null, connection.rules ? connection.rulesSource : null, sealed.ciphertext, sealed.keyId, actor, at]);
    // The activity record names the repositories, never the token.
    await c.query('INSERT INTO activity (id,actor,action,entity_id,detail,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), actor, 'APPLICATION_GITHUB_CONNECTED', applicationId,
        `GitHub access saved: ${connection.app.repository}, tests ${connection.tests.repository}, profiles ${connection.profiles.repository}`, at]);
}

export async function openPrAssuranceRepository({ connectionString, sslMode, ca, migrate = false } = {}) {
    const db = await openDatabase({ connectionString, sslMode, ca });
    try {
        if (migrate) await migratePrAssurance(db);
        else await requirePrAssurance(db);
    } catch (error) {
        await db.close();
        throw error;
    }
    const now = () => new Date().toISOString();
    const read = (sql, params) => db.transaction(c => c.query(sql, params), true).then(r => r.rows);
    const lockRun = async (c, id) => {
        const row = (await c.query('SELECT * FROM pr_assurance_runs WHERE id = $1 FOR UPDATE', [identifier(id, 'Run')])).rows[0];
        if (!row) throw new InputError('RUN_NOT_FOUND', 'This assessment run does not exist.', 404);
        return row;
    };

    return {
        /** Content-addressed, so storing the same snapshot again changes nothing. */
        async saveSnapshot(snapshot) {
            await db.transaction(c => c.query('INSERT INTO pr_assurance_rule_snapshots (digest, repository, body, stored_at) VALUES ($1,$2,$3,$4) ON CONFLICT (digest) DO NOTHING',
                [snapshot.snapshotDigest, snapshot.source.repository, JSON.stringify(snapshot), now()]));
        },

        async getSnapshot(digest) {
            const row = (await read('SELECT body FROM pr_assurance_rule_snapshots WHERE digest = $1', [digest]))[0];
            return row ? JSON.parse(row.body) : null;
        },

        /** For writes that must share one transaction (saving a connection with its activity record). */
        transaction: fn => db.transaction(fn),

        /** The connection with its encrypted token, for the service only. */
        async getConnection(applicationId) {
            const row = (await read('SELECT * FROM pr_assurance_connections WHERE application_id = $1', [identifier(applicationId, 'Application')]))[0];
            return row ? { ...toConnection(row), sealed: { ciphertext: row.token_ciphertext, keyId: row.token_key_id } } : null;
        },

        async listConnections() {
            return (await read('SELECT * FROM pr_assurance_connections ORDER BY application_id')).map(toConnection);
        },

        async savePull(applicationId, pull, actor) {
            const at = now();
            return db.transaction(async c => toPull((await c.query(
                `INSERT INTO pr_assurance_pulls (application_id, pull_number, repository, head_sha, base_sha, head_ref, base_ref, title, url, fingerprint, imported_by, imported_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (application_id, pull_number) DO UPDATE SET repository = EXCLUDED.repository, head_sha = EXCLUDED.head_sha, base_sha = EXCLUDED.base_sha,
                   head_ref = EXCLUDED.head_ref, base_ref = EXCLUDED.base_ref, title = EXCLUDED.title, url = EXCLUDED.url,
                   fingerprint = EXCLUDED.fingerprint, imported_by = EXCLUDED.imported_by, imported_at = EXCLUDED.imported_at
                 RETURNING *`,
                [applicationId, pull.pullNumber, pull.repository, pull.headSha, pull.baseSha, pull.headRef, pull.baseRef, pull.title, pull.url, pull.fingerprint, actor.email, at])).rows[0]));
        },

        async getPull(applicationId, pullNumber) {
            const row = (await read('SELECT * FROM pr_assurance_pulls WHERE application_id = $1 AND pull_number = $2', [applicationId, pullNumber]))[0];
            return row ? toPull(row) : null;
        },

        async listPulls(applicationId) {
            return (await read('SELECT * FROM pr_assurance_pulls WHERE application_id = $1 ORDER BY pull_number', [applicationId])).map(toPull);
        },

        /** Creates a QUEUED run for the imported head commit, or returns the run this request key created. */
        async createRun(input, actor) {
            fields(input, ['applicationId', 'pullNumber', 'requestKey', 'rulesSnapshotDigest']);
            const requestKey = identifier(input.requestKey, 'Request key');
            return db.transaction(async c => {
                // Lock the pull first, so two requests with the same key are serialised and the second finds the first's run.
                const pull = (await c.query('SELECT * FROM pr_assurance_pulls WHERE application_id = $1 AND pull_number = $2 FOR UPDATE', [input.applicationId, input.pullNumber])).rows[0];
                const prior = (await c.query('SELECT * FROM pr_assurance_runs WHERE requested_by = $1 AND request_key = $2', [actor.email, requestKey])).rows[0];
                if (prior) {
                    if (Number(prior.pull_number) !== input.pullNumber || prior.application_id !== input.applicationId) throw conflict('REQUEST_KEY_REUSED', 'This request key was already used for another pull request.');
                    return { run: toRun(prior), created: false };
                }
                if (!pull) throw conflict('PULL_NOT_IMPORTED', 'Import this pull request from GitHub before evaluating it.');
                const active = (await c.query("SELECT id FROM pr_assurance_runs WHERE application_id = $1 AND pull_number = $2 AND status IN ('QUEUED','RUNNING') ORDER BY created_at DESC LIMIT 1",
                    [input.applicationId, input.pullNumber])).rows[0];
                if (active) throw conflict('RUN_ALREADY_ACTIVE', 'This pull request is already being evaluated.', { activeRunId: active.id });
                const at = now();
                const row = (await c.query(
                    `INSERT INTO pr_assurance_runs (id, application_id, pull_number, head_sha, rules_snapshot_digest, requested_by, request_key, status, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,'QUEUED',$8,$8) RETURNING *`,
                    [randomUUID(), input.applicationId, input.pullNumber, pull.head_sha, input.rulesSnapshotDigest, actor.email, requestKey, at])).rows[0];
                return { run: toRun(row), created: true };
            });
        },

        async getRun(id) {
            const row = (await read('SELECT * FROM pr_assurance_runs WHERE id = $1', [identifier(id, 'Run')]))[0];
            return row ? toRun(row, true) : null;
        },

        /** Newest first, without evidence text. Every pull request of the application when no number is given. */
        async listRuns(applicationId, pullNumber) {
            const rows = pullNumber === undefined
                ? await read('SELECT * FROM pr_assurance_runs WHERE application_id = $1 ORDER BY created_at DESC, id', [applicationId])
                : await read('SELECT * FROM pr_assurance_runs WHERE application_id = $1 AND pull_number = $2 ORDER BY created_at DESC, id', [applicationId, pullNumber]);
            return rows.map(row => toRun(row));
        },

        async events(runId) {
            return (await read('SELECT seq, stage, message, recorded_at FROM pr_assurance_run_events WHERE run_id = $1 ORDER BY seq', [identifier(runId, 'Run')]))
                .map(r => ({ seq: Number(r.seq), stage: r.stage, message: r.message, recordedAt: r.recorded_at }));
        },

        /** Records what GitHub reported. A finished run is returned unchanged. */
        async recordProgress(id, { githubRunId, githubRunUrl, checkRunId, status, stage, message, progress } = {}) {
            if (status !== undefined && !ACTIVE.includes(status)) throw new Error('INVALID_PROGRESS_STATUS');
            return db.transaction(async c => {
                const row = await lockRun(c, id);
                if (!ACTIVE.includes(row.status)) return toRun(row);
                const at = now();
                const updated = (await c.query(
                    `UPDATE pr_assurance_runs SET status = $2, github_run_id = $3, github_run_url = $4, check_run_id = $5, progress = $6, updated_at = $7
                     WHERE id = $1 RETURNING *`,
                    [row.id, status ?? row.status, githubRunId ?? row.github_run_id, githubRunUrl ?? row.github_run_url,
                        checkRunId ?? row.check_run_id, progress === undefined ? row.progress : JSON.stringify(progress), at])).rows[0];
                if (stage && message) {
                    const last = (await c.query('SELECT seq, stage, message FROM pr_assurance_run_events WHERE run_id = $1 ORDER BY seq DESC LIMIT 1', [row.id])).rows[0];
                    if (!last || last.stage !== stage || last.message !== message) {
                        await c.query('INSERT INTO pr_assurance_run_events (run_id, seq, stage, message, recorded_at) VALUES ($1,$2,$3,$4,$5)',
                            [row.id, (last ? Number(last.seq) : 0) + 1, stage, message, at]);
                    }
                }
                return toRun(updated);
            });
        },

        /** Stores verified evidence once. `changed` is false when the run had already finished. */
        async completeRun(id, { evidenceText, evidenceSha256, teamTests, disposition }) {
            if (!DISPOSITIONS.includes(disposition)) throw new Error('INVALID_DISPOSITION');
            return db.transaction(async c => {
                const row = await lockRun(c, id);
                if (!ACTIVE.includes(row.status)) return { run: toRun(row, true), changed: false };
                const at = now();
                const updated = (await c.query(
                    `UPDATE pr_assurance_runs SET status = 'COMPLETED', evidence_text = $2, evidence_sha256 = $3, team_tests = $4, disposition = $5,
                       updated_at = $6, finished_at = $6 WHERE id = $1 RETURNING *`,
                    [row.id, evidenceText, evidenceSha256, teamTests === null || teamTests === undefined ? null : JSON.stringify(teamTests), disposition, at])).rows[0];
                return { run: toRun(updated, true), changed: true };
            });
        },

        /** Ends a run without a disposition. `changed` is false when the run had already finished. */
        async failRun(id, { status, code, message }) {
            if (!FAILURES.includes(status)) throw new Error('INVALID_FAILURE_STATUS');
            return db.transaction(async c => {
                const row = await lockRun(c, id);
                if (!ACTIVE.includes(row.status)) return { run: toRun(row), changed: false };
                const at = now();
                const updated = (await c.query(
                    `UPDATE pr_assurance_runs SET status = $2, failure_code = $3, failure_message = $4, updated_at = $5, finished_at = $5
                     WHERE id = $1 RETURNING *`, [row.id, status, code, message, at])).rows[0];
                return { run: toRun(updated), changed: true };
            });
        },

        close: () => db.close(),
    };
}
