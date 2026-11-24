import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeShell, deferred } from '../test-utils';
import type { LegacyApi, LegacyOpenForm, LegacySession, LegacyState } from '../legacy-bridge';
import { createIntakeUI, type IntakeUI } from './intake-module';

const shell = fakeShell();
const h = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const field = (id: string, label: string) => `<div class="form-field"><label for="${id}">${label}</label><textarea id="${id}" name="${id}"></textarea></div>`;

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
let openForm: ReturnType<typeof vi.fn<LegacyOpenForm>>;
let toast: ReturnType<typeof vi.fn<(text: string) => void>>;

function setup(previewAnswer: () => Promise<unknown>, repos: unknown = repositories) {
  api = vi.fn<LegacyApi>(async path => {
    if (path === '/api/source-repositories') return repos;
    if (path === '/api/source-previews') return previewAnswer();
    if (path === '/api/source-imports') return { changeId: 'chg-new' };
    throw new Error('unexpected ' + path);
  });
  openForm = vi.fn<LegacyOpenForm>();
  toast = vi.fn();
  ui = createIntakeUI({ S: state as LegacyState, api, h, shell, field, openForm, toast, can: role => (state.session?.roles ?? []).includes(role) });
}

async function previewPull(number = '12') {
  fireEvent.change(screen.getByLabelText('Open pull-request number'), { target: { value: number } });
  fireEvent.submit(screen.getByRole('button', { name: 'Preview source metadata' }).closest('form')!);
}

beforeEach(() => {
  state = { session: { email: 'author@example.test', roles: ['AUTHOR'] }, workspace };
  shell.mockClear();
  location.hash = '#/intake';
});
afterEach(() => ui?.unmount());

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
    expect(openForm).toHaveBeenCalledTimes(1);
    const [title, , content, saveLabel, submit] = openForm.mock.calls[0]!;
    expect([title, saveLabel]).toEqual(['Import reviewed source', 'Import source']);
    expect(content).toContain('<option value="chg-1">New revision of: Stop &lt;b&gt;self&lt;/b&gt; approval</option>');
    expect(content).not.toContain('chg-2');
    expect(api.mock.calls.some(([path]) => path === '/api/source-imports')).toBe(false);

    await expect(submit({ changeId: 'chg-1', reason: 'Belongs to this change', copyObligations: 'on' })).resolves.toBe('#/changes/chg-new');
    expect(api).toHaveBeenLastCalledWith('/api/source-imports', { method: 'POST', data: { previewId: 'prev-1', changeId: 'chg-1', expectedRevisionId: 'rev-1', copyObligations: true, reason: 'Belongs to this change' } });
    expect(toast).toHaveBeenCalledWith('Source context saved. No assurance result was created.');

    ui.invalidate();
    toast.mockClear();
    await submit({ changeId: '', reason: 'A new change instead', copyObligations: 'on' });
    expect(api).toHaveBeenLastCalledWith('/api/source-imports', { method: 'POST', data: { previewId: 'prev-1', changeId: null, expectedRevisionId: null, copyObligations: false, reason: 'A new change instead' } });
    expect(toast).not.toHaveBeenCalled();
  });
});
