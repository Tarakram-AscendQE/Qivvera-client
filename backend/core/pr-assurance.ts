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
export const SUPPORTED_PROFILE = {
  id: "payments-critical",
  digest: "sha256:1df281544d5d608eccc4942a7abb7790affc9960e2c303fc9a15af50fcc07051",
} as const;
const SNAPSHOT_KIND = "qivvera.rules-snapshot/v1";
const EVIDENCE_KIND = "qivvra.evidence/v1";
/** V1 proves the environment ran the commit under review; without it no other result counts. */
const ENVIRONMENT_CHECK = "V1/qe-runs-head-commit";
const CHECK_STATES = new Set(["SUPPORTED", "VIOLATED", "NOT_ASSESSED"]);

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
  readonly source: { readonly repository: string; readonly commit: string; readonly selectedFor: readonly string[]; readonly generatedBy: string };
  readonly profile: { readonly id: string; readonly title: string; readonly file: string; readonly digest: string; readonly rules: unknown };
  readonly verifiers: {
    readonly file: string;
    readonly digest: string;
    readonly catalog: Readonly<Record<string, { readonly name: string; readonly checks: Readonly<Record<string, string>> }>>;
  };
  readonly policies: readonly SnapshotPolicy[];
  readonly snapshotDigest: string;
}

interface EvidenceCheck {
  readonly check: string;
  readonly state: "SUPPORTED" | "VIOLATED" | "NOT_ASSESSED";
  readonly reason: string | null;
  readonly durationMs: number;
  readonly observation: unknown;
}

interface EvidenceRecord {
  readonly kind: string;
  readonly target: { readonly expectedSha: string; readonly versionAtStart: unknown; readonly versionAtEnd: unknown };
  readonly environmentConfirmed: boolean;
  readonly verifiers: { readonly commit: string | null };
  readonly run: { readonly startedAt: string; readonly finishedAt: string };
  readonly checks: Readonly<Record<string, EvidenceCheck>>;
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
  readonly counts: { readonly obligations: number; readonly supported: number; readonly brokenRules: number };
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

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const refuse = (reason: RefusalReason, message: string): Refusal => ({ ok: false, reason, message });

/** Throws unless the snapshot is complete and was taken with the profile this code implements. */
export function validateSnapshot(snapshot: RulesSnapshot): void {
  if (!isObject(snapshot) || snapshot.kind !== SNAPSHOT_KIND || !Array.isArray(snapshot.policies) || snapshot.policies.length === 0) {
    throw new Error("INVALID_SNAPSHOT");
  }
  if (snapshot.profile?.id !== SUPPORTED_PROFILE.id || snapshot.profile.digest !== SUPPORTED_PROFILE.digest) {
    throw new Error("PROFILE_NOT_SUPPORTED");
  }
  const seen = new Set<string>();
  for (const policy of snapshot.policies) {
    for (const obligation of policy.obligations) {
      if (seen.has(obligation.id)) throw new Error(`INVALID_SNAPSHOT:${obligation.id}`);
      seen.add(obligation.id);
      if (typeof snapshot.verifiers.catalog[obligation.verifier]?.checks[obligation.check] !== "string") {
        throw new Error(`INVALID_SNAPSHOT:${obligation.id}`);
      }
    }
  }
}

function isEvidenceCheck(key: string, value: unknown): value is EvidenceCheck {
  return isObject(value) && value["check"] === key && CHECK_STATES.has(value["state"] as string) &&
    (value["reason"] === null || typeof value["reason"] === "string") && typeof value["durationMs"] === "number";
}

function isEvidenceShape(value: Record<string, unknown>): value is Record<string, unknown> & EvidenceRecord {
  const { target, verifiers, run, checks } = value;
  return isObject(target) && typeof target["expectedSha"] === "string" && typeof value["environmentConfirmed"] === "boolean" &&
    isObject(verifiers) && (verifiers["commit"] === null || typeof verifiers["commit"] === "string") &&
    isObject(run) && typeof run["startedAt"] === "string" && typeof run["finishedAt"] === "string" &&
    isObject(checks) && Object.entries(checks).every(([key, check]) => isEvidenceCheck(key, check));
}

const gitShaOf = (version: unknown): unknown => (isObject(version) ? version["gitSha"] : undefined);

/** The disposition rules of payments-critical, first match wins; anything unmatched fails closed. */
function decide(rules: readonly RuleResult[], obligations: readonly ObligationResult[]): { disposition: Disposition; reason: string } {
  const ids = (predicate: (o: ObligationResult, rule: RuleResult) => boolean) =>
    rules.flatMap(rule => rule.obligations.filter(o => predicate(o, rule)).map(o => o.id));
  const criticalNotAssessed = ids((o, rule) => o.state === "NOT_ASSESSED" && rule.severity === "critical");
  if (criticalNotAssessed.length) return { disposition: "INDETERMINATE", reason: `Not assessed on a critical rule: ${criticalNotAssessed.join(", ")}` };
  const violated = ids(o => o.state === "VIOLATED");
  if (violated.length) return { disposition: "NOT_READY", reason: `Violated: ${violated.join(", ")}` };
  // No exceptions exist in this demo, so every INSUFFICIENT obligation blocks.
  const insufficient = ids(o => o.state === "INSUFFICIENT");
  if (insufficient.length) return { disposition: "NOT_READY", reason: `No evidence: ${insufficient.join(", ")}` };
  if (obligations.every(o => o.state === "SUPPORTED")) return { disposition: "READY", reason: `All ${obligations.length} obligations supported` };
  const rest = ids(o => o.state !== "SUPPORTED");
  return { disposition: "INDETERMINATE", reason: `Not assessed: ${rest.join(", ")}. The profile has no rule for this, so it is not treated as ready.` };
}

const LABELS: Record<Disposition, string> = { READY: "READY", NOT_READY: "NOT READY", INDETERMINATE: "INDETERMINATE" };
const brokenText = (n: number) => (n === 0 ? "no rules broken" : n === 1 ? "1 rule broken" : `${n} rules broken`);

/** Checks the evidence (digest, kind, shape, commit) and assesses it against the snapshot. */
export function assessEvidence(input: AssessInput): Assessment | Refusal {
  const { snapshot, evidenceText, evidenceSha256, expectedCommit, sha256 } = input;
  validateSnapshot(snapshot);
  if (!/^[a-f0-9]{64}$/.test(evidenceSha256) || sha256(evidenceText) !== evidenceSha256) {
    return refuse("EVIDENCE_DIGEST_MISMATCH", "The evidence does not match its published SHA-256.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(evidenceText);
  } catch {
    return refuse("EVIDENCE_MALFORMED", "The evidence is not valid JSON.");
  }
  if (!isObject(parsed)) return refuse("EVIDENCE_MALFORMED", "The evidence is not a JSON object.");
  if (parsed["kind"] !== EVIDENCE_KIND) return refuse("EVIDENCE_KIND_UNSUPPORTED", `Only ${EVIDENCE_KIND} evidence is supported.`);
  if (!isEvidenceShape(parsed)) return refuse("EVIDENCE_MALFORMED", "The evidence is missing required fields or has an unknown check state.");
  const evidence = parsed;
  if (evidence.target.expectedSha !== expectedCommit) {
    return refuse("EVIDENCE_FOR_ANOTHER_COMMIT", `The evidence is about ${evidence.target.expectedSha}, not ${expectedCommit}.`);
  }

  const environmentConfirmed = evidence.environmentConfirmed && evidence.checks[ENVIRONMENT_CHECK]?.state === "SUPPORTED" &&
    gitShaOf(evidence.target.versionAtStart) === expectedCommit && gitShaOf(evidence.target.versionAtEnd) === expectedCommit;

  const rules: RuleResult[] = snapshot.policies.map(policy => {
    const obligations = policy.obligations.map((obligation): ObligationResult => {
      const check = `${obligation.verifier}/${obligation.check}`;
      const result = evidence.checks[check];
      const base = { id: obligation.id, statement: obligation.statement, check, checkDescription: snapshot.verifiers.catalog[obligation.verifier]?.checks[obligation.check] ?? null };
      if (!result) return { ...base, state: "INSUFFICIENT", reason: `No result for ${check}.`, observation: null, durationMs: null };
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

/** Which rules a PR fixed, kept broken or newly broke compared with the previous PR; null without one. */
export function compareAssessments(previous: Assessment | null, current: Assessment): { fixed: string[]; stillBroken: string[]; newlyBroken: string[] } | null {
  if (!previous) return null;
  const before = new Set(previous.rules.filter(r => r.broken).map(r => r.id));
  const now = new Set(current.rules.filter(r => r.broken).map(r => r.id));
  return {
    fixed: [...before].filter(id => !now.has(id)),
    stillBroken: [...now].filter(id => before.has(id)),
    newlyBroken: [...now].filter(id => !before.has(id)),
  };
}
