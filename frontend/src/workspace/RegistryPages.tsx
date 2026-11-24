import { Badge, formatDate } from '../format';
import { text } from '../legacy-bridge';
import { DistinctRecordsNote, type Roles } from './OverviewPage';
import { ActivityRows, ChangeRows, type WorkspaceSummary } from './rows';

type Application = WorkspaceSummary['applications'][number] & { readonly description?: unknown };

export function ApplicationsPage({ workspace, roles }: { workspace: WorkspaceSummary; roles: Roles }) {
  const applications = workspace.applications as readonly Application[];
  return (
    <>
      <div className="heading"><div><div className="eyebrow">Application registry</div><h1>Applications</h1><p className="sub">The systems whose changes you will assure.</p></div><button className="button primary" data-action="new-application" disabled={!roles.author}>+ Register application</button></div>
      {applications.length ? <div className="app-grid">{applications.map(app => <a className="app-card" href={`#/applications/${app.id}`} key={app.id}><div className="card-top"><div className="app-icon">{text(app.name).slice(0, 2).toUpperCase()}</div><Badge text="REGISTERED" /></div><h2>{text(app.name)}</h2><p>{text(app.description || 'No description yet.')}</p><div className="app-meta"><span>{workspace.changes.filter(change => change.applicationId === app.id).length} changes</span><span>Source not connected →</span></div></a>)}</div>
        : <section className="panel"><div className="empty"><div className="empty-icon">▦</div><h2>Give your first application a home</h2><p>Registering an application does not connect to its source or fetch its code.</p><button className="button primary" data-action="new-application" disabled={!roles.author}>Register application</button></div></section>}
    </>
  );
}

export function ApplicationPage({ app, workspace, roles }: { app: Application; workspace: WorkspaceSummary; roles: Roles }) {
  return (
    <>
      <a className="back" href="#/applications">← Applications</a><div className="heading"><div><div className="eyebrow">Registered application</div><h1>{text(app.name)}</h1><p className="sub">{text(app.description || 'No description supplied.')}</p></div><button className="button primary" data-action="new-change" data-app={app.id} disabled={!roles.author}>+ New change</button></div>
      <section className="panel"><div className="panel-body details"><div><span className="field-label">Repository reference</span><div className="detail-value">{text(app.repositoryUrl || 'Not supplied')}</div><div className="small muted">Reference only. Source access has not been verified.</div></div><div><span className="field-label">Registered</span><div className="detail-value">{formatDate(app.createdAt)}</div></div></div></section>
      <div className="tabs"><button className="active">Changes</button></div><section className="panel"><ChangeRows changes={workspace.changes.filter(change => change.applicationId === app.id)} workspace={workspace} canAuthor={roles.author} /></section>
    </>
  );
}

export function ChangesPage({ workspace, roles }: { workspace: WorkspaceSummary; roles: Roles }) {
  return (
    <>
      <div className="heading"><div><div className="eyebrow">Change registry</div><h1>Changes</h1><p className="sub">Every change begins unassessed. Confidence must be earned by evidence.</p></div><button className="button primary" data-action="new-change" disabled={!(workspace.applications.length && roles.author)}>+ New change</button></div>
      <DistinctRecordsNote /><section className="panel"><ChangeRows changes={workspace.changes} workspace={workspace} canAuthor={roles.author} /></section>
    </>
  );
}

export function ActivityPage({ workspace }: { workspace: WorkspaceSummary }) {
  return <><div className="heading"><div><div className="eyebrow">Workspace history</div><h1>Activity</h1><p className="sub">The latest 100 saved actions. These are working records, not certified assurance evidence.</p></div><a className="button" href="/api/export">Export records ↓</a></div><section className="panel"><div className="panel-body"><ActivityRows items={workspace.activity} /></div></section></>;
}
