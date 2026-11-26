import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from './workspace-module';

const shell = fakeShell();
const app = { id: 'a1', name: 'VendorPay', description: '', repositoryUrl: '', createdAt: '2026-11-01T10:00:00Z' };
const changes = [{ id: 'c1', title: 'Mine', applicationId: 'a1' }, { id: 'c2', title: 'Other', applicationId: 'a2' }];

let ui: WorkspaceUI;
function setup(roles: string[], workspace: Record<string, unknown>) {
  ui = createWorkspaceUI({ ...fakeWorkspaceServices(), S: { session: { email: 'u@example.test', roles }, workspace } as never, shell, can: role => roles.includes(role) });
}

beforeEach(() => { shell.mockClear(); });
afterEach(() => shell.reset());

describe('application registry', () => {
  it('invites only an Author to register the first application', () => {
    setup(['VIEWER'], { applications: [], changes: [], activity: [] });
    ui.showApplications();
    expect(shell).toHaveBeenCalledWith(expect.anything(), 'applications', 'Applications');
    expect((screen.getByRole('button', { name: 'Register application' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an application with its own changes and an honest source status', () => {
    setup(['AUTHOR'], { applications: [app], changes, activity: [] });
    ui.showApplication('a1');
    expect(shell).toHaveBeenCalledWith(expect.anything(), 'applications', 'VendorPay');
    expect(within(document.querySelector<HTMLElement>('.details')!).getByText('Not supplied')).toBeTruthy();
    expect(screen.getByText('Reference only. Source access has not been verified.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mine' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Other' })).toBeNull();
    const newChange = screen.getByRole('button', { name: '+ New change' });
    expect([newChange.dataset['action'], newChange.dataset['app']]).toEqual(['new-change', 'a1']);
  });

  it('refuses an unknown application instead of drawing an empty page', () => {
    setup(['AUTHOR'], { applications: [app], changes, activity: [] });
    expect(() => ui.showApplication('missing')).toThrow('Application not found.');
    expect(shell).not.toHaveBeenCalled();
  });
});

describe('changes and activity', () => {
  it('lists every change and keeps the change dialog hook', () => {
    setup(['AUTHOR'], { applications: [app], changes, activity: [] });
    ui.showChanges();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '+ New change' }).dataset['action']).toBe('new-change');
  });

  it('offers the records export and states that activity is not certified evidence', () => {
    setup(['VIEWER'], { applications: [], changes: [], activity: [] });
    ui.showActivity();
    expect(screen.getByRole('link', { name: 'Export records ↓' }).getAttribute('href')).toBe('/api/export');
    expect(screen.getByText('The latest 100 saved actions. These are working records, not certified assurance evidence.')).toBeTruthy();
  });
});

describe('archiving applications', () => {
  const archivedApp = { ...app, id: 'a2', name: 'Old test app', archived: true, archivedAt: '2026-11-26T09:00:00Z', archivedBy: 'author@example.test' };

  it('offers a menu per card to Authors and Policy Authorities, and hides archived cards until asked', () => {
    setup(['POLICY_AUTHORITY'], { applications: [app, archivedApp], changes, activity: [] });
    ui.showApplications();
    expect(screen.queryByRole('link', { name: 'Old test app' })).toBeNull();
    const menu = screen.getByRole('button', { name: 'More actions for VendorPay' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(menu);
    const item = screen.getByRole('menuitem', { name: 'Archive application' });
    expect([item.dataset['action'], item.dataset['id']]).toEqual(['archive-application', 'a1']);
    fireEvent.click(screen.getByRole('button', { name: 'Show archived · 1' }));
    expect(screen.getByRole('link', { name: 'Old test app' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Old test app' }));
    expect(screen.getByRole('menuitem', { name: 'Restore application' }).dataset['action']).toBe('restore-application');
  });

  it('gives a Viewer no menu', () => {
    setup(['VIEWER'], { applications: [app], changes, activity: [] });
    ui.showApplications();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });

  it('marks an archived application and blocks new changes on its page', () => {
    setup(['AUTHOR'], { applications: [archivedApp], changes: [], activity: [] });
    ui.showApplication('a2');
    expect(screen.getByText(/It is hidden from lists and cannot get new changes. Its history is kept./)).toBeTruthy();
    expect((screen.getByRole('button', { name: '+ New change' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('confirms before archiving and sends only the optional reason', async () => {
    const api = vi.fn(async () => ({}));
    document.body.insertAdjacentHTML('beforeend', '<dialog id="modal"></dialog>');
    ui = createWorkspaceUI({ ...fakeWorkspaceServices(), api, S: { session: { email: 'u@example.test', roles: ['AUTHOR'] }, workspace: { applications: [app], changes: [], activity: [] } } as never, shell, can: role => role === 'AUTHOR' });
    ui.openArchiveApplication('a1', true);
    expect(await screen.findByRole('heading', { name: 'Archive “VendorPay”?' })).toBeTruthy();
    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Rehearsal data' } });
    fireEvent.click(screen.getByRole('button', { name: 'Archive application' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/applications/a1/archive', { method: 'POST', data: { reason: 'Rehearsal data' } }));
    document.querySelector('#modal')?.remove();
  });
});
