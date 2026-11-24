import { lookup } from '../json';

export { reviewLabel } from '../impact/report';

const FINDING_REASONS: Readonly<Record<string, string>> = {
  REQUESTER_APPROVED_OWN_REQUEST: 'The requester approved their own request, contrary to the accepted separation requirement.',
  SELF_APPROVAL_REJECTED_AND_INDEPENDENT_APPROVAL_SUCCEEDED: 'Self-approval was rejected and approval by a different eligible approver succeeded.',
  FINALIZED_APPROVAL_ACCEPTED_OR_MUTATED: 'The finalized request accepted another approval or changed when the repeated approval was attempted.',
  LEGITIMATE_APPROVAL_SUCCEEDED_AND_REPEAT_REJECTED: 'Legitimate approval succeeded; the repeated approval was rejected and the finalized record stayed unchanged.',
  UNRESOLVED_PRIOR_COUNTEREXAMPLE: 'A valid earlier counterexample remains unresolved for the same inputs.',
  AUTHORITATIVE_REQUIREMENT_UNRESOLVED: 'The applicable requirement has not been accepted by the authority workflow.',
  NO_SUPPORTED_VERIFIER_MAPPING: 'No supported verification check is mapped to this required obligation.',
  REJECTED_BY_RECORDED_AUTHORITY: 'The recorded authority decision rejected this candidate. It remains in history as an exclusion.',
  MAPPED_REPORT_MISSING: 'The mapped check has no usable report. This requirement cannot be treated as supported.',
  POSITIVE_CONTROL_NOT_ESTABLISHED: 'The check could not establish that a legitimate approval succeeds. Rejecting all requests is not proof of the control.',
  REQUIRED_OBSERVATION_MISSING: 'A required observation is missing; the check cannot establish support.',
  TARGET_IDENTITY_NOT_ESTABLISHED: 'The expected test target identity could not be established before execution.',
  TARGET_IDENTITY_CHANGED_OR_UNAVAILABLE: 'The test target identity changed or could not be confirmed after execution.',
  QUEUE_DEADLINE_EXCEEDED: 'The assessment was not claimed before its queue deadline. Ask the operator to check the worker before requesting another run.',
  WORKER_LEASE_EXPIRED: 'The worker did not complete within its ownership period. Its output is not accepted; investigate before requesting another run.',
  INPUTS_CHANGED_BEFORE_EXECUTION: 'The plan, scope or target changed before execution. Review the current inputs and approve a new plan if needed.',
  CANCELLED_BY_USER: 'A user cancelled acceptance of this run. Target operations already sent may still have completed.',
  PRIOR_EVIDENCE_INTEGRITY_FAILED: 'Earlier related evidence failed integrity checks. Investigate it before accepting a new conclusion.'
};

/** Plain-language reason for a finding or failure code; unknown codes are shown as received. */
export const findingReason = (value: unknown): string => lookup(FINDING_REASONS, value) ?? String(value ?? '');

/** Underscores read as spaces in statuses and dispositions. */
export const spaced = (value: unknown): string => String(value ?? '').replaceAll('_', ' ');
