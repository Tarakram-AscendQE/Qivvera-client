import type { ReactNode } from 'react';
import { Badge } from '../format';
import { text } from '../legacy-bridge';
import { resultKind } from '../workspace/rows';
import { findingReason, spaced } from './labels';
import type { ChangeView } from './types';

const ACTIVE = ['QUEUED', 'RUNNING'];

function TabLink({ tab, children }: { tab: string; children: string }) {
  return <button className="link-button" data-action="tab" data-tab={tab}>{children}</button>;
}

/** One reasoned next step for the displayed revision; it never implies readiness on its own. */
function nextStep({ change, context, runs, assuranceError, roles: { author, authority } }: ChangeView): { message: string; action: ReactNode } {
  const latest = runs[0];
  const required = change.obligations.filter(o => o.reviewStatus !== 'REJECTED');
  const draft = required.some(o => o.reviewStatus === 'DRAFT' || o.reviewStatus === 'CLARIFICATION_REQUIRED');
  const pending = required.some(o => o.reviewStatus === 'IN_REVIEW');
  const current = latest?.applicability === 'CURRENT';
  if (!change.isCurrentRevision) return { message: 'You are viewing an earlier revision. Its decisions and evidence are retained for comparison; they do not establish the current revision’s result.', action: <a href={`#/changes/${change.id}`}>Open current revision →</a> };
  if (assuranceError) return { message: 'Assessment details could not be loaded. Refresh before relying on a displayed result. If the problem continues, use Support to give the workspace operator a request reference.', action: <button className="link-button" data-action="refresh-assurance">Reload assessment details</button> };
  if (latest && ACTIVE.includes(latest.status)) return { message: latest.status === 'QUEUED' ? 'Your assessment is queued. Keep this view open or refresh it to see progress. If it remains queued, ask the operator to check the separate worker; queuing does not confirm that the worker is available.' : 'Your assessment is running the approved checks. Wait for completion before interpreting evidence. Cancelling stops result acceptance; it cannot undo test operations already sent.', action: <TabLink tab="assurance">View assessment progress</TabLink> };
  if (current && latest.status === 'COMPLETED' && !latest.disposition) return { message: 'The completed record does not have an accepted disposition. Inspect its evidence integrity and ask the operator to investigate; a new passing run must not hide missing or damaged earlier evidence.', action: <TabLink tab="evidence">Inspect evidence</TabLink> };
  if (current && latest.disposition === 'NOT_READY') return { message: 'A required obligation has a valid violation. Inspect the expected and observed behaviour, record the correction, and obtain fresh evidence. Closing a resolution item does not change the original result.', action: <TabLink tab="evidence">Inspect the finding</TabLink> };
  if (current && latest.disposition === 'INDETERMINATE') return { message: 'There is not enough evidence for every required obligation. Inspect the findings to distinguish a requirement-review gap, an unsupported mapping or an execution problem. An unknown result must remain visible.', action: <TabLink tab="evidence">Inspect the gaps</TabLink> };
  if (current && latest.disposition === 'READY') return { message: 'Every non-rejected declared obligation is supported within this assessment’s frozen scope. Read the evidence and exclusions before making a separate release decision. A new revision or changed inputs requires fresh assessment.', action: <TabLink tab="evidence">Review the assurance case</TabLink> };
  if (!required.length) return { message: author ? 'Record at least one applicable obligation and its source. Rejected candidates remain in history; an empty scope does not prove readiness.' : 'Ask an Author to record the applicable obligations and their sources. Requirement acceptance and verification will follow separately.', action: <TabLink tab="obligations">Open obligations</TabLink> };
  if (draft) return { message: author ? 'Complete draft requirements, including their sources and versions, then request review. Clarification requests need an updated draft before resubmission.' : 'An Author must complete or clarify the remaining drafts and request review. A draft is not an accepted requirement.', action: <TabLink tab="obligations">Review obligation progress</TabLink> };
  if (pending) return { message: authority ? 'Review the submitted obligations and record why each applies, needs clarification or should be rejected. In independent mode, your own contributions need a different eligible reviewer.' : 'Requirements are awaiting a Policy Authority’s decision. You can inspect their sources and review history while waiting.', action: <TabLink tab="obligations">Open pending requirements</TabLink> };
  if (!context) return { message: 'The workflow can retain requirements, but assurance execution is not available in this workspace. Ask the operator to enable and verify the approved test setup.', action: <a href="#/support">Open workspace support →</a> };
  if (!context.targets.length) return { message: 'No approved test target matches this application and its full declared source revision. Ask the operator to configure the matching test target before a plan can be approved.', action: <TabLink tab="assurance">Inspect assurance setup</TabLink> };
  if (!context.plan?.current) return { message: authority ? 'Approve a current verification plan. Map supported checks only to requirements they actually establish; every other non-rejected obligation remains a visible gap.' : 'A Policy Authority must approve a current verification plan for these inputs. Earlier plans and results remain in history.', action: <TabLink tab="assurance">Open verification plan</TabLink> };
  if (latest && (latest.status === 'FAILED' || latest.status === 'CANCELLED')) return { message: 'The previous attempt produced no accepted disposition. Inspect the run and resolve its cause before explicitly requesting another assessment. Previous target operations may already have happened.', action: <TabLink tab="assurance">Inspect the previous run</TabLink> };
  return { message: author || authority ? 'The current plan can be submitted to the separate worker. Run assurance, then inspect every finding and the scope limitations. Unmapped obligations will remain gaps.' : 'A current plan is available. Ask an Author or Policy Authority to request the assessment, then inspect the resulting evidence.', action: <TabLink tab="assurance">Open assurance</TabLink> };
}

export function NextStep({ view }: { view: ChangeView }) {
  const { message, action } = nextStep(view);
  return <section className="next-step" aria-labelledby="next-step-title"><div><h2 id="next-step-title">What to do next</h2><p>{message}</p></div><div className="actions">{action}<a className="small" href="#/guide">Workflow guide</a></div></section>;
}

function bannerState({ runs, assuranceError }: ChangeView): { title: string; copy: string; kind: string } {
  const latest = runs[0];
  if (assuranceError) return { title: 'Assessment information unavailable', copy: 'No readiness claim can be made from this view. Reload or contact the deployment owner.', kind: '' };
  if (!latest) return { title: 'Not assessed', copy: 'No assessment has completed for these inputs.', kind: '' };
  if (latest.applicability === 'STALE_INPUTS') return { title: 'Reassessment required', copy: 'Earlier evidence belongs to different obligations, a plan, or target configuration. It remains in history.', kind: '' };
  if (latest.applicability === 'HISTORICAL_REVISION') return { title: 'Historical assessment', copy: 'This record applies to the selected earlier revision, not the current change.', kind: '' };
  if (latest.status === 'QUEUED') return { title: 'Queued', copy: 'Waiting for the separate assurance worker. No disposition has been issued.', kind: '' };
  if (latest.status === 'RUNNING') return { title: 'Running', copy: 'Executing the approved checks and their positive controls. No disposition is available until completion.', kind: '' };
  if (latest.status === 'COMPLETED' && latest.disposition) return { title: spaced(latest.disposition), copy: text(latest.case?.reason), kind: resultKind(latest.disposition) };
  return { title: latest.status === 'COMPLETED' ? 'Evidence integrity unresolved' : spaced(latest.status), copy: 'No disposition is available. ' + findingReason(latest.failureCode ?? latest.evidenceIntegrity ?? ''), kind: '' };
}

export function AssessmentBanner({ view }: { view: ChangeView }) {
  const latest = view.runs[0];
  const { title, copy, kind } = bannerState(view);
  return <section className={`status-panel ${kind}`}><div><span className="field-label">{latest?.applicability === 'CURRENT' ? 'Current assessment' : 'Assessment status'}</span><h2>{title}</h2><p>{copy}</p><p className="small">Scope-bound behavioural assessment. Not universal safety or release certification.</p></div><div className="chip-row"><Badge text={view.change.obligations.filter(o => o.reviewStatus === 'ACCEPTED').length + ' ACCEPTED'} />{latest ? <Badge text={latest.status} /> : null}</div></section>;
}

export function RunButton({ view }: { view: ChangeView }) {
  const active = view.runs.some(run => ACTIVE.includes(run.status));
  const enabled = !!view.change.isCurrentRevision && !!view.context?.plan?.current && !active && (view.roles.author || view.roles.authority);
  return <button className="button primary" data-action="run-assurance" disabled={!enabled} title="Requires a current authority-approved plan and a separately running worker">{active ? 'Assessment in progress' : 'Run assurance'}</button>;
}
