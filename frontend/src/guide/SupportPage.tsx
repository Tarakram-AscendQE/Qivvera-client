import { useQuery } from '@tanstack/react-query';
import { downloadJson } from '../download';
import { isSessionEnded, text, type Api } from '../shell-contract';
import { Detail } from './GuidePage';
import {
  ACTION_LABELS, CAPABILITY_LABELS, availabilityText, enabledText, reviewModeName, roleName,
  supportQueryOptions, toSupportReport, type SupportReport
} from './support-report';

export const SUPPORT_FILE_NAME = 'Qivvera-support-details.json';

function downloadReport(report: SupportReport): void {
  downloadJson(SUPPORT_FILE_NAME, JSON.stringify(report, null, 2) + '\n');
}

function storageCheckText(value: unknown): string {
  return value === 'reachable' ? 'Reachable when checked' : 'Unavailable or not established';
}

function storageText(value: unknown): string {
  return value === 'postgres' ? 'PostgreSQL' : value === 'sqlite' ? 'SQLite · local review only' : 'Unknown';
}

/**
 * Shows configuration diagnostics. The first read happens before this screen is shown; Refresh
 * reads again in place. A failed refresh keeps the last details visible and explains the failure.
 */
export function SupportPage({ api }: { api: Api }) {
  const query = useQuery(supportQueryOptions(api));
  if (!query.data) return null;
  const report = toSupportReport(query.data);
  const w = report.workspace;
  // api() already showed sign-in for an ended or replaced session.
  const refreshError = query.error && !isSessionEnded(query.error) ? query.error.message : null;

  return (
    <>
      <div className="heading"><div><div className="eyebrow">Help and diagnostics</div><h1>Workspace support</h1><p className="sub">Check the current configuration and gather details for your workspace operator.</p></div><div className="actions"><button className="button" id="refresh-support" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh support details</button><button className="button primary" id="download-support" onClick={() => downloadReport(report)}>Download support details</button></div></div>
      {refreshError !== null && <p className="form-error" role="alert">{refreshError}</p>}
      <div className="notice warning"><span><strong>These details describe configuration.</strong> Worker availability, live GitHub or AI-service access, evidence correctness and release acceptance have not been established by this check.</span></div>

      <section className="panel guide-section"><div className="panel-head"><h2>Current workspace</h2></div><div className="panel-body">
        <dl className="support-list"><dt>Product version</dt><dd>{text(report.product.version)}</dd><dt>Your role</dt><dd>{report.roles.map(roleName).join(' · ')}</dd><dt>Review mode</dt><dd>{reviewModeName(w.reviewMode)}</dd><dt>Storage check</dt><dd>{storageCheckText(w.storageCheck)}</dd><dt>Storage mode</dt><dd>{storageText(w.storage)}</dd><dt>Session cookie protection</dt><dd>{w.secureSession ? 'Secure-cookie setting enabled' : 'Local HTTP mode; use a protected hosted setup for hosted access'}</dd><dt>Checked at</dt><dd>{text(report.generatedAt)}</dd><dt>Request reference</dt><dd className="mono">{text(report.requestId)}</dd></dl>
        <p className="small muted">A reachable database does not establish migration correctness, backup restoration or deployed acceptance. The secure-cookie setting does not independently verify the end-to-end network connection.</p>
      </div></section>

      <section className="panel guide-section"><div className="panel-head"><h2>Configured features</h2></div><div className="panel-body"><dl className="support-list">{CAPABILITY_LABELS.map(([name, key]) => [<dt key={key + ':name'}>{name}</dt>, <dd key={key + ':value'}>{enabledText(report.capabilities[key])}</dd>])}</dl><p className="small muted">Enabled features still require valid records, permissions and external prerequisites. Target configuration is not a connection test.</p></div></section>

      <section className="panel guide-section"><div className="panel-head"><h2>Checks and next steps</h2></div><div className="panel-body">{report.warnings.length ? <ul className="support-warnings">{report.warnings.map((warning, index) => <li key={index}><strong>{text(warning.message)}</strong><p>{text(warning.nextStep)}</p></li>)}</ul> : <p>No configuration warnings were returned. Worker, provider, hosted and release checks still require separate evidence.</p>}</div></section>

      <section className="panel guide-section"><div className="panel-head"><h2>Ask for help with a specific action</h2></div><div className="panel-body"><p>Tell your workspace operator what you were trying to do, the time, the visible error and its request reference. Include a change or assessment ID when relevant. The downloaded support details contain configuration status, without account names, credentials, application records or evidence.</p><p>Review any additional text you share and keep passwords, tokens and sensitive business data out of support messages. This page does not send a message or upload the report anywhere.</p>
        <Detail title="Technical details for your operator"><dl className="support-list"><dt>Declared deployment revision</dt><dd className="mono">{text(report.product.revision)}</dd><dt>Observed schema version</dt><dd>{text(w.schemaVersion ?? 'Unavailable')}</dd><dt>Required schema version</dt><dd>{text(w.requiredSchemaVersion ?? 'Unavailable')}</dd><dt>Maximum supported schema version</dt><dd>{text(w.maxSupportedSchemaVersion)}</dd></dl><p className="small">The revision is deployment-supplied metadata. It is not an independently verified source or build attestation.</p></Detail>
        <Detail title="Actions available to your role"><dl className="support-list">{ACTION_LABELS.map(([name, key]) => [<dt key={key + ':name'}>{name}</dt>, <dd key={key + ':value'}>{availabilityText(report.actions[key])}</dd>])}</dl><p className="small">These are role-level hints. Record state, contributor independence, current versions and evidence checks can still prevent a specific action.</p></Detail>
      </div></section>
    </>
  );
}
