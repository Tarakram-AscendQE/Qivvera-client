import { useMutation } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import { Badge, formatDate } from '../format';
import { field, list } from '../json';
import { isSessionEnded, text } from '../shell-contract';
import type { ActiveCheck } from '../visits';
import type { PrAssuranceBridge } from './pr-assurance-module';

const short = (sha: unknown) => text(sha).slice(0, 7);
const DISPOSITION_KIND: Record<string, string> = { READY: 'finding-good', NOT_READY: 'finding-bad', INDETERMINATE: 'finding-gap' };
const STATE_KIND: Record<string, string> = { SUPPORTED: 'finding-good', VIOLATED: 'finding-bad', INSUFFICIENT: 'finding-gap', NOT_ASSESSED: 'finding-gap' };
const isActive = (run: unknown) => ['QUEUED', 'RUNNING'].includes(text(field(run, 'status')));
/** A PR's broken-rule count, only from a completed run whose stored evidence passed its check. */
const countOf = (entry: unknown): number | null => {
  const result = field(entry, 'result');
  return result && field(result, 'integrityFailed') !== true ? Number(field(result, 'brokenRules')) : null;
};

/** The latest completed result: the count of broken rules, never a guess. */
function Result({ entry }: { entry: unknown }) {
  const result = field(entry, 'result'), count = countOf(entry);
  if (!result) return <p className="pr-count muted">Not evaluated</p>;
  if (count === null) return <p className="small">The stored evidence of its last result failed its integrity check. No count is shown.</p>;
  const disposition = text(field(result, 'disposition'));
  return (
    <div className="pr-result-line">
      <p className={`pr-count ${count ? 'bad' : 'good'}`}><strong>{count}</strong> {count === 1 ? 'rule broken' : 'rules broken'}</p>
      <Badge text={disposition.replace('_', ' ')} kind={DISPOSITION_KIND[disposition] ?? ''} />
    </div>
  );
}

/** Each obligation's state on each PR's latest result, and what changed from the first to the last. */
function CompareTable({ obligations, pulls }: { obligations: readonly unknown[]; pulls: readonly unknown[] }) {
  const evaluated = pulls.filter(entry => countOf(entry) !== null);
  if (!evaluated.length) return null;
  const state = (entry: unknown, id: string) => text(field(field(field(entry, 'result'), 'states'), id));
  const first = evaluated[0], last = evaluated.at(-1);
  return (
    <section className="panel"><div className="panel-head"><div><h2>Compare pull requests</h2><p>Each obligation on each pull request's latest result. The last column compares the first and last evaluated.</p></div></div>
      <div className="panel-body pr-compare-table"><table aria-label="Obligations across pull requests">
        <thead><tr><th>Obligation</th>{pulls.map(entry => <th key={text(field(entry, 'number'))}>PR #{text(field(entry, 'number'))}</th>)}<th>Change</th></tr></thead>
        <tbody>{obligations.map(obligation => {
          const id = text(field(obligation, 'id')), before = state(first, id), after = state(last, id);
          const change = evaluated.length < 2 || before === after ? 'Unchanged' : after === 'SUPPORTED' ? 'Now supported' : before === 'SUPPORTED' ? 'Newly failing' : 'Changed';
          return (
            <tr key={id} data-obligation={id}>
              <td><span className="mono">{id}</span> {text(field(obligation, 'statement'))}</td>
              {pulls.map(entry => { const s = countOf(entry) === null ? '' : state(entry, id); return <td key={text(field(entry, 'number'))}>{s ? <Badge text={s} kind={STATE_KIND[s] ?? ''} /> : <span className="small muted">—</span>}</td>; })}
              <td><Badge text={change} kind={change === 'Now supported' ? 'finding-good' : change === 'Newly failing' ? 'finding-bad' : ''} /></td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </section>
  );
}

/** One pull request: what was imported from GitHub, and its latest run. */
function PullCard({ entry, canImport, importing, error, onImport }: {
  entry: unknown; canImport: boolean; importing: boolean; error: string; onImport: () => void;
}) {
  const number = text(field(entry, 'number')), pull = field(entry, 'pull'), run = field(entry, 'latestRun');
  return (
    <article className="pr-card" data-pull={number}>
      <div className="pr-card-head"><span className="pr-number">PR #{number}</span>
        {!pull ? <Badge text="Not imported" /> : isActive(run) ? <Badge text="Evaluation running" kind="candidate" /> : null}
      </div>
      {pull ? <Result entry={entry} /> : null}
      {pull ? (
        <>
          <h3>{text(field(pull, 'title'))}</h3>
          <dl className="boundary">
            <dt>Branch</dt><dd className="mono">{text(field(pull, 'headRef'))}</dd>
            <dt>Head commit</dt><dd className="mono">{short(field(pull, 'headSha'))}</dd>
            <dt>Imported</dt><dd>{formatDate(field(pull, 'importedAt'))} by {text(field(pull, 'importedBy'))}</dd>
          </dl>
          <div className="actions"><a className="button primary" href={`#/pr-assurance/pulls/${number}`}>Open</a><a className="link-button" href={text(field(pull, 'url'))} target="_blank" rel="noreferrer">Open on GitHub</a></div>
        </>
      ) : <p className="small muted">Not imported yet. Importing reads its title, branch and exact head commit from GitHub.</p>}
      <div className="form-error" role="alert">{error}</div>
      {canImport ? <button className="button" data-action="import-pull" disabled={importing} onClick={onImport}>{importing ? 'Importing…' : pull ? 'Re-import from GitHub' : 'Import from GitHub'}</button> : null}
    </article>
  );
}

export function TimelinePage({ bridge, scenario, active }: { bridge: PrAssuranceBridge; scenario: unknown; active: ActiveCheck }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Synchronous guard: one import at a time; a second click while one is in flight is ignored.
  const importing = useRef<number | null>(null);
  const importMutation = useMutation({ mutationFn: (number: number) => bridge.api(`/api/pr-assurance/pulls/${number}/import`, { method: 'POST' }) });
  const rules = field(scenario, 'rules'), tokenConfigured = field(scenario, 'githubTokenConfigured') === true;
  const canImport = field(scenario, 'canEvaluate') === true && tokenConfigured;
  const pulls = list(field(scenario, 'pulls'));
  const counts = pulls.map(countOf);

  async function importPull(number: number) {
    if (!active() || importing.current !== null) return;
    importing.current = number;
    setErrors(current => ({ ...current, [number]: '' }));
    try {
      await importMutation.mutateAsync(number);
      if (!active()) return;
      bridge.toast(`PR #${number} imported from GitHub. Nothing has been evaluated yet.`);
      await bridge.route();
    } catch (err) {
      if (!active() || isSessionEnded(err)) return;
      setErrors(current => ({ ...current, [number]: err instanceof Error ? err.message : String(err) }));
    } finally {
      importing.current = null;
    }
  }

  // Imports every pull request in order, one at a time; stops at the first failure and shows it on that card.
  const [importingAll, setImportingAll] = useState(false);
  async function importAll() {
    if (!active() || importing.current !== null) return;
    importing.current = 0;
    setImportingAll(true);
    setErrors({});
    const numbers = pulls.map(entry => Number(field(entry, 'number')));
    let done = 0;
    try {
      for (const number of numbers) {
        try {
          await importMutation.mutateAsync(number);
          done += 1;
        } catch (err) {
          if (!active() || isSessionEnded(err)) return;
          setErrors(current => ({ ...current, [number]: err instanceof Error ? err.message : String(err) }));
          break;
        }
        if (!active()) return;
      }
      if (!active()) return;
      if (done === numbers.length) bridge.toast(`All ${done} pull requests imported from GitHub. Nothing has been evaluated yet.`);
      else if (done) bridge.toast(`${done} of ${numbers.length} pull requests imported. The import stopped at an error.`);
      if (done) await bridge.route();
    } finally {
      importing.current = null;
      if (active()) setImportingAll(false);
    }
  }

  return (
    <>
      <div className="heading"><div>
        <div className="eyebrow">{text(field(scenario, 'application'))} · {text(field(scenario, 'repository'))}</div>
        <h1>Pull request assurance</h1>
        <p className="sub">{text(field(scenario, 'change'))}. Each pull request is checked against the business rules by Qivvera's own tests, run on GitHub Actions against its exact commit.</p>
      </div>
      {canImport ? <div className="actions"><button className="button primary" data-action="import-all" disabled={importingAll || importMutation.isPending} onClick={() => void importAll()}>{importingAll ? 'Importing all…' : 'Import all from GitHub'}</button></div> : null}
      </div>
      {tokenConfigured ? null : <div className="notice warning"><strong>No GitHub token is configured.</strong> Ask the deployer to set QIVVERA_PR_ASSURANCE_GITHUB_TOKEN. Nothing can be imported or evaluated until then.</div>}
      <section className="panel"><div className="panel-head"><div><h2>Rules assured against</h2>
        <p>{text(field(rules, 'policies'))} rules · {text(field(rules, 'obligations'))} obligations · {text(field(field(rules, 'profile'), 'title'))}</p></div></div>
        <div className="panel-body"><p className="small">From <span className="mono">{text(field(rules, 'repository'))}</span> at commit <span className="mono">{short(field(rules, 'commit'))}</span>, a fixed snapshot ({text(field(rules, 'snapshotDigest')).slice(0, 19)}…). Changing a rule means a new snapshot.</p></div>
      </section>
      <div className="pr-timeline" aria-label="Pull requests in order">
        {pulls.map((entry, index) => {
          const number = Number(field(entry, 'number'));
          return (
            <Fragment key={number}>
              {index > 0 ? <span className="pr-arrow" aria-hidden="true">→</span> : null}
              <PullCard entry={entry} canImport={canImport} importing={importMutation.isPending && importMutation.variables === number}
                error={errors[number] ?? ''} onImport={() => void importPull(number)} />
            </Fragment>
          );
        })}
      </div>
      {counts.every(count => count !== null) ? <p className="pr-progression" aria-label="Progression">{counts.join(' → ')} {counts.at(-1) === 1 ? 'rule' : 'rules'} broken</p> : null}
      <CompareTable obligations={list(field(scenario, 'obligations'))} pulls={pulls} />
      <div className="notice">Importing reads pull-request metadata only. It does not run code, post to GitHub or block a merge.</div>
    </>
  );
}
