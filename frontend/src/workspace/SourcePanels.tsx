import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, formatDate } from '../format';
import { field, list } from '../json';
import { isSessionEnded, text, type Api } from '../shell-contract';
import type { ActiveCheck } from '../visits';

/** What the application page needs to read pull requests: the API and the shell's "still on screen" check. */
export interface SourceServices {
  readonly api: Api;
  readonly viewContext: () => ActiveCheck;
}

type Load = { readonly state: 'loading' } | { readonly state: 'ready'; readonly data: unknown } | { readonly state: 'failed'; readonly message: string };

/**
 * Reads one endpoint for the visible page. `reload` reads it again. A late answer after the person
 * has left the page (or signed out) is ignored, and an ended session is already handled by api().
 */
function useRead(services: SourceServices, path: string): [Load, () => void] {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const generation = useRef(0);
  const reload = useCallback(() => {
    const current = ++generation.current, active = services.viewContext();
    setLoad({ state: 'loading' });
    services.api(path).then(
      data => { if (active() && current === generation.current) setLoad({ state: 'ready', data }); },
      (error: unknown) => {
        if (!active() || current !== generation.current || isSessionEnded(error)) return;
        setLoad({ state: 'failed', message: error instanceof Error ? error.message : String(error) });
      }
    );
  }, [services.api, services.viewContext, path]);
  useEffect(() => {
    reload();
    return () => { generation.current++; };
  }, [reload]);
  return [load, reload];
}

/** A link into GitHub intake with the repository and pull request already chosen (preview only; nothing is imported). */
const intakeLink = (repositoryKey: unknown, pullNumber: unknown) => `#/intake/${encodeURIComponent(text(repositoryKey))}/${text(pullNumber)}`;

/** Where an imported pull request stands: the linked change, and whether its latest commits are imported. */
function ImportState({ imported, link, canAuthor, showNotImported }: { imported: unknown; link: string; canAuthor: boolean; showNotImported?: boolean }) {
  const currentHead = field(imported, 'currentHead') === true;
  return (
    <div>
      {imported ? <><a className="button" href={`#/changes/${text(field(imported, 'changeId'))}`}>Open linked change</a>{currentHead ? (showNotImported ? <span className="small muted"> Up to date</span> : null) : <span className="small muted"> New commits since import</span>}</>
        : showNotImported ? <span className="small muted">Not imported</span> : null}
      {canAuthor && (!imported || !currentHead) ? <> <a className="button primary" href={link}>{imported ? 'Import new commits' : 'Import'}</a></> : null}
    </div>
  );
}

export function PullsNotConnected() {
  return <><p><strong>No repository is connected.</strong> The repository URL above is stored as a reference only.</p><p className="small muted">To list pull requests here, the workspace operator connects this application's GitHub repository with read access (QIVVERA_GITHUB_INTAKE_ENABLED and QIVVERA_GITHUB_REPOSITORIES_JSON).</p></>;
}

/** Open pull requests of the application's connected repositories. Listed for context only. */
export function PullRequestsPanel({ services, applicationId, canAuthor }: { services: SourceServices; applicationId: string; canAuthor: boolean }) {
  const [load, reload] = useRead(services, `/api/applications/${encodeURIComponent(applicationId)}/pull-requests`);
  let body;
  if (load.state === 'loading') body = <p className="muted">Loading pull requests…</p>;
  else if (load.state === 'failed') body = <div className="notice warning">{load.message}</div>;
  else {
    const groups = list(field(load.data, 'repositories'));
    body = !groups.length ? <PullsNotConnected /> : (
      <>
        {groups.map((group, index) => {
          const repository = field(group, 'repository'), error = field(group, 'error'), pulls = list(field(group, 'pulls'));
          return (
            <div className="pull-group" key={index}>
              <div className="field-label">{text(field(repository, 'owner'))}/{text(field(repository, 'repo'))}</div>
              {error ? <div className="notice warning">{text(field(error, 'message'))}</div>
                : pulls.length ? pulls.map(pull => (
                  <div className="row" key={text(field(pull, 'number'))}>
                    <div><a href={text(field(pull, 'url'))} target="_blank" rel="noopener noreferrer">#{text(field(pull, 'number'))} {text(field(pull, 'title'))}</a>{field(pull, 'draft') ? <> <Badge text="Draft" /></> : null}<span className="muted">{text(field(pull, 'author'))} · {text(field(pull, 'headRef'))} → {text(field(pull, 'baseRef'))}{field(pull, 'updatedAt') ? ` · updated ${formatDate(field(pull, 'updatedAt'))}` : ''}</span></div>
                    <ImportState imported={field(pull, 'imported')} link={intakeLink(field(repository, 'id'), field(pull, 'number'))} canAuthor={canAuthor} />
                  </div>
                )) : <p className="muted">No open pull requests.</p>}
            </div>
          );
        })}
        <p className="small muted">{text(field(load.data, 'notice'))}</p>
      </>
    );
  }
  return (
    <section className="panel" id="app-pulls">
      <div className="panel-head"><div><h2>Pull requests</h2><p>Open pull requests from the operator-connected repository. Listed for context only.</p></div><button className="link-button" type="button" onClick={reload}>Refresh</button></div>
      <div className="panel-body" id="app-pulls-body">{body}</div>
    </section>
  );
}

const EVENT_LABELS: Readonly<Record<string, string>> = { opened: 'Opened', synchronize: 'New commits', reopened: 'Reopened', ready_for_review: 'Ready for review' };

/** Pull-request activity received from signed GitHub webhooks. Nothing is imported automatically. */
export function SourceEventsPanel({ services, applicationId, canAuthor }: { services: SourceServices; applicationId: string; canAuthor: boolean }) {
  const [load, reload] = useRead(services, `/api/applications/${encodeURIComponent(applicationId)}/source-events`);
  let body;
  if (load.state === 'loading') body = <p className="muted">Loading activity…</p>;
  else if (load.state === 'failed') body = <div className="notice warning">{load.message}</div>;
  else {
    const pulls = list(field(load.data, 'pulls'));
    body = pulls.length ? (
      <>
        {pulls.map(pull => {
          const action = text(field(pull, 'action'));
          return (
            <div className="row" key={`${text(field(pull, 'repositoryKey'))}#${text(field(pull, 'pullNumber'))}`}>
              <div><a href={text(field(pull, 'url'))} target="_blank" rel="noopener noreferrer">{text(field(pull, 'repository'))} #{text(field(pull, 'pullNumber'))} {text(field(pull, 'title'))}</a>{field(pull, 'draft') ? <> <Badge text="Draft" /></> : null}<span className="muted">{EVENT_LABELS[action] ?? action} · <code>{text(field(pull, 'headSha')).slice(0, 7)}</code> · {text(field(pull, 'headRef'))} → {text(field(pull, 'baseRef'))} · {text(field(pull, 'sender'))} · {formatDate(field(pull, 'receivedAt'))}</span></div>
              <ImportState imported={field(pull, 'imported')} link={intakeLink(field(pull, 'repositoryKey'), field(pull, 'pullNumber'))} canAuthor={canAuthor} showNotImported />
            </div>
          );
        })}
        <p className="small muted">{text(field(load.data, 'notice'))}</p>
      </>
    ) : <><p className="muted">No pull-request activity has been received yet.</p><p className="small muted">GitHub sends an event when a pull request is opened, updated, reopened or marked ready for review.</p></>;
  }
  return (
    <section className="panel" id="app-events">
      <div className="panel-head"><div><h2>PR activity from GitHub</h2><p>Signed webhook deliveries for this application. Nothing is imported automatically.</p></div><button className="link-button" type="button" onClick={reload}>Refresh</button></div>
      <div className="panel-body" id="app-events-body">{body}</div>
    </section>
  );
}
