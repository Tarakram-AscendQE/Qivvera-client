import { Badge, formatDate } from '../format';
import { lookup } from '../json';
import { text } from '../legacy-bridge';

/** The workspace summary the legacy shell keeps in S.workspace. Server values are shown only as text. */
export interface WorkspaceChange {
  readonly id: string;
  readonly title?: unknown;
  readonly applicationId?: unknown;
  readonly sourceRevision?: unknown;
  readonly assuranceError?: unknown;
  readonly disposition?: unknown;
  readonly assessmentStatus?: unknown;
  readonly latestAssessment?: { readonly applicability?: unknown } | null;
  readonly obligationCount?: number;
}
export interface WorkspaceActivity { readonly action: unknown; readonly detail?: unknown; readonly createdAt: unknown; readonly actor?: unknown }
export interface WorkspaceSummary {
  readonly applications: readonly { readonly id: string; readonly name?: unknown; readonly repositoryUrl?: unknown; readonly createdAt?: unknown }[];
  readonly changes: readonly WorkspaceChange[];
  readonly activity: readonly WorkspaceActivity[];
}

/** The status-pill style for a disposition or finding state. */
export function resultKind(value: unknown): string {
  if (value === 'NOT_READY' || value === 'VIOLATED') return 'finding-bad';
  if (value === 'READY' || value === 'SUPPORTED') return 'finding-good';
  if (value === 'INDETERMINATE' || value === 'INSUFFICIENT') return 'finding-gap';
  return '';
}

/** The first 12 characters of a declared source revision. */
export const shortRevision = (value: unknown): string => (value ? String(value).slice(0, 12) : 'Not supplied');

function changeStatus(change: WorkspaceChange): unknown {
  if (change.assuranceError) return 'ASSURANCE UNAVAILABLE';
  if (change.disposition != null) return change.disposition;
  if (change.latestAssessment?.applicability === 'STALE_INPUTS') return 'REASSESSMENT REQUIRED';
  return change.assessmentStatus != null ? String(change.assessmentStatus).replaceAll('_', ' ') : 'NOT ASSESSED';
}

export function ChangeRows({ changes, workspace, canAuthor }: { changes: readonly WorkspaceChange[]; workspace: WorkspaceSummary; canAuthor: boolean }) {
  if (!changes.length) {
    return <div className="empty"><div className="empty-icon">↗</div><h3>No changes registered yet</h3><p>Register an application, then describe the change you want to understand.</p><button className="button" data-action="new-change" disabled={!(workspace.applications.length && canAuthor)}>Create a change</button></div>;
  }
  return <>{changes.map(change => <div className="row" key={change.id}><div><a href={`#/changes/${change.id}`}>{text(change.title)}</a><span className="muted">{text(workspace.applications.find(app => app.id === change.applicationId)?.name ?? 'Application')} &nbsp;·&nbsp; Revision {shortRevision(change.sourceRevision)}</span></div><Badge text={changeStatus(change)} kind={change.assuranceError ? 'finding-gap' : resultKind(change.disposition)} /></div>)}</>;
}

const ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  APPLICATION_CREATED: 'Application registered', CHANGE_CREATED: 'Change created',
  OBLIGATION_PROPOSED: 'Candidate obligation added', OBLIGATION_UPDATED: 'Candidate draft updated'
};

export function ActivityRows({ items }: { items: readonly WorkspaceActivity[] }) {
  if (!items.length) return <p className="small muted">Your saved actions will appear here. No activity has been recorded yet.</p>;
  return <>{items.map((item, index) => <div className="activity" key={index}><strong>{text(lookup(ACTIVITY_LABELS, item.action) ?? item.action)}</strong><p>{text(item.action === 'OBLIGATION_UPDATED' ? 'Previous draft retained in activity record.' : item.detail)}</p><p>{formatDate(item.createdAt)} · {text(item.actor)}</p></div>)}</>;
}
