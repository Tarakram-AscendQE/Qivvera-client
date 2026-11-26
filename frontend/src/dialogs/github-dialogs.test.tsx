import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from '../workspace/workspace-module';

const shell = fakeShell();
const TOKEN = 'github_pat_TEST_ONLY_dialog_0123456789';
const connection = {
  app: { repository: 'prcheck-live/vendorpay-app' }, tests: { repository: 'prcheck-live/prcheck-verifiers', ref: 'main' },
  profiles: { repository: 'prcheck-live/vendorpay-policies', commit: 'e'.repeat(40) },
  rules: { source: 'BUNDLED', repository: 'prcheck-live/vendorpay-policies', commit: 'e408884988ad27d6e0776700c4e268d4bf86ad9d', policies: 6, obligations: 14 },
  configuredBy: 'author@example.test', configuredAt: '2026-11-26T09:00:00Z',
};
const connected = { id: 'a1', name: 'VendorPay', description: '', repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', createdAt: '2026-11-01T10:00:00Z', github: connection };
const unconnected = { id: 'a2', name: 'Billing', description: '', repositoryUrl: '', createdAt: '2026-11-01T10:00:00Z', github: null };

let ui: WorkspaceUI;
let services: ReturnType<typeof fakeWorkspaceServices>;

function setup({ prAssurance = true, roles = ['AUTHOR'], api = async () => ({ id: 'new-app' }) }: { prAssurance?: boolean; roles?: string[]; api?: (path: string, options?: { data?: unknown }) => Promise<unknown> } = {}) {
  document.body.innerHTML = '<div id="root"></div><dialog id="modal"></dialog>';
  services = fakeWorkspaceServices();
  services.api.mockImplementation(api as never);
  services.closeDialog.mockImplementation(() => { ui.unmountDialog(); const modal = document.querySelector<HTMLDialogElement>('#modal')!; if (modal.open) modal.close(); modal.replaceChildren(); });
  const S = { session: { email: 'author@example.test', roles }, workspace: { applications: [connected, unconnected], changes: [], activity: [], capabilities: { prAssurance } } };
  ui = createWorkspaceUI({ ...services, viewContext: () => () => true, S: S as never, shell, can: role => roles.includes(role) });
}
const modal = () => document.querySelector<HTMLDialogElement>('#modal')!;
const type = (label: RegExp | string, value: string) => fireEvent.change(within(modal()).getByLabelText(label), { target: { value } });

beforeEach(() => { location.hash = '#/applications'; shell.mockClear(); });
afterEach(() => { ui?.unmountDialog(); shell.reset(); });

describe('registering an application with its GitHub repositories', () => {
  it('asks for the three repositories and a token, all required, with the token hidden until shown', () => {
    setup();
    ui.openNewApplication();
    const labels = [...modal().querySelectorAll('label')].map(label => label.textContent);
    expect(labels).toEqual(['Application name *', 'Description', 'Application repository URL *', 'Verifiers repository URL *', 'Profiles repository URL *', 'GitHub personal access token *']);
    for (const id of ['name', 'repositoryUrl', 'testRepositoryUrl', 'profilesRepositoryUrl', 'githubToken']) expect(modal().querySelector<HTMLInputElement>(`#${id}`)!.required).toBe(true);
    const token = modal().querySelector<HTMLInputElement>('#githubToken')!;
    expect([token.type, token.value, token.autocomplete]).toEqual(['password', '', 'new-password']);
    fireEvent.click(within(modal()).getByRole('button', { name: 'Show token' }));
    expect(token.type).toBe('text');
    fireEvent.click(within(modal()).getByRole('button', { name: 'Hide token' }));
    expect(token.type).toBe('password');
    expect(within(modal()).getByText(/checks that the token can reach all three repositories before saving/)).toBeTruthy();
  });

  it('sends every field once and opens the new application', async () => {
    setup();
    ui.openNewApplication();
    type('Application name *', 'VendorPay');
    type('Application repository URL *', 'https://github.com/prcheck-live/vendorpay-app');
    type('Verifiers repository URL *', 'https://github.com/prcheck-live/prcheck-verifiers');
    type('Profiles repository URL *', 'https://github.com/prcheck-live/vendorpay-policies');
    type('GitHub personal access token *', TOKEN);
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(location.hash).toBe('#/applications/new-app'));
    expect(services.api).toHaveBeenCalledTimes(1);
    expect(services.api).toHaveBeenCalledWith('/api/applications', { method: 'POST', data: {
      name: 'VendorPay', description: '', repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', testRepositoryUrl: 'https://github.com/prcheck-live/prcheck-verifiers',
      profilesRepositoryUrl: 'https://github.com/prcheck-live/vendorpay-policies', githubToken: TOKEN } });
  });

  it('shows why GitHub refused, keeps the dialog open and saves nothing', async () => {
    setup({ api: async () => { throw Object.assign(new Error('Profiles repository URL: acme/profiles was not found, or this token has no access to it.'), { status: 400 }); } });
    ui.openNewApplication();
    type('Application name *', 'Billing');
    type('Application repository URL *', 'https://github.com/acme/app');
    type('Verifiers repository URL *', 'https://github.com/acme/verifiers');
    type('Profiles repository URL *', 'https://github.com/acme/profiles');
    type('GitHub personal access token *', TOKEN);
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(within(modal()).getByRole('alert').textContent).toMatch(/was not found, or this token has no access/));
    expect(modal().open).toBe(true);
    expect(services.refresh).not.toHaveBeenCalled();
  });

  it('without PR assurance, keeps the original form: an optional repository URL and no token', () => {
    setup({ prAssurance: false });
    ui.openNewApplication();
    expect([...modal().querySelectorAll('label')].map(label => label.textContent)).toEqual(['Application name *', 'Description', 'Repository URL']);
    expect(modal().querySelector('#githubToken')).toBeNull();
  });
});

describe('an application\'s GitHub access', () => {
  it('shows the connected repositories and rules, never a token, with a way to update access', () => {
    setup();
    ui.showApplication('a1');
    const panel = document.querySelector<HTMLElement>('#app-github')!;
    for (const repository of ['prcheck-live/vendorpay-app', 'prcheck-live/prcheck-verifiers', 'prcheck-live/vendorpay-policies']) {
      expect(within(panel).getByRole('link', { name: repository }).getAttribute('href')).toBe(`https://github.com/${repository}`);
    }
    expect(within(panel).getByText(/6 rules · 14 obligations, from the snapshot shipped with Qivvera at e408884/)).toBeTruthy();
    expect(within(panel).getByText('Stored encrypted')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Open PR assurance' }).getAttribute('href')).toBe('#/pr-assurance/apps/a1');
    const update = within(panel).getByRole('button', { name: 'Update GitHub access' });
    expect([update.dataset['action'], update.dataset['id']]).toEqual(['connect-github', 'a1']);
  });

  it('offers to connect an application that has no GitHub access; a viewer gets no button', () => {
    setup();
    ui.showApplication('a2');
    expect(within(document.querySelector<HTMLElement>('#app-github')!).getByRole('button', { name: 'Connect to GitHub' }).dataset['id']).toBe('a2');
    setup({ roles: ['VIEWER'] });
    ui.showApplication('a2');
    expect(screen.queryByRole('button', { name: 'Connect to GitHub' })).toBeNull();
  });

  it('marks connected applications on their cards', () => {
    setup();
    ui.showApplications();
    const cards = [...document.querySelectorAll<HTMLElement>('.app-card')];
    expect(cards.map(card => card.querySelector('.app-meta span:last-child')!.textContent)).toEqual(['GitHub connected', 'Source not connected']);
  });

  it('updating access pre-fills the repositories but never the token, and sends to the application\'s own address', async () => {
    setup({ api: async () => ({}) });
    ui.openConnectGitHub('a1');
    expect(within(modal()).getByRole('heading', { name: 'GitHub access for “VendorPay”' })).toBeTruthy();
    expect(modal().querySelector<HTMLInputElement>('#repositoryUrl')!.value).toBe('https://github.com/prcheck-live/vendorpay-app');
    expect(modal().querySelector<HTMLInputElement>('#testRepositoryUrl')!.value).toBe('https://github.com/prcheck-live/prcheck-verifiers');
    expect(modal().querySelector<HTMLInputElement>('#profilesRepositoryUrl')!.value).toBe('https://github.com/prcheck-live/vendorpay-policies');
    expect(modal().querySelector<HTMLInputElement>('#githubToken')!.value).toBe('');
    type('GitHub personal access token *', TOKEN);
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(services.api).toHaveBeenCalledTimes(1));
    expect(services.api).toHaveBeenCalledWith('/api/applications/a1/github', { method: 'POST', data: {
      repositoryUrl: 'https://github.com/prcheck-live/vendorpay-app', testRepositoryUrl: 'https://github.com/prcheck-live/prcheck-verifiers',
      profilesRepositoryUrl: 'https://github.com/prcheck-live/vendorpay-policies', githubToken: TOKEN } });
  });
});
