import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, fakeWorkspaceServices } from '../test-utils';
import type { LegacyApi, LegacySession, LegacyShell, LegacyState } from '../legacy-bridge';
import { createIntakeUI, type IntakeUI } from './intake-module';

/** Like the real shell, this replaces only #root, so the separate <dialog> survives page redraws. */
const shell = vi.fn<LegacyShell>((content, active = '', label = '') => { document.querySelector('#root')!.innerHTML = `<nav data-active="${active}" data-label="${label}"></nav><main id="main">${content}</main>`; });
const modal = () => document.querySelector<HTMLDialogElement>('#modal')!;

const repositories = [{ id: 'repo-1', owner: 'acme', repo: 'approvals', applicationId: 'app-1' }];
const workspace = {
  applications: [{ id: 'app-1', name: 'Approvals' }],
  changes: [
    { id: 'chg-1', title: 'Stop <b>self</b> approval', applicationId: 'app-1', revision: { id: 'rev-1' } },
    { id: 'chg-2', title: 'Elsewhere', applicationId: 'app-2', revision: { id: 'rev-2' } }
  ]
};
const preview = {
  id: 'prev-1', applicationId: 'app-1', expiresAt: '2026-11-24T12:00:00Z',
  source: { repository: 'acme/approvals', pullNumber: 12, draft: false, title: '<img src=x onerror=alert(1)>', importedTitle: 'Imported', headSha: 'a', baseSha: 'b', headRepository: 'fork/approvals', body: 'y'.repeat(4001) }
};


let state: { session: LegacySession | null; workspace: typeof workspace };
let ui: IntakeUI;
let api: ReturnType<typeof vi.fn<LegacyApi>>;
let toast: ReturnType<typeof vi.fn<(text: string) => void>>;
let generation = 0;

function setup(previewAnswer: () => Promise<unknown>, repos: unknown = repositories) {
  api = vi.fn<LegacyApi>(async path => {
    if (path === '/api/source-repositories') return repos;
    if (path === '/api/source-previews') return previewAnswer();
    if (path === '/api/source-imports') return { changeId: 'chg-new' };
    throw new Error('unexpected ' + path);
  });
  toast = vi.fn();
  // As the real closeDialog() does: unmount the React dialog before emptying the dialog element.
  const closeDialog = () => { generation++; ui.unmountDialog(); if (modal().open) modal().close(); modal().replaceChildren(); };
  ui = createIntakeUI({ ...fakeWorkspaceServices(), S: state as LegacyState, api, shell, toast, closeDialog, dialogGeneration: () => generation, can: role => (state.session?.roles ?? []).includes(role) });
}

async function previewPull(number = '12') {
  fireEvent.change(screen.getByLabelText('Open pull-request number'), { target: { value: number } });
  fireEvent.submit(screen.getByRole('button', { name: 'Preview source metadata' }).closest('form')!);
}

beforeEach(() => {
  state = { session: { email: 'author@example.test', roles: ['AUTHOR'] }, workspace };
  document.body.innerHTML = '<div id="root"></div><dialog id="modal"></dialog>';
  shell.mockClear();
  location.hash = '#/intake';
});
afterEach(() => { ui?.unmountDialog(); ui?.unmount(); });

describe('GitHub intake', () => {
  it('shows the preview form to an Author with a configured repository', async () => {
    setup(async () => preview);
    await ui.show();
    expect(shell).toHaveBeenCalledWith(expect.any(String), 'intake', 'GitHub intake');
    expect(screen.getByRole('heading', { level: 1, name: 'Import a GitHub change' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'acme/approvals · Approvals' })).toBeTruthy();
  });

  it('explains why the form is missing', async () => {
    setup(async () => preview, []);
    await ui.show();
    expect(screen.getByRole('heading', { name: 'No repository is configured' })).toBeTruthy();
    ui.unmount();
    state.session = { email: 'viewer@example.test', roles: ['VIEWER'] };
    setup(async () => preview);
    await ui.show();
    expect(screen.getByRole('heading', { name: 'Author role required' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Preview source metadata' })).toBeNull();
  });

  it('does not draw a late repository list over a newer route', async () => {
    const repos = deferred<unknown>();
    setup(async () => preview);
    api.mockImplementationOnce(() => repos.promise);
    const shown = ui.show();
    location.hash = '#/overview';
    repos.resolve(repositories);
    await shown;
    expect(shell).not.toHaveBeenCalled();
  });

  it('shows untrusted source metadata only as text, truncating a long description', async () => {
    setup(async () => preview);
    await ui.show();
    await previewPull();
    expect(await screen.findByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('pre')!.textContent).toBe('y'.repeat(4000) + '\n[Preview truncated; full supported description retained in the source receipt.]');
    expect(api).toHaveBeenCalledWith('/api/source-previews', { method: 'POST', data: { repositoryKey: 'repo-1', pullNumber: 12 } });
  });

  it('sends one preview at a time and re-enables the button afterwards', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    await ui.show();
    await previewPull();
    await previewPull();
    const button = screen.getByRole('button', { name: 'Preview source metadata' }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(true));
    answer.resolve(preview);
    await screen.findByRole('heading', { name: 'Review before importing' });
    expect(api.mock.calls.filter(([path]) => path === '/api/source-previews')).toHaveLength(1);
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('ignores a preview answer that arrives after the visit ended', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    await ui.show();
    await previewPull();
    ui.invalidate();
    answer.resolve(preview);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByRole('heading', { name: 'Review before importing' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('explains a failed preview and removes the earlier preview', async () => {
    const answers = [async () => preview, async () => { throw new Error('Pull request is closed.'); }];
    setup(() => answers.shift()!());
    await ui.show();
    await previewPull();
    await screen.findByRole('heading', { name: 'Review before importing' });
    await previewPull('13');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Pull request is closed.'));
    expect(screen.queryByRole('heading', { name: 'Review before importing' })).toBeNull();
  });

  it('shows no preview error when the session ended, because sign-in is already shown', async () => {
    setup(async () => { throw Object.assign(new Error('Your session ended.'), { sessionExpired: true }); });
    await ui.show();
    await previewPull();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('imports only through the reviewed dialog, with an explicit destination and reason', async () => {
    setup(async () => preview);
    await ui.show();
    await previewPull();
    fireEvent.click(await screen.findByRole('button', { name: 'Import reviewed context' }));
    const dialog = within(modal());
    expect(modal().open).toBe(true);
    expect(dialog.getByRole('heading', { name: 'Import reviewed source' })).toBeTruthy();
    expect(dialog.getByRole('option', { name: 'New revision of: Stop <b>self</b> approval' })).toBeTruthy();
    expect(dialog.queryByRole('option', { name: 'New revision of: Elsewhere' })).toBeNull();
    expect(api.mock.calls.some(([path]) => path === '/api/source-imports')).toBe(false);

    fireEvent.change(dialog.getByLabelText('Destination'), { target: { value: 'chg-1' } });
    fireEvent.change(dialog.getByLabelText('Why does this source belong here? *'), { target: { value: 'Belongs to this change' } });
    fireEvent.click(dialog.getByRole('checkbox'));
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(location.hash).toBe('#/changes/chg-new'));
    expect(api).toHaveBeenCalledWith('/api/source-imports', { method: 'POST', data: { previewId: 'prev-1', changeId: 'chg-1', expectedRevisionId: 'rev-1', copyObligations: true, reason: 'Belongs to this change' } });
    expect(toast).toHaveBeenCalledWith('Source context saved. No assurance result was created.');
  });

  it('copies nothing into a new change and says nothing once the intake visit has ended', async () => {
    setup(async () => preview);
    await ui.show();
    await previewPull();
    fireEvent.click(await screen.findByRole('button', { name: 'Import reviewed context' }));
    const dialog = within(modal());
    fireEvent.change(dialog.getByLabelText('Why does this source belong here? *'), { target: { value: 'A new change instead' } });
    fireEvent.click(dialog.getByRole('checkbox'));
    ui.invalidate();
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/source-imports', { method: 'POST', data: { previewId: 'prev-1', changeId: null, expectedRevisionId: null, copyObligations: false, reason: 'A new change instead' } }));
    await waitFor(() => expect(location.hash).toBe('#/changes/chg-new'));
    expect(toast).not.toHaveBeenCalledWith('Source context saved. No assurance result was created.');
  });
});
