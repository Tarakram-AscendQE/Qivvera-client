import { useEffect, useState } from 'react';
import { Badge, formatDate } from '../format';
import { field, list } from '../json';
import { isSessionEnded, text } from '../shell-contract';
import type { ActiveCheck } from '../visits';
import type { PrAssuranceBridge } from './pr-assurance-module';
import { Report } from './Report';

/** How often the page asks Qivvera to sync an active run with GitHub. */
export const SYNC_INTERVAL_MS = 2000;

const STAGES: readonly [string, string][] = [
  ['queued', 'Waiting for GitHub'],
  ['preparing', 'Preparing a fresh GitHub machine'],
  ['starting-app', 'Starting the application at the pull request’s commit'],
  ['running-checks', 'Running Qivvera’s checks'],
  ['running-team-tests', 'Running the team’s own tests'],
  ['done', 'Assessment complete']
];
const OUTCOME: Record<string, string> = { passed: '✅', failed: '❌', timedOut: '❌', interrupted: '⚠️', skipped: '⏭' };
const isActive = (run: unknown) => ['QUEUED', 'RUNNING'].includes(text(field(run, 'status')));

/** The badge for a run: its disposition once complete, otherwise where it stands. */
export function runLabel(run: unknown): { label: string; kind: string } {
  const disposition = text(field(run, 'disposition'));
  if (disposition) return { label: disposition.replace('_', ' '), kind: disposition === 'READY' ? 'finding-good' : disposition === 'NOT_READY' ? 'finding-bad' : 'finding-gap' };
  const status = text(field(run, 'status'));
  const labels: Record<string, string> = { QUEUED: 'Waiting for GitHub', RUNNING: 'Running', FAILED: 'No result: failed', TIMED_OUT: 'No result: timed out', CANCELLED: 'No result: cancelled' };
  return { label: labels[status] ?? status, kind: isActive(run) ? 'candidate' : 'finding-gap' };
}

/** The stage a run is at: from its latest progress, else its latest event, else waiting for GitHub. */
function currentStage(run: unknown, events: readonly unknown[]): string {
  return text(field(field(run, 'progress'), 'stage')) || text(field(events.at(-1), 'stage')) || 'queued';
}

/** What a screen reader announces while a run is active, e.g. "Running Qivvera’s checks · 5 of 14 checks finished". */
function announcement(run: unknown, events: readonly unknown[]): string {
  if (!isActive(run)) return '';
  const label = STAGES.find(([stage]) => stage === currentStage(run, events))?.[1] ?? 'Evaluation in progress';
  const progress = field(run, 'progress'), finished = list(field(progress, 'checks')).length;
  return finished ? `${label} · ${finished} of ${text(field(progress, 'checksTotal')) || '14'} checks finished` : label;
}

function Stages({ run, events }: { run: unknown; events: readonly unknown[] }) {
  const complete = text(field(run, 'status')) === 'COMPLETED';
  const at = STAGES.findIndex(([stage]) => stage === currentStage(run, events));
  return (
    <ol className="pr-stages">
      {STAGES.map(([stage, label], index) => {
        const state = complete || index < at ? 'done' : index === at && isActive(run) ? 'current' : 'todo';
        return <li key={stage} className={state} aria-current={state === 'current' ? 'step' : undefined}><span aria-hidden="true">{state === 'done' ? '✓' : state === 'current' ? '●' : '○'}</span>{label}</li>;
      })}
    </ol>
  );
}

function Checks({ progress }: { progress: unknown }) {
  const checks = list(field(progress, 'checks'));
  if (!checks.length) return null;
  return (
    <div className="pr-checks">
      <h3>Qivvera’s checks · {checks.length} of {text(field(progress, 'checksTotal')) || '14'} finished</h3>
      <ul>{checks.map(check => <li key={text(field(check, 'check'))}><span aria-hidden="true">{OUTCOME[text(field(check, 'outcome'))] ?? '•'}</span><span className="mono">{text(field(check, 'check'))}</span><span className="small muted">{text(field(check, 'outcome'))}</span></li>)}</ul>
    </div>
  );
}

/**
 * One run. While it is active the panel asks Qivvera to sync it every 2 s; when it ends, the page is
 * drawn again so the history and report come from fresh reads. Late answers from an earlier visit,
 * route or session change nothing.
 */
export function RunPanel({ bridge, initial, active }: { bridge: PrAssuranceBridge; initial: unknown; active: ActiveCheck }) {
  const [view, setView] = useState<unknown>(initial);
  const [syncError, setSyncError] = useState('');
  // Counts failed syncs, so a failure schedules the next attempt.
  const [attempt, setAttempt] = useState(0);
  const run = field(view, 'run'), events = list(field(view, 'events'));
  const runId = text(field(run, 'id')), running = isActive(run);

  useEffect(() => {
    if (!running) return;
    let stopped = false;
    const timer = setTimeout(async () => {
      if (stopped || !active()) return;
      try {
        const next = await bridge.api(`/api/pr-assurance/runs/${runId}/sync`, { method: 'POST' });
        if (stopped || !active()) return;
        setSyncError('');
        if (isActive(field(next, 'run'))) setView(next);
        else void bridge.route();
      } catch (err) {
        if (stopped || !active() || isSessionEnded(err)) return;
        setSyncError(err instanceof Error ? err.message : String(err));
        setAttempt(n => n + 1);
      }
    }, SYNC_INTERVAL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [view, attempt, running, runId, bridge, active]);

  const { label, kind } = runLabel(run);
  const failure = field(run, 'failure'), notice = text(field(view, 'githubNotice'));
  const githubRunUrl = text(field(run, 'githubRunUrl'));
  return (
    <section className="panel pr-run" data-run={runId} data-status={text(field(run, 'status'))}>
      <div className="panel-head"><div><h2>{running ? 'Evaluation in progress' : 'Latest result'}</h2>
        <p>Started {formatDate(field(run, 'createdAt'))} · commit <span className="mono">{text(field(run, 'headSha')).slice(0, 7)}</span>{githubRunUrl ? <> · <a href={githubRunUrl} target="_blank" rel="noreferrer">GitHub run</a></> : null}</p></div>
        <Badge text={label} kind={kind} /></div>
      <div className="panel-body">
        {notice || syncError ? <div className="notice warning">{syncError || notice} Qivvera keeps checking.</div> : null}
        {/* Always present, so changes are announced: a live region added together with its text is not. */}
        <p className="sr-only" role="status" aria-live="polite">{announcement(run, events)}</p>
        {running || text(field(run, 'status')) === 'COMPLETED' ? <Stages run={run} events={events} /> : null}
        {running ? <Checks progress={field(run, 'progress')} /> : null}
        {failure ? <div className="notice warning"><strong>No result.</strong> {text(field(failure, 'message'))} A run that did not finish has no verdict.</div> : null}
        {field(view, 'report') ? <Report report={field(view, 'report')} /> : null}
        {events.length ? <details className="pr-events"><summary>Run log</summary><ul>{events.map(event => <li key={text(field(event, 'seq'))}><span className="small muted">{formatDate(field(event, 'recordedAt'))}</span> {text(field(event, 'message'))}</li>)}</ul></details> : null}
      </div>
    </section>
  );
}
