import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, fakeShell } from '../test-utils';
import type { LegacyApi } from '../legacy-bridge';
import { createResolutionUI, type ResolutionUI } from './resolution-module';

const shell = fakeShell();
const me = 'me@example.test';
const record = (over: Record<string, unknown> = {}) => ({
  id: 'res1-0000-4000', changeId: 'chg-1', kind: 'VIOLATION', version: 3, status: 'AWAITING_REASSESSMENT', effectiveStatus: 'AWAITING_REASSESSMENT', reviewMode: 'independent',
  notice: 'n', assignedTo: 'owner@example.test', actionPlan: 'p', correctionRevisionId: 'r3', correctionRunFloor: 2, correctionObligationId: 'o1',
  source: { finding: { statement: 'Original finding' } },
  comparison: { source: null, candidate: null, eligible: true, blockers: [], expectations: {} },
  challenges: [], history: [{ action: 'CREATED', version: 1, actor: 'owner@example.test', createdAt: '2026-11-01T10:00:00Z' }], ...over
});

let ui: ResolutionUI;
let api: ReturnType<typeof vi.fn<LegacyApi>>;
let toast: ReturnType<typeof vi.fn<(text: string) => void>>;
let generation = 0;

function setup(answer: (path: string) => Promise<unknown>, roles = ['POLICY_AUTHORITY']) {
  document.body.innerHTML = '<div id="root"></div><dialog id="modal"></dialog>';
  location.hash = '#/resolutions/res1-0000-4000';
  api = vi.fn<LegacyApi>(answer);
  toast = vi.fn();
  const S = { session: { email: me, roles }, workspace: { capabilities: { resolutionWorkflow: true } }, change: { id: 'chg-1' } };
  const closeDialog = () => { generation++; ui.unmountDialog(); const modal = document.querySelector<HTMLDialogElement>('#modal')!; if (modal.open) modal.close(); modal.replaceChildren(); };
  ui = createResolutionUI({ S: S as never, api, shell, toast, can: role => roles.includes(role), route: vi.fn(async () => {}), refresh: vi.fn(async () => {}), closeDialog, viewContext: () => () => true, dialogGeneration: () => generation });
}
const button = (data: Record<string, string>) => { const element = document.createElement('button'); Object.assign(element.dataset, data); return element; };
const modal = () => document.querySelector<HTMLDialogElement>('#modal')!;

beforeEach(() => { shell.mockClear(); });
afterEach(() => { ui?.unmountDialog(); shell.reset(); });

describe('resolution', () => {
  it('requires a Policy Authority who neither owns nor contributed to verify a correction', async () => {
    setup(async () => record({ history: [{ action: 'PROPOSE_CORRECTION', version: 2, actor: me, createdAt: '2026-11-02T10:00:00Z' }] }));
    await ui.showItem('res1-0000-4000');
    expect((screen.getByRole('button', { name: 'Verify resolution' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('A different authorized Policy Authority must verify this correction.')).toBeTruthy();
    shell.reset();
    setup(async () => record());
    await ui.showItem('res1-0000-4000');
    expect((screen.getByRole('button', { name: 'Verify resolution' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('records an action against the version the person saw and returns to the item', async () => {
    setup(async path => (path.endsWith('/actions') ? {} : record()));
    await ui.showItem('res1-0000-4000');
    await ui.handle(button({ resolution: 'note' }));
    fireEvent.change(within(modal()).getByLabelText('Reason for this action *'), { target: { value: 'Working note text.' } });
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/resolutions/res1-0000-4000/actions', { method: 'POST', data: { rationale: 'Working note text.', action: 'NOTE', version: 3 } }));
  });

  it('explains when no fresh reassessment can be linked instead of offering stale runs', async () => {
    setup(async path => (path.includes('/assessments?') ? [{ id: 'run-1', number: 1, status: 'COMPLETED', applicability: 'CURRENT', queuedAt: '2026-11-01T10:00:00Z', snapshot: { mappings: [{ obligationId: 'o1' }] } }] : record()));
    await ui.showItem('res1-0000-4000');
    await ui.handle(button({ resolution: 'link' }));
    expect(toast).toHaveBeenCalledWith('No new reassessment exists. Open the correction revision, approve its plan, and run assurance first.');
    expect(modal().open).toBe(false);
  });

  it('ignores a late item answer after navigation, and actions without a displayed item', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    const shown = ui.showItem('res1-0000-4000');
    location.hash = '#/overview';
    answer.resolve(record());
    await shown;
    expect(shell).not.toHaveBeenCalled();
    expect(await ui.handle(button({ resolution: 'note' }))).toBe(true);
    expect(modal().open).toBe(false);
  });

  it('can remove its own dialog when no other screen module is loaded', async () => {
    setup(async path => (path === '/api/resolution-assignees' ? [{ email: me }] : record()));
    location.hash = '#/changes/chg-1';
    await ui.handle(button({ resolution: 'create', run: 'run-9', obligation: 'o1' }));
    expect(within(modal()).getByRole('heading', { name: 'Track finding resolution' })).toBeTruthy();
    fireEvent.click(within(modal()).getByRole('button', { name: 'Cancel' }));
    expect(modal().childNodes.length).toBe(0);
    await ui.handle(button({ resolution: 'create', run: 'run-9', obligation: 'o1' }));
    expect(within(modal()).getByRole('heading', { name: 'Track finding resolution' })).toBeTruthy();
  });
});
