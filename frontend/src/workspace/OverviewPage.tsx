import { ActivityRows, ChangeRows, type WorkspaceSummary } from './rows';

export interface Roles { readonly author: boolean; readonly authority: boolean }

/** Requirements, evidence and decisions stay distinct; repeated on workspace pages. */
export function DistinctRecordsNote() {
  return <div className="notice"><span className="symbol">i</span><span><strong>Requirements, evidence, and decisions stay distinct.</strong> Accepting a requirement does not establish software correctness. Run a supported assessment and inspect its declared scope.</span></div>;
}

function roleText({ author, authority }: Roles): string {
  if (author && authority) return 'You can author changes and record authority decisions. Independent review still requires an eligible different reviewer when you contributed to the requirement.';
  if (author) return 'You can register applications, describe changes, propose requirements and request assessments. A Policy Authority reviews requirements and approves verification plans.';
  if (authority) return 'You can review submitted requirements, approve verification plans and assess proposed corrections. An Author records the application, change and candidate requirements.';
  return 'You can inspect changes, decisions, evidence and history. Ask a named Author or Policy Authority to make changes; Viewer access does not allow saving decisions.';
}

function startingPoint(workspace: WorkspaceSummary, { author }: Roles): string {
  if (!workspace.applications.length) return author ? 'Register your first application, then create a change. A repository reference alone does not connect its source.' : 'No application has been registered. Ask an Author to prepare the first change; the guide explains what to look for.';
  if (!workspace.changes.length) return author ? 'Create a change for a registered application and record the outcome you expect.' : 'No change has been registered. Ask an Author to describe the first change, then open it here.';
  return 'Open a change to see its current revision, next step and any outstanding findings.';
}

function GettingStarted({ workspace, roles }: { workspace: WorkspaceSummary; roles: Roles }) {
  return <section className="panel getting-started" aria-labelledby="getting-started-title"><div className="panel-head"><div><span className="eyebrow">Getting started</span><h2 id="getting-started-title">Start with your role</h2></div><a className="button" href="#/guide">Read the product guide</a></div><div className="panel-body"><p>{roleText(roles)}</p><p><strong>Your starting point:</strong> {startingPoint(workspace, roles)}</p><p className="small muted">Use synthetic review data and operator-approved test targets. You can always return to Guide for terminology, supported checks and the full workflow.</p></div></section>;
}

function Step({ done, number, title, children }: { done: boolean; number: string; title: string; children: string }) {
  return <li><span className={`step ${done ? 'done' : ''}`}>{done ? '✓' : number}</span><div><strong>{title}</strong><p>{children}</p></div></li>;
}

/** The workspace starting point. Buttons carry data-action; the shell handles them. */
export function OverviewPage({ workspace, roles }: { workspace: WorkspaceSummary; roles: Roles }) {
  const { applications, changes } = workspace;
  return (
    <>
      <div className="heading"><div><div className="eyebrow">Independent Change Assurance</div><h1>Your assurance workspace</h1><p className="sub">A clear starting point for every consequential change.</p></div><div className="actions"><button className="button" data-action="new-application" disabled={!roles.author}>+ Register application</button><button className="button primary" data-action="new-change" disabled={!(applications.length && roles.author)}>+ New change</button></div></div>
      <DistinctRecordsNote />
      <GettingStarted workspace={workspace} roles={roles} />
      <div className="stats"><div className="stat"><span className="stat-label">Registered applications</span><span className="value">{applications.length}</span><small>Owned application records</small></div><div className="stat"><span className="stat-label">Registered changes</span><span className="value">{changes.length}</span><small>Each revision has its own assessment</small></div><div className="stat"><span className="stat-label">Changes with current evidence</span><span className="value">{changes.filter(change => change.disposition).length}</span><small>Open a change to inspect scope and gaps</small></div></div>
      <div className="grid"><section className="panel"><div className="panel-head"><div><h2>Changes to understand</h2><p>Start with intent. Keep the source revision explicit.</p></div><a className="small" href="#/changes">View all →</a></div><ChangeRows changes={changes.slice(0, 5)} workspace={workspace} canAuthor={roles.author} /></section><section className="panel"><div className="panel-head"><h2>Build your assurance context</h2></div><div className="panel-body"><ol className="checklist"><Step done={applications.length > 0} number="1" title="Register an application">Name the system and add its repository reference.</Step><Step done={changes.length > 0} number="2" title="Describe the change">Capture the intended outcome and declared revision.</Step><Step done={changes.some(change => (change.obligationCount ?? 0) > 0)} number="3" title="Propose obligations">Record what must be true. Nothing becomes authoritative automatically.</Step></ol><div className="inline-note">An authorized mapping defines the supported check. A separate worker collects actual observations.</div></div></section></div>
      <section className="panel"><div className="panel-head"><h2>Recent activity</h2><a className="small" href="#/activity">Open activity →</a></div><div className="panel-body"><ActivityRows items={workspace.activity.slice(0, 3)} /></div></section>
    </>
  );
}
