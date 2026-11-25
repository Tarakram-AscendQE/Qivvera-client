import { lookup } from '../json';

/** The impact report contract (schema qivvera.impact/1). Server values are displayed only as text. */

export interface ImpactRevision {
  readonly id: string;
  readonly number: unknown;
  readonly isCurrent?: unknown;
  readonly sourceRevision?: unknown;
  readonly intent?: unknown;
  readonly reason?: unknown;
}

export interface ImpactDifference {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface ImpactGuidance {
  readonly code: unknown;
  readonly role: unknown;
  readonly message: unknown;
  readonly action: unknown;
}

export interface ImpactObligationRecord {
  readonly id: unknown;
  readonly revisionId: string;
  readonly statement: unknown;
  readonly version: unknown;
  readonly criticality: unknown;
  readonly reviewStatus: unknown;
  readonly sourceReference?: unknown;
  readonly sourceVersion?: unknown;
}

export interface ImpactMappingHint {
  readonly checkTitle?: unknown;
  readonly checkId: unknown;
  readonly planVersion: unknown;
  readonly rationale: unknown;
  readonly notice: unknown;
  readonly contentUnchanged?: unknown;
}

export interface ImpactObligation {
  readonly current: ImpactObligationRecord;
  readonly baseline?: ImpactObligationRecord | null;
  readonly priorMappingHint?: ImpactMappingHint | null;
  readonly comparison: unknown;
  readonly differences: readonly ImpactDifference[];
  readonly authorityChanged?: unknown;
  readonly guidance?: readonly ImpactGuidance[] | null;
}

export interface ImpactNotCarried extends ImpactObligationRecord {
  readonly notice: unknown;
}

export interface ImpactPlan {
  readonly version: unknown;
  readonly current?: unknown;
  readonly reasons?: readonly { readonly message: unknown }[] | null;
  readonly mappings: readonly { readonly checkTitle?: unknown; readonly checkId: unknown; readonly obligationId: unknown }[];
}

export interface ImpactRun {
  readonly id: unknown;
  readonly number: unknown;
  readonly status: unknown;
  readonly observedStatus?: unknown;
  readonly applicability: unknown;
  readonly evidenceIntegrity: unknown;
  readonly recordedDisposition?: unknown;
  readonly currentDisposition?: unknown;
  readonly failureCode?: unknown;
  readonly inputDifferences?: readonly ImpactDifference[] | null;
  readonly findings?: readonly { readonly obligationId: unknown; readonly state: unknown; readonly reason: unknown }[] | null;
}

export interface ImpactTarget {
  readonly id: unknown;
  readonly name?: unknown;
  readonly sourceRevision: unknown;
  readonly artifactDigest: unknown;
  readonly environmentDigest: unknown;
  readonly instanceId: unknown;
}

export interface ImpactAssurance {
  readonly available?: unknown;
  readonly plan?: ImpactPlan | null;
  readonly latestRun?: ImpactRun | null;
  readonly checks: readonly { readonly title: unknown; readonly rule: unknown }[];
  readonly targetOptions: readonly ImpactTarget[];
  readonly scopeDigest?: unknown;
}

export interface ImpactReport {
  readonly schema: 'qivvera.impact/1';
  readonly change: { readonly id: string; readonly title: unknown };
  readonly selectedRevision: ImpactRevision;
  readonly baselineRevision?: ImpactRevision | null;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly revisionDifferences: readonly ImpactDifference[];
  readonly guidance: readonly ImpactGuidance[];
  readonly obligations: readonly ImpactObligation[];
  readonly notCarriedForward: readonly ImpactNotCarried[];
  readonly assurance: ImpactAssurance;
  readonly limitations?: readonly unknown[] | null;
  readonly reviewMode?: unknown;
  readonly generatedAt: unknown;
  readonly snapshotDigest: unknown;
}

/**
 * Accepts only a report for exactly the requested change and revision (Increment 8 rule). Only the
 * structure is checked here; deeper fields are read defensively while rendering.
 */
export function parseImpactReport(value: unknown, changeId: string, revisionId: string): ImpactReport {
  const report = value as Partial<Record<keyof ImpactReport, unknown>> | null;
  const change = report?.change as { id?: unknown } | undefined;
  const selected = report?.selectedRevision as { id?: unknown } | undefined;
  if (report?.schema !== 'qivvera.impact/1' || change?.id !== changeId || selected?.id !== revisionId ||
      !Array.isArray(report.obligations) || !Array.isArray(report.notCarriedForward) || !Array.isArray(report.guidance) || !report.assurance) {
    throw new Error('This impact report does not match the selected revision or expected format. Reload the change before continuing.');
  }
  return report as unknown as ImpactReport;
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  statement: 'Requirement statement', sourceReference: 'Source reference', sourceVersion: 'Source version',
  criticality: 'Criticality', reviewStatus: 'Requirement review', version: 'Obligation version',
  sourceRevision: 'Declared source commit', intent: 'Business intent', producer: 'Producer category',
  reason: 'Revision reason', scopeDigest: 'Declared scope digest', planId: 'Approved plan',
  target: 'Target identity', profile: 'Verification profile', verifier: 'Verifier identity',
  obligationVersion: 'Obligation version', acceptanceDecisionId: 'Requirement acceptance decision'
};
const REVIEW_LABELS: Readonly<Record<string, string>> = { DRAFT: 'Draft', IN_REVIEW: 'Awaiting review', ACCEPTED: 'Requirement accepted', REJECTED: 'Rejected', CLARIFICATION_REQUIRED: 'Clarification requested' };
const COMPARISON_LABELS: Readonly<Record<string, string>> = { NEW: 'No recorded copy link', COPIED_UNCHANGED: 'Copied · recorded fields unchanged', COPIED_CHANGED: 'Copied · recorded fields changed' };
const ROLE_LABELS: Readonly<Record<string, string>> = { AUTHOR: 'Author', POLICY_AUTHORITY: 'Policy Authority', VIEWER: 'Viewer', OPERATOR: 'Workspace operator', EVERYONE: 'Everyone', ALL: 'Everyone', ANY: 'Everyone', AUTHOR_OR_POLICY_AUTHORITY: 'Author or Policy Authority' };

/** Underscores read as spaces. */
export const named = (value: unknown): string => String(value ?? '').replaceAll('_', ' ');
export const fieldLabel = (field: string): string => lookup(FIELD_LABELS, field) ?? named(field);
/** Unknown values are shown as received. */
export const reviewLabel = (value: unknown): unknown => lookup(REVIEW_LABELS, value) ?? value;
export const comparisonLabel = (value: unknown): unknown => lookup(COMPARISON_LABELS, value) ?? value;
export const roleLabel = (value: unknown): string => lookup(ROLE_LABELS, value) ?? String(value ?? 'Everyone').replaceAll('_', ' ');
/** A missing value is labelled; structured values are shown as indented JSON. */
export const display = (value: unknown): string =>
  value === null || value === undefined || value === '' ? 'Not supplied' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

export type ChangeTab = 'overview' | 'obligations' | 'assurance' | 'evidence';

export function destination(action: unknown): { tab: ChangeTab; label: string } | { tab: null; href: string; label: string } | null {
  switch (action) {
    case 'REVIEW_OBLIGATIONS': return { tab: 'obligations', label: 'Open obligations' };
    case 'INSPECT_SCOPE': return { tab: 'obligations', label: 'Inspect declared scope' };
    case 'REVIEW_PLAN': return { tab: 'assurance', label: 'Open verification plan' };
    case 'REQUEST_ASSESSMENT': return { tab: 'assurance', label: 'Open assurance' };
    case 'INSPECT_ASSESSMENT': return { tab: 'assurance', label: 'Inspect assessment' };
    case 'CONTACT_OPERATOR': return { tab: null, href: '#/support', label: 'Open workspace support' };
    default: return null;
  }
}
