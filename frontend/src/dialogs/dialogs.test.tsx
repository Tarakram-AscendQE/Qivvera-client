import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deferred, fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from '../workspace/workspace-module';

const shell = fakeShell();
const me = 'me@example.test';
const obligation = { id: 'o1', version: 4, statement: 'Requester cannot approve', reviewStatus: 'IN_REVIEW', proposedBy: me, criticality: 'HIGH' };

let ui: WorkspaceUI;
let services: ReturnType<typeof fakeWorkspaceServices>;
let active = true;

function setup(api: (path: string, options?: { data?: unknown }) => Promise<unknown>) {
  document.body.innerHTML = '<dialog id="modal"></dialog>';
  services = fakeWorkspaceServices();
  services.api.mockImplementation(api as never);
  services.closeDialog.mockImplementation(() => { ui.unmountDialog(); const modal = document.querySelector<HTMLDialogElement>('#modal')!; if (modal.open) modal.close(); modal.replaceChildren(); });
  const S = { session: { email: me, roles: ['AUTHOR', 'POLICY_AUTHORITY'], reviewMode: 'independent' }, tab: 'overview', workspace: { applications: [{ id: 'a1', name: 'VendorPay' }], changes: [], activity: [], capabilities: {} }, change: { id: 'chg-1', title: 'T', revision: { id: 'r1', number: 1 }, currentRevisionId: 'r1', obligations: [obligation] } };
  ui = createWorkspaceUI({ ...services, viewContext: () => () => active, S: S as never, shell, can: () => true });
}
const modal = () => document.querySelector<HTMLDialogElement>('#modal')!;
const submit = () => fireEvent.submit(modal().querySelector('form')!);

beforeEach(() => { active = true; location.hash = '#/overview'; });
afterEach(() => ui?.unmountDialog());

describe('form dialogs', () => {
  it('sends one save, locks every control until it settles, then refreshes and opens the saved record', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    ui.openNewApplication();
    expect(modal().open).toBe(true);
    fireEvent.change(screen.getByLabelText('Application name *'), { target: { value: 'Pay' } });
    submit();
    submit();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy());
    expect([...modal().querySelector('form')!.elements].every(control => (control as HTMLInputElement).disabled)).toBe(true);
    answer.resolve({ id: 'app-9' });
    await waitFor(() => expect(location.hash).toBe('#/applications/app-9'));
    expect(services.api).toHaveBeenCalledTimes(1);
    expect(services.refresh).toHaveBeenCalledTimes(1);
    expect(services.toast).toHaveBeenCalledWith('Saved to your workspace.');
    expect(modal().open).toBe(false);
  });

  it('explains a conflict and keeps the dialog open for the person to reload', async () => {
    setup(async () => { throw Object.assign(new Error('The record changed.'), { status: 409 }); });
    ui.openReview('o1', 'SUBMIT');
    submit();
    await waitFor(() => expect(modal().querySelector('.form-error')!.textContent).toBe('The record changed. Close this dialog and reload the view before trying again.'));
    expect((screen.getByRole('button', { name: 'Submit for review' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says a save happened when only the refresh failed, instead of inviting a second save', async () => {
    setup(async () => ({}));
    services.refresh.mockRejectedValueOnce(new Error('offline'));
    ui.openReview('o1', 'WITHDRAW');
    submit();
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith('Your action was saved, but the workspace could not be refreshed. Reload the view to inspect the saved record.'));
    expect(services.api).toHaveBeenCalledTimes(1);
  });

  it('labels a same-person decision and sends the chosen decision with the reviewed version', async () => {
    setup(async () => ({}));
    ui.openReview('o1', 'DECISION');
    expect(screen.getByText('Same-person decision: no independent approval is claimed.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'REJECT' } });
    fireEvent.change(screen.getByLabelText('Reason for this decision *'), { target: { value: 'Not applicable to this revision.' } });
    submit();
    await waitFor(() => expect(services.api).toHaveBeenCalledWith('/api/obligations/o1/review', { method: 'POST', data: { action: 'REJECT', rationale: 'Not applicable to this revision.', version: 4, revisionId: 'r1' } }));
    expect(services.route).toHaveBeenCalled();
  });

  it('shows no error for a save whose dialog was already closed', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    ui.openObligation();
    fireEvent.change(screen.getByLabelText('What must be true? *'), { target: { value: 'S' } });
    submit();
    services.closeDialog();
    answer.reject(new Error('late failure'));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(modal().textContent).toBe('');
    expect(services.toast).not.toHaveBeenCalled();
  });
});

describe('review history', () => {
  it('opens newest first and ignores a late answer after the view changed', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    const shown = ui.showObligationHistory('o1');
    active = false;
    answer.resolve([{ action: 'PROPOSE', version: 1, actor: 'a', createdAt: '2026-11-01T10:00:00Z', snapshot: {} }]);
    await shown;
    expect(modal().open).toBe(false);
    active = true;
    setup(async () => [{ action: 'PROPOSE', version: 1, actor: 'first', createdAt: '2026-11-01T10:00:00Z', snapshot: {} }, { action: 'ACCEPT', version: 2, actor: 'second', createdAt: '2026-11-02T10:00:00Z', snapshot: {} }]);
    await ui.showObligationHistory('o1');
    expect([...modal().querySelectorAll('.decision-actor')].map(node => node.textContent?.split(' · ')[0])).toEqual(['second', 'first']);
  });
});
