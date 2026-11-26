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
 * With `githubWrite` on, Qivvera also tells the pull request on GitHub: a pending "Qivvera" commit status
 * when a run starts, then success (READY only) or failure plus one PR comment when it completes, or error
 * when it ends without a result. This is best effort and never changes the run: if GitHub refuses, the
 * commit keeps no success status (so a required check keeps the merge blocked) and a notice says so.
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
/** The PR comment for a completed run: the result, what is broken and what changed since the previous PR. */
function commentFor(run, result, link) {
    const icon = result.disposition === 'READY' ? '✅' : '❌';
    const lines = [`### ${icon} Qivvera: ${result.summary}`, '', `Commit \`${run.headSha.slice(0, 7)}\`${link ? ` · [Full report in Qivvera](${link})` : ''}`, ''];
    const broken = result.rules.filter(r => r.broken);
    if (broken.length) {
        lines.push('**Broken business rules**', '');
        for (const rule of broken) {
            lines.push(`- **${rule.id}** ${rule.title}`);
            for (const o of rule.obligations.filter(o => o.state !== 'SUPPORTED')) lines.push(`  - \`${o.id}\` ${o.statement} — ${o.state}`);
        }
        lines.push('');
    } else lines.push('No business rule is broken on this commit.', '');
    const c = result.comparison;
    if (c) {
        const ids = list => (list.length ? list.join(', ') : 'none');
        lines.push(`**Since PR #${c.previousPull}:** fixed ${ids(c.fixed)} · still broken ${ids(c.stillBroken)} · newly broken ${ids(c.newlyBroken)}`, '');
    }
    lines.push(result.disposition === 'READY'
        ? '_This commit may be merged as far as Qivvera is concerned._'
        : '_Merging stays blocked until Qivvera reports READY. Push a fix, then evaluate the new commit in Qivvera._');
    return lines.join('\n');
}
const progressOf = output => ({ stage: output.stage, message: output.message, checksTotal: output.checksTotal, checks: output.checks });

export async function openPrAssuranceService({ database, secretEnv = process.env, fetchFn = fetch, migrate = false, snapshot = loadRulesSnapshot(), now = () => Date.now(),
    githubWrite = false, publicOrigin = null }) {
    const repository = await openPrAssuranceRepository({ ...database, migrate });
    const github = createGitHubClient({ secretEnv, fetchFn });
    const obligations = snapshot.policies.reduce((n, policy) => n + policy.obligations.length, 0);
    const obligationRows = snapshot.policies.flatMap(policy => policy.obligations.map(o => ({ id: o.id, statement: o.statement, policyId: policy.id })));

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

    /** A PR's result for the timeline: its latest COMPLETED run, assessed again from the stored evidence. */
    async function resultOf(runs, number) {
        const latest = runs.find(r => r.pullNumber === number && r.status === 'COMPLETED');
        if (!latest) return null;
        const assessed = assessStored(await repository.getRun(latest.id));
        if (!assessed.ok) return { runId: latest.id, finishedAt: latest.finishedAt, integrityFailed: true, reason: assessed.reason };
        return {
            runId: latest.id, finishedAt: latest.finishedAt, disposition: assessed.disposition,
            brokenRules: assessed.counts.brokenRules, brokenRuleIds: assessed.rules.filter(r => r.broken).map(r => r.id),
            supported: assessed.counts.supported, obligations: assessed.counts.obligations,
            states: Object.fromEntries(assessed.rules.flatMap(r => r.obligations.map(o => [o.id, o.state]))),
        };
    }

    const runLink = id => (publicOrigin ? `${publicOrigin}/#/pr-assurance/runs/${id}` : null);
    /**
     * Tells the PR on GitHub how a run started or ended ('started', 'completed' or 'ended'). Returns a
     * notice when GitHub refused; never repeats a write by itself.
     */
    async function tellGitHub(runId, kind) {
        if (!githubWrite) return null;
        try {
            const run = await repository.getRun(runId);
            const targetUrl = runLink(run.id);
            if (kind === 'started') {
                await github.setCommitStatus(run.headSha, { state: 'pending', description: 'Qivvera is checking the business rules on this commit', targetUrl });
            } else if (kind === 'completed') {
                const result = await report(run);
                if (!result.ok) {
                    await github.setCommitStatus(run.headSha, { state: 'error', description: 'Qivvera could not verify its stored evidence. Evaluate again.', targetUrl });
                    return null;
                }
                await github.setCommitStatus(run.headSha, { state: result.disposition === 'READY' ? 'success' : 'failure', description: result.summary, targetUrl });
                await github.upsertPullComment(run.pullNumber, commentFor(run, result, targetUrl));
            } else {
                await github.setCommitStatus(run.headSha, { state: 'error', description: 'Qivvera could not finish evaluating this commit. Evaluate it again.', targetUrl });
            }
            return null;
        } catch (error) {
            if (typeof error?.code === 'string' && error instanceof InputError) return `Qivvera could not update the pull request on GitHub: ${error.message}`;
            throw error;
        }
    }
    /** Ends a run without a result; only the request that actually ended it tells GitHub. */
    async function endRun(runId, failure) {
        const { changed } = await repository.failRun(runId, failure);
        return changed ? tellGitHub(runId, 'ended') : null;
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
            return endRun(run.id, { status: 'TIMED_OUT', code: 'RUN_TIMED_OUT', message: 'GitHub did not finish this run within 15 minutes.' });
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
                    return endRun(run.id, { status: 'FAILED', code: parsed.reason, message: 'GitHub reported progress that Qivvera cannot accept for this run.' });
                }
                const { output } = parsed;
                if (output.stage === 'failed') {
                    return endRun(run.id, { status: 'FAILED', code: 'ASSESSMENT_FAILED', message: output.message });
                }
                if (output.stage === 'done') {
                    const result = assessEvidence({ snapshot, evidenceText: output.evidence, evidenceSha256: output.evidenceSha256, expectedCommit: run.headSha.slice(0, 7), sha256 });
                    if (!result.ok) {
                        return endRun(run.id, { status: 'FAILED', code: result.reason, message: result.message });
                    }
                    await repository.recordProgress(run.id, { ...found, checkRunId: checkRun.id, status: 'RUNNING', stage: 'done', message: result.summary, progress: progressOf(output) });
                    const { changed } = await repository.completeRun(run.id, { evidenceText: output.evidence, evidenceSha256: output.evidenceSha256, teamTests: output.teamTests, disposition: result.disposition });
                    return changed ? tellGitHub(run.id, 'completed') : null;
                }
                await repository.recordProgress(run.id, { ...found, checkRunId: checkRun.id, status: 'RUNNING', stage: output.stage, message: output.message, progress: progressOf(output) });
            } else if (githubRun.status === 'in_progress') {
                await repository.recordProgress(run.id, { ...found, status: 'RUNNING', stage: 'preparing', message: 'A GitHub machine has started' });
            }
            if (githubRun.status === 'completed') {
                // The workflow ended but never reported a finished assessment.
                const cancelled = githubRun.conclusion === 'cancelled';
                return endRun(run.id, cancelled
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
                obligations: obligationRows,
                pulls: await Promise.all(SCENARIO.pulls.map(async number => ({
                    number,
                    pull: pulls.find(p => p.pullNumber === number) ?? null,
                    latestRun: runSummary(runs.find(r => r.pullNumber === number)) ?? null,
                    result: await resultOf(runs, number),
                }))),
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
            const told = await tellGitHub(run.id, 'started');
            if (told) notice = notice ? `${notice} ${told}` : told;
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
