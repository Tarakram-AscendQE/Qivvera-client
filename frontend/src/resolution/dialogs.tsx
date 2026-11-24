import type { ReactNode } from 'react';
import { formatDate } from '../format';
import { field } from '../json';
import { text, type LegacyApi } from '../legacy-bridge';
import { Field, FormDialog, type DialogEnvironment } from '../dialogs/FormDialog';
import { runLabel } from './parts';

export interface Assignee { readonly email: unknown }

/** Configured named authors and policy authorities only; choosing one grants nothing. */
export function OwnerField({ directory, selected }: { directory: readonly Assignee[]; selected: unknown }) {
  const value = directory.some(person => person.email === selected) ? text(selected) : undefined;
  return <div className="form-field"><label htmlFor="assignedTo">Resolution owner *</label><select id="assignedTo" name="assignedTo" required defaultValue={value}>{directory.map((person, index) => <option value={text(person.email)} key={index}>{text(person.email)}</option>)}</select><small>Configured named authors and policy authorities only. This is not an invitation or a permission grant.</small></div>;
}

export function ReasonField() {
  return <Field id="rationale" label="Reason for this action" type="textarea" hint="At least 10 characters. Do not include secrets or tokens." required />;
}

/** Tracks a finding. The original assessment and evidence are preserved; a task status cannot change the result. */
export function NewResolutionDialog({ env, api, directory, owner, runId, obligationId }: { env: DialogEnvironment; api: LegacyApi; directory: readonly Assignee[]; owner: unknown; runId: string; obligationId: string }) {
  return (
    <FormDialog env={env} title="Track finding resolution" description="The original assessment and evidence will be preserved. A task status cannot change the assurance result." saveLabel="Create resolution"
      submit={async data => `#/resolutions/${text(field(await api(`/api/assessments/${runId}/resolutions`, { method: 'POST', data: { ...data, obligationId } }), 'id'))}`}>
      <OwnerField directory={directory} selected={owner} /><Field id="actionPlan" label="What should happen next?" type="textarea" hint="Describe a correction, investigation or clarification; at least 10 characters." required /><Field id="externalReference" label="External ticket reference" hint="Optional reference only. Qivvera does not connect to or update the ticket." />
    </FormDialog>
  );
}

/** One recorded resolution action, sent with the version the person saw. */
export function ActionDialog({ env, api, resolution, title, description, saveLabel, action, extra = {}, children }: {
  env: DialogEnvironment; api: LegacyApi; resolution: { readonly id: string; readonly version: unknown };
  title: string; description: string; saveLabel: string; action: string; extra?: Record<string, unknown>; children: ReactNode;
}) {
  return (
    <FormDialog env={env} title={title} description={description} saveLabel={saveLabel}
      submit={async data => { await api(`/api/resolutions/${resolution.id}/actions`, { method: 'POST', data: { ...data, ...extra, action, version: resolution.version } }); return `#/resolutions/${resolution.id}`; }}>
      {children}
    </FormDialog>
  );
}

export interface CorrectionChange { readonly sourceRevision?: unknown; readonly revision: { readonly id: unknown; readonly number: unknown }; readonly obligations: readonly { readonly id: unknown; readonly statement: unknown; readonly reviewStatus: unknown }[] }

export function CorrectionFields({ change }: { change: CorrectionChange }) {
  return <><div className="review-summary"><p>Current revision {text(change.revision.number)}: <span className="mono">{text(change.sourceRevision)}</span></p><p>Only the original requirement or an explicitly copied descendant can close the item.</p></div><div className="form-field"><label htmlFor="obligationId">Related requirement on the correction revision *</label><select id="obligationId" name="obligationId" required>{change.obligations.filter(o => o.reviewStatus !== 'REJECTED').map((o, index) => <option value={text(o.id)} key={index}>{text(o.statement)} · {text(o.reviewStatus)}</option>)}</select></div><ReasonField /></>;
}

export interface LinkableRun { readonly id: unknown; readonly number: number; readonly status: string; readonly disposition?: string | null; readonly applicability: unknown; readonly queuedAt: unknown }

export function LinkFields({ runs }: { runs: readonly LinkableRun[] }) {
  return <><div className="form-field"><label htmlFor="runId">Reassessment *</label><select id="runId" name="runId">{runs.map((run, index) => <option value={text(run.id)} key={index}>Run {run.number} · {runLabel(run)} · {text(run.applicability)} · {formatDate(run.queuedAt)}</option>)}</select></div><ReasonField /></>;
}

export function ResponseFields() {
  return <><div className="form-field"><label htmlFor="response">Response *</label><select id="response" name="response"><option value="FINDING_UPHELD">Finding upheld</option><option value="REASSESSMENT_REQUIRED">Reassessment required</option></select></div><ReasonField /></>;
}

export function OwnershipFields({ directory, resolution }: { directory: readonly Assignee[]; resolution: { readonly assignedTo: unknown; readonly actionPlan?: unknown; readonly externalReference?: unknown } }) {
  return <><OwnerField directory={directory} selected={resolution.assignedTo} /><Field id="actionPlan" label="Next action" type="textarea" value={text(resolution.actionPlan)} hint="At least 10 characters." required /><Field id="externalReference" label="External ticket reference" value={text(resolution.externalReference)} /><ReasonField /></>;
}
