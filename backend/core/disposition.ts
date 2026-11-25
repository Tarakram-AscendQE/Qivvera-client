import type { AssessmentSnapshot, Decision, EvaluationTarget, ObligationAssessment } from "./model.js";

const fields = ["applicationId", "revision", "artifactDigest", "environmentDigest", "profileId", "profileVersion", "scopeDigest", "verifierSetDigest"] as const;
const digests = ["artifactDigest", "environmentDigest", "scopeDigest", "verifierSetDigest"] as const;
const states = new Set(["SUPPORTED", "VIOLATED", "INSUFFICIENT", "CONFLICTED", "NOT_ASSESSED"]);
const authorities = new Set(["AUTHORITATIVE", "DERIVED", "CANDIDATE"]);
const lifecycles = new Set(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]);

/** Compares declared identity; this is NOT cryptographic attestation verification. */
export function assertTarget(target: EvaluationTarget): void {
  if (!target || typeof target !== "object") throw new Error("INVALID_TARGET");
  for (const field of fields) {
    if (typeof target[field] !== "string" || target[field].trim().length === 0) {
      throw new Error(`INVALID_TARGET:${field}`);
    }
  }
  for (const field of digests) {
    if (!/^sha256:[a-f0-9]{64}$/.test(target[field])) throw new Error(`INVALID_DIGEST:${field}`);
  }
}

export function sameTarget(a: EvaluationTarget, b: EvaluationTarget): boolean {
  assertTarget(a);
  assertTarget(b);
  return fields.every(field => a[field] === b[field]);
}

function validate(snapshot: AssessmentSnapshot): void {
  assertTarget(snapshot.target);
  if (!lifecycles.has(snapshot.lifecycle) || typeof snapshot.scopeConfirmed !== "boolean") {
    throw new Error("INVALID_SNAPSHOT");
  }
  if (![snapshot.obligations, snapshot.evidence, snapshot.requestedExceptionIds].every(Array.isArray)) {
    throw new Error("INVALID_COLLECTION");
  }
  const obligationIds = new Set<string>();
  for (const obligation of snapshot.obligations) {
    if (!obligation.id?.trim() || obligationIds.has(obligation.id)) throw new Error("INVALID_OBLIGATION_ID");
    obligationIds.add(obligation.id);
    if (!states.has(obligation.state) || !authorities.has(obligation.authority) ||
        typeof obligation.authorityAccepted !== "boolean" || typeof obligation.mandatory !== "boolean" ||
        typeof obligation.blocking !== "boolean" || !Array.isArray(obligation.evidenceIds) ||
        !obligation.evidenceIds.every(id => typeof id === "string" && id.trim().length > 0)) {
      throw new Error("INVALID_OBLIGATION");
    }
  }
  const evidenceIds = new Set<string>();
  for (const evidence of snapshot.evidence) {
    if (!evidence.id?.trim() || evidenceIds.has(evidence.id)) throw new Error("INVALID_EVIDENCE_ID");
    if (!obligationIds.has(evidence.obligationId) || typeof evidence.admissible !== "boolean") {
      throw new Error("INVALID_EVIDENCE");
    }
    evidenceIds.add(evidence.id);
    assertTarget(evidence.target);
  }
}

/** Provisional policy kernel only. No discovery, execution, authority validation,
 * evidence adequacy judgement, signatures, persistence, or public endpoint here.
 * READY_WITH_EXCEPTIONS is reserved and can never be returned by this version.
 */
export function deriveDisposition(snapshot: AssessmentSnapshot): Decision {
  validate(snapshot);
  const decide = (disposition: Decision["disposition"], reasonCodes: string[]): Decision => ({
    target: { ...snapshot.target }, disposition, reasonCodes,
  });
  if (snapshot.lifecycle !== "COMPLETED") {
    return decide(null, [`ASSESSMENT_${snapshot.lifecycle}`]);
  }
  const evidenceById = new Map(snapshot.evidence.map(e => [e.id, e]));
  const acceptedAuthority = (o: ObligationAssessment) => o.authority !== "CANDIDATE" && o.authorityAccepted;
  const hasApplicableEvidence = (o: ObligationAssessment) => o.evidenceIds.some(id => {
    const e = evidenceById.get(id);
    return Boolean(e && e.obligationId === o.id && e.admissible && sameTarget(e.target, snapshot.target));
  });
  const blockingViolations = snapshot.obligations.filter(o =>
    o.blocking && o.state === "VIOLATED" && acceptedAuthority(o) && hasApplicableEvidence(o));
  if (blockingViolations.length) {
    return decide("NOT_READY", blockingViolations.map(o => `BLOCKING_VIOLATION:${o.id}`));
  }
  const reasons: string[] = [];
  if (!snapshot.scopeConfirmed) reasons.push("SCOPE_NOT_CONFIRMED");
  if (snapshot.requestedExceptionIds.length) reasons.push("EXCEPTION_WORKFLOW_NOT_IMPLEMENTED");
  const required = snapshot.obligations.filter(o => o.mandatory || o.blocking);
  if (required.length === 0) reasons.push("NO_REQUIRED_OBLIGATIONS");
  for (const obligation of required) {
    if (!acceptedAuthority(obligation)) reasons.push(`AUTHORITY_UNRESOLVED:${obligation.id}`);
    if (obligation.state !== "SUPPORTED") reasons.push(`UNRESOLVED_${obligation.state}:${obligation.id}`);
    if (!hasApplicableEvidence(obligation)) reasons.push(`NO_APPLICABLE_EVIDENCE:${obligation.id}`);
  }
  return reasons.length ? decide("INDETERMINATE", reasons)
    : decide("READY", ["REQUIRED_OBLIGATIONS_SUPPORTED_WITHIN_DECLARED_SCOPE"]);
}
