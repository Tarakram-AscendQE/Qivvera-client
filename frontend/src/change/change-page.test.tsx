import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from '../workspace/workspace-module';

const shell = fakeShell();
const me = 'me@example.test';
const obligation = (id: string, reviewStatus: string, over: Record<string, unknown> = {}) => ({ id: id.padEnd(36, '0'), version: 1, statement: 'Statement ' + id, reviewStatus, authority: 'CANDIDATE', state: 'NOT_ASSESSED', criticality: 'HIGH', proposedBy: 'other@example.test', ...over });
const change = (over: Record<string, unknown> = {}) => ({
  id: 'chg-1', title: 'Approvals', applicationId: 'a1', isCurrentRevision: true, currentRevisionId: 'r1', sourceRevision: 'abc',
  revision: { id: 'r1', number: 1 }, revisions: [{ id: 'r1', number: 1, createdAt: '2026-11-01T10:00:00Z' }], obligations: [], ...over
});
const plan = { current: true, version: 1, snapshot: { profile: { title: 'p' }, target: { name: 't', sourceRevision: 's' }, mappings: [] } };

let ui: WorkspaceUI;
function show(state: Record<string, unknown>, roles: string[], resolutionHtml = '') {
  const S = {
    session: { email: me, roles, reviewMode: 'independent' }, tab: 'obligations', runs: [], assuranceContext: null, assuranceError: null, sources: [], sourceError: null,
    workspace: { applications: [{ id: 'a1', name: 'VendorPay' }], changes: [], activity: [], capabilities: {} }, change: change(), ...state
  };
  ui = createWorkspaceUI({ ...fakeWorkspaceServices(), S: S as never, shell, can: role => roles.includes(role) });
  ui.showChange(resolutionHtml);
}

beforeEach(() => shell.mockClear());
afterEach(() => ui?.unmount());

describe('change page', () => {
  it('does not let a contributor decide on their own requirement in independent review', () => {
    show({ change: change({ obligations: [obligation('mine', 'IN_REVIEW', { proposedBy: me }), obligation('theirs', 'IN_REVIEW')] }) }, ['AUTHOR', 'POLICY_AUTHORITY']);
    const mine = document.querySelector<HTMLElement>(`[data-obligation-id="${'mine'.padEnd(36, '0')}"]`)!;
    const theirs = document.querySelector<HTMLElement>(`[data-obligation-id="${'theirs'.padEnd(36, '0')}"]`)!;
    expect(within(mine).queryByRole('button', { name: 'Record decision' })).toBeNull();
    expect(within(mine).getByText('Needs a different authorized reviewer.')).toBeTruthy();
    expect(within(mine).getByRole('button', { name: 'Withdraw request' })).toBeTruthy();
    expect(within(theirs).getByRole('button', { name: 'Record decision' }).dataset['action']).toBe('review-decision');
  });

  it('labels same-person decisions in founder-review mode instead of hiding them', () => {
    show({ session: { email: me, roles: ['POLICY_AUTHORITY'], reviewMode: 'founder-review' }, change: change({ obligations: [obligation('mine', 'IN_REVIEW', { proposedBy: me })] }) }, ['POLICY_AUTHORITY']);
    expect(screen.getByText('Same-person decisions are permitted and labelled. They do not establish independent approval.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record decision' })).toBeTruthy();
  });

  it('keeps an earlier revision read-only and points to the current one', () => {
    show({ change: change({ isCurrentRevision: false, obligations: [obligation('a', 'DRAFT')] }) }, ['AUTHOR']);
    expect(screen.getByText('Historical revision · read-only')).toBeTruthy();
    expect((screen.getByRole('button', { name: '+ Add obligation' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit draft' })).toBeNull();
    expect(screen.getByText(/You are viewing an earlier revision/)).toBeTruthy();
  });

  it('never claims readiness while an assessment is unfinished, and blocks a second run', () => {
    show({ tab: 'assurance', change: change({ obligations: [obligation('a', 'ACCEPTED')] }), assuranceContext: { isCurrent: true, targets: [{}], scope: { obligations: [] }, profile: { exclusions: [] }, plan }, runs: [{ id: 'run-1', status: 'RUNNING', applicability: 'CURRENT', queuedAt: '2026-11-01T10:00:00Z' }] }, ['AUTHOR']);
    const banner = document.querySelector('.status-panel')!;
    expect(within(banner as HTMLElement).getByRole('heading', { name: 'Running' })).toBeTruthy();
    const run = screen.getByRole('button', { name: 'Assessment in progress' }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel acceptance' }).dataset['action']).toBe('cancel-assessment');
  });

  it('explains a missing assurance setup rather than showing an empty plan', () => {
    show({ tab: 'assurance', assuranceError: 'Assurance could not be read.' }, ['VIEWER']);
    expect(screen.getByRole('heading', { name: 'Assurance setup is not available' })).toBeTruthy();
    expect(screen.getByText('Assurance could not be read.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload assessment details' }).dataset['action']).toBe('refresh-assurance');
  });

  it('shows requirement text only as text and embeds the resolution tab supplied by the shell', () => {
    show({ change: change({ obligations: [obligation('a', 'DRAFT', { statement: '<img src=x onerror=alert(1)>' })] }) }, ['VIEWER']);
    expect(screen.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    ui.unmount();
    show({ tab: 'resolutions' }, ['VIEWER'], '<section class="panel"><h2>Findings to resolve</h2></section>');
    expect(screen.getByRole('heading', { name: 'Findings to resolve' })).toBeTruthy();
  });
});
