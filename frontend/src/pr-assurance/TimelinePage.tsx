import { useMutation } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import { Badge, formatDate } from '../format';
import { field, list } from '../json';
import { isSessionEnded, text } from '../shell-contract';
import type { ActiveCheck } from '../visits';
import type { PrAssuranceBridge } from './pr-assurance-module';

const short = (sha: unknown) => text(sha).slice(0, 7);
const STATUS_LABEL: Record<string, string> = { QUEUED: 'Waiting for GitHub', RUNNING: 'Running', FAILED: 'Run failed', TIMED_OUT: 'Timed out', CANCELLED: 'Cancelled' };
const DISPOSITION_KIND: Record<string, string> = { READY: 'finding-good', NOT_READY: 'finding-bad', INDETERMINATE: 'finding-gap' };

/** One pull request: what was imported from GitHub, and its latest run. */
function PullCard({ entry, canImport, importing, error, onImport }: {
  entry: unknown; canImport: boolean; importing: boolean; error: string; onImport: () => void;
}) {
  const number = text(field(entry, 'number')), pull = field(entry, 'pull'), run = field(entry, 'latestRun');
  const disposition = text(field(run, 'disposition')), status = text(field(run, 'status'));
  return (
    <article className="pr-card" data-pull={number}>
      <div className="pr-card-head"><span className="pr-number">PR #{number}</span>
        {run ? <Badge text={disposition ? disposition.replace('_', ' ') : STATUS_LABEL[status] ?? status} kind={DISPOSITION_KIND[disposition] ?? 'candidate'} /> : <Badge text={pull ? 'Not evaluated' : 'Not imported'} />}
      </div>
      {pull ? (
        <>
          <h3>{text(field(pull, 'title'))}</h3>
          <dl className="boundary">
            <dt>Branch</dt><dd className="mono">{text(field(pull, 'headRef'))}</dd>
            <dt>Head commit</dt><dd className="mono">{short(field(pull, 'headSha'))}</dd>
            <dt>Imported</dt><dd>{formatDate(field(pull, 'importedAt'))} by {text(field(pull, 'importedBy'))}</dd>
          </dl>
          <a className="link-button" href={text(field(pull, 'url'))} target="_blank" rel="noreferrer">Open on GitHub</a>
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

  return (
    <>
      <div className="heading"><div>
        <div className="eyebrow">{text(field(scenario, 'application'))} · {text(field(scenario, 'repository'))}</div>
        <h1>Pull request assurance</h1>
        <p className="sub">{text(field(scenario, 'change'))}. Each pull request is checked against the business rules by Qivvera's own tests, run on GitHub Actions against its exact commit.</p>
      </div></div>
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
      <div className="notice">Importing reads pull-request metadata only. It does not run code, post to GitHub or block a merge.</div>
    </>
  );
}
