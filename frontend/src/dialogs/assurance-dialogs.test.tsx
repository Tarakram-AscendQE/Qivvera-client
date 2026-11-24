import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deferred, fakeShell, fakeWorkspaceServices } from '../test-utils';
import { createWorkspaceUI, type WorkspaceUI } from '../workspace/workspace-module';

const shell = fakeShell();
const context = { scopeDigest: 'sha256:s', targets: [{ id: 't1', name: 'Target' }], profile: { rule: 'Self approval is rejected' }, plan: { id: 'plan-1', version: 1, current: true, snapshot: { target: { name: 'Target' } } }, scope: { changeId: 'chg-1', revisionId: 'r1' } };
const record = { id: 'run-1', status: 'COMPLETED', disposition: 'NOT_READY', applicability: 'CURRENT', evidenceIntegrity: 'VERIFIED', case: { reason: 'MAPPED_REPORT_MISSING', findings: [{ state: 'VIOLATED', statement: '<img src=x onerror=alert(1)>', reason: 'REQUESTER_APPROVED_OWN_REQUEST' }] }, evidence: { report: { observations: [{ step: 'maker approves', expected: { status: 409 }, observed: { status: 200 } }] } }, snapshot: { target: {}, profile: { exclusions: [], independence: {} }, verifier: { digest: 'sha256:v' } } };

let ui: WorkspaceUI;
let services: ReturnType<typeof fakeWorkspaceServices>;
let active = true;
let S: Record<string, unknown>;

function setup(api: (path: string, options?: { data?: unknown }) => Promise<unknown>, obligations = [{ id: 'o1', statement: 'Accepted one', reviewStatus: 'ACCEPTED' }], resolutionButtons?: (r: unknown) => string | null) {
  document.body.innerHTML = '<dialog id="modal"></dialog>';
  services = fakeWorkspaceServices();
  services.api.mockImplementation(api as never);
  services.closeDialog.mockImplementation(() => { ui.unmountDialog(); const modal = document.querySelector<HTMLDialogElement>('#modal')!; if (modal.open) modal.close(); modal.replaceChildren(); });
  S = { session: { email: 'pa@example.test', roles: ['POLICY_AUTHORITY'] }, tab: 'overview', workspace: { applications: [], capabilities: {} }, change: { id: 'chg-1', title: 'T', sourceRevision: 'abc', revision: { id: 'r1', number: 1 }, obligations }, assuranceContext: context };
  ui = createWorkspaceUI({ ...services, viewContext: () => () => active, S: S as never, shell, can: () => true, ...(resolutionButtons ? { resolutionButtons } : {}) });
}
const modal = () => document.querySelector<HTMLDialogElement>('#modal')!;

beforeEach(() => { active = true; });
afterEach(() => ui?.unmountDialog());

describe('assurance dialogs', () => {
  it('asks for an accepted obligation before any mapping can be approved', () => {
    setup(async () => ({}), [{ id: 'o1', statement: 'Draft', reviewStatus: 'DRAFT' }]);
    ui.openPlan();
    expect(services.toast).toHaveBeenCalledWith('Accept an obligation before mapping a verifier.');
    expect(modal().open).toBe(false);
  });

  it('queues an assessment with one request key, even when the first attempt is lost', async () => {
    const keys: unknown[] = [];
    let attempt = 0;
    setup(async (_path, options) => { keys.push((options?.data as { requestKey: unknown }).requestKey); if (++attempt === 1) throw new Error('Connection lost.'); return {}; });
    ui.openRequestAssessment();
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(modal().querySelector('.form-error')!.textContent).toBe('Connection lost.'));
    fireEvent.submit(modal().querySelector('form')!);
    await waitFor(() => expect(services.route).toHaveBeenCalled());
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(S['tab']).toBe('assurance');
  });

  it('shows the assessment case with server text as text and resolution actions when enabled', async () => {
    setup(async () => record, undefined, () => '<button class="button" data-resolution="track">Track finding</button>');
    await ui.showAssessment('run-1');
    expect(within(modal()).getByRole('heading', { name: 'NOT READY' })).toBeTruthy();
    expect(within(modal()).getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeTruthy();
    expect(modal().querySelector('img')).toBeNull();
    expect(within(modal()).getByRole('button', { name: 'Track finding' })).toBeTruthy();
    expect(modal().querySelectorAll('pre')[1]!.textContent).toBe('{\n  "status": 200\n}');
    expect(screen.getByRole('link', { name: 'Export case JSON' }).getAttribute('href')).toBe('/api/assessments/run-1/export');
  });

  it('does not open an assessment case that arrives after the view changed', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    const shown = ui.showAssessment('run-1');
    active = false;
    answer.resolve(record);
    await shown;
    expect(modal().open).toBe(false);
  });
});
