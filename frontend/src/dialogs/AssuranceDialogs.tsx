import { Badge } from '../format';
import { text, type Api } from '../shell-contract';
import type { ChangeObligation, ChangeRecord } from '../change/types';
import { findingReason, spaced } from '../change/labels';
import { SourceButtons, type RunForResolution } from '../resolution/parts';
import { resultKind } from '../workspace/rows';
import { Field, FormDialog, type DialogEnvironment } from './FormDialog';

export interface PlanTarget { readonly id: unknown; readonly name: unknown; readonly adapterId?: unknown }
export interface PlanCheck { readonly id: string; readonly title: unknown; readonly rule: unknown }
export interface PlanContext {
  readonly scopeDigest?: unknown; readonly targets: readonly PlanTarget[]; readonly checks?: readonly PlanCheck[] | null;
  readonly profile: { readonly rule?: unknown }; readonly plan?: { readonly id?: unknown; readonly version?: unknown; readonly current?: unknown; readonly snapshot?: { readonly target?: { readonly name?: unknown } } } | null;
  readonly scope: { readonly changeId: string; readonly revisionId: string };
}

interface Common { readonly env: DialogEnvironment; readonly api: Api }

/** One supported check (version 1 profile): an authority decision about coverage, not a test result. */
export function SinglePlanDialog({ env, api, change, context, accepted }: Common & { change: ChangeRecord; context: PlanContext; accepted: readonly ChangeObligation[] }) {
  return (
    <FormDialog env={env} title="Approve verification mapping" description="This is an authority decision about coverage. The check writes isolated synthetic requests to an operator-approved test application." saveLabel="Approve plan"
      submit={async data => { await api(`/api/changes/${change.id}/assurance-plan`, { method: 'POST', data: { ...data, acknowledgeLimits: data['acknowledgeLimits'] === 'on', revisionId: change.revision.id, scopeDigest: context.scopeDigest, expectedPlanVersion: context.plan?.version ?? 0 } }); }}>
      <div className="form-field"><label htmlFor="obligationId">Accepted obligation</label><select id="obligationId" name="obligationId">{accepted.map(o => <option value={o.id} key={o.id}>{text(o.statement)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="targetId">Approved test target</label><select id="targetId" name="targetId">{context.targets.map((target, index) => <option value={text(target.id)} key={index}>{text(target.name)}</option>)}</select></div>
      <div className="review-summary"><h3>What this verifier actually establishes</h3><p>{text(context.profile.rule)}</p><p className="small">Only the described interface and identities are exercised. Every other non-rejected obligation remains mandatory and will be reported as a gap if unsupported.</p></div>
      <Field id="rationale" label="Why does this check support the obligation?" type="textarea" hint="Explain the mapping and accepted limitations; at least 10 characters." required />
      <label className="acknowledge"><input type="checkbox" name="acknowledgeLimits" required /> I accept this declared scope and its limitations. The target binding is not an independent build attestation.</label>
    </FormDialog>
  );
}

/** One or two supported checks; each needs a distinct accepted obligation. Unmapped checks leave gaps. */
export function MultiPlanDialog({ env, api, context, accepted }: Common & { context: PlanContext & { checks: readonly PlanCheck[] }; accepted: readonly ChangeObligation[] }) {
  const { changeId, revisionId } = context.scope;
  return (
    <FormDialog env={env} title="Approve verification plan" description="One or two supported checks. Each needs a distinct accepted obligation; unmapped obligations cannot become supported." saveLabel="Approve plan"
      submit={async data => { await api(`/api/changes/${changeId}/assurance-plan`, { method: 'POST', data: { revisionId, scopeDigest: context.scopeDigest, expectedPlanVersion: context.plan?.version ?? 0, targetId: data['targetId'], rationale: data['rationale'], acknowledgeLimits: data['acknowledgeLimits'] === 'on', mappings: context.checks.filter(check => data['map_' + check.id]).map(check => ({ checkId: check.id, obligationId: data['map_' + check.id], rationale: data['reason_' + check.id] })) } }); }}>
      <div className="form-field"><label htmlFor="targetId">Approved test target</label><select name="targetId" id="targetId">{context.targets.map((target, index) => <option value={text(target.id)} key={index}>{text(target.name)} · {text(target.adapterId ?? 'approval-v1')}</option>)}</select></div>
      {context.checks.map(check => <fieldset key={check.id}><legend>{text(check.title)}</legend><p className="small">{text(check.rule)}</p><div className="form-field"><label htmlFor={`map_${check.id}`}>Accepted obligation to verify</label><select id={`map_${check.id}`} name={`map_${check.id}`}><option value="">Not mapped — any related mandatory obligation remains a gap</option>{accepted.map(o => <option value={o.id} key={o.id}>{text(o.statement)}</option>)}</select></div><Field id={'reason_' + check.id} label="Why does this check support the requirement?" type="textarea" hint="Required when mapped; at least 10 characters." /></fieldset>)}
      <Field id="rationale" label="Plan rationale" type="textarea" hint="Explain the selected scope and limitations." required />
      <label className="acknowledge"><input type="checkbox" name="acknowledgeLimits" required /> I acknowledge the exact contracts, exclusions and target-binding limitations.</label>
    </FormDialog>
  );
}

/** Queues the approved plan for the separate worker. One request key per dialog, so a retry cannot queue twice. */
export function RequestAssessmentDialog({ env, api, change, context, requestKey, openAssurance }: Common & { change: ChangeRecord; context: PlanContext; requestKey: string; openAssurance: () => void }) {
  return (
    <FormDialog env={env} title="Request assurance" description="A separate worker will execute the accepted plan. This does not run inside the browser or claim an immediate result." saveLabel="Queue assessment"
      submit={async () => { await api(`/api/changes/${change.id}/assessments`, { method: 'POST', data: { revisionId: change.revision.id, planId: context.plan?.id, requestKey } }); openAssurance(); }}>
      <div className="review-summary"><p>Target: {text(context.plan?.snapshot?.target?.name)}</p><p>Revision: <span className="mono">{text(change.sourceRevision)}</span></p><p>Only synthetic operations in the configured test environment are authorized.</p></div>
    </FormDialog>
  );
}

interface Observation { readonly step: unknown; readonly expected?: unknown; readonly observed?: unknown }
export interface AssessmentCase {
  readonly id: string; readonly status: string; readonly disposition?: string | null; readonly applicability: unknown; readonly evidenceIntegrity: unknown;
  readonly failureCode?: unknown; readonly workerId?: unknown; readonly finishedAt?: unknown;
  readonly case?: { readonly reason?: unknown; readonly findings?: readonly { readonly state: unknown; readonly statement: unknown; readonly reason: unknown }[] } | null;
  readonly evidence?: { readonly counterevidence?: readonly { readonly runId: unknown; readonly reason: unknown; readonly evidenceDigest: unknown }[] | null; readonly report?: { readonly observations?: readonly Observation[]; readonly reports?: readonly { readonly checkId: unknown; readonly obligationId: unknown; readonly report: { readonly observations: readonly Observation[] } }[] } } | null;
  readonly snapshot: {
    readonly target: { readonly sourceRevision: unknown; readonly artifactDigest: unknown; readonly environmentDigest: unknown; readonly instanceId: unknown };
    readonly scopeDigest: unknown; readonly verifier?: { readonly digest?: unknown } | null; readonly mappings?: readonly { readonly checkId: unknown; readonly verifier: { readonly digest: unknown } }[];
    readonly profile: { readonly id: unknown; readonly version: unknown; readonly exclusions: readonly unknown[]; readonly independence: { readonly binding: unknown; readonly evidence: unknown } };
  };
}

/** Two-check evidence lists each observation with its check and obligation. */
function observations(caseRecord: AssessmentCase): readonly Observation[] {
  const report = caseRecord.evidence?.report;
  if (report?.reports) return report.reports.flatMap(entry => entry.report.observations.map(o => ({ ...o, step: String(entry.checkId) + ' · ' + String(entry.obligationId).slice(0, 8) + ' · ' + String(o.step) })));
  return report?.observations ?? [];
}

/** The scope-bound assurance case: findings, unresolved contrary evidence, observations and the boundary. */
export function AssessmentCaseDialog({ record, close, resolution }: { record: AssessmentCase; close: () => void; resolution: { readonly canTrack: boolean } | null }) {
  const s = record.snapshot, items = observations(record), counter = record.evidence?.counterevidence;
  return (
    <>
      <div className="modal-head"><div><span className="eyebrow">Scope-bound assurance case</span><h2 id="modal-title">{spaced(record.disposition ?? record.status)}</h2></div><button className="close" data-close="" aria-label="Close dialog" onClick={close}>×</button></div>
      <div className="modal-body assurance-case">
        <div className="chip-row"><Badge text={record.applicability} /><Badge text={record.evidenceIntegrity} /></div><p>{findingReason(record.case?.reason ?? record.failureCode ?? 'The worker has not produced a complete accepted result.')}</p><div className="notice"><span>Readiness applies only to the frozen declared scope. Not universal safety, compliance, or an attested software supply chain.</span></div>
        <h3>Obligations and gaps</h3>{(record.case?.findings ?? []).map((finding, index) => <article className="run-card" key={index}><Badge text={finding.state} kind={resultKind(finding.state)} /><h4>{text(finding.statement)}</h4><p className="small">{findingReason(finding.reason)}</p></article>)}
        {counter?.length ? <><h3>Unresolved contrary evidence</h3><div className="notice warning">A later passing execution cannot erase an earlier valid counterexample for these inputs.</div>{counter.map((item, index) => <p className="small" key={index}>Run {text(item.runId)} · {findingReason(item.reason)}<br /><span className="mono">{text(item.evidenceDigest)}</span></p>)}</> : null}
        {resolution ? <div className="actions resolution-source"><SourceButtons run={record as unknown as RunForResolution} enabled={resolution.canTrack} /></div> : null}
        <h3>Expected versus observed</h3>{items.length ? items.map((item, index) => <details className="observation" key={index}><summary>{text(item.step)}</summary><div className="observation-grid"><div><span className="field-label">Expected</span><pre>{text(JSON.stringify(item.expected, null, 2))}</pre></div><div><span className="field-label">Observed</span><pre>{text(JSON.stringify(item.observed, null, 2))}</pre></div></div></details>) : <p>No observations available.</p>}
        <h3>Assurance boundary</h3><dl className="boundary"><dt>Source revision</dt><dd>{text(s.target.sourceRevision)}</dd><dt>Artifact digest</dt><dd>{text(s.target.artifactDigest)}</dd><dt>Environment digest</dt><dd>{text(s.target.environmentDigest)}</dd><dt>Instance</dt><dd>{text(s.target.instanceId)}</dd><dt>Scope digest</dt><dd>{text(s.scopeDigest)}</dd><dt>Profile</dt><dd>{text(s.profile.id)} / {text(s.profile.version)}</dd><dt>Verifier digest</dt><dd>{text(s.verifier?.digest ?? (s.mappings ?? []).map(m => String(m.checkId) + ': ' + String(m.verifier.digest)).join('; '))}</dd><dt>Worker</dt><dd>{text(record.workerId ?? 'Not yet claimed')}</dd><dt>Evidence cutoff</dt><dd>{text(record.finishedAt ?? 'Not completed')}</dd><dt>Excluded areas</dt><dd>{s.profile.exclusions.map(text).join('; ')}</dd><dt>Binding limitation</dt><dd>{text(s.profile.independence.binding)}</dd><dt>Integrity limitation</dt><dd>{text(s.profile.independence.evidence)}</dd></dl><a className="button" href={`/api/assessments/${record.id}/export`}>Export case JSON</a>
      </div>
    </>
  );
}
