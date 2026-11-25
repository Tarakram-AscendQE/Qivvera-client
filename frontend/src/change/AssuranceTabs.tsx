import { Badge, formatDate } from '../format';
import { text } from '../shell-contract';
import { resultKind } from '../workspace/rows';
import { findingReason, spaced } from './labels';
import type { AssuranceContext, ChangeView, PlanMapping } from './types';

const mappingsOf = (snapshot: { readonly mappings?: readonly PlanMapping[]; readonly mapping?: PlanMapping }): readonly (PlanMapping | undefined)[] => snapshot.mappings ?? [snapshot.mapping];

function Plan({ context }: { context: AssuranceContext }) {
  const plan = context.plan;
  if (!plan) return <><h3>No mapping has been accepted</h3><p>A Policy Authority must confirm which accepted obligation this verifier supports. Merely choosing a test does not establish coverage.</p>{context.targets.length ? null : <div className="notice warning">No configured target matches this application and full source revision. Ask the deployment owner to register the test target.</div>}</>;
  return (
    <>
      <Badge text={plan.current ? 'CURRENT PLAN' : 'STALE PLAN'} kind={plan.current ? 'candidate' : 'finding-gap'} /><h3>{text(plan.snapshot.profile.title)}</h3>
      {mappingsOf(plan.snapshot).map((mapping, index) => <article className="run-card" key={index}><strong>{text(mapping?.checkId ?? 'separation')}</strong><p>{text(context.scope.obligations.find(o => o.id === mapping?.obligationId)?.statement ?? mapping?.obligationId)}</p><p className="small">{text(mapping?.rationale)}</p></article>)}
      <p className="small">Approved by {text(plan.approvedBy)} · Plan {text(plan.version)}</p><div className="detail-value">Target: {text(plan.snapshot.target.name)}</div><p className="small mono">{text(plan.snapshot.target.sourceRevision)}</p>
    </>
  );
}

function TemplateActions({ view, context }: { view: ChangeView; context: AssuranceContext }) {
  const { change } = view, plan = context.plan;
  return <div className="actions template-plan-actions">{context.isCurrent ? <a className="button" href={`#/template-plan/${change.id}/${change.revision.id}`}>Use a template</a> : null}{view.roles.authority && context.isCurrent && plan?.current && plan.snapshot.schema === 'qivvera.assurance-plan/2' ? <a className="button" href={`#/template-save/${change.id}/${change.revision.id}`}>Save as template</a> : null}<a className="button" href="#/verification-templates">Browse templates</a></div>;
}

function Runs({ view }: { view: ChangeView }) {
  const canAct = view.roles.author || view.roles.authority;
  if (!view.runs.length) return <p>No assessment requested. A run will appear here only after an Author or Policy Authority requests one using the current approved plan.</p>;
  return <>{view.runs.map(run => <article className="run-card" key={run.id}><div className="chip-row"><Badge text={run.status} />{run.disposition ? <Badge text={spaced(run.disposition)} kind={resultKind(run.disposition)} /> : null}</div><p className="small">{formatDate(run.queuedAt)}</p><p className="small">{spaced(run.applicability)}</p><button className="link-button" data-action="open-assessment" data-id={run.id}>Open assurance case →</button>{(run.status === 'QUEUED' || run.status === 'RUNNING') && canAct ? <button className="link-button" data-action="cancel-assessment" data-id={run.id}>Cancel acceptance</button> : null}</article>)}</>;
}

export function AssuranceTab({ view }: { view: ChangeView }) {
  const context = view.context;
  if (!context) return <section className="panel"><div className="empty"><h2>Assurance setup is not available</h2><p>{view.assuranceError ?? 'The deployment owner must enable the protected target catalogue and separate worker. Requirement review remains available.'}</p></div></section>;
  const plan = context.plan, required = context.scope.obligations.filter(o => o.reviewStatus !== 'REJECTED');
  const templateUse = plan?.templateUse;
  return (
    <div className="grid"><section className="panel"><div className="panel-head"><div><h2>Approved verification plan</h2><p>Explicit supported mappings. Every non-rejected obligation stays in scope.</p></div><button className="button" data-action="configure-plan" disabled={!(view.roles.authority && context.isCurrent && context.targets.length)}>{plan ? 'Revise mapping' : 'Configure mapping'}</button></div><div className="panel-body"><Plan context={context} />
      {view.workspace.capabilities['verificationTemplates'] ? <TemplateActions view={view} context={context} /> : null}
      {templateUse ? <div className="review-summary template-use-receipt"><h3>Template reference</h3><a href={`#/verification-templates/${text(templateUse.templateId)}/versions/${text(templateUse.versionId)}`}>{text(templateUse.name)} · Version {text(templateUse.version)}</a><p className="small">Fresh plan approved by {text(templateUse.usedBy)} · {formatDate(templateUse.usedAt)}. No prior evidence or approval transfers.</p></div> : null}
      <div className="inline-note">{required.length} required obligation(s). Unaccepted or unmapped obligations produce visible gaps; they are not silently omitted.</div>
      <h3>Declared limitations</h3><p className="small">{context.profile.exclusions.map(text).join(' · ')}</p><p className="small">Target identity is operator-pinned and target-reported, not independently attested.</p></div></section>
      <aside className="panel"><div className="panel-head"><h2>Assessment runs</h2><button className="link-button" data-action="refresh-assurance">Refresh</button></div><div className="panel-body"><Runs view={view} /></div></aside></div>
  );
}

/** Actual observations, tied to a frozen revision, scope, target and verifier; plans are not evidence. */
/** The route from a failed check to Ready. A later pass on the same commit never clears the failure. */
function FixPath({ resolution }: { resolution: boolean }) {
  const steps: readonly [string, string][] = [
    [resolution ? 'Track the fix' : 'Record what went wrong', resolution ? 'Open Resolutions and create an item from this result.' : 'Describe the failure so the developer can correct it.'],
    ['Ship a corrected commit', 'Add it as a new revision of this change.'],
    ['Check the new revision', 'Same requirement, same check, fresh evidence.'],
    ['Independent verification', 'Someone who did not track, fix or own it confirms the correction.']
  ];
  return <aside className="fix-path" aria-labelledby="fix-path-title"><h2 id="fix-path-title">How to get to Ready</h2><ol>{steps.map(([title, copy], index) => <li key={title}><span className="fix-num" aria-hidden="true">{index + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></li>)}</ol><p className="small">This failure stays on record for the checked commit. A later pass on the same commit does not hide it.</p></aside>;
}

export function EvidenceTab({ view }: { view: ChangeView }) {
  const runs = view.runs.filter(run => run.evidence || run.evidenceIntegrity === 'DIGEST_MISMATCH');
  const latest = view.runs[0];
  const failed = latest?.applicability === 'CURRENT' && latest.status === 'COMPLETED' && latest.disposition === 'NOT_READY';
  const evidence = <EvidenceList runs={runs} />;
  return failed ? <div className="evidence-layout">{evidence}<FixPath resolution={!!view.resolution} /></div> : evidence;
}

function EvidenceList({ runs }: { runs: ChangeView['runs'] }) {
  return <section className="panel"><div className="panel-head"><div><h2>Execution evidence</h2><p>Actual observations, tied to a frozen revision, scope, target, and verifier.</p></div></div><div className="panel-body">{runs.length ? runs.map(run => { const report = run.evidence?.report; return <article className="run-card" key={run.id}><div className="chip-row"><Badge text={run.evidenceIntegrity} /><Badge text={run.applicability} />{run.evidence ? <Badge text={report?.outcome ?? 'MULTIPLE FINDINGS'} kind={resultKind(report?.outcome)} /> : null}</div><p>{findingReason(report?.reason ?? (report?.reports ? 'Inspect the evidence for each mapped obligation.' : null) ?? 'Evidence failed its content-digest check. No disposition is accepted.')}</p><p className="small mono">{text(run.evidenceDigest ?? '')}</p><button className="button" data-action="open-assessment" data-id={run.id}>Inspect expected vs observed</button></article>; }) : <div className="empty"><h3>No execution evidence yet</h3><p>Accepted requirements and saved plans are not execution evidence.</p></div>}</div></section>;
}
