import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isSessionEnded, text } from '../shell-contract';
import { changeLink } from '../links';
import type { ActiveCheck } from '../visits';

/** Versioned preparation references. Every reuse requires a fresh plan decision. */

const id = (value: unknown): string => encodeURIComponent(String(value));
export const detailLink = (templateId: unknown, versionId?: unknown): string => `#/verification-templates/${id(templateId)}${versionId ? '/versions/' + id(versionId) : ''}`;
export const saveLink = (changeId: unknown, revisionId: unknown, templateId?: unknown): string => `#/template-save/${id(changeId)}/${id(revisionId)}${templateId ? '/' + id(templateId) : ''}`;
export const planLink = (changeId: unknown, revisionId: unknown, templateId?: unknown, versionId?: unknown): string =>
  `#/template-plan/${id(changeId)}/${id(revisionId)}${templateId ? '/' + id(templateId) + '/' + id(versionId) : ''}`;

/** A conflict means the saved record moved on; the person must review before trying again. */
export function problem(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (error as { status?: unknown } | null)?.status === 409 ? `${message} Reload this view and review the current records before trying again.` : message;
}

/** What links and buttons in a template view may do, only while that view is current. */
export interface TemplateActions {
  readonly active: ActiveCheck;
  /** Remembers which change tab a link opens (S.tab). */
  selectTab(tab: string): void;
  /** Re-reads the route (the shell's route()). */
  reload(): void;
  /** Re-reads the workspace summary (the shell's refresh()); throws on failure. */
  refreshWorkspace(): Promise<void>;
  /** The shell's router itself, for a save that lands on the same route. */
  route(): Promise<void>;
}

export function Boundary({ founderReview }: { founderReview: boolean }) {
  return <>{founderReview ? <div className="notice warning"><strong>Founder-review mode</strong><span>Same-person decisions are permitted and labelled. They do not establish independent approval.</span></div> : null}<div className="notice template-boundary"><span><strong>Reuse the approach; review the new mapping.</strong> Templates retain an earlier verification approach. They do not transfer requirement acceptance, execution evidence or a readiness result. Every non-rejected obligation remains mandatory.</span></div></>;
}

export function TabLink({ tab, href, className, actions, children }: { tab: string; href: string; className?: string; actions: TemplateActions; children: ReactNode }) {
  return <a className={className} data-template-tab={tab} href={href} onClick={() => actions.selectTab(tab)}>{children}</a>;
}

export function Back({ changeId, revisionId, actions }: { changeId: string; revisionId: string; actions: TemplateActions }) {
  return <TabLink tab="assurance" className="back" href={changeLink(changeId, revisionId)} actions={actions}>← Back to verification plan</TabLink>;
}

export function Input({ name, label, value = '', max = 2000, required = true, multiline = false, hint = '', disabled = false }: {
  name: string; label: string; value?: string; max?: number; required?: boolean; multiline?: boolean; hint?: string; disabled?: boolean;
}) {
  return <div className="form-field"><label htmlFor={name}>{label}{required ? ' *' : ''}</label>{multiline ? <textarea id={name} name={name} maxLength={max} required={required} defaultValue={value} disabled={disabled}></textarea> : <input id={name} name={name} maxLength={max} defaultValue={value} required={required} disabled={disabled} />}{hint ? <small>{hint}</small> : null}</div>;
}

export interface TemplateRequirement {
  readonly statement: unknown; readonly sourceReference?: unknown; readonly sourceVersion?: unknown; readonly criticality: unknown; readonly version: unknown;
  readonly acceptanceDecision?: { readonly actor?: unknown; readonly rationale?: unknown; readonly independentActor?: unknown } | null;
}
export interface TemplateEntry {
  readonly check: { readonly id: string; readonly title: unknown; readonly rule: unknown; readonly version?: unknown };
  readonly requirement: TemplateRequirement;
  readonly mappingRationale: unknown;
}

export function SourceRequirement({ entry }: { entry: TemplateEntry }) {
  const requirement = entry.requirement, decision = requirement.acceptanceDecision;
  const independent = decision?.independentActor === true;
  return <div className="template-source"><span className="field-label">Original mapped requirement · historical reference</span><p className="template-text">{text(requirement.statement)}</p><p className="small"><strong>Source:</strong> {text(requirement.sourceReference || 'Not supplied')} · {text(requirement.sourceVersion || 'No version')}<br />{text(requirement.criticality)} · Obligation version {text(requirement.version)}</p><details><summary>Original mapping rationale</summary><p className="template-text">{text(entry.mappingRationale)}</p></details><details><summary>Acceptance in the source revision</summary><p className="small">Recorded reviewer: {text(decision?.actor ?? 'Not available')}</p><p className="template-text">{text(decision?.rationale ?? 'No recorded decision rationale')}</p><p className={independent ? 'small muted' : 'notice warning'}>{independent ? 'Different recorded reviewer identity. Organizational independence is not established by this record.' : 'Source acceptance does not establish independent human review.'}</p><p className="small muted">This source decision does not accept any destination requirement.</p></details></div>;
}

/**
 * The mutation contract for template saves:
 * - one request key while the submitted content is unchanged, so a retry after a lost response
 *   cannot save twice (Increment 9 at-most-once receipts);
 * - every control is locked while saving; no automatic retry;
 * - after a save the workspace summary is refreshed, then the saved record is opened.
 */
export function useTemplateSave<Payload, Result>({ actions, label, recovery, data, submit, onSaved }: {
  actions: TemplateActions; label: string; recovery: string;
  data: (form: HTMLFormElement) => Payload;
  submit: (payload: Payload, requestKey: string) => Promise<Result>;
  onSaved: (result: Result) => string | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyNow = useRef(false);
  const attempt = useRef<{ fingerprint: string; requestKey: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!actions.active() || busyNow.current || !form.reportValidity()) return;
    const payload = data(form), fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, requestKey: crypto.randomUUID() };
    busyNow.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await submit(payload, attempt.current.requestKey);
      if (!actions.active()) return;
      await actions.refreshWorkspace();
      if (!actions.active()) return;
      const next = onSaved(result);
      if (next === location.hash) await actions.route();
      else if (next) location.hash = next;
    } catch (err) {
      if (!actions.active() || isSessionEnded(err)) return;
      setError(problem(err) + ' ' + recovery);
    } finally {
      busyNow.current = false;
      setBusy(false);
    }
  }

  return { onSubmit: (event: FormEvent<HTMLFormElement>) => void onSubmit(event), busy, error, buttonText: busy ? 'Saving…' : label };
}
