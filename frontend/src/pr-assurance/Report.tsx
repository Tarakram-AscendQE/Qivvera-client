import { field } from '../json';
import { text } from '../shell-contract';

/** The report of a completed run. Stored evidence that fails its check is reported, never shown as a result. */
export function Report({ report }: { report: unknown }) {
  if (field(report, 'ok') === false) {
    return <div className="notice warning"><strong>The stored evidence failed its integrity check.</strong> {text(field(report, 'message'))} No result is shown.</div>;
  }
  return <div className="pr-report"><p className="pr-summary">{text(field(report, 'summary'))}</p></div>;
}
