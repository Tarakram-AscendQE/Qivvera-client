import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from './workspace-module';

const shell = fakeShell();
const app = { id: 'a1', name: 'VendorPay', description: '', repositoryUrl: '', createdAt: '2026-11-01T10:00:00Z' };
const changes = [{ id: 'c1', title: 'Mine', applicationId: 'a1' }, { id: 'c2', title: 'Other', applicationId: 'a2' }];

let ui: WorkspaceUI;
function setup(roles: string[], workspace: Record<string, unknown>) {
  ui = createWorkspaceUI({ ...fakeWorkspaceServices(), S: { session: { email: 'u@example.test', roles }, workspace } as never, shell, can: role => roles.includes(role) });
}

beforeEach(() => shell.mockClear());
afterEach(() => ui?.unmount());

describe('application registry', () => {
  it('invites only an Author to register the first application', () => {
    setup(['VIEWER'], { applications: [], changes: [], activity: [] });
    ui.showApplications();
    expect(shell).toHaveBeenCalledWith(expect.any(String), 'applications', 'Applications');
    expect((screen.getByRole('button', { name: 'Register application' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an application with its own changes and an honest source status', () => {
    setup(['AUTHOR'], { applications: [app], changes, activity: [] });
    ui.showApplication('a1');
    expect(shell).toHaveBeenCalledWith(expect.any(String), 'applications', 'VendorPay');
    expect(screen.getByText('Not supplied')).toBeTruthy();
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
    expect(document.querySelectorAll('.row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '+ New change' }).dataset['action']).toBe('new-change');
  });

  it('offers the records export and states that activity is not certified evidence', () => {
    setup(['VIEWER'], { applications: [], changes: [], activity: [] });
    ui.showActivity();
    expect(screen.getByRole('link', { name: 'Export records ↓' }).getAttribute('href')).toBe('/api/export');
    expect(screen.getByText('The latest 100 saved actions. These are working records, not certified assurance evidence.')).toBeTruthy();
  });
});
