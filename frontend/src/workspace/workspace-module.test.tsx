import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeShell } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from './workspace-module';

const shell = fakeShell();
const apps = [{ id: 'a1', name: 'VendorPay' }];
const change = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 'Change ' + id, applicationId: 'a1', sourceRevision: 'abcdef1234567890', obligationCount: 0, ...over });

let S: { session: { email: string; roles: string[] } | null; workspace: unknown };
let ui: WorkspaceUI;

function show(roles: string[], workspace: unknown) {
  S = { session: { email: 'u@example.test', roles }, workspace };
  ui = createWorkspaceUI({ S: S as never, shell, can: role => roles.includes(role) });
  ui.showOverview();
}

beforeEach(() => shell.mockClear());
afterEach(() => ui?.unmount());

describe('workspace overview', () => {
  it('lets only an Author start work, and only once an application exists', () => {
    show(['AUTHOR'], { applications: [], changes: [], activity: [] });
    expect((screen.getByRole('button', { name: '+ Register application' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '+ New change' }) as HTMLButtonElement).disabled).toBe(true);
    ui.unmount();
    show(['VIEWER'], { applications: apps, changes: [], activity: [] });
    expect((screen.getByRole('button', { name: '+ Register application' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '+ New change' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the data-action hooks the legacy shell uses to open dialogs', () => {
    show(['AUTHOR'], { applications: apps, changes: [], activity: [] });
    expect(screen.getByRole('button', { name: '+ Register application' }).dataset['action']).toBe('new-application');
    expect(screen.getByRole('button', { name: '+ New change' }).dataset['action']).toBe('new-change');
    expect(screen.getByRole('button', { name: 'Create a change' }).dataset['action']).toBe('new-change');
  });

  it('labels each change by its assessment state without implying readiness', () => {
    show(['VIEWER'], { applications: apps, activity: [], changes: [
      change('1', { disposition: 'READY' }), change('2', { assuranceError: { message: 'down' } }),
      change('3', { latestAssessment: { applicability: 'STALE_INPUTS' } }), change('4', { assessmentStatus: 'IN_PROGRESS' }), change('5')
    ] });
    const pills = [...document.querySelectorAll('.row .pill')].map(pill => [pill.textContent, pill.className]);
    expect(pills).toEqual([['READY', 'pill finding-good'], ['ASSURANCE UNAVAILABLE', 'pill finding-gap'], ['REASSESSMENT REQUIRED', 'pill '], ['IN PROGRESS', 'pill '], ['NOT ASSESSED', 'pill ']]);
  });

  it('shows at most five changes and three activity items, server text only as text', () => {
    const activity = [1, 2, 3, 4].map(n => ({ action: 'CHANGE_CREATED', detail: '<img src=x onerror=alert(1)>', createdAt: '2026-11-2' + n + 'T10:00:00Z', actor: 'a' }));
    show(['VIEWER'], { applications: apps, changes: [1, 2, 3, 4, 5, 6].map(n => change(String(n))), activity });
    expect(document.querySelectorAll('.row')).toHaveLength(5);
    expect(document.querySelectorAll('.activity')).toHaveLength(3);
    expect(screen.getAllByText('<img src=x onerror=alert(1)>')).toHaveLength(3);
    expect(document.querySelector('img')).toBeNull();
  });

  it('does not repeat the text of a superseded draft in activity', () => {
    show(['VIEWER'], { applications: apps, changes: [], activity: [{ action: 'OBLIGATION_UPDATED', detail: 'old draft wording', createdAt: '2026-11-20T10:00:00Z', actor: 'a' }] });
    const recent = screen.getByRole('heading', { name: 'Recent activity' }).closest('section')!;
    expect(within(recent).getByText('Previous draft retained in activity record.')).toBeTruthy();
    expect(within(recent).queryByText('old draft wording')).toBeNull();
  });
});
