import { useState } from 'react';
import { Badge, formatDate } from '../format';
import { text } from '../shell-contract';
import type { Roles } from './OverviewPage';
import { ActivityRows, ChangeRows, shortRevision, type WorkspaceChange, type WorkspaceSummary } from './rows';
import { changeStage, isMyTurn, waitingOnLabel } from './stage';
import { PullRequestsPanel, PullsNotConnected, SourceEventsPanel, type SourceServices } from './SourcePanels';

type Application = WorkspaceSummary['applications'][number] & { readonly description?: unknown };

export function ApplicationsPage({ workspace, roles }: { workspace: WorkspaceSummary; roles: Roles }) {
  const applications = workspace.applications as readonly Application[];
  return (
    <>
      <div className="heading"><div><h1>Applications</h1><p className="sub">The systems whose changes you will assure.</p></div><div className="actions"><button className="button" data-action="new-application" disabled={!roles.author}>+ Register application</button><button className="button primary" data-action="new-change" disabled={!(applications.length && roles.author)}>+ New change</button></div></div>
      {applications.length ? <div className="app-grid">{applications.map(app => <a className="app-card" href={`#/applications/${app.id}`} key={app.id}><div className="card-top"><div className="app-icon">{text(app.name).slice(0, 2).toUpperCase()}</div><Badge text="REGISTERED" /></div><h2>{text(app.name)}</h2><p>{text(app.description || 'No description yet.')}</p><div className="app-meta"><span>{workspace.changes.filter(change => change.applicationId === app.id).length} changes</span><span>Source not connected →</span></div></a>)}</div>
        : <section className="panel"><div className="empty"><div className="empty-icon">▦</div><h2>Give your first application a home</h2><p>Registering an application does not connect to its source or fetch its code.</p><button className="button primary" data-action="new-application" disabled={!roles.author}>Register application</button></div></section>}
    </>
  );
}

/** Which GitHub features the workspace has switched on (from the workspace summary). */
function capability(workspace: WorkspaceSummary, name: string): boolean {
  return !!(workspace as { capabilities?: Readonly<Record<string, unknown>> }).capabilities?.[name];
}

export function ApplicationPage({ app, workspace, roles, sources }: { app: Application; workspace: WorkspaceSummary; roles: Roles; sources: SourceServices }) {
  const intake = capability(workspace, 'githubIntake'), webhooks = capability(workspace, 'githubWebhooks');
  return (
    <>
      <a className="back" href="#/applications">← Applications</a><div className="heading"><div><h1>{text(app.name)}</h1><p className="sub">{text(app.description || 'No description supplied.')}</p></div><button className="button primary" data-action="new-change" data-app={app.id} disabled={!roles.author}>+ New change</button></div>
      <section className="panel"><div className="panel-body details"><div><span className="field-label">Repository reference</span><div className="detail-value">{text(app.repositoryUrl || 'Not supplied')}</div><div className="small muted">Reference only. Source access has not been verified.</div></div><div><span className="field-label">Registered</span><div className="detail-value">{formatDate(app.createdAt)}</div></div></div></section>
      {intake ? <PullRequestsPanel services={sources} applicationId={app.id} canAuthor={roles.author} />
        : <section className="panel" id="app-pulls"><div className="panel-head"><div><h2>Pull requests</h2><p>Open pull requests from the operator-connected repository. Listed for context only.</p></div></div><div className="panel-body" id="app-pulls-body"><PullsNotConnected /></div></section>}
      {webhooks ? <SourceEventsPanel services={sources} applicationId={app.id} canAuthor={roles.author} /> : null}
      <h2 className="section-title">Changes</h2>
      <ChangeTable changes={workspace.changes.filter(change => change.applicationId === app.id)} workspace={workspace} roles={roles} showApplication={false} />
    </>
  );
}

type Filter = 'all' | 'mine' | 'progress' | 'ready' | 'not-ready';

/** Changes as a table: where each one stands (step bar), its status and who acts next. */
function ChangeTable({ changes, workspace, roles, showApplication = true }: { changes: readonly WorkspaceChange[]; workspace: WorkspaceSummary; roles: Roles; showApplication?: boolean }) {
  if (!changes.length) return <section className="panel"><ChangeRows changes={changes} workspace={workspace} canAuthor={roles.author} /></section>;
  const appName = (id: unknown) => text(workspace.applications.find(app => app.id === id)?.name ?? 'Application');
  return (
    <div className="table-box">
      <table className="change-table">
        <thead><tr><th scope="col">Change</th><th scope="col">Stage</th><th scope="col">Status</th><th scope="col">Waiting on</th></tr></thead>
        <tbody>{changes.map(change => {
          const stage = changeStage(change);
          return (
            <tr key={change.id}>
              <td><a className="row-title" href={`#/changes/${change.id}`}>{text(change.title)}</a><span className="muted">{showApplication ? <>{appName(change.applicationId)} · </> : null}Revision <span className="mono">{shortRevision(change.sourceRevision)}</span></span></td>
              <td><span className="stage-bar" aria-hidden="true">{[1, 2, 3, 4].map(n => <span key={n} className={n < stage.step || stage.tone === 'ready' ? 'done' : n === stage.step ? `now tone-${stage.tone}` : ''} />)}</span><span className="stage-text">{stage.detail}</span></td>
              <td><span className={`pill tone-${stage.tone}`}>{stage.status}</span></td>
              <td>{isMyTurn(stage, roles) ? <strong>You</strong> : waitingOnLabel(stage.waitingOn)}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

export function ChangesPage({ workspace, roles }: { workspace: WorkspaceSummary; roles: Roles }) {
  const [filter, setFilter] = useState<Filter>('all');
  const staged = workspace.changes.map(change => ({ change, stage: changeStage(change) }));
  const matches: Record<Filter, (s: (typeof staged)[number]) => boolean> = {
    all: () => true, mine: s => isMyTurn(s.stage, roles), ready: s => s.stage.tone === 'ready', 'not-ready': s => s.stage.tone === 'not-ready',
    progress: s => s.stage.tone !== 'ready' && s.stage.tone !== 'not-ready'
  };
  const filters: readonly [Filter, string][] = [['all', 'All'], ['mine', 'Needs my action'], ['progress', 'In progress'], ['ready', 'Ready'], ['not-ready', 'Not ready']];
  return (
    <>
      <div className="heading"><div><h1>Changes</h1><p className="sub">Every change starts unchecked. Its stage shows how far it has got.</p></div><button className="button primary" data-action="new-change" disabled={!(workspace.applications.length && roles.author)}>+ New change</button></div>
      {workspace.changes.length ? <div className="filter-chips" role="group" aria-label="Filter changes">{filters.map(([id, label]) => <button key={id} type="button" className={`chip${filter === id ? ' on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label} · {staged.filter(matches[id]).length}</button>)}</div> : null}
      {workspace.changes.length && !staged.some(matches[filter]) ? <p className="muted">No changes match this filter.</p>
        : <ChangeTable changes={staged.filter(matches[filter]).map(s => s.change)} workspace={workspace} roles={roles} />}
    </>
  );
}

export function ActivityPage({ workspace }: { workspace: WorkspaceSummary }) {
  return <><div className="heading"><div><h1>Activity</h1><p className="sub">The latest 100 saved actions. These are working records, not certified assurance evidence.</p></div><a className="button" href="/api/export">Export records ↓</a></div><section className="panel"><div className="panel-body"><ActivityRows items={workspace.activity} /></div></section></>;
}
