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
export type ObligationState = "SUPPORTED" | "VIOLATED" | "INSUFFICIENT" | "NOT_ASSESSED";
export type Disposition = "READY" | "NOT_READY" | "INDETERMINATE";
export type RefusalReason = "EVIDENCE_DIGEST_MISMATCH" | "EVIDENCE_MALFORMED" | "EVIDENCE_KIND_UNSUPPORTED" | "EVIDENCE_FOR_ANOTHER_COMMIT";
/** The profile the rules below implement. A changed profile file must be reviewed against this code. */
export declare const SUPPORTED_PROFILE: {
    readonly id: "payments-critical";
    readonly digest: "sha256:1df281544d5d608eccc4942a7abb7790affc9960e2c303fc9a15af50fcc07051";
};
export interface SnapshotObligation {
    readonly id: string;
    readonly statement: string;
    readonly verifier: string;
    readonly check: string;
}
export interface SnapshotPolicy {
    readonly id: string;
    readonly title: string;
    readonly version: string;
    readonly authority: string;
    readonly owner: string;
    readonly severity: string;
    readonly file: string;
    readonly digest: string;
    readonly rule: string;
    readonly exceptionsAllowed: boolean;
    readonly obligations: readonly SnapshotObligation[];
}
export interface RulesSnapshot {
    readonly kind: string;
    readonly source: {
        readonly repository: string;
        readonly commit: string;
        readonly selectedFor: readonly string[];
        readonly generatedBy: string;
    };
    readonly profile: {
        readonly id: string;
        readonly title: string;
        readonly file: string;
        readonly digest: string;
        readonly rules: unknown;
    };
    readonly verifiers: {
        readonly file: string;
        readonly digest: string;
        readonly catalog: Readonly<Record<string, {
            readonly name: string;
            readonly checks: Readonly<Record<string, string>>;
        }>>;
    };
    readonly policies: readonly SnapshotPolicy[];
    readonly snapshotDigest: string;
}
export interface ObligationResult {
    readonly id: string;
    readonly statement: string;
    readonly check: string;
    readonly checkDescription: string | null;
    readonly state: ObligationState;
    readonly reason: string | null;
    readonly observation: unknown;
    readonly durationMs: number | null;
}
export interface RuleResult {
    readonly id: string;
    readonly title: string;
    readonly owner: string;
    readonly severity: string;
    readonly rule: string;
    readonly exceptionsAllowed: boolean;
    readonly broken: boolean;
    readonly obligations: readonly ObligationResult[];
}
export interface Proof {
    readonly commit: string;
    readonly environmentConfirmed: boolean;
    readonly verifiersCommit: string | null;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly rulesCommit: string;
    readonly snapshotDigest: string;
}
export interface Assessment {
    readonly ok: true;
    readonly disposition: Disposition;
    readonly dispositionReason: string;
    readonly summary: string;
    readonly counts: {
        readonly obligations: number;
        readonly supported: number;
        readonly brokenRules: number;
    };
    readonly rules: readonly RuleResult[];
    readonly proof: Proof;
}
export interface Refusal {
    readonly ok: false;
    readonly reason: RefusalReason;
    readonly message: string;
}
export interface AssessInput {
    readonly snapshot: RulesSnapshot;
    /** The evidence.json text exactly as published; its digest is checked on these bytes. */
    readonly evidenceText: string;
    /** Hex SHA-256 published next to the evidence. */
    readonly evidenceSha256: string;
    /** Short commit of the PR head Qivvera imported (what the workflow passed as EXPECTED_SHA). */
    readonly expectedCommit: string;
    readonly sha256: (text: string) => string;
}
/** Throws unless the snapshot is complete and was taken with the profile this code implements. */
export declare function validateSnapshot(snapshot: RulesSnapshot): void;
/** Checks the evidence (digest, kind, shape, commit) and assesses it against the snapshot. */
export declare function assessEvidence(input: AssessInput): Assessment | Refusal;
export type AssessmentStage = "preparing" | "starting-app" | "running-checks" | "running-team-tests" | "done" | "failed";
export interface TeamTests {
    readonly total: number;
    readonly passed: number;
    readonly failed: number;
    readonly flaky: number;
    readonly skipped: number;
}
export interface AssessmentOutput {
    readonly stage: AssessmentStage;
    readonly message: string;
    readonly checksTotal: number | null;
    readonly checks: readonly {
        readonly check: string;
        readonly outcome: string;
        readonly durationMs: number;
    }[];
    readonly teamTests: TeamTests | null;
    /** Present only once the stage is "done": the evidence.json text and its hex SHA-256. */
    readonly evidence: string | null;
    readonly evidenceSha256: string | null;
}
/** Reads one check-run text, refusing anything malformed or written for another run or commit. */
export declare function parseAssessmentOutput(text: string, expected: {
    readonly correlationId: string;
    readonly appSha: string;
}): {
    readonly ok: true;
    readonly output: AssessmentOutput;
} | {
    readonly ok: false;
    readonly reason: "OUTPUT_MALFORMED" | "OUTPUT_FOR_ANOTHER_RUN";
};
/** Which rules a PR fixed, kept broken or newly broke compared with the previous PR; null without one. */
export declare function compareAssessments(previous: Assessment | null, current: Assessment): {
    fixed: string[];
    stillBroken: string[];
    newlyBroken: string[];
} | null;
