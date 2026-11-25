/**
 * The PR assurance add-on as the API uses it: the fixed scenario, importing the demo pull requests and
 * evaluating them on GitHub Actions. Anyone signed in may read and sync a run; only an Author or a
 * Policy Authority may import or start one.
 *
 * Reading a run never contacts GitHub. `sync` brings in what GitHub reports (the page calls it while a
 * run is active): the run's progress, and once the workflow is done its evidence, which is verified
 * (SHA-256, kind, commit) and assessed against the rules snapshot before it is stored. Anything that
 * cannot be verified ends the run without a disposition. The report is derived again from the stored
 * evidence on every read, so stored evidence that no longer matches its digest is shown as such.
 *
 * The rules snapshot is checked when the service opens: its digest must match its content and it must
 * have been taken with the profile the decision logic implements. Otherwise the feature does not start.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assessEvidence, compareAssessments, parseAssessmentOutput, validateSnapshot } from '../../../dist/core/pr-assurance.js';
import { InputError, actorEmail, fields } from '../workflow-input.mjs';
import { SCENARIO } from './config.mjs';
import { createGitHubClient } from './github.mjs';
import { openPrAssuranceRepository } from './repository.mjs';

const sha256 = text => createHash('sha256').update(text).digest('hex');
const ACTIVE = ['QUEUED', 'RUNNING'];

export function loadRulesSnapshot(file = new URL(`../../../${SCENARIO.snapshotFile}`, import.meta.url)) {
    const snapshot = JSON.parse(readFileSync(file, 'utf8'));
    const { snapshotDigest, ...body } = snapshot;
    if (snapshotDigest !== `sha256:${sha256(JSON.stringify(body))}`) throw new Error('RULES_SNAPSHOT_DIGEST_MISMATCH');
    validateSnapshot(snapshot);
    return snapshot;
}

const canAct = session => session.roles.includes('AUTHOR') || session.roles.includes('POLICY_AUTHORITY');
function requireActor(session) {
    actorEmail(session);
    if (!canAct(session)) throw new InputError('FORBIDDEN', 'Only an Author or a Policy Authority can import or evaluate pull requests.', 403);
}
function scenarioPull(number) {
    if (!SCENARIO.pulls.includes(number)) throw new InputError('PULL_NOT_IN_SCENARIO', 'Only the demo pull requests #6, #7 and #8 can be used.', 400);
    return number;
}

/** What the timeline shows about a run: never the evidence itself. */
const runSummary = run => run && {
    id: run.id, status: run.status, disposition: run.disposition, headSha: run.headSha,
    createdAt: run.createdAt, finishedAt: run.finishedAt, failure: run.failure,
};
/** The progress shown while a run is going: the check-run output without any evidence. */
const progressOf = output => ({ stage: output.stage, message: output.message, checksTotal: output.checksTotal, checks: output.checks });

export async function openPrAssuranceService({ database, secretEnv = process.env, fetchFn = fetch, migrate = false, snapshot = loadRulesSnapshot(), now = () => Date.now() }) {
    const repository = await openPrAssuranceRepository({ ...database, migrate });
    const github = createGitHubClient({ secretEnv, fetchFn });
    const obligations = snapshot.policies.reduce((n, policy) => n + policy.obligations.length, 0);

    /** Assesses a stored run's evidence again; a changed snapshot or altered evidence is reported, not hidden. */
    function assessStored(run) {
        if (run.rulesSnapshotDigest !== snapshot.snapshotDigest) {
            return { ok: false, reason: 'RULES_SNAPSHOT_CHANGED', message: 'This run was assessed against an earlier rules snapshot.' };
        }
        return assessEvidence({ snapshot, evidenceText: run.evidenceText, evidenceSha256: run.evidenceSha256, expectedCommit: run.headSha.slice(0, 7), sha256 });
    }

    async function report(run) {
        const result = assessStored(run);
        if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
        let comparison = null;
        const index = SCENARIO.pulls.indexOf(run.pullNumber);
        if (index > 0) {
            const previousPull = SCENARIO.pulls[index - 1];
            const latest = (await repository.listRuns(previousPull)).find(r => r.status === 'COMPLETED');
            const previous = latest ? assessStored(await repository.getRun(latest.id)) : null;
            if (previous?.ok) comparison = { previousPull, ...compareAssessments(previous, result) };
        }
        return {
            ...result, teamTests: run.teamTests, comparison,
            proof: { ...result.proof, pullNumber: run.pullNumber, headSha: run.headSha, evidenceSha256: run.evidenceSha256, githubRunUrl: run.githubRunUrl },
        };
    }

    async function view(runId, githubNotice = null) {
        const stored = await repository.getRun(runId);
        if (!stored) throw new InputError('RUN_NOT_FOUND', 'This assessment run does not exist.', 404);
        const { evidenceText: _evidence, ...run } = stored;
        return { run, events: await repository.events(runId), report: stored.status === 'COMPLETED' ? await report(stored) : null, githubNotice };
    }

    /**
     * Brings an active run up to date with GitHub (at most two GitHub calls). Returns a notice when
     * GitHub could not be asked; the run is then left as it was and the next sync tries again.
     */
    async function advance(run) {
        if (!ACTIVE.includes(run.status)) return null;
        if (now() - Date.parse(run.createdAt) > SCENARIO.runTimeoutMs) {
            await repository.failRun(run.id, { status: 'TIMED_OUT', code: 'RUN_TIMED_OUT', message: 'GitHub did not finish this run within 15 minutes.' });
            return null;
        }
        try {
            const githubRun = run.githubRunId ? await github.getRun(run.githubRunId, run.id) : await github.findRun(run.id, run.createdAt);
            if (!githubRun) return null;
            const found = { githubRunId: githubRun.id, githubRunUrl: githubRun.url };
            if (githubRun.status !== 'in_progress' && githubRun.status !== 'completed') {
                await repository.recordProgress(run.id, { ...found, stage: 'queued', message: 'Waiting for a GitHub machine' });
                return null;
            }
            const checkRun = await github.findCheckRun(githubRun.headSha, run.id);
            if (checkRun?.text) {
                const parsed = parseAssessmentOutput(checkRun.text, { correlationId: run.id, appSha: run.headSha });
                if (!parsed.ok) {
                    await repository.failRun(run.id, { status: 'FAILED', code: parsed.reason, message: 'GitHub reported progress that Qivvera cannot accept for this run.' });
                    return null;
                }
                const { output } = parsed;
                if (output.stage === 'failed') {
                    await repository.failRun(run.id, { status: 'FAILED', code: 'ASSESSMENT_FAILED', message: output.message });
                    return null;
                }
                if (output.stage === 'done') {
                    const result = assessEvidence({ snapshot, evidenceText: output.evidence, evidenceSha256: output.evidenceSha256, expectedCommit: run.headSha.slice(0, 7), sha256 });
                    if (!result.ok) {
                        await repository.failRun(run.id, { status: 'FAILED', code: result.reason, message: result.message });
                        return null;
                    }
                    await repository.recordProgress(run.id, { ...found, checkRunId: checkRun.id, status: 'RUNNING', stage: 'done', message: result.summary, progress: progressOf(output) });
                    await repository.completeRun(run.id, { evidenceText: output.evidence, evidenceSha256: output.evidenceSha256, teamTests: output.teamTests, disposition: result.disposition });
                    return null;
                }
                await repository.recordProgress(run.id, { ...found, checkRunId: checkRun.id, status: 'RUNNING', stage: output.stage, message: output.message, progress: progressOf(output) });
            } else if (githubRun.status === 'in_progress') {
                await repository.recordProgress(run.id, { ...found, status: 'RUNNING', stage: 'preparing', message: 'A GitHub machine has started' });
            }
            if (githubRun.status === 'completed') {
                // The workflow ended but never reported a finished assessment.
                const cancelled = githubRun.conclusion === 'cancelled';
                await repository.failRun(run.id, cancelled
                    ? { status: 'CANCELLED', code: 'GITHUB_RUN_CANCELLED', message: 'The GitHub run was cancelled before it produced evidence.' }
                    : { status: 'FAILED', code: 'GITHUB_RUN_FAILED', message: `The GitHub run ended (${githubRun.conclusion ?? 'no conclusion'}) without evidence.` });
            }
            return null;
        } catch (error) {
            if (String(error?.code ?? '').startsWith('GITHUB_')) return error.message;
            throw error;
        }
    }

    return {
        async scenario(session) {
            actorEmail(session);
            const [pulls, runs] = await Promise.all([repository.listPulls(), repository.listRuns()]);
            return {
                application: SCENARIO.application,
                change: SCENARIO.change,
                repository: `${SCENARIO.app.owner}/${SCENARIO.app.repo}`,
                githubTokenConfigured: github.tokenConfigured(),
                canEvaluate: canAct(session),
                rules: {
                    repository: snapshot.source.repository, commit: snapshot.source.commit, snapshotDigest: snapshot.snapshotDigest,
                    profile: { id: snapshot.profile.id, title: snapshot.profile.title }, policies: snapshot.policies.length, obligations,
                },
                pulls: SCENARIO.pulls.map(number => ({
                    number,
                    pull: pulls.find(p => p.pullNumber === number) ?? null,
                    latestRun: runSummary(runs.find(r => r.pullNumber === number)) ?? null,
                })),
            };
        },

        async importPull(number, session) {
            requireActor(session);
            return repository.savePull(await github.readPull(scenarioPull(number)), session);
        },

        /** Starts one run for the imported head commit; the same request key returns the same run. */
        async startRun(pullNumber, input, session) {
            requireActor(session);
            scenarioPull(pullNumber);
            fields(input, ['requestKey']);
            // A run that quietly stopped (for example, GitHub never started it) is timed out first, so it cannot block forever.
            const active = (await repository.listRuns(pullNumber)).find(r => ACTIVE.includes(r.status));
            if (active) await advance(active);
            const { run, created } = await repository.createRun({ pullNumber, requestKey: input.requestKey, rulesSnapshotDigest: snapshot.snapshotDigest }, session);
            if (!created) return { ...await view(run.id), notice: null, replayed: true };
            await repository.recordProgress(run.id, { stage: 'queued', message: 'Waiting for GitHub to start the run' });
            let notice = null;
            try {
                await github.dispatch({ appSha: run.headSha, correlationId: run.id });
            } catch (error) {
                if (error?.code !== 'GITHUB_DISPATCH_UNCERTAIN') {
                    await repository.failRun(run.id, { status: 'FAILED', code: error?.code ?? 'GITHUB_DISPATCH_FAILED', message: error?.message ?? 'GitHub did not start the run.' });
                    throw error;
                }
                notice = error.message;
            }
            return { ...await view(run.id), notice, replayed: false };
        },

        async getRun(runId, session) {
            actorEmail(session);
            return view(runId);
        },

        async syncRun(runId, session) {
            actorEmail(session);
            const run = await repository.getRun(runId);
            if (!run) throw new InputError('RUN_NOT_FOUND', 'This assessment run does not exist.', 404);
            return view(runId, await advance(run));
        },

        async listRuns(pullNumber, session) {
            actorEmail(session);
            return repository.listRuns(scenarioPull(pullNumber));
        },

        close: () => repository.close(),
    };
}
