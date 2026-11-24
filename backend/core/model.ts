/** Internal kernel inputs, not a public or trusted evidence-ingestion API.
 * A caller must authenticate, verify evidence provenance, and enforce authority.
 * This checkpoint only applies conservative, deterministic disposition rules.
 */
export type ObligationState =
  | "SUPPORTED" | "VIOLATED" | "INSUFFICIENT" | "CONFLICTED" | "NOT_ASSESSED";
export type Lifecycle = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type Disposition = "READY" | "READY_WITH_EXCEPTIONS" | "NOT_READY" | "INDETERMINATE";
export type Authority = "AUTHORITATIVE" | "DERIVED" | "CANDIDATE";

export interface EvaluationTarget {
  readonly applicationId: string;
  readonly revision: string;
  readonly artifactDigest: string;
  readonly environmentDigest: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly scopeDigest: string;
  readonly verifierSetDigest: string;
}

export interface EvidenceReference {
  readonly id: string;
  readonly obligationId: string;
  readonly target: EvaluationTarget;
  /** Internal adjudication result. MUST NOT be accepted as a producer assertion. */
  readonly admissible: boolean;
}

export interface ObligationAssessment {
  readonly id: string;
  readonly mandatory: boolean;
  readonly blocking: boolean;
  readonly authority: Authority;
  readonly authorityAccepted: boolean;
  readonly state: ObligationState;
  readonly evidenceIds: readonly string[];
}

export interface AssessmentSnapshot {
  readonly target: EvaluationTarget;
  readonly lifecycle: Lifecycle;
  readonly scopeConfirmed: boolean;
  readonly obligations: readonly ObligationAssessment[];
  readonly evidence: readonly EvidenceReference[];
  /** Full exception handling is intentionally unsupported in this checkpoint. */
  readonly requestedExceptionIds: readonly string[];
}

export interface Decision {
  readonly target: EvaluationTarget;
  readonly disposition: Disposition | null;
  readonly reasonCodes: readonly string[];
}
