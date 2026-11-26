/**
 * Rules snapshots: what an application's pull requests are assessed against.
 *
 * Each application's rules come from its Profiles repository: Qivvera reads `.qivvera/rules-snapshot.json`
 * (made by scripts/pr-assurance-snapshot.mjs) at that repository's current commit when the application
 * is connected. When the repository does not publish one, a snapshot shipped with Qivvera for that
 * same repository is used (today: prcheck-live/vendorpay-policies @ e408884). A snapshot is accepted
 * only if its digest matches its content, it names that repository as its source, and it was taken
 * with the profile the decision logic implements.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { validateSnapshot } from '../../../dist/core/pr-assurance.js';
import { InputError } from '../workflow-input.mjs';
import { PR_ASSURANCE } from './config.mjs';

const sha256 = text => createHash('sha256').update(text).digest('hex');

/** Throws unless the snapshot is intact and usable; returns it unchanged. */
export function checkSnapshot(snapshot) {
    const { snapshotDigest, ...body } = snapshot ?? {};
    if (snapshotDigest !== `sha256:${sha256(JSON.stringify(body))}`) throw new Error('RULES_SNAPSHOT_DIGEST_MISMATCH');
    validateSnapshot(snapshot);
    return snapshot;
}

/** The snapshots shipped with Qivvera, checked when the service opens (a bad one stops it starting). */
export function loadBundledSnapshots(dir = new URL(`../../../${PR_ASSURANCE.bundledSnapshotsDir}/`, import.meta.url)) {
    const snapshots = readdirSync(dir).filter(name => name.endsWith('.json')).map(name => JSON.parse(readFileSync(new URL(name, dir), 'utf8')))
        .filter(doc => doc?.kind === 'qivvera.rules-snapshot/v1').map(checkSnapshot);
    return Object.freeze({
        all: snapshots,
        forRepository: fullName => snapshots.find(s => s.source.repository.toLowerCase() === String(fullName).toLowerCase()) ?? null,
    });
}

/** A snapshot read from a Profiles repository, accepted only for that repository. */
export function acceptPublishedSnapshot(raw, repository) {
    try {
        checkSnapshot(raw);
    } catch {
        throw new InputError('RULES_SNAPSHOT_INVALID', `${PR_ASSURANCE.rulesFile} in ${repository} is not a valid Qivvera rules snapshot (wrong digest, kind or profile). Regenerate it with scripts/pr-assurance-snapshot.mjs.`);
    }
    if (String(raw.source?.repository).toLowerCase() !== repository.toLowerCase()) {
        throw new InputError('RULES_SNAPSHOT_INVALID', `${PR_ASSURANCE.rulesFile} in ${repository} was taken from ${String(raw.source?.repository)}, not from this repository.`);
    }
    return raw;
}

/** What the pages show about a snapshot (never the snapshot's full content). */
export const rulesSummary = (snapshot, source) => snapshot && {
    source, repository: snapshot.source.repository, commit: snapshot.source.commit, snapshotDigest: snapshot.snapshotDigest,
    profile: { id: snapshot.profile.id, title: snapshot.profile.title }, policies: snapshot.policies.length,
    obligations: snapshot.policies.reduce((n, policy) => n + policy.obligations.length, 0),
};
