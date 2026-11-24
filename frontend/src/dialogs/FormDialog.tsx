import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isSessionEnded } from '../legacy-bridge';
import type { ActiveCheck } from '../visits';

/** What a dialog may do, as the legacy shell defines it. */
export interface DialogEnvironment {
  /** True while the page that opened the dialog is still the visible view. */
  readonly active: ActiveCheck;
  /** True while this dialog is still open and no newer dialog replaced it. */
  readonly present: () => boolean;
  /** The legacy closeDialog(). */
  readonly close: () => void;
  /** Re-reads the workspace summary. */
  readonly refresh: () => Promise<void>;
  readonly toast: (text: string) => void;
  /** The legacy route(): re-reads and redraws the current view. */
  readonly route: () => Promise<void>;
}

/** One labelled field, with the legacy field() markup. Label and hint are product text, not server text. */
export function Field({ id, label, type = 'text', value = '', hint = '', required = false }: { id: string; label: string; type?: string; value?: string; hint?: string; required?: boolean }) {
  return <div className="form-field"><label htmlFor={id}>{label}{required ? ' *' : ''}</label>{type === 'textarea' ? <textarea id={id} name={id} required={required} defaultValue={value}></textarea> : <input id={id} name={id} type={type} defaultValue={value} required={required} />}{hint ? <small>{hint}</small> : null}</div>;
}

/**
 * The legacy openForm() contract. A save is sent once; controls stay locked until it settles; a lost
 * or failed save is never repeated automatically. After a save the dialog closes, the workspace
 * summary is refreshed, and the returned route opens (or the current view is redrawn).
 */
export function FormDialog({ title, description, saveLabel, submit, env, children }: {
  title: string; description: string; saveLabel: string; env: DialogEnvironment; children: ReactNode;
  submit: (data: Record<string, string>) => Promise<string | undefined | void>;
}) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!env.present() || savingNow.current || !form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const controls = [...form.elements] as (HTMLElement & { disabled: boolean })[];
    const disabled = controls.map(control => control.disabled);
    let saved = false;
    controls.forEach(control => { control.disabled = true; });
    savingNow.current = true;
    setSaving(true);
    setError('');
    try {
      const next = await submit(data);
      saved = true;
      if (!env.present()) return;
      env.close();
      await env.refresh();
      if (!env.active()) return;
      env.toast('Saved to your workspace.');
      if (typeof next === 'string' && next !== location.hash) location.hash = next;
      else await env.route();
    } catch (err) {
      if (!env.active() || isSessionEnded(err)) return;
      if (saved) { env.toast('Your action was saved, but the workspace could not be refreshed. Reload the view to inspect the saved record.'); return; }
      if (!env.present()) return;
      const message = err instanceof Error ? err.message : String(err);
      setError((err as { status?: unknown }).status === 409 ? message + ' Close this dialog and reload the view before trying again.' : message);
    } finally {
      controls.forEach((control, index) => { control.disabled = disabled[index]!; });
      savingNow.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <div className="modal-head"><div><h2 id="modal-title">{title}</h2></div><button className="close" data-close="" aria-label="Close dialog" onClick={env.close}>×</button></div>
      <div className="modal-body"><p className="small muted">{description}</p><form onSubmit={event => void onSubmit(event)}><div className="form-error" role="alert">{error}</div>{children}<div className="form-actions"><button className="button" type="button" data-close="" onClick={env.close}>Cancel</button><button className="button primary" type="submit">{saving ? 'Saving…' : saveLabel}</button></div></form></div>
    </>
  );
}
