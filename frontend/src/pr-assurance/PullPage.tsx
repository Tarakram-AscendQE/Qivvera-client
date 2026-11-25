import { useRef, useState } from 'react';
import { Badge, formatDate } from '../format';
import { field, list } from '../json';
import { isSessionEnded, text } from '../shell-contract';
import type { ActiveCheck } from '../visits';
import type { PrAssuranceBridge } from './pr-assurance-module';
import { RunPanel, runLabel } from './RunPanel';

const short = (sha: unknown) => text(sha).slice(0, 7);
const isActive = (run: unknown) => ['QUEUED', 'RUNNING'].includes(text(field(run, 'status')));

function History({ runs }: { runs: readonly unknown[] }) {
  if (!runs.length) return <p className="small muted">No runs yet.</p>;
  return (
    <ul className="pr-history">
      {runs.map(run => {
        const { label, kind } = runLabel(run);
        return (
          <li key={text(field(run, 'id'))}>
            <a href={`#/pr-assurance/runs/${text(field(run, 'id'))}`}>{formatDate(field(run, 'createdAt'))}</a>
            <span className="mono">{short(field(run, 'headSha'))}</span><Badge text={label} kind={kind} />
            {field(run, 'failure') ? <span className="small muted">{text(field(field(run, 'failure'), 'message'))}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** One pull request: what was imported, the Evaluate action, the latest run (live while it runs) and the history. */
export function PullPage({ bridge, number, scenario, history, latest, active }: {
  bridge: PrAssuranceBridge; number: number; scenario: unknown; history: readonly unknown[]; latest: unknown; active: ActiveCheck;
}) {
  const entry = list(field(scenario, 'pulls')).find(p => field(p, 'number') === number);
  const pull = field(entry, 'pull');
  const [view, setView] = useState<unknown>(latest);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  // One request key per attempt: a repeat after a lost answer returns the same run instead of starting another.
  const requestKey = useRef<string | null>(null);
  const runActive = isActive(field(view, 'run'));
  const canStart = field(scenario, 'canEvaluate') === true && field(scenario, 'githubTokenConfigured') === true && !!pull && !runActive;

  async function evaluate() {
    if (!active() || starting || !canStart) return;
    requestKey.current ??= crypto.randomUUID();
    setStarting(true);
    setError('');
    try {
      const result = await bridge.api(`/api/pr-assurance/pulls/${number}/runs`, { method: 'POST', data: { requestKey: requestKey.current } });
      if (!active()) return;
      requestKey.current = null;
      setView(result);
      setNotice(text(field(result, 'notice')));
      bridge.toast(`Evaluation of PR #${number} started on GitHub Actions.`);
    } catch (err) {
      if (!active() || isSessionEnded(err)) return;
      // A definite answer ends this attempt; without one (no status) the same key is kept for a retry.
      if (typeof (err as { status?: unknown }).status === 'number') requestKey.current = null;
      setError(err instanceof Error ? err.message : String(err));
      if ((err as { code?: unknown }).code === 'RUN_ALREADY_ACTIVE') void bridge.route();
    } finally {
      if (active()) setStarting(false);
    }
  }

  return (
    <>
      <a className="back" href="#/pr-assurance">← All pull requests</a>
      <div className="heading">
        <div>
          <div className="eyebrow">{text(field(scenario, 'repository'))} · PR #{number}</div>
          <h1>{pull ? text(field(pull, 'title')) : `PR #${number}`}</h1>
          {pull ? <p className="sub"><span className="mono">{text(field(pull, 'headRef'))}</span> · head <span className="mono">{short(field(pull, 'headSha'))}</span> · <a href={text(field(pull, 'url'))} target="_blank" rel="noreferrer">Open on GitHub</a></p>
            : <p className="sub">Not imported yet. Import it from the pull request list first.</p>}
        </div>
        <div className="actions">
          <button className="button primary" data-action="evaluate" disabled={!canStart || starting} onClick={() => void evaluate()}>{starting ? 'Starting…' : runActive ? 'Evaluation running…' : 'Evaluate with Qivvera'}</button>
        </div>
      </div>
      <div className="form-error" role="alert">{error}</div>
      {notice ? <div className="notice warning">{notice}</div> : null}
      {view ? <RunPanel key={text(field(field(view, 'run'), 'id'))} bridge={bridge} initial={view} active={active} />
        : <section className="panel"><div className="panel-body"><h2>Not evaluated yet</h2><p className="small">Evaluate runs Qivvera's 14 checks against this pull request's exact commit on GitHub Actions. It takes about 2–3 minutes.</p></div></section>}
      <section className="panel"><div className="panel-head"><h2>Earlier runs</h2></div><div className="panel-body"><History runs={history} /></div></section>
    </>
  );
}

/** One run by its link: the same panel, live while it runs. */
export function RunPage({ bridge, view, active }: { bridge: PrAssuranceBridge; view: unknown; active: ActiveCheck }) {
  const run = field(view, 'run');
  return (
    <>
      <a className="back" href={`#/pr-assurance/pulls/${text(field(run, 'pullNumber'))}`}>← PR #{text(field(run, 'pullNumber'))}</a>
      <div className="heading"><div><div className="eyebrow">PR #{text(field(run, 'pullNumber'))} · commit <span className="mono">{short(field(run, 'headSha'))}</span></div><h1>Assessment run</h1></div></div>
      <RunPanel bridge={bridge} initial={view} active={active} />
    </>
  );
}
