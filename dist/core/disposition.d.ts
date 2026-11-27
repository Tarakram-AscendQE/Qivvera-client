import type { AssessmentSnapshot, Decision, EvaluationTarget } from "./model.js";
/** Compares declared identity; this is NOT cryptographic attestation verification. */
export declare function assertTarget(target: EvaluationTarget): void;
export declare function sameTarget(a: EvaluationTarget, b: EvaluationTarget): boolean;
/** Provisional policy kernel only. No discovery, execution, authority validation,
 * evidence adequacy judgement, signatures, persistence, or public endpoint here.
 * READY_WITH_EXCEPTIONS is reserved and can never be returned by this version.
 */
export declare function deriveDisposition(snapshot: AssessmentSnapshot): Decision;
