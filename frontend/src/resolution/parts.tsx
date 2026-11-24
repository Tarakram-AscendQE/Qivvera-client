import { Badge, formatDate } from '../format';
import { lookup } from '../json';
import { text } from '../legacy-bridge';

/** Increment 4 resolution records. The server rechecks every permission, version and evidence rule. */

export interface ResolutionItem {
  readonly id: string; readonly kind: unknown; readonly effectiveStatus: unknown; readonly assignedTo: unknown; readonly sourceRunId: unknown; readonly updatedAt: unknown;
  readonly source: { readonly finding: { readonly statement: unknown } };
}
export interface ResolutionPage { readonly items: readonly ResolutionItem[]; readonly total: number; readonly offset: number; readonly limit: number; readonly hasMore?: unknown }
export interface RunForResolution {
  readonly id: string; readonly status: string; readonly disposition?: string | null;
  readonly case?: { readonly findings?: readonly { readonly state: unknown; readonly obligationId: unknown; readonly statement: unknown }[] } | null;
  readonly snapshot?: { readonly mappings?: readonly { readonly obligationId: unknown }[]; readonly mapping?: { readonly obligationId: unknown } } | null;
}

const STATUS_LABELS: Readonly<Record<string, string>> = { OPEN: 'Open', IN_PROGRESS: 'In progress', AWAITING_REASSESSMENT: 'Awaiting reassessment', RESOLVED: 'Resolution verified', REASSESSMENT_REQUIRED: 'Reassessment required' };
const EXPLANATIONS: Readonly<Record<string, string>> = {
  REQUESTER_APPROVED_OWN_REQUEST: 'The requester approved their own request.',
  SELF_APPROVAL_REJECTED_AND_INDEPENDENT_APPROVAL_SUCCEEDED: 'Self-approval was rejected and approval by a different eligible person succeeded.',
  UNRESOLVED_PRIOR_COUNTEREXAMPLE: 'A valid earlier counterexample remains unresolved.',
  AUTHORITATIVE_REQUIREMENT_UNRESOLVED: 'The applicable requirement has not been accepted.',
  NO_SUPPORTED_VERIFIER_MAPPING: 'No supported verification is mapped to this requirement.'
};

export const statusLabel = (status: unknown): unknown => lookup(STATUS_LABELS, status) ?? status;
export const statusKind = (status: unknown): string => (status === 'RESOLVED' ? 'accepted' : status === 'REASSESSMENT_REQUIRED' ? 'clarify' : 'candidate');
export const explain = (value: unknown): string => lookup(EXPLANATIONS, value) ?? String(value ?? '').replaceAll('_', ' ');
export const runLabel = (run: { readonly disposition?: string | null; readonly status: string }): string => (run.disposition ?? run.status).replaceAll('_', ' ');
const spaced = (value: unknown): string => String(value ?? '').replaceAll('_', ' ');

export function Rows({ data }: { data: ResolutionPage }) {
  if (!data.items.length) return <div className="empty"><h3>No resolution items yet</h3><p>Open an assessment with a violation, a gap, or an execution failure, then track its resolution. No findings are invented from a passing assessment.</p></div>;
  return <>{data.items.map(item => <article className="resolution-row" key={item.id}><div><span className="field-label">{spaced(item.kind)} · {item.id.slice(0, 8).toUpperCase()}</span><h3><a href={`#/resolutions/${item.id}`}>{text(item.source.finding.statement)}</a></h3><p className="small muted">Owner: {text(item.assignedTo)} · Source assessment {text(item.sourceRunId).slice(0, 8)}</p></div><div><Badge text={statusLabel(item.effectiveStatus)} kind={statusKind(item.effectiveStatus)} /><p className="small muted">{formatDate(item.updatedAt)}</p></div></article>)}</>;
}

/** Pages through items across all change revisions; buttons act through data-resolution. */
export function Pagination({ data, scope = 'all' }: { data: ResolutionPage; scope?: string }) {
  return <div className="resolution-pagination"><span>{data.total ? data.offset + 1 : 0}–{data.offset + data.items.length} of {data.total} items · across all change revisions</span><div className="actions"><button className="button" data-resolution="page" data-scope={scope} data-offset={Math.max(0, data.offset - data.limit)} disabled={!data.offset}>Previous</button><button className="button" data-resolution="page" data-scope={scope} data-offset={data.offset + data.limit} disabled={!data.hasMore}>Next</button></div></div>;
}

/** "Track resolution" for each violated or insufficient finding, or each mapping of a failed run. */
export function SourceButtons({ run, enabled }: { run: RunForResolution; enabled: boolean }) {
  if (!enabled) return null;
  const findings = run.status === 'FAILED'
    ? (run.snapshot?.mappings ?? [run.snapshot?.mapping]).map(mapping => ({ obligationId: mapping?.obligationId, statement: 'Investigate execution failure' }))
    : (run.case?.findings ?? []).filter(finding => finding.state === 'VIOLATED' || finding.state === 'INSUFFICIENT').map(finding => ({ obligationId: finding.obligationId, statement: text(finding.statement) }));
  return <>{findings.map((finding, index) => <button className="button" data-resolution="create" data-run={run.id} data-obligation={text(finding.obligationId)} key={index}>Track resolution: {finding.statement.slice(0, 65)}{finding.statement.length > 65 ? '…' : ''}</button>)}</>;
}

export interface ResolutionTabState {
  readonly resolutions: ResolutionPage | null;
  readonly resolutionError: string | null;
  readonly runs: readonly RunForResolution[];
  /** Resolution is on and the person is an Author or Policy Authority. */
  readonly canTrack: boolean;
}

/** The change page's Resolutions tab. Resolution status and software readiness stay separate. */
export function ResolutionChangeTab({ state }: { state: ResolutionTabState }) {
  if (state.resolutionError) return <div className="notice warning">{state.resolutionError}</div>;
  const data = state.resolutions ?? { items: [], total: 0, limit: 50, offset: 0, hasMore: false };
  const runs = state.runs.filter(run => run.status === 'FAILED' || run.case?.findings?.some(finding => finding.state === 'VIOLATED' || finding.state === 'INSUFFICIENT'));
  return (
    <>
      <section className="panel"><div className="panel-head"><div><h2>Findings to resolve</h2><p>Owners, corrections and evidence-backed review. Not a release waiver.</p></div><button className="button" data-resolution="refresh">Refresh</button></div><Rows data={data} /><Pagination data={data} scope="change" /></section>
      {state.canTrack && runs.length ? <section className="panel resolution-source"><div className="panel-head"><h2>Track a finding from this revision</h2></div><div className="panel-body">{runs.map(run => <div className="run-card" key={run.id}><p><Badge text={runLabel(run)} /> · Assessment {run.id.slice(0, 8)}</p><div className="actions"><SourceButtons run={run} enabled={state.canTrack} /></div></div>)}</div></section> : null}
    </>
  );
}
