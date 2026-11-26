/**
 * PR assurance as the API uses it, per application: connecting an application to GitHub, importing
 * its pull requests and evaluating them on GitHub Actions. Anyone signed in may read and sync a run;
 * only an Author or a Policy Authority may connect an application, import or start a run.
 *
 * Every GitHub call for an application uses that application's own token, decrypted just for the
 * call, and only that application's repositories. Project A's token is never used for Project B.
 *
 * Reading a run never contacts GitHub. `sync` brings in what GitHub reports (the page calls it while a
 * run is active): the run's progress, and once the workflow is done its evidence, which is verified
 * (SHA-256, kind, commit) and assessed against the rules snapshot the run started with before it is
 * stored. Anything that cannot be verified ends the run without a disposition. The report is derived
 * again from the stored evidence on every read, so stored evidence that no longer matches its digest
 * is shown as such.
 *
 * With `githubWrite` on, Qivvera also tells the pull request on GitHub, in the application's own
 * repository and with its own token: a pending "Qivvera" commit status when a run starts, then success
 * (READY only) or failure plus one PR comment when it completes, or error when it ends without a result.
 * This is best effort and never changes the run: if GitHub refuses, the commit keeps no success status
 * (so a required check keeps the merge blocked) and a notice says so.
 */
import { createHash } from 'node:crypto';
import { assessEvidence, compareAssessments, parseAssessmentOutput } from '../../../dist/core/pr-assurance.js';
import { InputError, actorEmail, fields, identifier } from '../workflow-input.mjs';
import { PR_ASSURANCE } from './config.mjs';
import { connectionInput, inspectConnection } from './connect.mjs';
import { keyMissing, loadCredentialKey } from './credentials.mjs';
import { createGitHubClient } from './github.mjs';
import { openPrAssuranceRepository, writeConnection } from './repository.mjs';
import { loadBundledSnapshots, rulesSummary } from './rules.mjs';

const sha256 = text => createHash('sha256').update(text).digest('hex');
const ACTIVE = ['QUEUED', 'RUNNING'];

const canAct = session => session.roles.includes('AUTHOR') || session.roles.includes('POLICY_AUTHORITY');
function requireActor(session, what = 'import or evaluate pull requests') {
    actorEmail(session);
    if (!canAct(session)) throw new InputError('FORBIDDEN', `Only an Author or a Policy Authority can ${what}.`, 403);
}
const notConnected = () => new InputError('APPLICATION_NOT_CONNECTED', 'This application is not connected to GitHub yet. Add its repositories and token in the application\'s GitHub settings.', 409);

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
/** A connection as pages see it: repositories and dates, never the token. */
const publicConnection = ({ sealed: _sealed, ...connection }) => connection;

export async function openPrAssuranceService({ database, secretEnv = process.env, fetchFn = fetch, migrate = false, bundled = loadBundledSnapshots(), now = () => Date.now(), githubTimeoutMs,
    githubWrite = false, publicOrigin = null } = {}) {
    const credentials = loadCredentialKey(secretEnv);
    const repository = await openPrAssuranceRepository({ ...database, migrate });
    // Shipped snapshots are stored by digest too, so runs made against them can always be reassessed.
    for (const snapshot of bundled.all) await repository.saveSnapshot(snapshot);
    const snapshots = new Map(bundled.all.map(s => [s.snapshotDigest, s]));
    async function snapshotFor(digest) {
        if (!digest) return null;
        if (!snapshots.has(digest)) {
            const stored = await repository.getSnapshot(digest);
            if (stored) snapshots.set(digest, stored);
        }
        return snapshots.get(digest) ?? null;
    }

    async function connectionOf(applicationId) {
        const connection = await repository.getConnection(identifier(applicationId, 'Application'));
        if (!connection) throw notConnected();
        return connection;
    }
    /** A GitHub client with this application's own token. */
    function githubFor(connection) {
        if (!credentials) throw keyMissing();
        return createGitHubClient({ token: credentials.open(connection.sealed, connection.applicationId), connection, fetchFn, timeoutMs: githubTimeoutMs });
    }

    /** Assesses a stored run's evidence again, against the snapshot that run started with. */
    async function assessStored(run) {
        const snapshot = await snapshotFor(run.rulesSnapshotDigest);
        if (!snapshot) return { ok: false, reason: 'RULES_SNAPSHOT_CHANGED', message: 'The rules snapshot this run was assessed against is no longer available.' };
        return assessEvidence({ snapshot, evidenceText: run.evidenceText, evidenceSha256: run.evidenceSha256, expectedCommit: run.headSha.slice(0, 7), sha256 });
    }

    /** The nearest earlier imported PR of the same application that has a completed run, if any. */
    async function previousResult(run) {
        const runs = await repository.listRuns(run.applicationId);
        const earlier = [...new Set(runs.filter(r => r.status === 'COMPLETED' && r.pullNumber < run.pullNumber).map(r => r.pullNumber))].sort((a, b) => b - a)[0];
        if (earlier === undefined) return null;
        const latest = runs.find(r => r.pullNumber === earlier && r.status === 'COMPLETED');
        const assessed = await assessStored(await repository.getRun(latest.id));
        return assessed.ok ? { previousPull: earlier, assessed } : null;
    }

    async function report(run) {
        const result = await assessStored(run);
        if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
        const previous = await previousResult(run);
        const connection = await repository.getConnection(run.applicationId);
        return {
            ...result, teamTests: run.teamTests,
            comparison: previous ? { previousPull: previous.previousPull, ...compareAssessments(previous.assessed, result) } : null,
            proof: { ...result.proof, pullNumber: run.pullNumber, headSha: run.headSha, evidenceSha256: run.evidenceSha256, githubRunUrl: run.githubRunUrl,
                rulesRepository: (await snapshotFor(run.rulesSnapshotDigest))?.source.repository ?? null, testsRepository: connection?.tests.repository ?? null },
        };
    }

    /** A PR's result for the timeline: its latest COMPLETED run, assessed again from the stored evidence. */
    async function resultOf(runs, number) {
        const latest = runs.find(r => r.pullNumber === number && r.status === 'COMPLETED');
        if (!latest) return null;
        const assessed = await assessStored(await repository.getRun(latest.id));
        if (!assessed.ok) return { runId: latest.id, finishedAt: latest.finishedAt, integrityFailed: true, reason: assessed.reason };
        return {
            runId: latest.id, finishedAt: latest.finishedAt, disposition: assessed.disposition,
            brokenRules: assessed.counts.brokenRules, brokenRuleIds: assessed.rules.filter(r => r.broken).map(r => r.id),
            supported: assessed.counts.supported, obligations: assessed.counts.obligations,
            states: Object.fromEntries(assessed.rules.flatMap(r => r.obligations.map(o => [o.id, o.state]))),
        };
    }

    async function view(runId, githubNotice = null) {
        const stored = await repository.getRun(runId);
        if (!stored) throw new InputError('RUN_NOT_FOUND', 'This assessment run does not exist.', 404);
        const { evidenceText: _evidence, ...run } = stored;
        return { run, events: await repository.events(runId), report: stored.status === 'COMPLETED' ? await report(stored) : null, githubNotice };
    }

    const runLink = id => (publicOrigin ? `${publicOrigin}/#/pr-assurance/runs/${id}` : null);
    /**
     * Tells the PR on GitHub how a run started or ended ('started', 'completed' or 'ended'), with the run's
     * application's own token. Returns a notice when GitHub refused; never repeats a write by itself.
     */
    async function tellGitHub(runId, kind) {
        if (!githubWrite) return null;
        try {
            const run = await repository.getRun(runId);
            const github = githubFor(await connectionOf(run.applicationId));
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
            if (typeof error?.code === 'string' && error instanceof InputError) {
                // Also in the server log (never the token): the page shows this notice only once.
                console.warn(`PR_ASSURANCE_GITHUB_WRITE_FAILED run=${runId} step=${kind} ${error.code}: ${error.message}`);
                return `Qivvera could not update the pull request on GitHub: ${error.message}`;
            }
            throw error;
        }
    }
    /** Ends a run without a result; only the request that actually ended it tells GitHub. */
    async function endRun(runId, failure) {
        const { changed } = await repository.failRun(runId, failure);
        return changed ? tellGitHub(runId, 'ended') : null;
    }

    /**
     * Brings an active run up to date with GitHub (at most two GitHub calls), with its application's
     * token. Returns a notice when GitHub could not be asked; the run is then left as it was and the
     * next sync tries again.
     */
    async function advance(run) {
        if (!ACTIVE.includes(run.status)) return null;
        if (now() - Date.parse(run.createdAt) > PR_ASSURANCE.runTimeoutMs) {
            return endRun(run.id, { status: 'TIMED_OUT', code: 'RUN_TIMED_OUT', message: 'GitHub did not finish this run within 15 minutes.' });
        }
        try {
            const github = githubFor(await connectionOf(run.applicationId));
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
                    const snapshot = await snapshotFor(run.rulesSnapshotDigest);
                    const result = snapshot
                        ? assessEvidence({ snapshot, evidenceText: output.evidence, evidenceSha256: output.evidenceSha256, expectedCommit: run.headSha.slice(0, 7), sha256 })
                        : { ok: false, reason: 'RULES_SNAPSHOT_CHANGED', message: 'The rules snapshot this run started with is no longer available.' };
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
            // GitHub problems, and a token that cannot be used, leave the run as it is with a notice.
            if (/^(GITHUB_|CREDENTIAL_|APPLICATION_NOT_CONNECTED)/.test(String(error?.code ?? ''))) return error.message;
            throw error;
        }
    }

    /**
     * Checks the form's repositories and token with GitHub, then returns a saver that encrypts the token
     * for the application id it is given and writes the connection on the caller's transaction.
     * Nothing is stored until that saver runs.
     */
    async function prepareConnection(input, session, role) {
        if (role) {
            actorEmail(session);
            if (!session.roles.includes(role)) throw new InputError('FORBIDDEN', 'Your workspace role does not permit this action.', 403);
        } else requireActor(session, 'connect an application to GitHub');
        if (!credentials) throw keyMissing();
        const parsed = connectionInput(input);
        const connection = await inspectConnection(parsed, { fetchFn, bundled, timeoutMs: githubTimeoutMs });
        if (connection.rules) await repository.saveSnapshot(connection.rules);
        const actor = actorEmail(session);
        return {
            summary: { ...connection, rules: rulesSummary(connection.rules, connection.rulesSource) },
            save: (c, applicationId) => writeConnection(c, { applicationId, connection, sealed: credentials.seal(parsed.token, applicationId), actor }),
        };
    }

    /** Connections without tokens, keyed by application id, with a summary of their rules. */
    async function connections() {
        const all = await repository.listConnections();
        return new Map(await Promise.all(all.map(async c => [c.applicationId, { ...c, rules: c.rules ? rulesSummary(await snapshotFor(c.rules.digest), c.rules.source) : null }])));
    }

    return {
        /** True when tokens can be stored and used (the deployer has set the encryption key). */
        credentialsReady: !!credentials,

        /** Registration uses this: it checks with GitHub first, then saves in the application's own transaction. */
        prepareConnection,

        /** Connects an existing application, or replaces its repositories and token. */
        async connect(applicationId, input, session) {
            identifier(applicationId, 'Application');
            const prepared = await prepareConnection(input, session);
            await repository.transaction(c => prepared.save(c, applicationId));
            return prepared.summary;
        },

        connections,

        /** The applications that can be chosen on the PR assurance page. */
        async overview(applications, session) {
            actorEmail(session);
            const connected = await connections();
            return {
                canEvaluate: canAct(session), credentialsReady: !!credentials,
                applications: applications.filter(app => !app.archived).map(app => ({ id: app.id, name: app.name, description: app.description ?? '', connection: connected.get(app.id) ?? null })),
            };
        },

        /** One application's pull requests (imported ones, with their latest run and result) and its rules. */
        async scenario(application, session) {
            actorEmail(session);
            const stored = await repository.getConnection(identifier(application.id, 'Application'));
            const connection = stored ? publicConnection(stored) : null;
            const snapshot = await snapshotFor(connection?.rules?.digest);
            const [pulls, runs] = await Promise.all([repository.listPulls(application.id), repository.listRuns(application.id)]);
            return {
                application: { id: application.id, name: application.name },
                repository: connection?.app.repository ?? null,
                connection, credentialsReady: !!credentials,
                githubTokenConfigured: !!connection,
                canEvaluate: canAct(session),
                rules: rulesSummary(snapshot, connection?.rules?.source ?? null),
                obligations: snapshot ? snapshot.policies.flatMap(policy => policy.obligations.map(o => ({ id: o.id, statement: o.statement, policyId: policy.id }))) : [],
                pulls: await Promise.all(pulls.map(async pull => ({
                    number: pull.pullNumber, pull,
                    latestRun: runSummary(runs.find(r => r.pullNumber === pull.pullNumber)) ?? null,
                    result: await resultOf(runs, pull.pullNumber),
                }))),
            };
        },

        /** The application's open PRs on GitHub, to choose what to import. Read with the application's token. */
        async githubPulls(applicationId, session) {
            requireActor(session);
            const connection = await connectionOf(applicationId);
            const [open, imported] = await Promise.all([githubFor(connection).listOpenPulls(), repository.listPulls(connection.applicationId)]);
            const numbers = new Set(imported.map(p => p.pullNumber));
            return open.map(pull => ({ ...pull, imported: numbers.has(pull.number) })).sort((a, b) => a.number - b.number);
        },

        async importPull(applicationId, number, session) {
            requireActor(session);
            const connection = await connectionOf(applicationId);
            return repository.savePull(connection.applicationId, await githubFor(connection).readPull(number), session);
        },

        /** Starts one run for the imported head commit; the same request key returns the same run. */
        async startRun(applicationId, pullNumber, input, session) {
            requireActor(session);
            fields(input, ['requestKey']);
            const connection = await connectionOf(applicationId);
            if (!connection.rules) throw new InputError('RULES_NOT_AVAILABLE', `There are no rules to assess against: ${connection.profiles.repository} does not publish ${PR_ASSURANCE.rulesFile}. Add it, then save the application's GitHub settings again.`, 409);
            // A run that quietly stopped (for example, GitHub never started it) is timed out first, so it cannot block forever.
            const active = (await repository.listRuns(connection.applicationId, pullNumber)).find(r => ACTIVE.includes(r.status));
            if (active) await advance(active);
            const github = githubFor(connection);
            const { run, created } = await repository.createRun({ applicationId: connection.applicationId, pullNumber, requestKey: input.requestKey, rulesSnapshotDigest: connection.rules.digest }, session);
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

        async listRuns(applicationId, pullNumber, session) {
            actorEmail(session);
            return repository.listRuns(identifier(applicationId, 'Application'), pullNumber);
        },

        close: () => repository.close(),
    };
}
