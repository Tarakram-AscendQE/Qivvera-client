import { lookup } from '../json';

/** Drafting prepares human-reviewed candidates. Source and model text are always data. */

export const methodLabel = (method: unknown): string => (method === 'openai' ? 'AI suggestions · OpenAI' : 'Explicit clauses · rule-based');

const STATUS_LABELS: Readonly<Record<string, string>> = {
  GENERATING: 'Generation in progress', COMPLETED: 'Drafts prepared', FAILED: 'Generation failed', EXPIRED: 'Generation expired',
  PROPOSED: 'Awaiting your decision', CANDIDATE_CREATED: 'Draft candidate created', DISMISSED: 'Suggestion dismissed'
};
/** Unknown statuses are shown as received. */
export const statusLabel = (status: unknown): unknown => lookup(STATUS_LABELS, status) ?? status;

const WARNINGS: Readonly<Record<string, string>> = {
  LIMIT_REACHED: 'The suggestion limit was reached. Review the full source and add any remaining applicable obligations yourself.',
  LONG_CLAUSES_SKIPPED: 'Some matching clauses exceeded the supported length and were omitted. Review the source and record those requirements manually.'
};
export const warningText = (code: unknown): string => lookup(WARNINGS, code) ?? 'The saved run reports a limitation: ' + String(code);

const FAILURES: Readonly<Record<string, string>> = {
  DRAFTING_PROVIDER_UNAVAILABLE: 'The configured AI service could not be reached. Ask the workspace operator to check its availability.',
  DRAFTING_PROVIDER_ACCESS_FAILED: 'The AI service rejected the configured access. Ask the workspace operator to check the protected configuration.',
  DRAFTING_PROVIDER_RATE_LIMITED: 'The AI service limited this request. Review this saved attempt before explicitly trying again later.',
  DRAFTING_PROVIDER_TIMEOUT: 'The AI service did not finish within the allowed time. No successful drafts are claimed.',
  DRAFTING_PROVIDER_INVALID_RESPONSE: 'The AI service returned an unusable response. It was not accepted as a completed set of drafts.',
  DRAFTING_PROVIDER_REFUSED: 'The AI service declined the request. No drafts were accepted.',
  DRAFTING_PROVIDER_INCOMPLETE: 'The AI response was incomplete. No partial result was accepted.',
  DRAFTING_UNGROUNDED_OUTPUT: 'The proposed quotations did not match the saved source. The result was rejected.',
  DRAFTING_INVALID_OUTPUT: 'The proposed result did not meet the drafting contract. It was rejected.',
  DRAFTING_GENERATION_FAILED: 'Generation could not be completed. Review the saved attempt and contact the workspace operator if needed.',
  DRAFTING_GENERATION_EXPIRED: 'This generation did not complete in time. It has not been retried automatically.'
};
export const failureText = (code: unknown): string =>
  lookup(FAILURES, code) ?? 'This run could not produce an accepted drafting result. Ask the workspace operator to inspect its reference.';

export const draftingBase = (changeId: string, revisionId: string): string => `#/drafting/${encodeURIComponent(changeId)}/${encodeURIComponent(revisionId)}`;
export const runLink = (changeId: string, revisionId: string, id: unknown): string => `${draftingBase(changeId, revisionId)}/runs/${encodeURIComponent(String(id))}`;

export interface SourceSize { text: string; characters: number; bytes: number; lines: number }

/** Line endings are normalized before counting and before saving, as the server does. */
export function sourceSize(value: string): SourceSize {
  const normalized = value.replace(/\r\n?/g, '\n');
  return { text: normalized, characters: normalized.length, bytes: new TextEncoder().encode(normalized).length, lines: normalized.split('\n').length };
}

export const sizeText = (size: SourceSize): string => `${size.characters} / 6,000 characters · ${size.bytes} / 12,000 bytes · ${size.lines} / 200 lines`;

export const sizeProblem = (size: SourceSize): string =>
  size.bytes > 12000 ? 'Reduce the excerpt to at most 12,000 UTF-8 bytes.' : size.lines > 200 ? 'Reduce the excerpt to at most 200 lines.' : '';

/** A conflict means the saved record moved on; the person must reconcile, not resubmit blindly. */
export function problem(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (error as { status?: unknown } | null)?.status === 409 ? `${message} Reload the saved run and reconcile its current state before trying again.` : message;
}
