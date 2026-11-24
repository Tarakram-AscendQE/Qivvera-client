import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { field } from '../json';
import { Field, FormDialog } from '../dialogs/FormDialog';
import { openFormDialog, type DialogServices } from '../dialogs/open-form';
import { isSessionEnded, text, type Api, type Can, type ShellState } from '../shell-contract';
import type { ActiveCheck } from '../visits';

/** The import dialog uses the shared React dialog; DialogServices carries closeDialog, refresh, toast and route. */
export interface IntakeBridge extends DialogServices {
  readonly S: ShellState;
  readonly api: Api;
  readonly can: Can;
}

const TRUNCATION_NOTE = '\n[Preview truncated; full supported description retained in the source receipt.]';
const DESCRIPTION_LIMIT = 4000;

/**
 * Source metadata is untrusted. It is shown as text only, never as markdown, HTML or an instruction,
 * and a preview is not a requirement, evidence or readiness.
 */
function PreviewResult({ preview, onImport }: { preview: unknown; onImport: () => void }) {
  const source = field(preview, 'source');
  const body = text(field(source, 'body'));
  return (
    <section className="panel resolution-source"><div className="panel-head"><div><h2>Review before importing</h2><p>{text(field(source, 'repository'))} #{text(field(source, 'pullNumber'))}{field(source, 'draft') ? ' · Draft pull request' : ''}</p></div></div><div className="panel-body"><h3>{text(field(source, 'title'))}</h3><p className="small">Imported change title: {text(field(source, 'importedTitle'))}</p><dl className="boundary"><dt>Head SHA</dt><dd>{text(field(source, 'headSha'))}</dd><dt>Base SHA</dt><dd>{text(field(source, 'baseSha'))}</dd><dt>Head repository</dt><dd>{text(field(source, 'headRepository'))}</dd><dt>Preview expires</dt><dd>{text(field(preview, 'expiresAt'))}</dd></dl><details><summary>Untrusted pull-request description</summary><pre className="source-description">{body.slice(0, DESCRIPTION_LIMIT)}{body.length > DESCRIPTION_LIMIT ? TRUNCATION_NOTE : ''}</pre></details><div className="notice warning">Nothing here is an accepted requirement or proof. Import rechecks the provider; changed source or metadata requires a new preview.</div><button className="button primary" id="source-import" onClick={onImport}>Import reviewed context</button></div></section>
  );
}

export function IntakePage({ bridge, repositories, active }: { bridge: IntakeBridge; repositories: readonly unknown[]; active: ActiveCheck }) {
  const { S, api, can } = bridge;
  const [preview, setPreview] = useState<unknown>(null);
  const [error, setError] = useState('');
  // Synchronous guard: a second submit while a preview is in flight is ignored, as before.
  const previewing = useRef(false);
  const previewMutation = useMutation({
    mutationFn: (data: { repositoryKey: string; pullNumber: number }) => api('/api/source-previews', { method: 'POST', data })
  });
  const author = can('AUTHOR');
  const applications = S.workspace?.applications ?? [];

  async function submitPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active() || previewing.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    previewing.current = true;
    setError('');
    try {
      const data = new FormData(form);
      const result = await previewMutation.mutateAsync({ repositoryKey: String(data.get('repositoryKey')), pullNumber: Number(data.get('pullNumber')) });
      if (!active()) return;
      setPreview(result);
    } catch (err) {
      if (!active() || isSessionEnded(err)) return;
      setError(err instanceof Error ? err.message : String(err));
      setPreview(null);
    } finally {
      previewing.current = false;
    }
  }

  function openImport(current: unknown) {
    if (!active()) return;
    const changes = (S.workspace?.changes ?? []).filter(change => change.applicationId === field(current, 'applicationId'));
    openFormDialog(bridge, env => (
      <FormDialog env={env} title="Import reviewed source" description="Choose a new change or an explicit existing change. A copied obligation becomes a candidate and receives no inherited evidence." saveLabel="Import source"
        submit={async data => {
          const change = changes.find(candidate => candidate.id === data['changeId']);
          const result = await api('/api/source-imports', { method: 'POST', data: { previewId: field(current, 'id'), changeId: change?.id ?? null, expectedRevisionId: change?.revision?.id ?? null, copyObligations: !!change && data['copyObligations'] === 'on', reason: data['reason'] } });
          if (active()) bridge.toast('Source context saved. No assurance result was created.');
          return `#/changes/${text(field(result, 'changeId'))}`;
        }}>
        <div className="form-field"><label htmlFor="changeId">Destination</label><select name="changeId" id="changeId"><option value="">Create a new change</option>{changes.map(change => <option value={change.id} key={change.id}>New revision of: {text(change.title)}</option>)}</select></div>
        <Field id="reason" label="Why does this source belong here?" type="textarea" hint="At least 10 characters; a human import rationale, not an auto-accepted PR instruction." required />
        <label className="acknowledge"><input type="checkbox" name="copyObligations" /> Copy prior candidates when adding to an existing change</label>
      </FormDialog>
    ));
  }

  return (
    <>
      <div className="heading"><div><div className="eyebrow">Development workflow</div><h1>Import a GitHub change</h1><p className="sub">Preview the exact source reference. Import context—not requirements, evidence or readiness.</p></div></div>
      <div className="notice">Repository access is configured by the operator. This does not fetch or execute repository code, verify a deployment, post a GitHub check or grant workspace permissions.</div>
      <section className="panel"><div className="panel-body">{author && repositories.length ? (
        <form id="source-preview" onSubmit={event => void submitPreview(event)}><div className="form-error" role="alert">{error}</div><div className="form-field"><label htmlFor="repositoryKey">Authorized repository</label><select name="repositoryKey" id="repositoryKey">{repositories.map((repository, index) => <option key={index} value={text(field(repository, 'id'))}>{`${String(field(repository, 'owner'))}/${String(field(repository, 'repo'))}`} · {applications.find(application => application.id === field(repository, 'applicationId'))?.name ?? 'Configured application'}</option>)}</select></div><div className="form-field"><label htmlFor="pullNumber">Open pull-request number</label><input id="pullNumber" name="pullNumber" type="number" min="1" max="2147483647" required /></div><button className="button primary" type="submit" disabled={previewMutation.isPending}>Preview source metadata</button></form>
      ) : (
        <><h2>{author ? 'No repository is configured' : 'Author role required'}</h2><p>Ask the workspace operator to confirm access. No source import has occurred.</p></>
      )}</div></section>
      <div id="source-preview-result">{preview !== null && <PreviewResult preview={preview} onImport={() => openImport(preview)} />}</div>
    </>
  );
}
