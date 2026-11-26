import { field, list } from '../json';
import { text } from '../shell-contract';

/**
 * PR assurance starts by choosing an application. Each application is assured with its own GitHub
 * repositories and its own token, so only connected applications can be opened here; the others link
 * to their application page, where they can be connected.
 */
export function ApplicationsPage({ overview }: { overview: unknown }) {
  const applications = list(field(overview, 'applications'));
  const connected = applications.filter(app => field(app, 'connection'));
  return (
    <>
      <div className="heading"><div>
        <h1>Pull request assurance</h1>
        <p className="sub">Choose an application. Its pull requests are imported and evaluated with its own GitHub repositories and token, against the business rules from its profiles repository.</p>
      </div></div>
      {field(overview, 'credentialsReady') === true ? null : <div className="notice warning"><strong>GitHub tokens cannot be stored or used yet.</strong> Ask the deployer to set QIVVERA_CREDENTIAL_KEY.</div>}
      {applications.length ? (
        <div className="app-grid" aria-label="Applications">
          {[...connected, ...applications.filter(app => !field(app, 'connection'))].map(app => {
            const id = text(field(app, 'id')), connection = field(app, 'connection'), rules = field(connection, 'rules');
            return (
              <article className="app-card" key={id} data-application={id}>
                <div className="card-top"><div className="app-icon" aria-hidden="true">{text(field(app, 'name')).slice(0, 2).toUpperCase()}</div><span className={`pill ${connection ? 'tone-ready' : 'tone-draft'}`}>{connection ? 'GitHub connected' : 'Not connected'}</span></div>
                <h2>{connection ? <a className="app-link" href={`#/pr-assurance/apps/${id}`}>{text(field(app, 'name'))}</a> : text(field(app, 'name'))}</h2>
                <p>{connection ? <span className="mono">{text(field(field(connection, 'app'), 'repository'))}</span> : 'Connect this application to GitHub before importing its pull requests.'}</p>
                <div className="app-meta">
                  <span>{connection ? (rules ? `${text(field(rules, 'policies'))} rules · ${text(field(rules, 'obligations'))} obligations` : 'No rules snapshot yet') : 'No repositories or token saved'}</span>
                  {connection ? <a href={`#/pr-assurance/apps/${id}`}>Open →</a> : <a href={`#/applications/${id}`}>Connect to GitHub →</a>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel"><div className="empty"><div className="empty-icon">▦</div><h2>No applications yet</h2><p>Register an application with its application, verifiers and profiles repositories and a GitHub token. Its pull requests then appear here.</p><a className="button primary" href="#/applications">Go to Applications</a></div></section>
      )}
    </>
  );
}
