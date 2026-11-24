import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { Badge, formatDate } from '../format';
import { field } from '../json';
import { isSessionEnded, text, type Api } from '../shell-contract';
import { changeLink } from '../links';
import type { ActiveCheck } from '../visits';
import {
  draftingBase, failureText, methodLabel, problem, runLink, sizeProblem, sizeText, sourceSize, statusLabel, warningText
} from './labels';

export interface DraftChange { readonly id: string; readonly title?: unknown; readonly sourceRevision?: unknown; readonly revision: { readonly id: string; readonly number?: unknown } }
export interface DraftRunSummary {
  readonly id: unknown; readonly status: unknown; readonly applicability?: unknown; readonly method?: unknown;
  readonly source: { readonly reference: unknown; readonly version: unknown };
  readonly createdBy: unknown; readonly createdAt: unknown; readonly pendingCount: unknown; readonly createdCount: unknown; readonly dismissedCount: unknown;
}
export interface DraftContext {
  readonly changeId: string; readonly revisionId: string; readonly isCurrentRevision?: unknown;
  readonly methods: { readonly openai?: unknown }; readonly runs: readonly DraftRunSummary[];
  readonly total: number; readonly offset: number; readonly limit: number;
}
export interface DraftDecision {
  readonly action: unknown; readonly rationale: unknown; readonly statement?: unknown; readonly criticality?: unknown;
  readonly actor: unknown; readonly createdAt: unknown; readonly obligationId?: unknown;
}
export interface DraftSuggestion {
  readonly id: string; readonly version: unknown; readonly status: unknown; readonly statement: unknown; readonly quote: unknown;
  readonly startLine: unknown; readonly endLine: unknown; readonly decision?: DraftDecision | null;
}
export interface DraftRun {
  readonly id: string; readonly changeId: string; readonly revisionId: string; readonly status: unknown; readonly applicability?: unknown;
  readonly method?: unknown; readonly engine?: Readonly<Record<string, unknown>> | null; readonly createdBy: unknown; readonly createdAt: unknown;
  readonly source: { readonly reference: unknown; readonly version: unknown; readonly digest: unknown; readonly text: unknown };
  readonly resultDigest?: unknown; readonly warnings?: readonly unknown[] | null; readonly failureCode?: unknown;
  readonly suggestions?: readonly DraftSuggestion[] | null;
}

/** One displayed drafting visit: its records and what its links and buttons may do. */
export interface DraftingView {
  readonly change: DraftChange;
  readonly context: DraftContext;
  readonly changeId: string;
  readonly revisionId: string;
  readonly active: ActiveCheck;
  readonly canAuthor: boolean;
  readonly email: unknown;
  readonly api: Api;
  /** Links back to the change open its Obligations tab (S.tab), only while current. */
  openObligations(): void;
  /** Re-reads the route (the shell's route()), only while current. */
  reload(): void;
}

/** A notice that can be added to a displayed run without redrawing it (keeps what the person typed). */
export interface NoticeStore {
  set(message: string): void;
  subscribe(listener: () => void): () => void;
  get(): string;
}

export function createNoticeStore(): NoticeStore {
  let message = '';
  const listeners = new Set<() => void>();
  return {
    set(next) { message = next; listeners.forEach(listener => listener()); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get: () => message
  };
}

function ChangeLink({ view, className, children }: { view: DraftingView; className?: string; children: ReactNode }) {
  return <a className={className} href={changeLink(view.changeId, view.revisionId)} onClick={view.openObligations}>{children}</a>;
}

function Header({ view, run }: { view: DraftingView; run: boolean }) {
  const { change, context } = view;
  return (
    <>
      <ChangeLink view={view} className="back">← Back to change</ChangeLink><div className="heading"><div><div className="eyebrow">Prepare obligations · Revision {text(change.revision.number)}</div><h1>{run ? 'Review source drafts' : 'Draft from source'}</h1><p className="sub">{text(change.title)}</p><p className="small muted">Declared source commit: <span className="mono">{text(change.sourceRevision || 'Not supplied')}</span></p></div><ChangeLink view={view} className="button">Open obligations</ChangeLink></div>
      {!context.isCurrentRevision && <div className="notice warning"><strong>Historical revision · read-only</strong><span>Saved sources and decisions remain available. New drafts and decisions require the current revision.</span></div>}<div className="notice drafting-boundary"><span><strong>Drafts need human review.</strong> A matching quotation shows where wording came from. It does not prove that the source is authentic, that the statement applies, or that all requirements have been found.</span></div>
    </>
  );
}

type SourceFormElements = HTMLFormControlsCollection & {
  sourceReference: HTMLInputElement; sourceVersion: HTMLInputElement; sourceText: HTMLTextAreaElement;
  method: HTMLSelectElement; externalProcessingConfirmed: HTMLInputElement;
};

function SourceForm({ view }: { view: DraftingView }) {
  const { context, changeId, revisionId, active, api } = view;
  const [size, setSize] = useState(() => sourceSize(''));
  const [external, setExternal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const generatingNow = useRef(false);
  // The same request ID is reused while the submitted content is unchanged, so a repeated submit
  // after a lost response cannot create a second generation (Increment 7 request receipts).
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  function updateSize(): void {
    const source = sourceRef.current;
    if (!source) return;
    const next = sourceSize(source.value);
    setSize(next);
    source.setCustomValidity(sizeProblem(next));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active() || generatingNow.current) return;
    const form = event.currentTarget, elements = form.elements as SourceFormElements;
    updateSize();
    if (!form.reportValidity()) return;
    generatingNow.current = true;
    const method = elements.method.value;
    const data = { revisionId, sourceReference: elements.sourceReference.value, sourceVersion: elements.sourceVersion.value, sourceText: sourceSize(elements.sourceText.value).text, method, externalProcessingConfirmed: method === 'openai' && elements.externalProcessingConfirmed.checked };
    const fingerprint = JSON.stringify(data);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestId: crypto.randomUUID() };
    setGenerating(true);
    setError('');
    try {
      const run = await api(`/api/changes/${encodeURIComponent(changeId)}/drafting-runs`, { method: 'POST', data: { ...data, requestId: attempt.current.requestId } });
      if (!active()) return;
      location.hash = runLink(changeId, revisionId, field(run, 'id'));
    } catch (err) {
      if (!active() || isSessionEnded(err)) return;
      setError(problem(err) + ' Use “Check saved drafts” to inspect the saved attempt before starting another.');
    } finally {
      generatingNow.current = false;
      setGenerating(false);
    }
  }

  return (
    <section className="panel drafting-section"><div className="panel-head"><div><h2>Provide the source to inspect</h2><p>Use a relevant, named and versioned excerpt. Its text is retained in the saved drafting record.</p></div></div><div className="panel-body"><form id="drafting-source-form" onSubmit={event => void submit(event)}>
      <div className="form-error" role="alert">{error}</div>
      <div className="form-field"><label htmlFor="sourceReference">Source reference *</label><input id="sourceReference" name="sourceReference" maxLength={500} required disabled={generating} /><small>Document, policy or requirement identifier and section. Up to 500 characters.</small></div>
      <div className="form-field"><label htmlFor="sourceVersion">Source version *</label><input id="sourceVersion" name="sourceVersion" maxLength={120} required disabled={generating} /><small>The declared version of this source. Up to 120 characters.</small></div>
      <div className="form-field"><label htmlFor="sourceText">Source excerpt *</label><textarea id="sourceText" name="sourceText" maxLength={6000} rows={10} required aria-describedby="drafting-source-limits drafting-source-size" ref={sourceRef} onInput={updateSize} disabled={generating}></textarea><small id="drafting-source-limits">Up to 6,000 characters, 12,000 UTF-8 bytes and 200 lines. Keep the original wording. Do not include credentials or sensitive data.</small><small id="drafting-source-size" aria-live="polite">{sizeText(size)}</small></div>
      <div className="form-field"><label htmlFor="method">Drafting method</label><select id="method" name="method" disabled={generating} onChange={event => { setExternal(event.currentTarget.value === 'openai'); setConfirmed(false); }}><option value="rules">Explicit clauses · rule-based</option>{context.methods.openai ? <option value="openai">AI suggestions · OpenAI</option> : null}</select><small>Explicit clauses extracts individual lines with supported requirement phrases. It does not understand the whole document or discover every requirement.</small>{context.methods.openai ? null : <small>AI suggestions are not enabled in this workspace. The built-in method does not call an AI provider.</small>}</div>
      <div id="drafting-ai-confirmation" className="review-summary" hidden={!external}><p>The displayed source excerpt will be sent to the configured OpenAI service. Account, application and evidence records are not part of this request. Provider retention follows your operator’s account and policy.</p><label className="acknowledge"><input type="checkbox" name="externalProcessingConfirmed" disabled={!external || generating} required={external} checked={confirmed} onChange={event => setConfirmed(event.currentTarget.checked)} /> I confirm that this source excerpt may be processed by the configured external AI service.</label></div>
      <div className="actions"><button className="button primary" type="submit" disabled={generating}>{generating ? 'Proposing drafts…' : 'Propose drafts'}</button><button className="button" type="button" id="drafting-check-saved" onClick={view.reload}>Check saved drafts</button></div><p className="small muted">Generation saves a preparation record. It does not add obligations, approve requirements or run verification.</p>
    </form></div></section>
  );
}

export function SourceView({ view }: { view: DraftingView }) {
  const { context, changeId, revisionId } = view;
  const allowed = view.canAuthor && !!context.isCurrentRevision;
  const base = draftingBase(changeId, revisionId);
  return (
    <>
      <Header view={view} run={false} />
      {allowed ? <SourceForm view={view} /> : <section className="panel drafting-section"><div className="panel-body"><h2>{context.isCurrentRevision ? 'Author role required to propose drafts' : 'This source history is read-only'}</h2><p>You can inspect saved sources and decisions. Only the requesting Author can act on their suggestions for a current revision.</p></div></section>}
      <section className="panel drafting-section"><div className="panel-head"><div><h2>Saved drafting runs</h2><p>{context.total} saved run{context.total === 1 ? '' : 's'} for this revision. Preparing or dismissing a suggestion does not change declared assurance scope.</p></div><button className="button" id="drafting-refresh-history" onClick={view.reload}>Refresh saved drafts</button></div>
        {context.runs.length ? context.runs.map((run, index) => <article className="drafting-run" key={index}><div className="chip-row"><Badge text={statusLabel(run.status)} kind="candidate" /><Badge text={run.applicability ?? (context.isCurrentRevision ? 'CURRENT' : 'HISTORICAL')} /></div><h3><a href={runLink(changeId, revisionId, run.id)}>{text(run.source.reference)}</a></h3><p className="small">Source version: {text(run.source.version)} · {methodLabel(run.method)}</p><p className="small muted">Requested by {text(run.createdBy)} · {formatDate(run.createdAt)}</p><p>{text(run.pendingCount)} awaiting decision · {text(run.createdCount)} candidates created · {text(run.dismissedCount)} dismissed</p><a className="button" href={runLink(changeId, revisionId, run.id)}>Review saved run</a></article>) : <div className="empty"><h3>No saved drafting runs</h3><p>Manual obligation authoring remains available on the change.</p></div>}
        <div className="panel-body drafting-pagination"><p className="small">{context.runs.length ? `Showing ${context.offset + 1}–${Math.min(context.offset + context.runs.length, context.total)} of ${context.total}.` : `No runs on this page. ${context.total} saved runs in total.`}</p><div className="actions">{context.offset > 0 ? <a className="button" href={`${base}/page/${Math.max(0, context.offset - context.limit)}`}>Previous runs</a> : null}{context.offset + context.runs.length < context.total ? <a className="button" href={`${base}/page/${context.offset + context.limit}`}>Next runs</a> : null}</div></div></section>
    </>
  );
}

const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

type DecisionAction = 'CREATE_CANDIDATE' | 'DISMISS';

function Suggestion({ item, index, actionable, view, saving, errors, decide }: {
  item: DraftSuggestion; index: number; actionable: boolean; view: DraftingView; saving: boolean;
  errors: Readonly<Record<string, string>>; decide: (event: FormEvent<HTMLFormElement>, item: DraftSuggestion, action: DecisionAction) => void;
}) {
  const id = `draft-${index}`, decision = item.decision;
  const lines = item.startLine === item.endLine ? 'line ' + String(item.startLine) : 'lines ' + String(item.startLine) + '–' + String(item.endLine);
  return (
    <article className="drafting-suggestion" data-suggestion-id={item.id}>
      <div className="chip-row"><Badge text={'SUGGESTION ' + (index + 1)} /><Badge text={statusLabel(item.status)} kind="candidate" /></div><h3>Original proposed statement</h3><p className="drafting-statement">{text(item.statement)}</p><div className="drafting-quote"><h4>Exact source quotation · {lines}</h4><blockquote>{text(item.quote)}</blockquote><p className="small muted">Check the surrounding source. Quotation matching does not prove that the proposed statement follows from it.</p></div>
      {decision ? <div className="review-summary"><h4>{decision.action === 'CREATE_CANDIDATE' ? 'Recorded candidate decision' : 'Recorded dismissal'}</h4><p>{text(decision.rationale)}</p>{decision.statement ? <><p><strong>Statement saved at this decision:</strong> {text(decision.statement)}</p><p><strong>Criticality selected:</strong> {text(decision.criticality)}</p></> : null}<p className="small">{text(decision.actor)} · {formatDate(decision.createdAt)}</p>{decision.obligationId ? <><p className="small mono">Obligation: {text(decision.obligationId)}</p><ChangeLink view={view} className="button">Open candidate in change</ChangeLink><p className="small muted">This receipt preserves the original creation decision. The ordinary obligation record may have later edits or review decisions.</p></> : <p className="small muted">Dismissal applies to this suggestion. It does not reject an existing obligation, grant a waiver or prove completeness.</p>}</div> : null}
      {actionable && item.status === 'PROPOSED' ? <div className="drafting-decisions"><details className="guide-detail"><summary>Review and create a draft candidate</summary><form data-drafting-action="CREATE_CANDIDATE" data-suggestion-id={item.id} onSubmit={event => decide(event, item, 'CREATE_CANDIDATE')}><div className="form-error" role="alert">{errors[item.id + ':CREATE_CANDIDATE'] ?? ''}</div><div className="form-field"><label htmlFor={`${id}-statement`}>What must be true? *</label><textarea id={`${id}-statement`} name="statement" maxLength={1200} required disabled={saving} defaultValue={text(item.statement)}></textarea><small>Edit this proposed wording after comparing it with the source. Up to 1,200 characters.</small></div><div className="form-field"><label htmlFor={`${id}-criticality`}>Criticality *</label><select id={`${id}-criticality`} name="criticality" required disabled={saving}><option value="">Choose the appropriate criticality</option>{CRITICALITIES.map(value => <option value={value} key={value}>{value}</option>)}</select><small>This is your decision. The generator has not assigned criticality.</small></div><div className="form-field"><label htmlFor={`${id}-rationale`}>Why should this become a candidate? *</label><textarea id={`${id}-rationale`} name="rationale" minLength={10} maxLength={1500} required disabled={saving}></textarea><small>10–1,500 characters. Explain the source and relevance to this change.</small></div><p className="small">The candidate starts as DRAFT / CANDIDATE / NOT_ASSESSED, with no evidence. Separate Policy Authority review is still required.</p><button className="button primary" type="submit" disabled={saving}>Create draft candidate</button></form></details><details className="guide-detail"><summary>Dismiss this suggestion</summary><form data-drafting-action="DISMISS" data-suggestion-id={item.id} onSubmit={event => decide(event, item, 'DISMISS')}><div className="form-error" role="alert">{errors[item.id + ':DISMISS'] ?? ''}</div><div className="form-field"><label htmlFor={`${id}-dismissal`}>Reason for dismissal *</label><textarea id={`${id}-dismissal`} name="rationale" minLength={10} maxLength={1500} required disabled={saving}></textarea><small>10–1,500 characters. Explain why you are not creating a candidate from this suggestion.</small></div><button className="button" type="submit" disabled={saving}>Dismiss suggestion</button></form></details></div> : null}
    </article>
  );
}

export interface RunActions {
  /** Draws the run again from a saved record (a new screen). Returns its notice store, or null if the visit ended. */
  redraw(run: unknown, message: string): NoticeStore | null;
  /** Re-reads the workspace summary (the shell's refresh()). */
  refreshWorkspace(): Promise<void>;
}

export function RunView({ run, view, message, notices, actions }: { run: DraftRun; view: DraftingView; message: string; notices: NoticeStore; actions: RunActions }) {
  const { context, active, api } = view;
  const suggestions = run.suggestions ?? [];
  const pending = suggestions.filter(item => item.status === 'PROPOSED').length;
  const owns = view.canAuthor && run.createdBy === view.email;
  const actionable = owns && !!context.isCurrentRevision && run.applicability === 'CURRENT' && run.status === 'COMPLETED';
  const engine = run.engine ?? {};
  const notice = useSyncExternalStore(notices.subscribe, notices.get);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const savingNow = useRef(false);

  async function decide(event: FormEvent<HTMLFormElement>, item: DraftSuggestion, action: DecisionAction) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!active() || savingNow.current || !form.reportValidity()) return;
    const elements = form.elements as HTMLFormControlsCollection & { rationale: HTMLTextAreaElement; statement?: HTMLTextAreaElement; criticality?: HTMLSelectElement };
    const data: Record<string, unknown> = { action, version: item.version, rationale: elements.rationale.value };
    if (action === 'CREATE_CANDIDATE') { data['statement'] = elements.statement?.value; data['criticality'] = elements.criticality?.value; }
    const key = item.id + ':' + action;
    savingNow.current = true;
    setSaving(true);
    setErrors(previous => ({ ...previous, [key]: '' }));
    try {
      const updated = await api(`/api/drafting-runs/${encodeURIComponent(run.id)}/suggestions/${encodeURIComponent(item.id)}/actions`, { method: 'POST', data });
      if (!active()) return;
      const next = actions.redraw(updated, action === 'CREATE_CANDIDATE' ? 'Draft candidate saved. Open the change to request its separate authority review.' : 'Suggestion dismissed with your recorded reason. This is not an obligation rejection or a waiver.');
      if (action === 'CREATE_CANDIDATE') {
        try { await actions.refreshWorkspace(); } catch (err) {
          if (!active() || isSessionEnded(err)) return;
          next?.set('The draft candidate was saved, but the workspace summary could not refresh. Reload the view to update its counts.');
        }
      }
    } catch (err) {
      if (!active() || isSessionEnded(err)) return;
      setErrors(previous => ({ ...previous, [key]: problem(err) + ' Reload the saved run to check whether the decision was recorded before submitting again.' }));
    } finally {
      savingNow.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <Header view={view} run={true} />
      {message ? <p className="notice" role="status">{message}</p> : null}<div className="actions drafting-toolbar"><a className="button" href={draftingBase(view.changeId, view.revisionId)}>All source drafts</a><button className="button" id="drafting-refresh-run" onClick={view.reload}>Reload saved run</button><a className="button" href={`/api/drafting-runs/${encodeURIComponent(run.id)}/export`}>Export drafting record</a></div>{notice ? <p className="notice warning" role="alert">{notice}</p> : null}
      <section className="panel drafting-section"><div className="panel-head"><div><h2>{text(run.source.reference)}</h2><p>Source version {text(run.source.version)}</p></div><div className="chip-row"><Badge text={statusLabel(run.status)} kind="candidate" /><Badge text={run.applicability} /></div></div><div className="panel-body">
        <dl className="support-list"><dt>Method</dt><dd>{methodLabel(run.method ?? engine['method'])}</dd><dt>Requested by</dt><dd>{text(run.createdBy)}</dd><dt>Requested at</dt><dd>{formatDate(run.createdAt)}</dd><dt>Source digest</dt><dd className="mono">{text(run.source.digest)}</dd>{engine['id'] ? <><dt>Generator</dt><dd>{text(engine['id'])}{engine['version'] ? ' · ' + text(engine['version']) : ''}</dd></> : null}{engine['provider'] ? <><dt>Provider</dt><dd>{text(engine['provider'])}</dd></> : null}{engine['model'] ? <><dt>Recorded model</dt><dd>{text(engine['model'])}</dd></> : null}{engine['requestedModel'] ? <><dt>Configured model</dt><dd>{text(engine['requestedModel'])}</dd></> : null}{engine['promptVersion'] ? <><dt>Prompt version</dt><dd>{text(engine['promptVersion'])}</dd></> : null}{engine['promptDigest'] ? <><dt>Prompt digest</dt><dd className="mono">{text(engine['promptDigest'])}</dd></> : null}{run.resultDigest ? <><dt>Result digest</dt><dd className="mono">{text(run.resultDigest)}</dd></> : null}</dl>
        <details className="guide-detail drafting-source"><summary>Read the saved source excerpt</summary><pre className="drafting-text">{text(run.source.text)}</pre></details>
        <p className="small muted">These digests identify stored content. They are not signatures or independent proof of source authenticity. Original suggestions and human decisions remain separate.</p>
        {(run.warnings ?? []).map((code, index) => <p className="notice warning" key={index}>{warningText(code)}</p>)}
        {run.failureCode ? <p className="notice warning" role="alert">{failureText(run.failureCode)} <span className="small">Reference: {text(run.id)}</span></p> : null}
        {run.status === 'GENERATING' ? <p className="notice" role="status">This request is still in progress. Use “Reload saved run” to inspect its state. Do not start another generation to recover a lost response.</p> : null}
      </div></section>
      <section className="panel drafting-section"><div className="panel-head"><div><h2>Review each suggestion</h2><p>{pending} awaiting decision · {suggestions.filter(item => item.status === 'CANDIDATE_CREATED').length} candidates created · {suggestions.filter(item => item.status === 'DISMISSED').length} dismissed</p></div></div><div className="panel-body drafting-scope-note"><p>Unconverted suggestions are preparation records. They are not declared obligations, evidence or passes. Each candidate you create enters the ordinary requirement workflow and becomes a declared scope gap until reviewed and supported.</p>{!owns ? <p>Only the requesting Author can create candidates or dismiss suggestions from this run.</p> : !context.isCurrentRevision || run.applicability !== 'CURRENT' ? <p>This run belongs to a historical revision. Its decisions cannot be changed here.</p> : null}</div>
        {suggestions.length ? suggestions.map((item, index) => <Suggestion key={item.id} item={item} index={index} actionable={actionable} view={view} saving={saving} errors={errors} decide={(event, suggestion, action) => void decide(event, suggestion, action)} />) : <div className="empty"><h3>{run.status === 'COMPLETED' ? 'No drafts were proposed' : 'No completed suggestions are available'}</h3><p>{run.status === 'COMPLETED' ? 'Review the source yourself and add any applicable obligations. An empty result does not establish complete scope.' : 'Inspect the saved run status. A failed or unfinished attempt is not an empty successful result.'}</p><ChangeLink view={view}>Open the change to add an obligation</ChangeLink></div>}</section>
    </>
  );
}
