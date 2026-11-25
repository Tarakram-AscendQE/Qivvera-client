import { Badge, formatDate, obligationLabel } from '../format';
import { lookup } from '../json';
import { text } from '../shell-contract';
import { ActivityRows, resultKind, shortRevision } from '../workspace/rows';
import { reviewLabel, spaced } from './labels';
import type { ChangeObligation, ChangeView } from './types';

function SourceReceipts({ view }: { view: ChangeView }) {
  if (view.sourceError) return <div className="notice warning">{view.sourceError}</div>;
  const receipts = view.sources.filter(receipt => receipt.revisionId === view.change.revision.id);
  return <section className="panel resolution-source"><div className="panel-head"><h2>Imported source context</h2></div><div className="panel-body">{receipts.length ? receipts.map((receipt, index) => <article className="run-card" key={index}><a href={text(receipt.source.url)} rel="noreferrer" target="_blank">{text(receipt.source.repository)} #{text(receipt.source.pullNumber)}</a><p>{text(receipt.source.title)}</p><p className="mono">{text(receipt.source.headSha)}</p><p className="small">Imported by {text(receipt.importedBy)} · {formatDate(receipt.importedAt)}</p><p className="small">Provider-observed head at import time. Not proof of a deployed binary, requirement acceptance or readiness.</p></article>) : <p>No GitHub import is attached to this revision. A manually declared source reference is not a provider-observed receipt.</p>}</div></section>;
}

export function OverviewTab({ view }: { view: ChangeView }) {
  const { change } = view;
  return (
    <>
      <section className="panel"><div className="panel-head"><h2>Declared change context</h2></div><div className="panel-body"><span className="field-label">Business intent</span><p>{text(change.intent || 'Not supplied')}</p><div className="details"><div><span className="field-label">Source reference</span><div className="mono">{text(change.sourceRevision || 'Not supplied')}</div><p className="small muted">Declared by a user; not independently bound to a deployed artifact.</p></div><div><span className="field-label">Producer</span>{text(change.producer)}</div><div><span className="field-label">Revision registered by</span>{text(change.revision.createdBy)}</div><div><span className="field-label">Reason</span>{text(change.revision.reason)}</div></div></div></section>
      {view.workspace.capabilities['githubIntake'] ? <SourceReceipts view={view} /> : null}
    </>
  );
}

const STATUS_KIND: Readonly<Record<string, string>> = { ACCEPTED: 'accepted', CLARIFICATION_REQUIRED: 'clarify', REJECTED: 'rejected' };

/** Review actions follow these rules: contributors cannot decide on their own requirement unless founder-review mode is on. */
function ObligationActions({ obligation, view, own }: { obligation: ChangeObligation; view: ChangeView; own: boolean }) {
  const current = !!view.change.isCurrentRevision, canEdit = view.roles.author && current, status = obligation.reviewStatus;
  const reviewer = view.roles.authority && current && (!own || view.session.reviewMode === 'founder-review');
  return (
    <div className="actions obligation-actions">
      {canEdit && status !== 'IN_REVIEW' ? <button className="button" data-action="edit-obligation" data-id={obligation.id}>{status === 'ACCEPTED' ? 'Revise requirement' : 'Edit draft'}</button> : null}
      {canEdit && !obligation.imported && (status === 'DRAFT' || status === 'CLARIFICATION_REQUIRED') ? <button className="button primary" data-action="review-submit" data-id={obligation.id}>Request review</button> : null}
      {canEdit && status === 'IN_REVIEW' && own ? <button className="button" data-action="review-withdraw" data-id={obligation.id}>Withdraw request</button> : null}
      {status === 'IN_REVIEW' && current ? (reviewer ? <button className="button primary" data-action="review-decision" data-id={obligation.id}>Record decision</button> : <span className="small muted">{own ? 'Needs a different authorized reviewer.' : 'Awaiting a policy authority.'}</span>) : null}
    </div>
  );
}

/**
 * An obligation that existed before the review workflow has no recorded author, so the server refuses
 * a review request (IMPORTED_REVIEW_REQUIRED) until an author edits and saves it. Explain that instead
 * of offering a button that can only fail.
 */
function ImportedNotice({ canEdit }: { canEdit: boolean }) {
  const why = 'This obligation was added before the review workflow, so it has no recorded author. ';
  return <div className="notice warning"><strong>No author yet</strong><span>{why + (canEdit
    ? 'Click Edit draft, check the wording, fill in Source reference and Source version, then click Save new draft. After that you can request review.'
    : 'An author must check and save it before it can be reviewed.')}</span></div>;
}

function ObligationCard({ obligation, view }: { obligation: ChangeObligation; view: ChangeView }) {
  const own = [obligation.proposedBy, obligation.lastEditedBy].includes(view.session.email);
  const status = obligation.reviewStatus;
  const kind = lookup(STATUS_KIND, status) ?? 'candidate';
  return (
    <article className="obligation" data-obligation-id={obligation.id}>
      <div className="obligation-top"><span className="field-label">{obligationLabel(obligation.id)} · Version {text(obligation.version)}</span><button className="link-button" data-action="obligation-history" data-id={obligation.id}>Review history</button></div><h3>{text(obligation.statement)}</h3>
      <div className="chip-row"><Badge text={reviewLabel(status)} kind={kind} /><Badge text={obligation.authority} /><Badge text={spaced(obligation.state)} kind={resultKind(obligation.state)} /></div>
      <div className="obligation-foot"><span><strong>Source:</strong> {text(obligation.sourceReference || 'Not supplied')}<br /><strong>Source version:</strong> {text(obligation.sourceVersion || 'Not supplied')} · {text(obligation.criticality)}</span><span>{obligation.evidenceCount ?? 0} evidence {obligation.evidenceCount === 1 ? 'item' : 'items'}</span></div>
      {status !== 'ACCEPTED' && obligation.imported
        ? <ImportedNotice canEdit={view.roles.author && !!view.change.isCurrentRevision} />
        : <p className="small muted">{status === 'ACCEPTED' ? 'Accepted for this revision by a recorded human decision. This does not establish that the software satisfies it.' : 'Proposed by ' + text(obligation.proposedBy)}</p>}
      <ObligationActions obligation={obligation} view={view} own={own} />
    </article>
  );
}

export function ObligationsTab({ view }: { view: ChangeView }) {
  const { change } = view, canEdit = view.roles.author && !!change.isCurrentRevision;
  const accepted = change.obligations.filter(o => o.reviewStatus === 'ACCEPTED').length, pending = change.obligations.filter(o => o.reviewStatus === 'IN_REVIEW').length;
  return (
    <div className="grid"><section className="panel"><div className="panel-head"><div><h2>What needs to be established?</h2><p>{accepted} accepted · {pending} awaiting review · {change.obligations.length} total</p></div><div className="actions">{view.workspace.capabilities['obligationDrafting'] ? <a className="button" href={`#/drafting/${change.id}/${change.revision.id}`}>{canEdit ? 'Draft from source' : 'View source drafts'}</a> : null}<button className="button" data-action="new-obligation" disabled={!canEdit}>+ Add obligation</button></div></div>
      {change.obligations.length ? change.obligations.map(obligation => <ObligationCard key={obligation.id} obligation={obligation} view={view} />) : <div className="empty"><h3>No obligations for this revision</h3><p>Record an expectation and its source. It remains a candidate until reviewed.</p></div>}</section>
      <aside><div className="explanation"><h3>Acceptance is not verification.</h3><p>A policy authority confirms that this requirement applies to this revision.</p><p>The source, version, reason and decision-maker are retained. Software evidence is shown separately.</p><p><strong>Next:</strong> independent evidence must establish whether the requirement is satisfied.</p></div><div className="boundary-note"><span className="field-label">Review boundary</span><p>Revision {text(change.revision.number)}<br />{shortRevision(change.sourceRevision)}</p><p>Source references remain human declarations. No automatic source-authenticity claim.</p></div></aside></div>
  );
}

export function RevisionsTab({ view }: { view: ChangeView }) {
  const { change } = view;
  return <section className="panel"><div className="panel-head"><div><h2>Change revisions</h2><p>Earlier revisions are read-only. Acceptance and evidence do not transfer automatically. Open a revision to inspect the decisions and evidence that belong to it.</p></div><button className="button primary" data-action="new-revision" disabled={!(view.roles.author && change.isCurrentRevision)}>+ New revision</button></div>{change.revisions.map(revision => <div className="revision-row" key={revision.id}><div><a href={`#/changes/${change.id}/revisions/${revision.id}`}><strong>Revision {text(revision.number)}</strong></a> <Badge text={revision.id === change.currentRevisionId ? 'CURRENT' : 'HISTORICAL'} /><p className="mono">{text(revision.sourceRevision || 'Not supplied')}</p><p>{text(revision.reason)}</p><p className="small muted">{text(revision.createdBy)} · {formatDate(revision.createdAt)}</p></div><Badge text="SEPARATE ASSESSMENT" /></div>)}</section>;
}

export function HistoryTab({ view }: { view: ChangeView }) {
  const { change } = view;
  const items = view.workspace.activity.filter(item => item.entityId === change.id || change.obligations.some(o => o.id === item.entityId));
  return <section className="panel"><div className="panel-head"><h2>Working activity</h2><p>This view filters the latest 100 workspace actions. Use each obligation’s Review history and each resolution’s history for its full recorded trail; an empty activity list does not mean earlier records were deleted.</p></div><div className="panel-body"><ActivityRows items={items} /></div></section>;
}
