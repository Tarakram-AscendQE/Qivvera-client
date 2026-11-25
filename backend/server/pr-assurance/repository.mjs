/**
 * PostgreSQL access for the PR assurance add-on: imported pull requests, assessment runs and their
 * progress events.
 *
 * A run always assesses the head commit Qivvera imported, never one the caller supplies. A request key
 * creates at most one run. A finished run never changes; completing or failing it again returns it as
 * it is. Everything that reads-then-writes a run locks its row first, so parallel polls are safe.
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
    pullNumber: Number(row.pull_number), repository: row.repository, headSha: row.head_sha, baseSha: row.base_sha,
    headRef: row.head_ref, baseRef: row.base_ref, title: row.title, url: row.url, fingerprint: row.fingerprint,
    importedBy: row.imported_by, importedAt: row.imported_at,
});

/** The run as the API reads it. The evidence text is included only when asked for (it is ~10 KB). */
function toRun(row, withEvidence = false) {
    const run = {
        id: row.id, pullNumber: Number(row.pull_number), headSha: row.head_sha, rulesSnapshotDigest: row.rules_snapshot_digest,
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
    const lockRun = async (c, id) => {
        const row = (await c.query('SELECT * FROM pr_assurance_runs WHERE id = $1 FOR UPDATE', [identifier(id, 'Run')])).rows[0];
        if (!row) throw new InputError('RUN_NOT_FOUND', 'This assessment run does not exist.', 404);
        return row;
    };

    return {
        async savePull(pull, actor) {
            const at = now();
            return db.transaction(async c => toPull((await c.query(
                `INSERT INTO pr_assurance_pulls (pull_number, repository, head_sha, base_sha, head_ref, base_ref, title, url, fingerprint, imported_by, imported_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (pull_number) DO UPDATE SET repository = EXCLUDED.repository, head_sha = EXCLUDED.head_sha, base_sha = EXCLUDED.base_sha,
                   head_ref = EXCLUDED.head_ref, base_ref = EXCLUDED.base_ref, title = EXCLUDED.title, url = EXCLUDED.url,
                   fingerprint = EXCLUDED.fingerprint, imported_by = EXCLUDED.imported_by, imported_at = EXCLUDED.imported_at
                 RETURNING *`,
                [pull.pullNumber, pull.repository, pull.headSha, pull.baseSha, pull.headRef, pull.baseRef, pull.title, pull.url, pull.fingerprint, actor.email, at])).rows[0]));
        },

        async getPull(pullNumber) {
            const row = (await db.transaction(c => c.query('SELECT * FROM pr_assurance_pulls WHERE pull_number = $1', [pullNumber]), true)).rows[0];
            return row ? toPull(row) : null;
        },

        async listPulls() {
            return (await db.transaction(c => c.query('SELECT * FROM pr_assurance_pulls ORDER BY pull_number'), true)).rows.map(toPull);
        },

        /** Creates a QUEUED run for the imported head commit, or returns the run this request key created. */
        async createRun(input, actor) {
            fields(input, ['pullNumber', 'requestKey', 'rulesSnapshotDigest']);
            const requestKey = identifier(input.requestKey, 'Request key');
            return db.transaction(async c => {
                // Lock the pull first, so two requests with the same key are serialised and the second finds the first's run.
                const pull = (await c.query('SELECT * FROM pr_assurance_pulls WHERE pull_number = $1 FOR UPDATE', [input.pullNumber])).rows[0];
                const prior = (await c.query('SELECT * FROM pr_assurance_runs WHERE requested_by = $1 AND request_key = $2', [actor.email, requestKey])).rows[0];
                if (prior) {
                    if (Number(prior.pull_number) !== input.pullNumber) throw conflict('REQUEST_KEY_REUSED', 'This request key was already used for another pull request.');
                    return { run: toRun(prior), created: false };
                }
                if (!pull) throw conflict('PULL_NOT_IMPORTED', 'Import this pull request from GitHub before evaluating it.');
                const active = (await c.query("SELECT id FROM pr_assurance_runs WHERE pull_number = $1 AND status IN ('QUEUED','RUNNING') ORDER BY created_at DESC LIMIT 1", [input.pullNumber])).rows[0];
                if (active) throw conflict('RUN_ALREADY_ACTIVE', 'This pull request is already being evaluated.', { activeRunId: active.id });
                const at = now();
                const row = (await c.query(
                    `INSERT INTO pr_assurance_runs (id, pull_number, head_sha, rules_snapshot_digest, requested_by, request_key, status, created_at, updated_at)
                     VALUES ($1,$2,$3,$4,$5,$6,'QUEUED',$7,$7) RETURNING *`,
                    [randomUUID(), input.pullNumber, pull.head_sha, input.rulesSnapshotDigest, actor.email, requestKey, at])).rows[0];
                return { run: toRun(row), created: true };
            });
        },

        async getRun(id) {
            const row = (await db.transaction(c => c.query('SELECT * FROM pr_assurance_runs WHERE id = $1', [identifier(id, 'Run')]), true)).rows[0];
            return row ? toRun(row, true) : null;
        },

        /** Newest first, without evidence text. All pull requests when no number is given. */
        async listRuns(pullNumber) {
            const rows = pullNumber === undefined
                ? (await db.transaction(c => c.query('SELECT * FROM pr_assurance_runs ORDER BY created_at DESC, id'), true)).rows
                : (await db.transaction(c => c.query('SELECT * FROM pr_assurance_runs WHERE pull_number = $1 ORDER BY created_at DESC, id', [pullNumber]), true)).rows;
            return rows.map(row => toRun(row));
        },

        async events(runId) {
            return (await db.transaction(c => c.query('SELECT seq, stage, message, recorded_at FROM pr_assurance_run_events WHERE run_id = $1 ORDER BY seq', [identifier(runId, 'Run')]), true))
                .rows.map(r => ({ seq: Number(r.seq), stage: r.stage, message: r.message, recordedAt: r.recorded_at }));
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
