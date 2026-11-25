import { Badge, formatDate } from '../format';
import { field } from '../json';
import { text, type Api } from '../shell-contract';
import type { ChangeObligation, ChangeRecord } from '../change/types';
import { spaced } from '../change/labels';
import { Field, FormDialog, type DialogEnvironment } from './FormDialog';

interface Common { readonly env: DialogEnvironment; readonly api: Api }

export function NewApplicationDialog({ env, api }: Common) {
  return (
    <FormDialog env={env} title="Register application" description="Create a saved record. This does not connect to the repository." saveLabel="Register application"
      submit={async data => `#/applications/${text(field(await api('/api/applications', { method: 'POST', data }), 'id'))}`}>
      <Field id="name" label="Application name" hint="For example: VendorPay" required /><Field id="description" label="Description" type="textarea" hint="What does this application do?" /><Field id="repositoryUrl" label="Repository URL" type="url" hint="Optional HTTPS URL. Do not include credentials." />
    </FormDialog>
  );
}

/** A new change opens on its Obligations tab (S.tab), but only if the person is still on the view that asked. */
export function NewChangeDialog({ env, api, applications, selected, openObligations }: Common & { applications: readonly { id: string; name?: unknown }[]; selected: string; openObligations: () => void }) {
  return (
    <FormDialog env={env} title="Create a change" description="Capture intent first. The change will remain unassessed." saveLabel="Create change"
      submit={async data => { const created = await api('/api/changes', { method: 'POST', data }); openObligations(); return `#/changes/${text(field(created, 'id'))}`; }}>
      <div className="form-field"><label htmlFor="applicationId">Application *</label><select id="applicationId" name="applicationId" required defaultValue={applications.some(app => app.id === selected) ? selected : undefined}>{applications.map(app => <option value={app.id} key={app.id}>{text(app.name)}</option>)}</select></div>
      <Field id="title" label="Change title" hint="What is being changed?" required /><Field id="intent" label="Business intent" type="textarea" hint="What outcome should this change achieve?" /><Field id="sourceRevision" label="Source commit reference" hint="Optional 7–64 character Git hash. Recorded as declared, not verified." />
      <div className="form-field"><label htmlFor="producer">Producer category</label><select name="producer" id="producer"><option value="UNSPECIFIED">Not specified</option><option value="AI_ASSISTED">AI-assisted</option><option value="HUMAN">Human</option><option value="AUTOMATION">Automation</option></select></div>
    </FormDialog>
  );
}

export function NewRevisionDialog({ env, api, change, openObligations }: Common & { change: ChangeRecord; openObligations: () => void }) {
  return (
    <FormDialog env={env} title="Register a new revision" description="The previous revision and its decisions remain read-only. This does not fetch or verify source code." saveLabel="Create revision"
      submit={async data => { const next = await api(`/api/changes/${change.id}/revisions`, { method: 'POST', data: { ...data, copyObligations: data['copyObligations'] === 'true', expectedRevisionId: change.currentRevisionId } }); openObligations(); return `#/changes/${text(field(next, 'id'))}`; }}>
      <Field id="sourceRevision" label="New source commit reference" hint="A different Git reference, recorded as declared." required /><Field id="intent" label="Business intent" type="textarea" value={text(change.intent)} hint="What should this revision achieve?" required /><Field id="reason" label="What changed and why?" type="textarea" hint="Explain the reason for the new revision." required />
      <div className="form-field"><label htmlFor="copyObligations">Prior obligations</label><select name="copyObligations" id="copyObligations"><option value="true">Copy non-rejected obligations as new candidates</option><option value="false">Start with no obligations</option></select><small>Copied obligations require new review. No acceptance, evidence or disposition transfers.</small></div>
    </FormDialog>
  );
}

const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

/** Revising an accepted requirement creates a new draft; the earlier acceptance stays in history. */
export function ObligationDialog({ env, api, change, obligation }: Common & { change: ChangeRecord; obligation: ChangeObligation | null }) {
  const revisionId = change.revision.id;
  return (
    <FormDialog env={env} title={obligation ? 'Revise obligation' : 'Propose an obligation'}
      description={obligation?.reviewStatus === 'ACCEPTED' ? 'Saving creates a new draft version. The prior acceptance remains in history and does not apply to the revised statement.' : 'Record the source and version. Submitting for review does not verify software behaviour.'}
      saveLabel={obligation ? 'Save new draft' : 'Add candidate'}
      submit={async data => { await (obligation ? api(`/api/obligations/${obligation.id}`, { method: 'PATCH', data: { ...data, version: obligation.version, revisionId } }) : api(`/api/changes/${change.id}/obligations`, { method: 'POST', data: { ...data, revisionId } })); }}>
      <Field id="statement" label="What must be true?" type="textarea" value={text(obligation?.statement ?? '')} hint="One expectation that could be evaluated." required /><Field id="sourceReference" label="Source reference" value={text(obligation?.sourceReference ?? '')} hint="Policy ID, requirement or document section." /><Field id="sourceVersion" label="Source version" value={text(obligation?.sourceVersion ?? '')} hint="For example: policy version 2 or an approved document revision." />
      <div className="form-field"><label htmlFor="criticality">Criticality</label><select id="criticality" name="criticality" defaultValue={text(obligation?.criticality ?? 'MEDIUM')}>{CRITICALITIES.map(value => <option key={value}>{value}</option>)}</select></div>
    </FormDialog>
  );
}

export type ReviewAction = 'SUBMIT' | 'WITHDRAW' | 'DECISION';

/** An authority decision is about applicability, never about whether the software satisfies the requirement. */
export function ReviewDialog({ env, api, change, obligation, action, own }: Common & { change: ChangeRecord; obligation: ChangeObligation; action: ReviewAction; own: boolean }) {
  const decision = action === 'DECISION';
  return (
    <FormDialog env={env} title={decision ? 'Record authority decision' : action === 'SUBMIT' ? 'Request review' : 'Withdraw review request'}
      description={decision ? 'This decision concerns whether the requirement applies. It does not assess the software.' : action === 'SUBMIT' ? 'The submitted version will be locked while it is reviewed.' : 'Withdrawal reopens this candidate for editing.'}
      saveLabel={decision ? 'Save decision' : action === 'SUBMIT' ? 'Submit for review' : 'Withdraw'}
      submit={async data => { await api(`/api/obligations/${obligation.id}/review`, { method: 'POST', data: { ...data, action: decision ? data['action'] : action, version: obligation.version, revisionId: change.revision.id } }); }}>
      <div className="review-summary"><h3>{text(obligation.statement)}</h3><p>Source: {text(obligation.sourceReference || 'Not supplied')} · {text(obligation.sourceVersion || 'No version')}</p><p>Revision {text(change.revision.number)} · Obligation version {text(obligation.version)}</p></div>
      {decision ? <><div className="form-field"><label htmlFor="action">Decision</label><select name="action" id="action"><option value="ACCEPT">Accept requirement</option><option value="REQUEST_CLARIFICATION">Request clarification</option><option value="REJECT">Reject candidate</option></select></div>{own ? <div className="notice warning">Same-person decision: no independent approval is claimed.</div> : null}<Field id="rationale" label="Reason for this decision" type="textarea" hint="At least 10 characters. Explain the source and applicability." required /></> : null}
    </FormDialog>
  );
}

export interface HistoryEvent {
  readonly action: unknown; readonly version: unknown; readonly actor: unknown; readonly createdAt: unknown; readonly rationale?: unknown; readonly independentActor?: unknown;
  readonly snapshot: { readonly statement?: unknown; readonly sourceReference?: unknown; readonly sourceVersion?: unknown; readonly reviewStatus?: unknown };
}

/** Append-only application history, newest first. Not tamper-proof evidence. */
export function HistoryDialog({ events, close }: { events: readonly HistoryEvent[]; close: () => void }) {
  return (
    <>
      <div className="modal-head"><h2 id="modal-title">Obligation review history</h2><button className="close" data-close="" aria-label="Close dialog" onClick={close}>×</button></div>
      <div className="modal-body"><p className="small muted">Append-only application history, not tamper-proof evidence. Earlier content is retained.</p>{events.slice().reverse().map((event, index) => <article className="decision-card" key={index}><div className="chip-row"><Badge text={spaced(event.action)} kind="candidate" /><Badge text={'VERSION ' + String(event.version)} /></div><p className="decision-actor">{text(event.actor)} · {formatDate(event.createdAt)}</p><p>{text(event.rationale || 'Candidate recorded.')}</p>{event.action === 'ACCEPT' || event.action === 'REJECT' || event.action === 'REQUEST_CLARIFICATION' ? <p className="small muted">{event.independentActor ? 'Different recorded reviewer identity. This is not a guarantee of organizational independence.' : 'No independent-review claim.'}</p> : null}<details><summary>Content at this decision</summary><p>{text(event.snapshot.statement)}</p><p className="small">Source: {text(event.snapshot.sourceReference ?? '')} · {text(event.snapshot.sourceVersion ?? '')}</p><p className="small">Review state: {text(event.snapshot.reviewStatus)}</p></details></article>)}</div>
    </>
  );
}
