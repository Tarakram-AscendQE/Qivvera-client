/**
 * PR assurance (demo): turns one verifier evidence record into obligation states, broken rules and a
 * disposition, using the static rules snapshot generated from vendorpay-policies.
 *
 * Pure: no I/O, no clock and no crypto of its own. The caller passes `sha256`, so the logic is the
 * same on the server and in tests.
 *
 * Check result → obligation state follows prcheck-verifiers' evidence reporter. Obligation states →
 * disposition follows the payments-critical profile, first match wins. A combination the profile has
 * no rule for is INDETERMINATE: Qivvera never infers READY from a gap in the rules.
 */
/** The profile the rules below implement. A changed profile file must be reviewed against this code. */
export const SUPPORTED_PROFILE = {
    id: "payments-critical",
    digest: "sha256:1df281544d5d608eccc4942a7abb7790affc9960e2c303fc9a15af50fcc07051",
};
const SNAPSHOT_KIND = "qivvera.rules-snapshot/v1";
const EVIDENCE_KIND = "qivvra.evidence/v1";
/** V1 proves the environment ran the commit under review; without it no other result counts. */
const ENVIRONMENT_CHECK = "V1/qe-runs-head-commit";
const CHECK_STATES = new Set(["SUPPORTED", "VIOLATED", "NOT_ASSESSED"]);
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const refuse = (reason, message) => ({ ok: false, reason, message });
/** Throws unless the snapshot is complete and was taken with the profile this code implements. */
export function validateSnapshot(snapshot) {
    if (!isObject(snapshot) || snapshot.kind !== SNAPSHOT_KIND || !Array.isArray(snapshot.policies) || snapshot.policies.length === 0) {
        throw new Error("INVALID_SNAPSHOT");
    }
    if (snapshot.profile?.id !== SUPPORTED_PROFILE.id || snapshot.profile.digest !== SUPPORTED_PROFILE.digest) {
        throw new Error("PROFILE_NOT_SUPPORTED");
    }
    const seen = new Set();
    for (const policy of snapshot.policies) {
        for (const obligation of policy.obligations) {
            if (seen.has(obligation.id))
                throw new Error(`INVALID_SNAPSHOT:${obligation.id}`);
            seen.add(obligation.id);
            if (typeof snapshot.verifiers.catalog[obligation.verifier]?.checks[obligation.check] !== "string") {
                throw new Error(`INVALID_SNAPSHOT:${obligation.id}`);
            }
        }
    }
}
function isEvidenceCheck(key, value) {
    return isObject(value) && value["check"] === key && CHECK_STATES.has(value["state"]) &&
        (value["reason"] === null || typeof value["reason"] === "string") && typeof value["durationMs"] === "number";
}
function isEvidenceShape(value) {
    const { target, verifiers, run, checks } = value;
    return isObject(target) && typeof target["expectedSha"] === "string" && typeof value["environmentConfirmed"] === "boolean" &&
        isObject(verifiers) && (verifiers["commit"] === null || typeof verifiers["commit"] === "string") &&
        isObject(run) && typeof run["startedAt"] === "string" && typeof run["finishedAt"] === "string" &&
        isObject(checks) && Object.entries(checks).every(([key, check]) => isEvidenceCheck(key, check));
}
const gitShaOf = (version) => (isObject(version) ? version["gitSha"] : undefined);
/** The disposition rules of payments-critical, first match wins; anything unmatched fails closed. */
function decide(rules, obligations) {
    const ids = (predicate) => rules.flatMap(rule => rule.obligations.filter(o => predicate(o, rule)).map(o => o.id));
    const criticalNotAssessed = ids((o, rule) => o.state === "NOT_ASSESSED" && rule.severity === "critical");
    if (criticalNotAssessed.length)
        return { disposition: "INDETERMINATE", reason: `Not assessed on a critical rule: ${criticalNotAssessed.join(", ")}` };
    const violated = ids(o => o.state === "VIOLATED");
    if (violated.length)
        return { disposition: "NOT_READY", reason: `Violated: ${violated.join(", ")}` };
    // No exceptions exist in this demo, so every INSUFFICIENT obligation blocks.
    const insufficient = ids(o => o.state === "INSUFFICIENT");
    if (insufficient.length)
        return { disposition: "NOT_READY", reason: `No evidence: ${insufficient.join(", ")}` };
    if (obligations.every(o => o.state === "SUPPORTED"))
        return { disposition: "READY", reason: `All ${obligations.length} obligations supported` };
    const rest = ids(o => o.state !== "SUPPORTED");
    return { disposition: "INDETERMINATE", reason: `Not assessed: ${rest.join(", ")}. The profile has no rule for this, so it is not treated as ready.` };
}
const LABELS = { READY: "READY", NOT_READY: "NOT READY", INDETERMINATE: "INDETERMINATE" };
const brokenText = (n) => (n === 0 ? "no rules broken" : n === 1 ? "1 rule broken" : `${n} rules broken`);
/** Checks the evidence (digest, kind, shape, commit) and assesses it against the snapshot. */
export function assessEvidence(input) {
    const { snapshot, evidenceText, evidenceSha256, expectedCommit, sha256 } = input;
    validateSnapshot(snapshot);
    if (!/^[a-f0-9]{64}$/.test(evidenceSha256) || sha256(evidenceText) !== evidenceSha256) {
        return refuse("EVIDENCE_DIGEST_MISMATCH", "The evidence does not match its published SHA-256.");
    }
    let parsed;
    try {
        parsed = JSON.parse(evidenceText);
    }
    catch {
        return refuse("EVIDENCE_MALFORMED", "The evidence is not valid JSON.");
    }
    if (!isObject(parsed))
        return refuse("EVIDENCE_MALFORMED", "The evidence is not a JSON object.");
    if (parsed["kind"] !== EVIDENCE_KIND)
        return refuse("EVIDENCE_KIND_UNSUPPORTED", `Only ${EVIDENCE_KIND} evidence is supported.`);
    if (!isEvidenceShape(parsed))
        return refuse("EVIDENCE_MALFORMED", "The evidence is missing required fields or has an unknown check state.");
    const evidence = parsed;
    if (evidence.target.expectedSha !== expectedCommit) {
        return refuse("EVIDENCE_FOR_ANOTHER_COMMIT", `The evidence is about ${evidence.target.expectedSha}, not ${expectedCommit}.`);
    }
    const environmentConfirmed = evidence.environmentConfirmed && evidence.checks[ENVIRONMENT_CHECK]?.state === "SUPPORTED" &&
        gitShaOf(evidence.target.versionAtStart) === expectedCommit && gitShaOf(evidence.target.versionAtEnd) === expectedCommit;
    const rules = snapshot.policies.map(policy => {
        const obligations = policy.obligations.map((obligation) => {
            const check = `${obligation.verifier}/${obligation.check}`;
            const result = evidence.checks[check];
            const base = { id: obligation.id, statement: obligation.statement, check, checkDescription: snapshot.verifiers.catalog[obligation.verifier]?.checks[obligation.check] ?? null };
            if (!result)
                return { ...base, state: "INSUFFICIENT", reason: `No result for ${check}.`, observation: null, durationMs: null };
            if (!environmentConfirmed && check !== ENVIRONMENT_CHECK && result.state !== "NOT_ASSESSED") {
                return { ...base, state: "NOT_ASSESSED", reason: "Evidence discarded: the environment was not confirmed to run the commit under review.", observation: result.observation, durationMs: result.durationMs };
            }
            return { ...base, state: result.state, reason: result.reason, observation: result.observation, durationMs: result.durationMs };
        });
        return {
            id: policy.id, title: policy.title, owner: policy.owner, severity: policy.severity, rule: policy.rule,
            exceptionsAllowed: policy.exceptionsAllowed, broken: obligations.some(o => o.state !== "SUPPORTED"), obligations,
        };
    });
    const obligations = rules.flatMap(rule => rule.obligations);
    const supported = obligations.filter(o => o.state === "SUPPORTED").length;
    const brokenRules = rules.filter(rule => rule.broken).length;
    const { disposition, reason } = decide(rules, obligations);
    return {
        ok: true, disposition, dispositionReason: reason,
        summary: `${LABELS[disposition]} · ${brokenText(brokenRules)} · ${supported} of ${obligations.length} obligations supported`,
        counts: { obligations: obligations.length, supported, brokenRules },
        rules,
        proof: {
            commit: expectedCommit, environmentConfirmed, verifiersCommit: evidence.verifiers.commit,
            startedAt: evidence.run.startedAt, finishedAt: evidence.run.finishedAt,
            rulesCommit: snapshot.source.commit, snapshotDigest: snapshot.snapshotDigest,
        },
    };
}
const STAGES = new Set(["preparing", "starting-app", "running-checks", "running-team-tests", "done", "failed"]);
const OUTPUT_KIND = "qivvera.pr-assessment/v1";
const count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const shortText = (value, max) => typeof value === "string" && value.length <= max;
function teamTestsOf(value) {
    if (value === null)
        return null;
    if (!isObject(value))
        return undefined;
    const { total, passed, failed, flaky, skipped } = value;
    return count(total) && count(passed) && count(failed) && count(flaky) && count(skipped) && passed + failed + flaky + skipped === total
        ? { total, passed, failed, flaky, skipped } : undefined;
}
/** Reads one check-run text, refusing anything malformed or written for another run or commit. */
export function parseAssessmentOutput(text, expected) {
    const malformed = { ok: false, reason: "OUTPUT_MALFORMED" };
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return malformed;
    }
    if (!isObject(value) || value["kind"] !== OUTPUT_KIND)
        return malformed;
    if (value["correlationId"] !== expected.correlationId || value["appSha"] !== expected.appSha)
        return { ok: false, reason: "OUTPUT_FOR_ANOTHER_RUN" };
    const { stage, message, checksTotal, checks, evidence, evidenceSha256 } = value;
    const teamTests = teamTestsOf(value["teamTests"]);
    const checksValid = Array.isArray(checks) && checks.length <= 100 &&
        checks.every(c => isObject(c) && shortText(c["check"], 200) && shortText(c["outcome"], 40) && typeof c["durationMs"] === "number");
    if (typeof stage !== "string" || !STAGES.has(stage) || !shortText(message, 500) || !(checksTotal === null || count(checksTotal)) || !checksValid || teamTests === undefined) {
        return malformed;
    }
    const done = stage === "done";
    if (done && (typeof evidence !== "string" || typeof evidenceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidenceSha256)))
        return malformed;
    return {
        ok: true,
        output: {
            stage: stage, message, checksTotal, teamTests,
            checks: checks.map(c => ({ check: c["check"], outcome: c["outcome"], durationMs: c["durationMs"] })),
            evidence: done ? evidence : null, evidenceSha256: done ? evidenceSha256 : null,
        },
    };
}
/** Which rules a PR fixed, kept broken or newly broke compared with the previous PR; null without one. */
export function compareAssessments(previous, current) {
    if (!previous)
        return null;
    const before = new Set(previous.rules.filter(r => r.broken).map(r => r.id));
    const now = new Set(current.rules.filter(r => r.broken).map(r => r.id));
    return {
        fixed: [...before].filter(id => !now.has(id)),
        stillBroken: [...now].filter(id => before.has(id)),
        newlyBroken: [...now].filter(id => !before.has(id)),
    };
}
//# sourceMappingURL=pr-assurance.js.map