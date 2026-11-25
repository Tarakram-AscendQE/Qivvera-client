import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../shell-contract';
import { fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI } from './workspace-module';

const shell = fakeShell();
const app = { id: 'a1', name: 'VendorPay', description: '', repositoryUrl: 'https://github.com/acme/vendorpay', createdAt: '2026-11-01T10:00:00Z' };
const repository = { id: 'repo-1', owner: 'acme', repo: 'vendorpay', applicationId: 'a1' };
const openPull = { number: 7, title: '<b>Fix</b> approvals', url: 'https://github.com/acme/vendorpay/pull/7', draft: false, author: 'dev', headRef: 'fix', baseRef: 'main', updatedAt: '2026-11-20T10:00:00Z', imported: null };
const importedPull = { ...openPull, number: 8, title: 'Imported', imported: { changeId: 'c1', headSha: 'a'.repeat(40), currentHead: false } };
const event = { repositoryKey: 'repo-1', repository: 'acme/vendorpay', pullNumber: 7, title: 'Fix approvals', url: openPull.url, draft: false, action: 'synchronize', headSha: 'f'.repeat(40), headRef: 'fix', baseRef: 'main', sender: 'dev', receivedAt: '2026-11-20T10:00:00Z', deliveries: 2, imported: null };

function show(roles: string[], capabilities: Record<string, boolean>, answers: Record<string, () => Promise<unknown>>) {
  const api = vi.fn<Api>(async path => {
    const answer = answers[path];
    if (!answer) throw new Error('unexpected ' + path);
    return answer();
  });
  const ui = createWorkspaceUI({ ...fakeWorkspaceServices(), api, S: { session: { email: 'u@example.test', roles }, workspace: { applications: [app], changes: [], activity: [], capabilities } } as never, shell, can: role => roles.includes(role) });
  ui.showApplication('a1');
  return api;
}

const pullsPath = '/api/applications/a1/pull-requests', eventsPath = '/api/applications/a1/source-events';

beforeEach(() => { shell.mockClear(); });
afterEach(() => shell.reset());

describe('application pull requests', () => {
  it('explains that no repository is connected when GitHub intake is off, without calling the API', () => {
    const api = show(['AUTHOR'], {}, {});
    expect(screen.getByText('No repository is connected.')).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'PR activity from GitHub' })).toBeNull();
  });

  it('lists open pull requests as text and links an Author to a read-only preview', async () => {
    show(['AUTHOR'], { githubIntake: true }, { [pullsPath]: async () => ({ repositories: [{ repository, pulls: [openPull, importedPull] }], notice: 'Listed for context only.' }) });
    await waitFor(() => expect(screen.getByRole('link', { name: '#7 <b>Fix</b> approvals' })).toBeTruthy());
    expect(document.querySelector('#app-pulls-body b')).toBeNull();
    expect(screen.getByRole('link', { name: 'Import' }).getAttribute('href')).toBe('#/intake/repo-1/7');
    expect(screen.getByRole('link', { name: 'Open linked change' }).getAttribute('href')).toBe('#/changes/c1');
    expect(screen.getByRole('link', { name: 'Import new commits' }).getAttribute('href')).toBe('#/intake/repo-1/8');
    expect(screen.getByText('New commits since import')).toBeTruthy();
  });

  it('shows a Viewer the list without import actions', async () => {
    show(['VIEWER'], { githubIntake: true }, { [pullsPath]: async () => ({ repositories: [{ repository, pulls: [openPull] }], notice: '' }) });
    await waitFor(() => expect(screen.getByRole('link', { name: '#7 <b>Fix</b> approvals' })).toBeTruthy());
    expect(screen.queryByRole('link', { name: 'Import' })).toBeNull();
  });

  it('shows a repository error and reads again on Refresh', async () => {
    let available = false;
    const api = show(['AUTHOR'], { githubIntake: true }, { [pullsPath]: async () => (available ? { repositories: [{ repository, pulls: [] }], notice: '' } : Promise.reject(new Error('GitHub is unavailable.'))) });
    await waitFor(() => expect(screen.getByText('GitHub is unavailable.')).toBeTruthy());
    const before = api.mock.calls.length;
    available = true;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('No open pull requests.')).toBeTruthy());
    expect(api.mock.calls.length).toBe(before + 1);
  });
});

describe('PR activity from GitHub', () => {
  it('shows the latest webhook event per pull request when webhooks are on', async () => {
    show(['AUTHOR'], { githubIntake: true, githubWebhooks: true }, {
      [pullsPath]: async () => ({ repositories: [], notice: '' }),
      [eventsPath]: async () => ({ pulls: [event], notice: 'Nothing is imported automatically.' })
    });
    await waitFor(() => expect(screen.getByText('Not imported')).toBeTruthy());
    expect(screen.getByText(/New commits · /)).toBeTruthy();
    expect(screen.getByText('fffffff')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Import' }).map(link => link.getAttribute('href'))).toEqual(['#/intake/repo-1/7']);
  });

  it('says when no activity has been received', async () => {
    show(['VIEWER'], { githubIntake: true, githubWebhooks: true }, {
      [pullsPath]: async () => ({ repositories: [], notice: '' }),
      [eventsPath]: async () => ({ pulls: [], notice: '' })
    });
    await waitFor(() => expect(screen.getByText('No pull-request activity has been received yet.')).toBeTruthy());
  });
});
