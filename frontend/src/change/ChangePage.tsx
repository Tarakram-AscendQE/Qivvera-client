import { text } from '../shell-contract';
import { ResolutionChangeTab } from '../resolution/parts';
import { shortRevision } from '../workspace/rows';
import { AssuranceTab, EvidenceTab } from './AssuranceTabs';
import { AssessmentBanner, NextStep, RunButton } from './Guidance';
import { HistoryTab, ObligationsTab, OverviewTab, RevisionsTab } from './RecordTabs';
import type { ChangeView } from './types';

function TabBody({ view }: { view: ChangeView }) {
  switch (view.tab) {
    case 'overview': return <OverviewTab view={view} />;
    case 'obligations': return <ObligationsTab view={view} />;
    case 'assurance': return <AssuranceTab view={view} />;
    case 'evidence': return <EvidenceTab view={view} />;
    case 'revisions': return <RevisionsTab view={view} />;
    case 'history': return <HistoryTab view={view} />;
    case 'resolutions': return view.resolution ? <ResolutionChangeTab state={view.resolution} /> : <div className="notice">Resolution is not enabled on this deployment.</div>;
    default: return null;
  }
}

type StepState = 'done' | 'now' | 'bad' | 'todo';
interface Step { readonly tab: string; readonly label: string; readonly sub: string; readonly state: StepState }

const ACTIVE = ['QUEUED', 'RUNNING'];

/**
 * The workflow as steps, each opening one section of the change. States come only from recorded
 * requirements, the current plan and the latest current assessment; a step is never marked done
 * on the strength of a later step's hope.
 */
function steps(view: ChangeView): readonly Step[] {
  const { change, runs, context, workspace } = view;
  const required = change.obligations.filter(o => o.reviewStatus !== 'REJECTED');
  const drafts = required.filter(o => o.reviewStatus === 'DRAFT' || o.reviewStatus === 'CLARIFICATION_REQUIRED').length;
  const inReview = required.filter(o => o.reviewStatus === 'IN_REVIEW').length;
  const accepted = required.filter(o => o.reviewStatus === 'ACCEPTED').length;
  const latest = runs[0], current = latest?.applicability === 'CURRENT';
  const requirementsDone = accepted > 0 && !drafts && !inReview;
  const requirements: Step = {
    tab: 'obligations', label: 'Requirements', state: requirementsDone ? 'done' : 'todo',
    sub: !required.length ? 'None yet' : drafts ? `${drafts} ${drafts === 1 ? 'draft' : 'drafts'}` : inReview ? `${inReview} in review` : accepted ? `${accepted} accepted` : 'All rejected'
  };
  const checked = current && latest!.status === 'COMPLETED';
  const plan: Step = {
    tab: 'assurance', label: 'Plan & check', state: checked ? 'done' : 'todo',
    sub: !accepted ? 'Needs an accepted requirement' : current && ACTIVE.includes(latest!.status) ? (latest!.status === 'QUEUED' ? 'Check queued' : 'Check running')
      : checked ? 'Checked' : context?.plan?.current ? 'Plan approved · ready to run' : 'Plan needed'
  };
  const disposition = checked ? latest!.disposition : null;
  const result: Step = {
    tab: 'evidence', label: 'Result',
    state: disposition === 'READY' ? 'done' : disposition === 'NOT_READY' ? 'bad' : 'todo',
    sub: disposition === 'READY' ? 'Ready' : disposition === 'NOT_READY' ? 'Not ready' : disposition === 'INDETERMINATE' ? 'Can’t decide yet' : checked ? 'No accepted result' : 'No result yet'
  };
  const list: Step[] = [{ tab: 'overview', label: 'Describe', sub: 'Done', state: 'done' }, requirements, plan, result];
  if (workspace.capabilities['resolutionWorkflow']) list.push({ tab: 'resolutions', label: 'Resolutions', sub: disposition === 'NOT_READY' ? 'Track the fix here' : 'Fixes for failed checks', state: 'todo' });
  // The first unfinished step of the main flow is "now"; a failed result stays red.
  const next = list.slice(1, 4).find(step => step.state === 'todo');
  return list.map(step => (step === next ? { ...step, state: 'now' as const } : step));
}

/** The step bar. Each step is a button that opens its section; the status line sits beside it so the button's name stays the step's name. */
function StepTracker({ view }: { view: ChangeView }) {
  return (
    <section className="flow-card">
      <nav aria-label="Change steps">
        <ol className="flow-steps">
          {steps(view).map((step, index) => (
            <li key={step.tab} className={`flow-step flow-${step.state}${view.tab === step.tab ? ' selected' : ''}`}>
              <button type="button" data-action="tab" data-tab={step.tab} aria-current={view.tab === step.tab ? 'step' : undefined}>
                <span className="flow-dot" aria-hidden="true">{step.state === 'done'
                  ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
                  : step.state === 'bad' ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg> : index + 1}</span>
                {step.label}
              </button>
              <span className="flow-sub">{step.sub}</span>
            </li>
          ))}
        </ol>
      </nav>
      <nav className="records" aria-label="Records">
        <span>Records</span>
        {['revisions', 'history'].map(tab => <button key={tab} type="button" className={view.tab === tab ? 'active' : ''} data-action="tab" data-tab={tab} aria-current={view.tab === tab ? 'page' : undefined}>{tab === 'revisions' ? 'Revisions' : 'History'}</button>)}
      </nav>
    </section>
  );
}

/** One change revision: its declared context, requirements, plan, evidence and history. Buttons act through data-action. */
export function ChangePage({ view }: { view: ChangeView }) {
  const { change, workspace } = view, current = !!change.isCurrentRevision, canEdit = view.roles.author && current;
  const application = workspace.applications.find(app => app.id === change.applicationId);
  return (
    <>
      <a className="back" href="#/changes">← Changes</a>
      <div className="heading">
        <div>
          <h1>{text(change.title)}</h1>
          <p className="change-meta"><span>{text(application?.name)}</span><span>Revision {text(change.revision.number)} · <span className="mono">{shortRevision(change.sourceRevision)}</span></span><span>Declared, not verified</span></p>
        </div>
        <div className="actions">{workspace.capabilities['revisionImpact'] ? <a className="button" href={`#/impact/${change.id}/${change.revision.id}`}>Impact &amp; next checks</a> : null}<button className="button" data-action="new-revision" disabled={!canEdit}>+ New revision</button><RunButton view={view} /></div>
      </div>
      {!current ? <div className="notice warning"><strong>Historical revision · read-only</strong><span><a href={`#/changes/${change.id}`}>Open current revision →</a></span></div> : null}
      {view.session.reviewMode === 'founder-review' ? <div className="notice warning"><strong>Founder-review mode</strong><span>Same-person decisions are permitted and labelled. They do not establish independent approval.</span></div> : null}
      <StepTracker view={view} />
      <div className="change-summary"><AssessmentBanner view={view} /><NextStep view={view} /></div>
      <TabBody view={view} />
    </>
  );
}
