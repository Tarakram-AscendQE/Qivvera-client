import type { ResolutionTabState } from '../resolution/parts';
import type { WorkspaceSummary } from '../workspace/rows';

/** The change record the legacy router loads into S.change. Server values are shown only as text. */
export interface ChangeObligation {
  readonly id: string; readonly version: unknown; readonly statement: unknown; readonly reviewStatus: unknown; readonly authority: unknown; readonly state: unknown;
  readonly sourceReference?: unknown; readonly sourceVersion?: unknown; readonly criticality: unknown; readonly evidenceCount?: number | null;
  readonly proposedBy?: unknown; readonly lastEditedBy?: unknown; readonly imported?: unknown;
}
export interface ChangeRevision { readonly id: string; readonly number: unknown; readonly sourceRevision?: unknown; readonly reason?: unknown; readonly createdBy?: unknown; readonly createdAt?: unknown }
export interface ChangeRecord {
  readonly id: string; readonly title: unknown; readonly applicationId: unknown; readonly isCurrentRevision?: unknown; readonly currentRevisionId?: unknown;
  readonly sourceRevision?: unknown; readonly intent?: unknown; readonly producer?: unknown;
  readonly revision: ChangeRevision; readonly revisions: readonly ChangeRevision[]; readonly obligations: readonly ChangeObligation[];
}

export interface AssessmentRun {
  readonly id: string; readonly status: string; readonly applicability: string; readonly disposition?: string | null; readonly queuedAt?: unknown;
  readonly failureCode?: unknown; readonly evidenceIntegrity?: unknown; readonly evidenceDigest?: unknown; readonly case?: { readonly reason?: unknown } | null;
  readonly evidence?: { readonly report: { readonly outcome?: unknown; readonly reason?: unknown; readonly reports?: unknown } } | null;
}

export interface PlanMapping { readonly checkId?: unknown; readonly obligationId: unknown; readonly rationale?: unknown }
export interface AssuranceContext {
  readonly isCurrent?: unknown; readonly targets: readonly unknown[];
  readonly scope: { readonly obligations: readonly { readonly id: unknown; readonly statement?: unknown; readonly reviewStatus: unknown }[] };
  readonly profile: { readonly exclusions: readonly unknown[] };
  readonly plan?: {
    readonly current?: unknown; readonly version: unknown; readonly approvedBy?: unknown;
    readonly snapshot: { readonly schema?: unknown; readonly profile: { readonly title: unknown }; readonly target: { readonly name: unknown; readonly sourceRevision: unknown }; readonly mappings?: readonly PlanMapping[]; readonly mapping?: PlanMapping };
    readonly templateUse?: { readonly templateId: unknown; readonly versionId: unknown; readonly name: unknown; readonly version: unknown; readonly usedBy: unknown; readonly usedAt: unknown } | null;
  } | null;
}

export interface SourceReceipt {
  readonly revisionId: unknown; readonly importedBy?: unknown; readonly importedAt?: unknown;
  readonly source: { readonly url?: unknown; readonly repository?: unknown; readonly pullNumber?: unknown; readonly title?: unknown; readonly headSha?: unknown };
}

/** Everything the change page reads from the legacy shell's state when it draws. */
export interface ChangeView {
  readonly change: ChangeRecord;
  readonly workspace: WorkspaceSummary & { readonly capabilities: Readonly<Record<string, unknown>> };
  readonly session: { readonly email: unknown; readonly reviewMode?: unknown };
  readonly roles: { readonly author: boolean; readonly authority: boolean };
  readonly tab: string;
  readonly runs: readonly AssessmentRun[];
  readonly context: AssuranceContext | null;
  readonly assuranceError: string | null;
  readonly sources: readonly SourceReceipt[];
  readonly sourceError: string | null;
  /** The Resolutions tab's records, or null when resolution is not enabled on this deployment. */
  readonly resolution: ResolutionTabState | null;
}
