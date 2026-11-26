import { Badge, formatDate } from '../format';
import { field, list } from '../json';
import { text } from '../shell-contract';

const DISPOSITION_KIND: Record<string, string> = { READY: 'finding-good', NOT_READY: 'finding-bad', INDETERMINATE: 'finding-gap' };
const STATE_KIND: Record<string, string> = { SUPPORTED: 'finding-good', VIOLATED: 'finding-bad', INSUFFICIENT: 'finding-gap', NOT_ASSESSED: 'finding-gap' };
const rulesText = (n: number) => (n === 1 ? '1 business rule is' : `${n} business rules are`);

/** The team's own tests on this commit: context only, never part of the verdict. */
function TeamTests({ report }: { report: unknown }) {
  const team = field(report, 'teamTests'), broken = Number(field(field(report, 'counts'), 'brokenRules'));
  if (!team) return <p className="pr-team small">The team’s own tests could not run on this commit. They are context only and never part of the verdict.</p>;
  const passed = Number(field(team, 'passed')), total = Number(field(team, 'total'));
  return (
    <div className="pr-team">
      <p>The team’s own tests on this commit: <strong>{passed} of {total} passed</strong>{Number(field(team, 'failed')) ? `, ${text(field(team, 'failed'))} failed` : ''}. <span className="small muted">Context only; never part of the verdict.</span></p>
      {passed === total && broken > 0 ? <p className="pr-contrast">The team’s own tests all passed, yet {rulesText(broken)} broken.</p> : null}
    </div>
  );
}

function Comparison({ comparison }: { comparison: unknown }) {
  if (!comparison) return null;
  const previous = text(field(comparison, 'previousPull'));
  const row = (label: string, ids: readonly unknown[], kind: string) => (
    <div className="pr-compare-row"><dt>{label}</dt><dd>{ids.length ? ids.map(id => <Badge key={text(id)} text={id} kind={kind} />) : <span className="small muted">none</span>}</dd></div>
  );
  return (
    <section className="pr-compare" aria-label={`Since PR #${previous}`}>
      <h3>Since PR #{previous}</h3>
      <dl>
        {row('Fixed', list(field(comparison, 'fixed')), 'finding-good')}
        {row('Still broken', list(field(comparison, 'stillBroken')), 'finding-bad')}
        {row('Newly broken', list(field(comparison, 'newlyBroken')), 'finding-bad')}
      </dl>
    </section>
  );
}

/** One failing obligation: what the rule requires, which check showed it, and what was observed. */
function FailingObligation({ obligation, exceptionsAllowed }: { obligation: unknown; exceptionsAllowed: boolean }) {
  const state = text(field(obligation, 'state')), statement = text(field(obligation, 'statement'));
  const observation = field(obligation, 'observation');
  return (
    <div className="pr-obligation" data-obligation={text(field(obligation, 'id'))}>
      <div className="chip-row"><Badge text={state} kind={STATE_KIND[state] ?? ''} /><strong className="mono">{text(field(obligation, 'id'))}</strong></div>
      <p>{statement}</p>
      <dl className="boundary">
        <dt>Checked by</dt><dd><span className="mono">{text(field(obligation, 'check'))}</span>{field(obligation, 'checkDescription') ? <span className="small muted"> · {text(field(obligation, 'checkDescription'))}</span> : null}</dd>
        <dt>What happened</dt><dd><pre className="pr-observed">{text(field(obligation, 'reason')) || 'No result was recorded for this check.'}</pre></dd>
        <dt>What would resolve it</dt><dd>Change the code so that “{statement}” holds, then evaluate the new commit.</dd>
      </dl>
      {observation ? <details><summary>Observation recorded by the check</summary><pre className="pr-observed">{JSON.stringify(observation, null, 2)}</pre></details> : null}
      {state === 'VIOLATED' ? <p className="small">A violation cannot be waived by an exception.</p>
        : exceptionsAllowed ? <p className="small">Missing evidence may be covered only by an exception approved by the rule’s owner; none exist in this demo.</p> : null}
    </div>
  );
}

function RuleCard({ rule }: { rule: unknown }) {
  const failing = list(field(rule, 'obligations')).filter(o => field(o, 'state') !== 'SUPPORTED');
  return (
    <article className="pr-rule" data-rule={text(field(rule, 'id'))}>
      <div className="pr-rule-head"><div><span className="mono">{text(field(rule, 'id'))}</span><h3>{text(field(rule, 'title'))}</h3></div><Badge text="BROKEN" kind="finding-bad" /></div>
      <p className="small muted">Owner {text(field(rule, 'owner'))} · severity {text(field(rule, 'severity'))}</p>
      <p className="small">{text(field(rule, 'rule'))}</p>
      {failing.map(o => <FailingObligation key={text(field(o, 'id'))} obligation={o} exceptionsAllowed={field(rule, 'exceptionsAllowed') === true} />)}
    </article>
  );
}

function AllObligations({ rules }: { rules: readonly unknown[] }) {
  const rows = rules.flatMap(rule => list(field(rule, 'obligations')));
  return (
    <details className="pr-all">
      <summary>All {rows.length} obligations</summary>
      <table aria-label="All obligations">
        <thead><tr><th>State</th><th>Obligation</th><th>Statement</th><th>Check</th></tr></thead>
        <tbody>{rows.map(o => {
          const state = text(field(o, 'state'));
          return <tr key={text(field(o, 'id'))}><td><Badge text={state} kind={STATE_KIND[state] ?? ''} /></td><td className="mono">{text(field(o, 'id'))}</td><td>{text(field(o, 'statement'))}</td><td className="mono">{text(field(o, 'check'))}</td></tr>;
        })}</tbody>
      </table>
    </details>
  );
}

function Proof({ proof, obligations }: { proof: unknown; obligations: number }) {
  const runUrl = text(field(proof, 'githubRunUrl'));
  return (
    <section className="pr-proof" aria-label="Proof">
      <h3>Proof</h3>
      <dl className="boundary">
        <dt>Pull request</dt><dd>#{text(field(proof, 'pullNumber'))} at <span className="mono">{text(field(proof, 'headSha'))}</span></dd>
        <dt>Environment</dt><dd>{field(proof, 'environmentConfirmed') === true ? 'Confirmed to run this commit before and after the checks (V1)' : 'Not confirmed: no other result counts'}</dd>
        <dt>Rules</dt><dd>{text(field(proof, 'rulesRepository')) || 'Rules snapshot'} at <span className="mono">{text(field(proof, 'rulesCommit'))}</span> · snapshot <span className="mono">{text(field(proof, 'snapshotDigest'))}</span></dd>
        <dt>Checks</dt><dd>{text(field(proof, 'testsRepository')) || 'Verifiers repository'} at <span className="mono">{text(field(proof, 'verifiersCommit'))}</span>{runUrl ? <> · <a href={runUrl} target="_blank" rel="noreferrer">GitHub run</a></> : null}</dd>
        <dt>Evidence SHA-256</dt><dd className="mono">{text(field(proof, 'evidenceSha256'))}</dd>
        <dt>Checks ran</dt><dd>{formatDate(field(proof, 'startedAt'))} – {formatDate(field(proof, 'finishedAt'))}</dd>
      </dl>
      <p className="small">Only these {obligations} obligations were checked. This is not a release approval. The SHA-256 shows the stored evidence is unchanged since it was verified; it is not a signature.</p>
    </section>
  );
}

/** The report of a completed run. Stored evidence that fails its check is reported, never shown as a result. */
export function Report({ report }: { report: unknown }) {
  if (field(report, 'ok') === false) {
    return <div className="notice warning"><strong>The stored evidence failed its integrity check.</strong> {text(field(report, 'message'))} No result is shown.</div>;
  }
  const disposition = text(field(report, 'disposition'));
  const rules = list(field(report, 'rules')), broken = rules.filter(rule => field(rule, 'broken') === true);
  return (
    <div className="pr-report">
      <div className="pr-result"><Badge text={disposition.replace('_', ' ')} kind={DISPOSITION_KIND[disposition] ?? ''} />
        <p className="pr-summary">{text(field(report, 'summary'))}</p></div>
      <p className="small muted">{text(field(report, 'dispositionReason'))}</p>
      <TeamTests report={report} />
      <Comparison comparison={field(report, 'comparison')} />
      <h3>{broken.length ? 'What blocks this change' : 'Business rules'}</h3>
      {broken.length ? broken.map(rule => <RuleCard key={text(field(rule, 'id'))} rule={rule} />) : <p>No business rule is broken on this commit.</p>}
      <AllObligations rules={rules} />
      <Proof proof={field(report, 'proof')} obligations={Number(field(field(report, 'counts'), 'obligations'))} />
    </div>
  );
}
