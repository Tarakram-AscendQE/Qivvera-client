/**
 * The PR assurance add-on as the API uses it: the fixed scenario and importing the demo pull requests
 * (evaluation follows in the next slice). Anyone signed in may read; only an Author or a Policy
 * Authority may import or evaluate.
 *
 * The rules snapshot is checked when the service opens: its digest must match its content and it must
 * have been taken with the profile the decision logic implements. Otherwise the feature does not start.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateSnapshot } from '../../../dist/core/pr-assurance.js';
import { InputError, actorEmail } from '../workflow-input.mjs';
import { SCENARIO } from './config.mjs';
import { createGitHubClient } from './github.mjs';
import { openPrAssuranceRepository } from './repository.mjs';

const sha256 = text => createHash('sha256').update(text).digest('hex');

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

/** What the timeline shows about a run: never the evidence itself. */
const runSummary = run => run && {
    id: run.id, status: run.status, disposition: run.disposition, headSha: run.headSha,
    createdAt: run.createdAt, finishedAt: run.finishedAt, failure: run.failure,
};

export async function openPrAssuranceService({ database, secretEnv = process.env, fetchFn = fetch, migrate = false, snapshot = loadRulesSnapshot() }) {
    const repository = await openPrAssuranceRepository({ ...database, migrate });
    const github = createGitHubClient({ secretEnv, fetchFn });
    const obligations = snapshot.policies.reduce((n, policy) => n + policy.obligations.length, 0);

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
            return repository.savePull(await github.readPull(number), session);
        },

        close: () => repository.close(),
    };
}
