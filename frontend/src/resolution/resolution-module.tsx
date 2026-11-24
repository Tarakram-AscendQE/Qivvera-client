import type { ReactNode } from 'react';
import { dialogHost } from '../dialogs/dialog-host';
import type { DialogEnvironment } from '../dialogs/FormDialog';
import { openFormDialog, type DialogServices } from '../dialogs/open-form';
import type { LegacyApi, LegacyCan, LegacyShell, LegacyState } from '../legacy-bridge';
import type { ActiveCheck } from '../visits';
import { ActionDialog, CorrectionFields, LinkFields, NewResolutionDialog, OwnershipFields, ReasonField, ResponseFields, type Assignee, type CorrectionChange, type LinkableRun } from './dialogs';
import { InboxPage, ItemPage, type ResolutionRecord } from './pages';
import type { ResolutionPage } from './parts';

export interface ResolutionBridge extends DialogServices {
  readonly S: LegacyState;
  readonly api: LegacyApi;
  readonly can: LegacyCan;
  readonly shell: LegacyShell;
}

export interface ResolutionUI {
  /** Ends the current visit and forgets the displayed item. Called when a route starts. */
  invalidate(): void;
  /** Reads this change's resolution items into S.resolutions; true when the change page should redraw. */
  loadChange(offset?: number): Promise<boolean>;
  showInbox(offset?: number): Promise<void>;
  showItem(id: string): Promise<void>;
  /** Handles a data-resolution button (the legacy click handlers pass it here). */
  handle(button: HTMLElement): Promise<boolean>;
  /** The shell supplies its change-page renderer so pagination redraws the selected change. */
  setChangeRenderer(render: () => void): void;
  /** Removes a React dialog; the legacy closeDialog() calls it before it empties the dialog element. */
  unmountDialog(): void;
}

type ShellState = LegacyState & { change?: { id: string } | null; resolutions?: ResolutionPage | null; resolutionError?: string | null; session: { email: unknown } | null };

/**
 * Built as /resolution.js. Increment 4 resolution workflow: ownership, corrections, fresh evidence and
 * independent verification. The server rechecks every permission, version and evidence rule.
 */
export function createResolutionUI(bridge: ResolutionBridge): ResolutionUI {
  const { api, can } = bridge;
  const S = bridge.S as ShellState;
  let item: ResolutionRecord | null = null, itemActive: ActiveCheck = () => false;
  let generation = 0, actionGeneration = 0, refreshChange: () => void = () => {};

  const capture = (): ActiveCheck => {
    const current = generation, session = S.session, hash = location.hash;
    return () => !!session && current === generation && session === S.session && hash === location.hash;
  };
  const begin = (): ActiveCheck => { generation++; return capture(); };
  const writable = () => can('AUTHOR') || can('POLICY_AUTHORITY');
  const openForm = (render: (env: DialogEnvironment) => ReactNode) => openFormDialog(bridge, render);
  const directory = () => api('/api/resolution-assignees') as Promise<Assignee[]>;

  function action(saved: ResolutionRecord, title: string, description: string, saveLabel: string, name: string, fields: ReactNode, extra: Record<string, unknown> = {}) {
    openForm(env => <ActionDialog env={env} api={api} resolution={saved} title={title} description={description} saveLabel={saveLabel} action={name} extra={extra}>{fields}</ActionDialog>);
  }

  async function loadChange(offset = 0): Promise<boolean> {
    const active = begin(), changeId = S.change!.id;
    try {
      const data = await api(`/api/changes/${changeId}/resolutions?offset=${offset}`) as ResolutionPage;
      if (!active() || S.change?.id !== changeId) return false;
      S.resolutions = data; S.resolutionError = null; return true;
    } catch (error) {
      const failure = error as Error & { status?: unknown; staleSession?: unknown };
      if (failure.status === 401 || failure.staleSession) throw error;
      if (!active() || S.change?.id !== changeId) return false;
      S.resolutionError = failure.message; S.resolutions = null; return true;
    }
  }

  async function showInbox(offset = 0): Promise<void> {
    const active = begin(), data = await api(`/api/resolutions?offset=${offset}`) as ResolutionPage;
    if (!active() || !location.hash.startsWith('#/resolutions') || location.hash.split('/')[2]) return;
    bridge.shell(<InboxPage data={data} />, 'resolutions', 'Resolutions');
  }

  async function showItem(id: string): Promise<void> {
    const active = begin(), record = await api(`/api/resolutions/${id}`) as ResolutionRecord;
    if (!active() || !location.hash.endsWith('/' + id)) return;
    item = record; itemActive = active;
    bridge.shell(<ItemPage record={record} email={S.session?.email} canTrack={writable()} isAuthority={can('POLICY_AUTHORITY')} />, 'resolutions', 'Resolution');
  }

  async function handle(button: HTMLElement): Promise<boolean> {
    const name = button.dataset['resolution'];
    if (!name) return false;
    const request = ++actionGeneration, view = capture(), active = () => request === actionGeneration && view();
    if (name === 'create') {
      const people = await directory();
      if (!active()) return true;
      const runId = button.dataset['run']!, obligationId = button.dataset['obligation']!;
      openForm(env => <NewResolutionDialog env={env} api={api} directory={people} owner={S.session?.email} runId={runId} obligationId={obligationId} />);
      return true;
    }
    if (name === 'refresh') { await bridge.route(); return true; }
    if (name === 'page') {
      const offset = Number(button.dataset['offset']);
      if (button.dataset['scope'] === 'change') { if (await loadChange(offset)) refreshChange(); } else await showInbox(offset);
      return true;
    }
    if (!item || !itemActive()) return true;
    const saved = item;
    if (name === 'start') action(saved, 'Start resolution work', 'Starting work does not alter evidence or disposition.', 'Start work', 'START', <ReasonField />);
    if (name === 'update') {
      const people = await directory();
      if (!active()) return true;
      action(saved, 'Update resolution ownership', 'This changes accountability and next steps only.', 'Save ownership', 'UPDATE', <OwnershipFields directory={people} resolution={saved} />);
    }
    if (name === 'propose') {
      const change = await api(`/api/changes/${String(saved.changeId)}`) as CorrectionChange;
      if (!active()) return true;
      action(saved, 'Propose a correction', 'This is a proposal, not proof of a fix. A behavioural violation needs a new revision and artifact. Register the revision in the change workspace first.', 'Record correction', 'PROPOSE_CORRECTION', <CorrectionFields change={change} />, { revisionId: change.revision.id });
    }
    if (name === 'link') {
      const runs = await api(`/api/changes/${String(saved.changeId)}/assessments?revision=${String(saved.correctionRevisionId)}`) as (LinkableRun & { snapshot: { mappings?: readonly { obligationId: unknown }[]; mapping?: { obligationId: unknown } } })[];
      if (!active()) return true;
      const fresh = runs.filter(run => run.number > (saved.correctionRunFloor ?? 0) && (run.snapshot.mappings ?? [run.snapshot.mapping]).some(mapping => mapping?.obligationId === saved.correctionObligationId));
      if (!fresh.length) { bridge.toast('No new reassessment exists. Open the correction revision, approve its plan, and run assurance first.'); return true; }
      action(saved, 'Link reassessment', 'Only a fresh, related assessment can be linked. Failed or incomplete runs do not verify a correction.', 'Link assessment', 'LINK_ASSESSMENT', <LinkFields runs={fresh} />);
    }
    if (name === 'verify') action(saved, 'Verify resolution', 'Confirm the corrected requirement using the linked evidence. The original finding remains unchanged. Other obligations may still prevent READY.', 'Verify resolution', 'VERIFY', <ReasonField />);
    if (name === 'reopen') action(saved, 'Reopen resolution', 'Previous verification remains in history. A new correction and reassessment will be required.', 'Reopen item', 'REOPEN', <ReasonField />);
    if (name === 'note') action(saved, 'Add resolution note', 'Notes are working records, not verification evidence.', 'Save note', 'NOTE', <ReasonField />);
    if (name === 'challenge') action(saved, 'Challenge the finding', 'Explain the concern. This records a challenge; it does not invalidate evidence or change readiness.', 'Record challenge', 'CHALLENGE', <ReasonField />);
    if (name === 'respond') action(saved, 'Respond to challenge', 'Neither response deletes evidence, closes the item, or creates a release exception.', 'Record response', 'RESPOND_CHALLENGE', <ResponseFields />, { challengeId: button.dataset['challenge'] });
    return true;
  }

  return {
    invalidate() { generation++; actionGeneration++; item = null; itemActive = () => false; },
    loadChange, showInbox, showItem, handle,
    setChangeRenderer(render) { refreshChange = render; },
    unmountDialog: dialogHost.unmount
  };
}
