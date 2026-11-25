import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from './workspace-module';

const shell = fakeShell();
const apps = [{ id: 'a1', name: 'VendorPay' }];
const change = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 'Change ' + id, applicationId: 'a1', sourceRevision: 'abcdef1234567890', obligationCount: 0, ...over });

let S: { session: { email: string; roles: string[] } | null; workspace: unknown };
let ui: WorkspaceUI;

function show(roles: string[], workspace: unknown) {
  S = { session: { email: 'u@example.test', roles }, workspace };
  ui = createWorkspaceUI({ ...fakeWorkspaceServices(), S: S as never, shell, can: role => roles.includes(role) });
  ui.showOverview();
}

beforeEach(() => { shell.mockClear(); });
afterEach(() => shell.reset());

describe('workspace overview', () => {
  it('lets only an Author register an application; new changes start from Applications', () => {
    show(['AUTHOR'], { applications: [], changes: [], activity: [] });
    expect((screen.getByRole('button', { name: '+ Register application' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: '+ New change' })).toBeNull();
    shell.reset();
    show(['VIEWER'], { applications: apps, changes: [], activity: [] });
    expect((screen.getByRole('button', { name: '+ Register application' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers + New change on Applications to an Author once an application exists', () => {
    show(['AUTHOR'], { applications: [], changes: [], activity: [] });
    shell.reset();
    ui.showApplications();
    expect((screen.getByRole('button', { name: '+ New change' }) as HTMLButtonElement).disabled).toBe(true);
    shell.reset();
    show(['AUTHOR'], { applications: apps, changes: [], activity: [] });
    shell.reset();
    ui.showApplications();
    const newChange = screen.getByRole('button', { name: '+ New change' }) as HTMLButtonElement;
    expect([newChange.disabled, newChange.dataset['action']]).toEqual([false, 'new-change']);
    shell.reset();
    show(['VIEWER'], { applications: apps, changes: [], activity: [] });
    shell.reset();
    ui.showApplications();
    expect((screen.getByRole('button', { name: '+ New change' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the data-action hooks the shell uses to open dialogs', () => {
    show(['AUTHOR'], { applications: apps, changes: [], activity: [] });
    expect(screen.getByRole('button', { name: '+ Register application' }).dataset['action']).toBe('new-application');
    shell.reset();
    ui.showChanges();
    expect(screen.getByRole('button', { name: 'Create a change' }).dataset['action']).toBe('new-change');
  });

  it('labels each change by its stage without implying readiness', () => {
    show(['VIEWER'], { applications: apps, activity: [], changes: [
      change('1', { disposition: 'READY' }), change('2', { assuranceError: { message: 'down' } }),
      change('3', { latestAssessment: { applicability: 'STALE_INPUTS' } }), change('4', { assessmentStatus: 'RUNNING' }), change('5')
    ] });
    shell.reset();
    ui.showChanges();
    const pills = [...document.querySelectorAll('tbody .pill')].map(pill => [pill.textContent, pill.className]);
    expect(pills).toEqual([['Ready', 'pill tone-ready'], ['Assurance unavailable', 'pill tone-gap'], ['Re-check needed', 'pill tone-waiting'], ['Check running', 'pill tone-active'], ['No requirements', 'pill tone-draft']]);
  });

  it('lists only the changes waiting for the signed-in roles, and server text only as text', () => {
    const activity = [1, 2, 3, 4].map(n => ({ action: 'CHANGE_CREATED', detail: '<img src=x onerror=alert(1)>', createdAt: '2026-11-2' + n + 'T10:00:00Z', actor: 'a' }));
    const changes = [change('1', { obligationCount: 2, inReviewCount: 2 }), change('2', { disposition: 'READY' }), change('3', { title: '<b>x</b>' })];
    show(['POLICY_AUTHORITY'], { applications: apps, changes, activity });
    expect([...document.querySelectorAll('.task-title')].map(link => link.textContent)).toEqual(['Change 1']);
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('#/changes/1');
    expect(document.querySelectorAll('.activity')).toHaveLength(3);
    expect(screen.getAllByText('<img src=x onerror=alert(1)>')).toHaveLength(3);
    expect(document.querySelector('img')).toBeNull();
    shell.reset();
    show(['AUTHOR'], { applications: apps, changes, activity: [] });
    expect([...document.querySelectorAll('.task-title')].map(link => link.textContent)).toEqual(['<b>x</b>']);
    expect(document.querySelector('b')).toBeNull();
    shell.reset();
    show(['VIEWER'], { applications: apps, changes, activity: [] });
    expect(document.querySelectorAll('.task')).toHaveLength(0);
    expect(screen.getByText('Viewers follow progress here. Nothing needs your action.')).toBeTruthy();
  });

  it('does not repeat the text of a superseded draft in activity', () => {
    show(['VIEWER'], { applications: apps, changes: [], activity: [{ action: 'OBLIGATION_UPDATED', detail: 'old draft wording', createdAt: '2026-11-20T10:00:00Z', actor: 'a' }] });
    const recent = screen.getByRole('heading', { name: 'Recent activity' }).closest('section')!;
    expect(within(recent).getByText('Previous draft retained in activity record.')).toBeTruthy();
    expect(within(recent).queryByText('old draft wording')).toBeNull();
  });
});
