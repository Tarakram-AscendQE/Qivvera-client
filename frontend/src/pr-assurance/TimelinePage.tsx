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

/** One imported pull request and its latest run. */
function PullCard({ entry, applicationId, canImport, importing, error, onImport }: {
  entry: unknown; applicationId: string; canImport: boolean; importing: boolean; error: string; onImport: () => void;
}) {
  const number = text(field(entry, 'number')), pull = field(entry, 'pull'), run = field(entry, 'latestRun');
  return (
    <article className="pr-card" data-pull={number}>
      <div className="pr-card-head"><span className="pr-number">PR #{number}</span>
        {isActive(run) ? <Badge text="Evaluation running" kind="candidate" /> : null}
      </div>
      <Result entry={entry} />
      <h3>{text(field(pull, 'title'))}</h3>
      <dl className="boundary">
        <dt>Branch</dt><dd className="mono">{text(field(pull, 'headRef'))}</dd>
        <dt>Head commit</dt><dd className="mono">{short(field(pull, 'headSha'))}</dd>
        <dt>Imported</dt><dd>{formatDate(field(pull, 'importedAt'))} by {text(field(pull, 'importedBy'))}</dd>
      </dl>
      <div className="actions"><a className="button primary" href={`#/pr-assurance/apps/${applicationId}/pulls/${number}`}>Open</a><a className="link-button" href={text(field(pull, 'url'))} target="_blank" rel="noreferrer">Open on GitHub</a></div>
      <div className="form-error" role="alert">{error}</div>
      {canImport ? <button className="button" data-action="import-pull" disabled={importing} onClick={onImport}>{importing ? 'Importing…' : 'Re-import from GitHub'}</button> : null}
    </article>
  );
}

/** The application's open PRs on GitHub (read with its own token), each importable. Listed only when asked for. */
function GitHubPulls({ bridge, applicationId, repository, importingNumber, errors, onImport, active }: {
  bridge: PrAssuranceBridge; applicationId: string; repository: string; importingNumber: number | null; errors: Record<string, string>; onImport: (number: number) => void; active: ActiveCheck;
}) {
  const [pulls, setPulls] = useState<readonly unknown[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function load() {
    if (loading || !active()) return;
    setLoading(true);
    setError('');
    try {
      const answer = await bridge.api(`/api/pr-assurance/applications/${applicationId}/github-pulls`);
      if (active()) setPulls(list(answer));
    } catch (err) {
      if (!active() || isSessionEnded(err)) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (active()) setLoading(false);
    }
  }
  return (
    <section className="panel" id="github-pulls"><div className="panel-head"><div><h2>Import from GitHub</h2><p>Open pull requests in <span className="mono">{repository}</span>, read with this application's token. Importing reads metadata only.</p></div>
      <button className="button" data-action="list-github-pulls" disabled={loading} onClick={() => void load()}>{loading ? 'Reading GitHub…' : pulls ? 'Refresh list' : 'Show open pull requests'}</button></div>
      <div className="panel-body">
        <div className="form-error" role="alert">{error}</div>
        {pulls === null ? <p className="small muted">Nothing is read from GitHub until you ask.</p>
          : !pulls.length ? <p className="small muted">There are no open pull requests in {repository}.</p>
          : <ul className="pr-history" aria-label="Open pull requests on GitHub">{pulls.map(pull => {
            const number = Number(field(pull, 'number')), imported = field(pull, 'imported') === true;
            return (
              <li key={number} data-github-pull={number}>
                <span className="pr-number">PR #{number}</span><span>{text(field(pull, 'title'))}</span><span className="mono small muted">{text(field(pull, 'headRef'))}</span>
                {imported ? <Badge text="Imported" kind="finding-good" />
                  : <button className="button" data-action="import-github-pull" disabled={importingNumber !== null} onClick={() => onImport(number)}>{importingNumber === number ? 'Importing…' : 'Import'}</button>}
                {errors[number] ? <span className="form-error" role="alert">{errors[number]}</span> : null}
              </li>
            );
          })}</ul>}
      </div>
    </section>
  );
}

export function TimelinePage({ bridge, scenario, active }: { bridge: PrAssuranceBridge; scenario: unknown; active: ActiveCheck }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Synchronous guard: one import at a time; a second click while one is in flight is ignored.
  const importing = useRef<number | null>(null);
  const applicationId = text(field(field(scenario, 'application'), 'id'));
  const importMutation = useMutation({ mutationFn: (number: number) => bridge.api(`/api/pr-assurance/applications/${applicationId}/pulls/${number}/import`, { method: 'POST' }) });
  const rules = field(scenario, 'rules'), connection = field(scenario, 'connection');
  const canImport = field(scenario, 'canEvaluate') === true && !!connection && field(scenario, 'credentialsReady') === true;
  const pulls = list(field(scenario, 'pulls'));
  const counts = pulls.map(countOf);
  const repository = text(field(scenario, 'repository'));

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
  const importingNumber = importMutation.isPending ? importMutation.variables ?? null : null;

  // Imports every open pull request not yet imported, in order, one at a time; stops at the first failure.
  const [importingAll, setImportingAll] = useState(false);
  const [importAllError, setImportAllError] = useState('');
  async function importAll() {
    if (!active() || importing.current !== null) return;
    importing.current = 0;
    setImportingAll(true);
    setErrors({});
    setImportAllError('');
    const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
    let done = 0, numbers: number[] = [];
    try {
      try {
        const open = list(await bridge.api(`/api/pr-assurance/applications/${applicationId}/github-pulls`));
        numbers = open.filter(pull => field(pull, 'imported') !== true).map(pull => Number(field(pull, 'number'))).sort((a, b) => a - b);
      } catch (err) {
        if (active() && !isSessionEnded(err)) setImportAllError(message(err));
        return;
      }
      if (!active()) return;
      if (!numbers.length) { bridge.toast('Every open pull request is already imported.'); return; }
      let failure = '';
      for (const number of numbers) {
        try {
          await importMutation.mutateAsync(number);
          done += 1;
        } catch (err) {
          if (!active() || isSessionEnded(err)) return;
          failure = `PR #${number}: ${message(err)}`;
          break;
        }
        if (!active()) return;
      }
      if (done === numbers.length) bridge.toast(`All ${done} pull requests imported from GitHub. Nothing has been evaluated yet.`);
      else if (done) bridge.toast(`${done} of ${numbers.length} pull requests imported. The import stopped at ${failure}`);
      if (done) await bridge.route();
      else setImportAllError(failure);
    } finally {
      importing.current = null;
      if (active()) setImportingAll(false);
    }
  }

  return (
    <>
      <a className="back" href="#/pr-assurance">← All applications</a>
      <div className="heading"><div>
        <div className="eyebrow">Pull request assurance{repository ? ` · ${repository}` : ''}</div>
        <h1>{text(field(field(scenario, 'application'), 'name'))}</h1>
        <p className="sub">Pull request assurance{repository ? <> for <span className="mono">{repository}</span></> : null}. Each pull request is checked against the business rules by this application's verifiers, run on GitHub Actions against its exact commit, with this application's own GitHub token.</p>
      </div>
      {canImport ? <div className="actions"><button className="button primary" data-action="import-all" disabled={importingAll || importMutation.isPending} onClick={() => void importAll()}>{importingAll ? 'Importing all…' : 'Import all from GitHub'}</button></div> : null}
      </div>
      {importAllError ? <div className="form-error" role="alert">{importAllError}</div> : null}
      {connection ? null : <div className="notice warning"><strong>This application is not connected to GitHub.</strong> <a href={`#/applications/${applicationId}`}>Add its repositories and token</a> before importing pull requests.</div>}
      {field(scenario, 'credentialsReady') === true ? null : <div className="notice warning"><strong>GitHub tokens cannot be used yet.</strong> Ask the deployer to set QIVVERA_CREDENTIAL_KEY.</div>}
      {connection ? (
        <section className="panel"><div className="panel-head"><div><h2>Rules assured against</h2>
          <p>{rules ? <>{text(field(rules, 'policies'))} rules · {text(field(rules, 'obligations'))} obligations · {text(field(field(rules, 'profile'), 'title'))}</> : 'No rules snapshot'}</p></div></div>
          <div className="panel-body"><p className="small">{rules
            ? <>From <span className="mono">{text(field(rules, 'repository'))}</span> at commit <span className="mono">{short(field(rules, 'commit'))}</span>, a fixed snapshot ({text(field(rules, 'snapshotDigest')).slice(0, 19)}…){field(rules, 'source') === 'BUNDLED' ? ', shipped with Qivvera' : ''}. Changing a rule means a new snapshot.</>
            : <>{text(field(field(connection, 'profiles'), 'repository'))} does not publish .qivvera/rules-snapshot.json, so pull requests can be imported but not evaluated. Add the snapshot, then save the application's GitHub access again.</>}</p></div>
        </section>
      ) : null}
      {pulls.length ? (
        <div className="pr-timeline" aria-label="Pull requests in order">
          {pulls.map((entry, index) => {
            const number = Number(field(entry, 'number'));
            return (
              <Fragment key={number}>
                {index > 0 ? <span className="pr-arrow" aria-hidden="true">→</span> : null}
                <PullCard entry={entry} applicationId={applicationId} canImport={canImport} importing={importingNumber === number}
                  error={errors[number] ?? ''} onImport={() => void importPull(number)} />
              </Fragment>
            );
          })}
        </div>
      ) : <section className="panel"><div className="empty"><h2>No pull requests imported yet</h2><p>{canImport ? 'Import all open pull requests, or show them below and import the ones to assure.' : 'An Author or a Policy Authority can import them once the application is connected to GitHub.'}</p></div></section>}
      {pulls.length > 1 && counts.every(count => count !== null) ? <p className="pr-progression" aria-label="Progression">{counts.join(' → ')} {counts.at(-1) === 1 ? 'rule' : 'rules'} broken</p> : null}
      <CompareTable obligations={list(field(scenario, 'obligations'))} pulls={pulls} />
      {canImport ? <GitHubPulls bridge={bridge} applicationId={applicationId} repository={repository} importingNumber={importingNumber} errors={errors} onImport={number => void importPull(number)} active={active} /> : null}
      <div className="notice">Importing reads pull-request metadata only. It does not run code, post to GitHub or block a merge.</div>
    </>
  );
}
