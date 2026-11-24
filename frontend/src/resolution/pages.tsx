import { Badge, formatDate } from '../format';
import { text } from '../shell-contract';
import { explain, Pagination, Rows, statusKind, statusLabel, type ResolutionPage } from './parts';

export function InboxPage({ data }: { data: ResolutionPage }) {
  return <><div className="heading"><div><div className="eyebrow">Resolution workspace</div><h1>Findings to resolve</h1><p className="sub">Keep the original finding visible. Link a correction. Confirm it with fresh evidence.</p></div><button className="button" data-resolution="refresh">Refresh</button></div><div className="notice">Resolution status and software readiness are separate. An item can be resolved while another obligation still prevents READY.</div><section className="panel"><Rows data={data} /><Pagination data={data} /></section></>;
}

interface Assessment { readonly finding?: { readonly state?: unknown; readonly reason?: unknown } | null; readonly status?: unknown; readonly sourceRevision?: unknown; readonly disposition?: unknown; readonly runId?: unknown }
export interface ResolutionRecord {
  readonly id: string; readonly changeId: unknown; readonly kind: unknown; readonly version: unknown; readonly status: unknown; readonly effectiveStatus: unknown; readonly reviewMode?: unknown;
  readonly notice: unknown; readonly assignedTo: unknown; readonly actionPlan?: unknown; readonly externalReference?: unknown; readonly correctionNote?: unknown;
  readonly correctionRevisionId?: unknown; readonly correctionRunFloor?: number; readonly correctionObligationId?: unknown;
  readonly source: { readonly finding: { readonly statement: unknown } };
  readonly comparison: { readonly source?: Assessment | null; readonly candidate?: Assessment | null; readonly eligible?: unknown; readonly blockers: readonly { readonly code: unknown; readonly message: unknown }[]; readonly expectations: { readonly original?: unknown; readonly correction?: unknown } };
  readonly challenges: readonly { readonly id: unknown; readonly state: unknown; readonly rationale: unknown; readonly raisedBy: unknown; readonly createdAt: unknown; readonly response?: unknown; readonly responseReason?: unknown; readonly respondedBy?: unknown; readonly independentActor?: unknown }[];
  readonly history: readonly { readonly action: unknown; readonly version: unknown; readonly rationale?: unknown; readonly actor: unknown; readonly createdAt: unknown; readonly snapshot?: unknown }[];
}

const spaced = (value: unknown): string => String(value ?? '').replaceAll('_', ' ');

function ResultCard({ title, result }: { title: string; result: Assessment | null | undefined }) {
  const state = result?.finding?.state;
  return <section className="panel"><div className="panel-head"><h2>{title}</h2></div><div className="panel-body">{result ? <><Badge text={state ?? result.status ?? 'NOT ASSESSED'} kind={state === 'SUPPORTED' ? 'accepted' : state === 'VIOLATED' ? 'rejected' : 'candidate'} /><p>{explain(result.finding?.reason ?? 'No completed finding')}</p><span className="field-label">Source revision</span><p className="mono">{text(result.sourceRevision)}</p><span className="field-label">Overall assessment</span><p>{spaced(result.disposition ?? 'No disposition')}</p><button className="button" data-action="open-assessment" data-id={text(result.runId)}>Inspect assessment</button></> : <><h3>No reassessment linked</h3><p>Propose a correction, run assurance through the change workspace, then link the new run.</p></>}</div></section>;
}

/** A resolution case. The original finding stays visible; a correction needs fresh, related evidence. */
export function ItemPage({ record: r, email, canTrack, isAuthority }: { record: ResolutionRecord; email: unknown; canTrack: boolean; isAuthority: boolean }) {
  const openChallenge = r.challenges.find(challenge => challenge.state === 'OPEN');
  const contributors = r.history.filter(event => event.action === 'CREATED' || event.action === 'PROPOSE_CORRECTION').map(event => event.actor);
  const independent = r.assignedTo !== email && !contributors.includes(email);
  const mayVerify = isAuthority && (independent || r.reviewMode === 'founder-review');
  const awaiting = r.status === 'AWAITING_REASSESSMENT';
  return (
    <>
      <a className="back" href={`#/changes/${text(r.changeId)}`}>← Open change workspace</a><div className="heading"><div><div className="eyebrow">Resolution {r.id.slice(0, 8).toUpperCase()}</div><h1>{text(r.source.finding.statement)}</h1><div className="chip-row"><Badge text={statusLabel(r.effectiveStatus)} kind={statusKind(r.effectiveStatus)} /><Badge text={spaced(r.kind)} /><Badge text={'Version ' + String(r.version)} /></div></div><button className="button" data-resolution="refresh">Refresh</button></div>
      {r.status === 'RESOLVED' && r.effectiveStatus !== 'RESOLVED' ? <div className="notice warning"><strong>Previous resolution retained in history. It no longer establishes current resolution.</strong></div> : null}
      {r.reviewMode === 'founder-review' ? <div className="notice warning">Founder-review mode permits same-person decisions. It does not establish independent review.</div> : null}
      <div className="notice">{text(r.notice)}</div>
      <section className="panel"><div className="panel-body"><div className="details"><div><span className="field-label">Accountable owner</span><p>{text(r.assignedTo)}</p><span className="field-label">Next action</span><p className="resolution-text">{text(r.actionPlan)}</p></div><div><span className="field-label">External reference — not connected</span><p>{text(r.externalReference || 'Not supplied')}</p><span className="field-label">Correction proposal</span><p>{text(r.correctionNote || 'Not yet proposed')}</p></div></div>
        {canTrack ? <div className="actions">{r.status === 'OPEN' ? <button className="button" data-resolution="start">Start work</button> : null}{r.status !== 'RESOLVED' ? <><button className="button" data-resolution="update">Edit ownership / action</button><button className="button primary" data-resolution="propose">Propose correction</button></> : <button className="button" data-resolution="reopen">Reopen</button>}{awaiting ? <><button className="button" data-resolution="link">Link reassessment</button><button className="button primary" data-resolution="verify" disabled={!(r.comparison.eligible && mayVerify)}>Verify resolution</button></> : null}<button className="button" data-resolution="note">Add note</button><button className="button" data-resolution="challenge" disabled={!!openChallenge}>Challenge finding</button></div> : null}
        {awaiting && !mayVerify ? <p className="small muted resolution-help">A different authorized Policy Authority must verify this correction.</p> : null}</div></section>
      <div className="resolution-comparison"><ResultCard title="Original finding" result={r.comparison.source} /><ResultCard title="Correction reassessment" result={r.comparison.candidate} /></div>
      <section className="panel"><div className="panel-head"><h2>Resolution review checks</h2></div><div className="panel-body">{r.comparison.eligible ? <p><strong>Evidence checks satisfied.</strong> An authorized reviewer must still confirm the correction. This does not mark the entire change READY.</p> : <ul className="resolution-blockers">{r.comparison.blockers.map((blocker, index) => <li key={index}><strong>{spaced(blocker.code)}</strong><p>{text(blocker.message)}</p></li>)}</ul>}<details><summary>Compare requirement wording and authority</summary><div className="observation-grid"><pre>{text(JSON.stringify(r.comparison.expectations.original, null, 2))}</pre><pre>{text(JSON.stringify(r.comparison.expectations.correction, null, 2))}</pre></div></details></div></section>
      <section className="panel resolution-source"><div className="panel-head"><h2>Challenges and responses</h2></div><div className="panel-body">{r.challenges.length ? r.challenges.map((challenge, index) => <article className="run-card" key={index}><Badge text={challenge.state} /><p>{text(challenge.rationale)}</p><p className="small">{text(challenge.raisedBy)} · {formatDate(challenge.createdAt)}</p>{challenge.state === 'OPEN' && isAuthority ? <button className="button" data-resolution="respond" data-challenge={text(challenge.id)}>Respond to challenge</button> : null}{challenge.response ? <><p><strong>{spaced(challenge.response)}</strong> · {text(challenge.responseReason)}</p><p className="small">{text(challenge.respondedBy)} · {challenge.independentActor ? 'Different identity recorded' : 'Same-person review; not independent'}</p></> : null}</article>) : <p>No challenge recorded. A response cannot delete evidence or waive a violation.</p>}</div></section>
      <section className="panel resolution-source"><div className="panel-head"><h2>Resolution history</h2><a className="button" href={`/api/resolutions/${r.id}/export`}>Export resolution case</a></div><div className="panel-body">{[...r.history].reverse().map((event, index) => <article className="activity" key={index}><strong>{spaced(event.action)} · Version {text(event.version)}</strong><p>{text(event.rationale)}</p><p>{text(event.actor)} · {formatDate(event.createdAt)}</p><details><summary>Recorded snapshot</summary><pre>{text(JSON.stringify(event.snapshot, null, 2))}</pre></details></article>)}</div></section>
    </>
  );
}
