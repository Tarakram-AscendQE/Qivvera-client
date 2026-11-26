import { useState } from 'react';
import { Badge, formatDate } from '../format';
import { field } from '../json';
import { text, type Api } from '../shell-contract';
import type { ChangeObligation, ChangeRecord } from '../change/types';
import { spaced } from '../change/labels';
import { Field, FormDialog, type DialogEnvironment } from './FormDialog';

interface Common { readonly env: DialogEnvironment; readonly api: Api }

/** The GitHub token field: hidden by default, with a show/hide toggle. Never pre-filled, and browsers are asked not to autofill or keep it. */
export function SecretField({ id, label, hint = '', required = false }: { id: string; label: string; hint?: string; required?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="form-field"><label htmlFor={id}>{label}{required ? ' *' : ''}</label>
      <div className="input-with-eye">
        <input id={id} name={id} type={visible ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="off" spellCheck={false} maxLength={255} required={required} />
        <button type="button" className="eye-btn" aria-controls={id} aria-label={visible ? 'Hide token' : 'Show token'} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button>
      </div>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** A connection's repositories, as the server reports them (never a token). */
export interface GitHubConnection { readonly app?: { readonly repository?: unknown }; readonly tests?: { readonly repository?: unknown }; readonly profiles?: { readonly repository?: unknown } }
const githubUrl = (repository: unknown) => (repository ? `https://github.com/${text(repository)}` : '');

/**
 * The three repositories and the token an application is assured with. The token is always entered fresh,
 * except while the server uses its own token for every application: then no token is asked for.
 */
function GitHubFields({ connection, repositoryUrl = '', serverToken = false }: { connection?: GitHubConnection | null; repositoryUrl?: string; serverToken?: boolean }) {
  return (
    <>
      <Field id="repositoryUrl" label="Application repository URL" type="url" value={githubUrl(connection?.app?.repository) || repositoryUrl} hint="The repository whose pull requests are assured, for example https://github.com/acme/vendorpay-app." required />
      <Field id="testRepositoryUrl" label="Test automation repository URL" type="url" value={githubUrl(connection?.tests?.repository)} hint="Runs Qivvera's checks. It must contain .github/workflows/qivvera-pr-assessment.yml." required />
      <Field id="profilesRepositoryUrl" label="Profiles repository URL" type="url" value={githubUrl(connection?.profiles?.repository)} hint="The business rules this application is assured against." required />
      {serverToken
        ? <p className="small muted" data-server-token>GitHub access uses the server's own token (QIVVERA_PR_ASSURANCE_GITHUB_TOKEN), so no token is needed here.</p>
        : <SecretField id="githubToken" label="GitHub personal access token" hint={connection ? 'Enter the token again, or a new one. It replaces the saved token, is stored encrypted and is never shown again.' : 'Used only for this application\'s repositories. Stored encrypted and never shown again.'} required />}
    </>
  );
}

/** Registration. With PR assurance on, the application's GitHub repositories and token are required and checked before saving. */
export function NewApplicationDialog({ env, api, github = false, serverToken = false }: Common & { github?: boolean; serverToken?: boolean }) {
  return (
    <FormDialog env={env} title="Register application" saveLabel="Register application"
      description={github ? 'Qivvera checks that the token can reach all three repositories before saving. Nothing is saved if a check fails.' : 'Create a saved record. This does not connect to the repository.'}
      submit={async data => `#/applications/${text(field(await api('/api/applications', { method: 'POST', data }), 'id'))}`}>
      <Field id="name" label="Application name" hint="For example: VendorPay" required /><Field id="description" label="Description" type="textarea" hint="What does this application do?" />
      {github ? <GitHubFields serverToken={serverToken} /> : <Field id="repositoryUrl" label="Repository URL" type="url" hint="Optional HTTPS URL. Do not include credentials." />}
    </FormDialog>
  );
}

/** Connects an existing application to GitHub, or replaces its repositories and token (for example after the token expired). */
export function ConnectGitHubDialog({ env, api, application, serverToken = false }: Common & { serverToken?: boolean; application: { id: string; name?: unknown; repositoryUrl?: unknown; github?: GitHubConnection | null } }) {
  const connected = !!application.github;
  return (
    <FormDialog env={env} title={connected ? `GitHub access for “${text(application.name)}”` : `Connect “${text(application.name)}” to GitHub`} saveLabel={connected ? 'Save GitHub access' : 'Connect to GitHub'}
      description="Qivvera checks that the token can reach all three repositories before saving. Nothing changes if a check fails."
      submit={async data => { await api(`/api/applications/${application.id}/github`, { method: 'POST', data }); return `#/applications/${application.id}`; }}>
      <GitHubFields connection={application.github ?? null} repositoryUrl={text(application.repositoryUrl || '')} serverToken={serverToken} />
    </FormDialog>
  );
}

/**
 * Archive hides an application (and its changes) from the lists and blocks new changes; restore undoes it.
 * Nothing is deleted. The person confirms in this dialog, optionally with a reason kept in the activity history.
 */
export function ArchiveApplicationDialog({ env, api, application, archive }: Common & { application: { id: string; name?: unknown }; archive: boolean }) {
  const name = text(application.name);
  return (
    <FormDialog env={env} title={archive ? `Archive “${name}”?` : `Restore “${name}”?`}
      description={archive
        ? 'It will be hidden from Applications, Workspace and Changes, and no new changes can be added. Nothing is deleted: its changes, decisions and evidence stay in history, and you can restore it at any time from “Show archived”.'
        : 'It will appear in the lists again and new changes can be added. Its history is unchanged.'}
      saveLabel={archive ? 'Archive application' : 'Restore application'}
      submit={async data => { await api(`/api/applications/${application.id}/${archive ? 'archive' : 'restore'}`, { method: 'POST', data: { reason: data['reason'] ?? '' } }); return archive ? '#/applications' : `#/applications/${application.id}`; }}>
      <Field id="reason" label="Reason (optional)" type="textarea" hint="Kept in the activity history, for example: Test data from the November rehearsal." />
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
