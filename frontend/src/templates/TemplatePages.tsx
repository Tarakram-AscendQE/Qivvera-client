import { useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Badge, formatDate } from '../format';
import { isSessionEnded, text, type LegacyApi, type LegacyChange } from '../legacy-bridge';
import {
  Back, Boundary, changeLink, detailLink, Input, planLink, problem, saveLink, SourceRequirement, TabLink,
  useTemplateSave, type TemplateActions, type TemplateEntry
} from './shared';

export interface TemplateListItem {
  readonly id: unknown; readonly versionId: unknown; readonly state: unknown; readonly version: unknown; readonly name: unknown; readonly purpose: unknown;
  readonly checkCount: unknown; readonly adapterId: unknown; readonly createdBy: unknown; readonly createdAt: unknown;
}
export interface TemplateList { readonly items: readonly TemplateListItem[]; readonly total: number; readonly offset: number; readonly limit: number; readonly hasMore?: unknown }
export interface ScopeObligation { readonly id: string; readonly statement: unknown; readonly reviewStatus: unknown; readonly sourceReference?: unknown; readonly sourceVersion?: unknown; readonly version?: unknown }
export interface AssuranceContext {
  readonly isCurrent?: unknown; readonly scopeDigest?: unknown;
  readonly scope: { readonly changeId: string; readonly revisionId: string; readonly obligations: readonly ScopeObligation[] };
  readonly plan?: {
    readonly id: unknown; readonly version?: number; readonly approvedBy?: unknown; readonly current?: unknown;
    readonly snapshot?: { readonly schema?: unknown; readonly mappings: readonly { readonly obligationId: unknown; readonly checkId: unknown; readonly rationale: unknown }[]; readonly scope: { readonly obligations: readonly ScopeObligation[] } } | null;
  } | null;
  readonly checks: readonly { readonly id: unknown; readonly title: unknown; readonly version?: unknown; readonly rule?: unknown }[];
  readonly targets: readonly { readonly id: unknown; readonly name: unknown; readonly adapterId?: unknown }[];
}
export interface Destination {
  readonly change: { readonly id: string; readonly title: unknown; readonly isCurrentRevision?: unknown; readonly revision: { readonly id: string; readonly number: unknown } };
  readonly context: AssuranceContext;
}
export interface TemplateSnapshot {
  readonly name: unknown; readonly purpose: unknown; readonly adapterId: unknown; readonly reviewMode?: unknown; readonly entries: readonly TemplateEntry[];
  readonly createdBy: unknown; readonly createdAt: unknown; readonly rationale: unknown; readonly limitations?: readonly unknown[] | null;
  readonly source: { readonly planVersion: unknown; readonly approvedBy: unknown; readonly planRationale: unknown; readonly changeId: unknown; readonly revisionId: unknown; readonly sourceRevision: unknown; readonly planId: unknown; readonly planDigest: unknown; readonly scopeDigest: unknown };
  readonly profile: { readonly id: unknown; readonly version: unknown };
}
export interface TemplateReport {
  readonly schema: unknown;
  readonly family: { readonly id: string; readonly state: unknown; readonly stateVersion?: unknown; readonly archivedBy?: unknown; readonly archivedAt?: unknown; readonly archiveRationale?: unknown };
  readonly version: { readonly id: string; readonly number: number; readonly digest: unknown; readonly snapshot: TemplateSnapshot };
  readonly history: readonly { readonly id: unknown; readonly number: number; readonly name: unknown; readonly createdBy: unknown; readonly createdAt: unknown }[];
}

/** Only the newest saved version can be reused. */
export const latestNumber = (report: TemplateReport): number => Math.max(report.version.number, ...report.history.map(item => item.number));

export function ListView({ list, dest, includeArchived, changeId, revisionId, canPolicy, founderReview, actions }: {
  list: TemplateList; dest: Destination | null; includeArchived: boolean; changeId: string | null; revisionId: string | null;
  canPolicy: boolean; founderReview: boolean; actions: TemplateActions;
}) {
  const choosing = !!dest, current = dest?.change.isCurrentRevision && dest?.context.isCurrent;
  const pageLink = (position: number) => choosing ? `${planLink(changeId, revisionId)}/page/${position}` : `#/verification-templates/page/${position}${includeArchived ? '/all' : ''}`;
  return (
    <>
      {dest && changeId && revisionId ? <Back changeId={changeId} revisionId={revisionId} actions={actions} /> : null}<div className="heading template-heading"><div><div className="eyebrow">Reusable verification approaches</div><h1>{choosing ? 'Choose a verification template' : 'Verification templates'}</h1><p className="sub">{dest ? text(dest.change.title) + ' · Revision ' + text(dest.change.revision.number) : 'Inspect saved approaches, their original requirements and their version history.'}</p></div><button className="button" id="template-refresh" onClick={actions.reload}>Refresh templates</button></div><Boundary founderReview={founderReview} />
      {choosing && !current ? <div className="notice warning"><strong>Historical revision · read-only</strong><span>Open the current revision to prepare a new plan.</span></div> : null}
      {choosing && !canPolicy ? <div className="notice"><span>You can inspect templates. A Policy Authority must approve a fresh verification plan.</span></div> : null}
      {list.limit < 20 ? <div className="notice"><span>Large saved histories: showing a smaller page. Use Next to inspect the remaining templates.</span></div> : null}
      <section className="panel template-section"><div className="panel-head"><div><h2>{includeArchived ? 'Saved template history' : 'Active templates'}</h2><p>{text(list.total)} template{list.total === 1 ? '' : 's'} in this view. Saving a template does not establish coverage for another change.</p></div>{!choosing ? <a className="button" href={includeArchived ? '#/verification-templates' : '#/verification-templates/page/0/all'}>{includeArchived ? 'Show active templates' : 'Include archived templates'}</a> : null}</div>
        {list.items.length ? list.items.map((item, index) => <article className="template-card" data-template-id={text(item.id)} key={index}><div className="chip-row"><Badge text={item.state} /><Badge text={'VERSION ' + String(item.version)} /></div><h3><a href={detailLink(item.id, item.versionId)}>{text(item.name)}</a></h3><p className="template-text">{text(item.purpose)}</p><p className="small muted">{text(item.checkCount)} supported check{item.checkCount === 1 ? '' : 's'} · Adapter {text(item.adapterId)}<br />Saved by {text(item.createdBy)} · {formatDate(item.createdAt)}</p><div className="actions"><a className="button" href={detailLink(item.id, item.versionId)}>Inspect template</a>{choosing && current && canPolicy && item.state === 'ACTIVE' ? <a className="button primary" href={planLink(changeId, revisionId, item.id, item.versionId)}>Review new mappings</a> : null}</div></article>) : <div className="empty"><h3>No templates in this view</h3><p>A Policy Authority can save a template from a current approved verification plan. Open a change’s Assurance section to begin.</p><a className="button" href="#/changes">Open changes</a></div>}
        <div className="panel-body template-pagination"><p className="small">{list.items.length ? `Showing ${list.offset + 1}–${Math.min(list.offset + list.items.length, list.total)} of ${list.total}.` : 'No saved templates on this page.'}</p><div className="actions">{list.offset > 0 ? <a className="button" href={pageLink(Math.max(0, list.offset - list.limit))}>Previous templates</a> : null}{list.hasMore ? <a className="button" href={pageLink(list.offset + list.limit)}>Next templates</a> : null}</div></div></section>
      {!choosing ? <p className="small muted">To reuse a template, open a current change’s Assurance section and choose “Use a template”. Template source and purpose may contain business information.</p> : null}
    </>
  );
}

function MaintainTemplate({ report, templateId, changes, api, actions }: { report: TemplateReport; templateId: string; changes: readonly LegacyChange[]; api: LegacyApi; actions: TemplateActions }) {
  const [choosing, setChoosing] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const archiveForm = useRef<HTMLFormElement>(null);
  const archive = useTemplateSave({
    actions, label: 'Confirm archive', recovery: 'Refresh this template to inspect whether the archive decision was saved.',
    data: form => ({ expectedVersion: report.version.number, expectedStateVersion: report.family.stateVersion, rationale: (form.elements.namedItem('archiveRationale') as HTMLTextAreaElement).value }),
    submit: (data, requestKey) => api(`/api/verification-templates/${encodeURIComponent(templateId)}/archive`, { method: 'POST', data: { ...data, requestKey } }),
    onSaved: () => detailLink(templateId)
  });

  async function chooseSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!actions.active() || !form.reportValidity()) return;
    setChoosing(true);
    try {
      const change = await api(`/api/changes/${encodeURIComponent((form.elements.namedItem('sourceChange') as HTMLSelectElement).value)}`) as { id: unknown; revision: { id: unknown } };
      if (actions.active()) location.hash = saveLink(change.id, change.revision.id, templateId);
    } catch (error) {
      if (actions.active() && !isSessionEnded(error)) setSourceError(problem(error));
    } finally {
      setChoosing(false);
    }
  }

  function showArchive() {
    if (!actions.active()) return;
    flushSync(() => setArchiving(true));
    (archiveForm.current?.elements.namedItem('archiveRationale') as HTMLTextAreaElement | null)?.focus();
  }

  return (
    <section className="panel template-section"><div className="panel-head"><h2>Maintain this template</h2></div><div className="panel-body"><p>A new version must come from a current approved plan. Older versions remain unchanged and cannot be selected for new reuse once superseded.</p><form id="template-version-source" onSubmit={event => void chooseSource(event)}><div className="form-error" role="alert">{sourceError}</div><div className="form-field"><label htmlFor="sourceChange">Change containing the current approved plan</label><select id="sourceChange" name="sourceChange" required><option value="">Choose a change</option>{changes.map(change => <option value={change.id} key={change.id}>{text(change.title)}</option>)}</select></div><button className="button" type="submit" disabled={choosing}>Prepare new template version</button></form><hr /><button className="button" id="template-show-archive" hidden={archiving} onClick={showArchive}>Archive template</button><form id="template-archive-form" hidden={!archiving} onSubmit={archive.onSubmit} ref={archiveForm}><div className="form-error" role="alert">{archive.error}</div><p>Archiving prevents new reuse. It does not cancel or invalidate plans already approved from this template.</p><Input name="archiveRationale" label="Reason for archiving" multiline hint="At least 10 characters." disabled={archive.busy} /><button className="button" type="submit" disabled={archive.busy}>{archive.buttonText}</button></form></div></section>
  );
}

export function DetailView({ report, templateId, canPolicy, founderReview, changes, api, actions, download }: {
  report: TemplateReport; templateId: string; canPolicy: boolean; founderReview: boolean; changes: readonly LegacyChange[];
  api: LegacyApi; actions: TemplateActions; download(): void;
}) {
  const snapshot = report.version.snapshot, latest = report.version.number === latestNumber(report);
  const editable = report.family.state === 'ACTIVE' && latest && canPolicy;
  return (
    <>
      <a className="back" href="#/verification-templates">← Verification templates</a><div className="heading template-heading"><div><div className="eyebrow">Saved verification approach · Version {text(report.version.number)}</div><h1>{text(snapshot.name)}</h1><p className="sub template-text">{text(snapshot.purpose)}</p></div><div className="actions"><button className="button" id="template-refresh" onClick={actions.reload}>Refresh template</button><button className="button" id="template-download" onClick={download}>Download template version</button></div></div><Boundary founderReview={founderReview} />
      <div className="chip-row"><Badge text={report.family.state} /><Badge text={latest ? 'LATEST VERSION' : 'HISTORICAL VERSION'} /></div>
      {!latest ? <div className="notice warning"><span>This version is historical and cannot be reused for a new plan. <a href={detailLink(templateId)}>Inspect the latest version →</a></span></div> : null}
      {report.family.state === 'ARCHIVED' ? <div className="notice warning"><strong>Archived template</strong><span>New reuse is blocked. Earlier versions and already approved plans remain in history.</span></div> : null}
      {snapshot.reviewMode === 'founder-review' ? <div className="notice warning"><strong>Source saved in founder-review mode</strong><span>The source approval does not establish independent human review.</span></div> : null}
      <section className="panel template-section" id="template-detail"><div className="panel-head"><h2>What this approach checks</h2><p>Adapter: {text(snapshot.adapterId)}. Reuse requires the same reviewed adapter and the exact supported check set.</p></div><div className="panel-body">{snapshot.entries.map((entry, index) => <article className="template-entry" key={index}><h3>{text(entry.check.title)}</h3><p className="template-text">{text(entry.check.rule)}</p><SourceRequirement entry={entry} /></article>)}</div></section>
      <section className="panel template-section"><div className="panel-head"><h2>Source and decision trail</h2></div><div className="panel-body"><p>Saved by {text(snapshot.createdBy)} · {formatDate(snapshot.createdAt)}</p><p className="template-text"><strong>Why this version was saved:</strong> {text(snapshot.rationale)}</p><p>Source plan {text(snapshot.source.planVersion)} · Approved by {text(snapshot.source.approvedBy)}</p><p className="template-text"><strong>Original plan rationale:</strong> {text(snapshot.source.planRationale)}</p><TabLink tab="assurance" className="button" href={changeLink(snapshot.source.changeId, snapshot.source.revisionId)} actions={actions}>Open source revision</TabLink><p className="small muted">The source revision view shows its latest recorded plan, which may differ from the original plan frozen in this template. The saved source is historical provenance. It does not approve use for another requirement, application or revision.</p><details className="guide-detail"><summary>Version identity and boundaries</summary><div><dl className="support-list"><dt>Version digest</dt><dd className="mono">{text(report.version.digest)}</dd><dt>Source revision</dt><dd className="mono">{text(snapshot.source.sourceRevision)}</dd><dt>Original source plan ID</dt><dd className="mono">{text(snapshot.source.planId)}</dd><dt>Original source plan digest</dt><dd className="mono">{text(snapshot.source.planDigest)}</dd><dt>Source scope digest</dt><dd className="mono">{text(snapshot.source.scopeDigest)}</dd><dt>Profile</dt><dd>{text(snapshot.profile.id)} / {text(snapshot.profile.version)}</dd></dl><ul>{(snapshot.limitations ?? []).map((item, index) => <li key={index}>{text(item)}</li>)}</ul><p className="small">The digest identifies content. It is not a signature, trusted timestamp or release approval.</p></div></details></div></section>
      <section className="panel template-section"><div className="panel-head"><h2>Version history</h2></div><div className="panel-body">{report.history.slice().sort((a, b) => b.number - a.number).map((item, index) => <article className="template-history" key={index}><a href={detailLink(templateId, item.id)}><strong>Version {text(item.number)} · {text(item.name)}</strong></a><p className="small">{text(item.createdBy)} · {formatDate(item.createdAt)}</p></article>)}{report.family.state === 'ARCHIVED' ? <><p><strong>Archived by:</strong> {text(report.family.archivedBy)} · {formatDate(report.family.archivedAt)}</p><p className="template-text">{text(report.family.archiveRationale)}</p></> : null}</div></section>
      {editable ? <MaintainTemplate report={report} templateId={templateId} changes={changes} api={api} actions={actions} /> : null}
      <p className="small muted">To reuse the latest active version, open the destination change’s Assurance section and choose “Use a template”.</p>
    </>
  );
}

function SaveForm({ dest, previous, changeId, revisionId, templateId, api, actions }: {
  dest: Destination; previous: TemplateReport | null; changeId: string; revisionId: string; templateId: string | null; api: LegacyApi; actions: TemplateActions;
}) {
  const { context } = dest, plan = context.plan!;
  const save = useTemplateSave({
    actions, label: previous ? 'Save new template version' : 'Save template', recovery: 'Use “Check saved templates” before submitting another save.',
    data: form => {
      const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value;
      return { sourceChangeId: changeId, sourceRevisionId: revisionId, sourcePlanId: plan.id, sourceScopeDigest: context.scopeDigest, name: value('templateName'), purpose: value('templatePurpose'), rationale: value('templateRationale'), acknowledgeLimits: (form.elements.namedItem('acknowledgeLimits') as HTMLInputElement).checked, ...(previous ? { expectedVersion: previous.version.number, expectedStateVersion: previous.family.stateVersion } : {}) };
    },
    submit: (data, requestKey) => api(`/api/verification-templates${templateId ? '/' + encodeURIComponent(templateId) + '/versions' : ''}`, { method: 'POST', data: { ...data, requestKey } }) as Promise<{ family: { id: unknown }; version: { id: unknown } }>,
    onSaved: report => detailLink(report.family.id, report.version.id)
  });
  return (
    <section className="panel template-section"><div className="panel-body"><form id="template-save-form" onSubmit={save.onSubmit}><div className="form-error" role="alert">{save.error}</div>{previous ? <p>Adding version {previous.version.number + 1} to <strong>{text(previous.version.snapshot.name)}</strong>. Version {previous.version.number} remains historical.</p> : null}<Input name="templateName" label="Template name" value={text(previous?.version.snapshot.name ?? '')} max={120} disabled={save.busy} /><Input name="templatePurpose" label="When should this approach be considered?" value={text(previous?.version.snapshot.purpose ?? '')} multiline hint="Explain the intended use and important limits. This is a reference, not a coverage claim." disabled={save.busy} /><Input name="templateRationale" label={previous ? 'Why is this new version needed?' : 'Why save this approach?'} multiline hint="At least 10 characters." disabled={save.busy} /><label className="acknowledge"><input type="checkbox" name="acknowledgeLimits" required disabled={save.busy} /> I confirm this is a reusable reference. Every new plan requires fresh requirement mapping, target selection and approval.</label><div className="actions"><button className="button primary" type="submit" disabled={save.busy}>{save.buttonText}</button><a className="button" href={previous ? detailLink(templateId) : '#/verification-templates'}>Check saved templates</a></div></form></div></section>
  );
}

export function SaveView({ dest, previous, allowed, changeId, revisionId, templateId, founderReview, api, actions }: {
  dest: Destination; previous: TemplateReport | null; allowed: boolean; changeId: string; revisionId: string; templateId: string | null;
  founderReview: boolean; api: LegacyApi; actions: TemplateActions;
}) {
  const { change, context } = dest, plan = context.plan, snapshot = plan?.snapshot;
  return (
    <>
      <Back changeId={changeId} revisionId={revisionId} actions={actions} /><div className="heading template-heading"><div><div className="eyebrow">Keep a reusable verification approach</div><h1>{previous ? 'Save a new template version' : 'Save verification template'}</h1><p className="sub">{text(change.title)} · Revision {text(change.revision.number)}</p></div><button className="button" id="template-refresh" onClick={actions.reload}>Reload source plan</button></div><Boundary founderReview={founderReview} />
      {allowed && plan && snapshot ? <><section className="panel template-section"><div className="panel-head"><h2>Review the source plan</h2></div><div className="panel-body"><p>Plan {text(plan.version)} · Approved by {text(plan.approvedBy)}</p><p>The saved version will retain these original mapped requirements, check definitions and rationales. Runtime credentials, target details and execution results are not copied.</p>{snapshot.mappings.map((mapping, index) => { const requirement = snapshot.scope.obligations.find(item => item.id === mapping.obligationId), check = context.checks.find(item => item.id === mapping.checkId); return <article className="template-entry" key={index}><h3>{text(check?.title ?? mapping.checkId)}</h3><p className="template-text">{text(requirement?.statement ?? mapping.obligationId)}</p><p className="small">{text(requirement?.sourceReference)} · {text(requirement?.sourceVersion)}</p><p className="template-text">{text(mapping.rationale)}</p></article>; })}<p className="small muted">Template reuse cannot remove other mandatory obligations from a future plan.</p></div></section><SaveForm dest={dest} previous={previous} changeId={changeId} revisionId={revisionId} templateId={templateId} api={api} actions={actions} /></>
        : <section className="panel template-section"><div className="panel-body"><h2>A current approved plan is required</h2><p>A Policy Authority can save a template from a current version 2 verification plan. Reload the source, review its requirements and target, and approve a current mapping first. Archived templates cannot receive another version.</p><TabLink tab="assurance" className="button" href={changeLink(changeId, revisionId)} actions={actions}>Inspect verification plan</TabLink></div></section>}
    </>
  );
}

function PlanForm({ report, dest, accepted, targets, changeId, revisionId, templateId, versionId, api, actions }: {
  report: TemplateReport; dest: Destination; accepted: readonly ScopeObligation[]; targets: Destination['context']['targets'];
  changeId: string; revisionId: string; templateId: string; versionId: string; api: LegacyApi; actions: TemplateActions;
}) {
  const snapshot = report.version.snapshot, { context } = dest;
  const [selected, setSelected] = useState<Readonly<Record<string, string>>>({});
  const approve = useTemplateSave({
    actions, label: 'Approve new plan', recovery: 'Use “Check saved verification plan” before requesting another approval.',
    data: form => {
      const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
      return { revisionId, scopeDigest: context.scopeDigest, expectedPlanVersion: context.plan?.version ?? 0, targetId: value('templateTarget'), mappings: snapshot.entries.map(entry => ({ checkId: entry.check.id, obligationId: value('map_' + entry.check.id), rationale: value('reason_' + entry.check.id) })), rationale: value('planRationale'), acknowledgeLimits: (form.elements.namedItem('acknowledgeLimits') as HTMLInputElement).checked };
    },
    submit: (data, requestKey) => api(`/api/changes/${encodeURIComponent(changeId)}/assurance-plan`, { method: 'POST', data: { ...data, templateUse: { templateId, versionId, templateDigest: report.version.digest, requestKey } } }),
    onSaved: () => { actions.selectTab('assurance'); return changeLink(changeId, revisionId); }
  });

  /** Each check needs a distinct accepted obligation; no semantic equivalence is inferred. */
  function choose(form: HTMLFormElement, checkId: string) {
    if (!actions.active()) return;
    const select = (name: string) => form.elements.namedItem(name) as HTMLSelectElement;
    setSelected(previous => ({ ...previous, [checkId]: select('map_' + checkId).value }));
    const chosen = snapshot.entries.map(item => select('map_' + item.check.id).value);
    for (const item of snapshot.entries) {
      const field = select('map_' + item.check.id);
      field.setCustomValidity(field.value && chosen.filter(value => value === field.value).length > 1 ? 'Choose a different accepted obligation for each check.' : '');
    }
  }

  return (
    <section className="panel template-section"><div className="panel-body"><form id="template-plan-form" onSubmit={approve.onSubmit}><div className="form-error" role="alert">{approve.error}</div>
      {snapshot.entries.map(entry => {
        const choice = accepted.find(item => item.id === selected[entry.check.id]);
        return <fieldset data-template-check={entry.check.id} key={entry.check.id} disabled={approve.busy}><legend>{text(entry.check.title)}</legend><p className="template-text">{text(entry.check.rule)}</p><SourceRequirement entry={entry} /><div className="form-field"><label htmlFor={`map_${entry.check.id}`}>New accepted obligation for {text(entry.check.title)}</label><select id={`map_${entry.check.id}`} name={`map_${entry.check.id}`} required disabled={approve.busy} onChange={event => choose(event.currentTarget.form!, entry.check.id)}><option value="">Choose an accepted obligation explicitly</option>{accepted.map(obligation => <option value={obligation.id} key={obligation.id}>{text(obligation.statement)}</option>)}</select><small>Choose a distinct obligation for each check. No semantic equivalence is inferred.</small></div><div className="template-selected" data-template-selected={entry.check.id} aria-live="polite">{choice ? <><p className="template-text"><strong>Selected new requirement:</strong> {text(choice.statement)}</p><p className="small">{text(choice.sourceReference || 'No source reference')} · {text(choice.sourceVersion || 'No source version')} · Version {text(choice.version)}</p></> : null}</div><Input name={'reason_' + entry.check.id} label="Why does this check support the new requirement?" multiline hint="Write a fresh reason of at least 10 characters. The old rationale is a reference only." disabled={approve.busy} /></fieldset>;
      })}
      <div className="form-field"><label htmlFor="templateTarget">Approved target for this revision</label><select id="templateTarget" name="templateTarget" required disabled={approve.busy}><option value="">Choose a current approved target</option>{targets.map((target, index) => <option value={text(target.id)} key={index}>{text(target.name)} · {text(target.adapterId ?? 'approval-v1')}</option>)}</select><small>The target must match this application and source revision, using the template’s reviewed adapter.</small></div><Input name="planRationale" label="Reason for approving this new plan" multiline hint="At least 10 characters. Explain applicability and remaining limits." disabled={approve.busy} /><label className="acknowledge"><input type="checkbox" name="acknowledgeLimits" required disabled={approve.busy} /> I reviewed the exact check contracts, the new requirements and target, and all remaining mandatory scope. This approval creates no execution evidence.</label><div className="actions"><button className="button primary" type="submit" disabled={approve.busy}>{approve.buttonText}</button><TabLink tab="assurance" className="button" href={changeLink(changeId, revisionId)} actions={actions}>Check saved verification plan</TabLink></div>
    </form></div></section>
  );
}

export function PlanView({ report, dest, changeId, revisionId, templateId, versionId, canPolicy, founderReview, api, actions }: {
  report: TemplateReport; dest: Destination; changeId: string; revisionId: string; templateId: string; versionId: string;
  canPolicy: boolean; founderReview: boolean; api: LegacyApi; actions: TemplateActions;
}) {
  const snapshot = report.version.snapshot, { change, context } = dest;
  const accepted = context.scope.obligations.filter(item => item.reviewStatus === 'ACCEPTED');
  const required = context.scope.obligations.filter(item => item.reviewStatus !== 'REJECTED');
  const targets = context.targets.filter(item => (item.adapterId ?? 'approval-v1') === snapshot.adapterId);
  const latest = report.version.number === latestNumber(report);
  const compatible = snapshot.entries.every(entry => context.checks?.some(check => check.id === entry.check.id && check.version === entry.check.version && check.rule === entry.check.rule));
  const allowed = canPolicy && !!change.isCurrentRevision && !!context.isCurrent && latest && report.family.state === 'ACTIVE' && compatible && targets.length > 0 && accepted.length >= snapshot.entries.length;
  return (
    <>
      <Back changeId={changeId} revisionId={revisionId} actions={actions} /><div className="heading template-heading"><div><div className="eyebrow">Fresh verification-plan decision</div><h1>Review template mappings</h1><p className="sub">{text(change.title)} · Revision {text(change.revision.number)}</p></div><button className="button" id="template-refresh" onClick={actions.reload}>Reload approval inputs</button></div><Boundary founderReview={founderReview} />
      <section className="panel template-section"><div className="panel-head"><div><h2>{text(snapshot.name)} · Version {text(report.version.number)}</h2><p className="template-text">{text(snapshot.purpose)}</p></div><a className="button" href={detailLink(templateId, versionId)}>Inspect template source</a></div><div className="panel-body"><p><strong>{required.length} mandatory obligations remain in this revision.</strong> This template contains {snapshot.entries.length} supported checks. Requirements that are unaccepted or unmapped remain gaps.</p><p>No destination obligation, target or rationale has been selected for you. Similar wording and prior approvals do not establish applicability here.</p>{snapshot.reviewMode === 'founder-review' ? <p className="notice warning">This template was saved in founder-review mode. No independent source approval is claimed.</p> : null}</div></section>
      {allowed ? <PlanForm report={report} dest={dest} accepted={accepted} targets={targets} changeId={changeId} revisionId={revisionId} templateId={templateId} versionId={versionId} api={api} actions={actions} />
        : <section className="panel template-section"><div className="panel-body"><h2>This template cannot be approved for these inputs</h2><ul>{!canPolicy ? <li>A Policy Authority must make this decision.</li> : null}{!change.isCurrentRevision || !context.isCurrent ? <li>This revision is historical. Open the current revision.</li> : null}{!latest ? <li>This template version was superseded. Inspect the latest active version.</li> : null}{report.family.state !== 'ACTIVE' ? <li>The template is archived and cannot be reused.</li> : null}{!compatible ? <li>The configured check contracts no longer match this saved version. Ask the operator to investigate compatibility.</li> : null}{!targets.length ? <li>No current target uses the template’s reviewed adapter for this application and revision.</li> : null}{accepted.length < snapshot.entries.length ? <li>Each check needs a distinct accepted obligation. Complete requirement review first.</li> : null}</ul><a className="button" href={planLink(changeId, revisionId)}>Choose another template</a><TabLink tab="assurance" className="button" href={changeLink(changeId, revisionId)} actions={actions}>Inspect verification plan</TabLink></div></section>}
    </>
  );
}
