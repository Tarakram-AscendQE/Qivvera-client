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
function show(state: Record<string, unknown>, roles: string[], resolutionEnabled = false) {
  const S = {
    session: { email: me, roles, reviewMode: 'independent' }, tab: 'obligations', runs: [], assuranceContext: null, assuranceError: null, sources: [], sourceError: null,
    workspace: { applications: [{ id: 'a1', name: 'VendorPay' }], changes: [], activity: [], capabilities: {} }, change: change(), ...state
  };
  ui = createWorkspaceUI({ ...fakeWorkspaceServices(), S: S as never, shell, can: role => roles.includes(role) });
  ui.showChange(resolutionEnabled);
}

beforeEach(() => { shell.mockClear(); });
afterEach(() => shell.reset());

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

  it('does not offer a review request for an imported draft and tells the author how to claim it', () => {
    show({ change: change({ obligations: [obligation('old', 'DRAFT', { imported: true, proposedBy: 'legacy-import' }), obligation('new', 'DRAFT', { proposedBy: me })] }) }, ['AUTHOR']);
    const imported = document.querySelector<HTMLElement>(`[data-obligation-id="${'old'.padEnd(36, '0')}"]`)!;
    const normal = document.querySelector<HTMLElement>(`[data-obligation-id="${'new'.padEnd(36, '0')}"]`)!;
    expect(within(imported).queryByRole('button', { name: 'Request review' })).toBeNull();
    expect(within(imported).getByRole('button', { name: 'Edit draft' }).dataset['action']).toBe('edit-obligation');
    expect(within(imported).getByText('No author yet')).toBeTruthy();
    expect(within(imported).getByText(/Click Edit draft, check the wording, fill in Source reference and Source version, then click Save new draft\. After that you can request review\./)).toBeTruthy();
    expect(within(normal).getByRole('button', { name: 'Request review' }).dataset['action']).toBe('review-submit');
  });

  it('explains an imported draft to someone who cannot edit it without giving edit steps', () => {
    show({ change: change({ obligations: [obligation('old', 'DRAFT', { imported: true, proposedBy: 'legacy-import' })] }) }, ['VIEWER']);
    expect(screen.getByText('No author yet')).toBeTruthy();
    expect(screen.getByText(/An author must check and save it before it can be reviewed\./)).toBeTruthy();
    expect(screen.queryByText(/Click Edit draft/)).toBeNull();
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

  it('shows requirement text only as text and renders the resolution tab when the workflow is on', () => {
    show({ change: change({ obligations: [obligation('a', 'DRAFT', { statement: '<img src=x onerror=alert(1)>' })] }) }, ['VIEWER']);
    expect(screen.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    shell.reset();
    show({ tab: 'resolutions', resolutions: { items: [], total: 0, offset: 0, limit: 50, hasMore: false } }, ['VIEWER'], true);
    expect(screen.getByRole('heading', { name: 'Findings to resolve' })).toBeTruthy();
  });
});

describe('change steps', () => {
  const states = () => [...document.querySelectorAll('.flow-step')].map(step => [step.querySelector('button')!.textContent, step.className.split(' ')[1], step.querySelector('.flow-sub')!.textContent]);

  it('shows the workflow as steps named for their section, with the first unfinished one current', () => {
    show({ change: change({ obligations: [obligation('a', 'ACCEPTED'), obligation('b', 'IN_REVIEW')] }) }, ['POLICY_AUTHORITY']);
    expect(states()).toEqual([['Describe', 'flow-done', 'Done'], ['2Requirements', 'flow-now', '1 in review'], ['3Plan & check', 'flow-todo', 'Plan needed'], ['4Result', 'flow-todo', 'No result yet']]);
    const requirements = screen.getByRole('button', { name: 'Requirements' });
    expect([requirements.dataset['action'], requirements.dataset['tab'], requirements.getAttribute('aria-current')]).toEqual(['tab', 'obligations', 'step']);
    expect(screen.getByRole('button', { name: 'Plan & check' }).dataset['tab']).toBe('assurance');
    expect(within(screen.getByRole('navigation', { name: 'Records' })).getAllByRole('button').map(b => b.dataset['tab'])).toEqual(['revisions', 'history']);
  });

  it('keeps a failed result red, never marks it done, and shows the route to Ready', () => {
    const failed = { id: 'run-1', status: 'COMPLETED', applicability: 'CURRENT', disposition: 'NOT_READY', evidenceIntegrity: 'DIGEST_MATCH', queuedAt: '2026-11-01T10:00:00Z' };
    show({ tab: 'evidence', change: change({ obligations: [obligation('a', 'ACCEPTED')] }), runs: [failed], workspace: { applications: [{ id: 'a1', name: 'VendorPay' }], changes: [], activity: [], capabilities: { resolutionWorkflow: true } } }, ['AUTHOR'], true);
    expect(states().find(([name]) => String(name).endsWith('Result'))).toEqual(['Result', 'flow-bad', 'Not ready']);
    expect(states().find(([name]) => String(name).endsWith('Resolutions'))).toEqual(['5Resolutions', 'flow-todo', 'Track the fix here']);
    const path = screen.getByRole('heading', { name: 'How to get to Ready' }).closest('aside')!;
    expect(within(path).getByText('Track the fix')).toBeTruthy();
    expect(within(path).getByText(/A later pass on the same commit does not hide it/)).toBeTruthy();
  });

  it('marks Ready only from a current completed READY assessment', () => {
    const stale = { id: 'run-1', status: 'COMPLETED', applicability: 'STALE_INPUTS', disposition: 'READY', queuedAt: '2026-11-01T10:00:00Z' };
    show({ change: change({ obligations: [obligation('a', 'ACCEPTED')] }), runs: [stale] }, ['VIEWER']);
    expect(states()[3]).toEqual(['4Result', 'flow-todo', 'No result yet']);
    expect(screen.queryByRole('heading', { name: 'How to get to Ready' })).toBeNull();
  });
});
