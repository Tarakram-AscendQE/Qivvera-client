import { text } from '../shell-contract';
import { ActivityRows, type WorkspaceSummary } from './rows';
import { changeStage, isMyTurn, type Stage } from './stage';

export interface Roles { readonly author: boolean; readonly authority: boolean }

/** Requirements, evidence and decisions stay distinct. Kept for screens that still state it in full. */
export function DistinctRecordsNote() {
  return <div className="notice"><span className="symbol">i</span><span><strong>Requirements, evidence, and decisions stay distinct.</strong> Accepting a requirement does not establish software correctness. Run a supported assessment and inspect its declared scope.</span></div>;
}

/** The verb on a task's button: what the person will do when they open it. */
function taskAction(stage: Stage, roles: Roles): string {
  if (stage.tone === 'not-ready') return 'Track a fix';
  if (stage.tone === 'gap') return 'Inspect gaps';
  if (stage.step === 2 && stage.waitingOn === 'POLICY_AUTHORITY') return 'Review';
  if (stage.step === 2) return stage.status === 'No requirements' ? 'Add requirements' : 'Finish drafts';
  if (stage.step === 3) return roles.authority ? 'Plan and check' : 'Run check';
  return 'Open';
}

function emptyMessage(workspace: WorkspaceSummary, roles: Roles): string {
  if (!workspace.applications.length) return roles.author ? 'Register your first application, then describe a change on the Applications page.' : 'No application has been registered yet. An Author starts by registering one.';
  if (!workspace.changes.length) return roles.author ? 'Create a change from the Applications page and record what it should achieve.' : 'No change has been registered yet. An Author describes the first change.';
  if (!roles.author && !roles.authority) return 'Viewers follow progress here. Nothing needs your action.';
  return 'Nothing is waiting for you right now. Changes that need someone else are listed under Changes.';
}

/** The workspace home: what is waiting for the signed-in roles, where changes stand, and recent activity. */
export function OverviewPage({ workspace, roles }: { workspace: WorkspaceSummary; roles: Roles }) {
  const staged = workspace.changes.map(change => ({ change, stage: changeStage(change) }));
  const mine = staged.filter(({ stage }) => isMyTurn(stage, roles));
  const appName = (id: unknown) => text(workspace.applications.find(app => app.id === id)?.name ?? 'Application');
  const tally = { ready: staged.filter(s => s.stage.tone === 'ready').length, notReady: staged.filter(s => s.stage.tone === 'not-ready').length };
  const inProgress = staged.length - tally.ready - tally.notReady;
  return (
    <>
      <div className="heading">
        <div>
          <h1>Your turn</h1>
          <p className="sub">{mine.length ? `${mine.length} ${mine.length === 1 ? 'change is' : 'changes are'} waiting for you.` : 'Nothing is waiting for you right now.'}</p>
        </div>
        <div className="actions"><button className="button" data-action="new-application" disabled={!roles.author}>+ Register application</button></div>
      </div>
      <div className="home-grid">
        <section className="task-list" aria-labelledby="waiting-title">
          <h2 id="waiting-title" className="section-title">Waiting for you</h2>
          {mine.length ? mine.map(({ change, stage }) => (
            <article className="task" key={change.id}>
              <div className="task-body">
                <div className="task-meta"><span className={`pill tone-${stage.tone}`}>{stage.status}</span><span>{appName(change.applicationId)}</span></div>
                <a className="task-title" href={`#/changes/${change.id}`}>{text(change.title)}</a>
                <p>{stage.detail}</p>
              </div>
              <a className="button primary" href={`#/changes/${change.id}`}>{taskAction(stage, roles)}</a>
            </article>
          )) : <div className="task-empty"><p>{emptyMessage(workspace, roles)}</p>{workspace.changes.length ? <a href="#/changes">See all changes</a> : <a href="#/guide">Read the product guide</a>}</div>}
        </section>
        <aside className="home-side">
          <section className="side-card" aria-labelledby="standing-title">
            <h2 id="standing-title">Where changes stand</h2>
            <ul className="standing">
              <li><span className="pill tone-ready">Ready</span><strong>{tally.ready}</strong></li>
              <li><span className="pill tone-not-ready">Not ready</span><strong>{tally.notReady}</strong></li>
              <li><span className="pill tone-draft">In progress</span><strong>{inProgress}</strong></li>
            </ul>
            <a href="#/changes">See all changes</a>
          </section>
          <section className="side-card" aria-labelledby="recent-title">
            <h2 id="recent-title">Recent activity</h2>
            <ActivityRows items={workspace.activity.slice(0, 3)} />
            <a href="#/activity">Full activity log</a>
          </section>
        </aside>
      </div>
    </>
  );
}
