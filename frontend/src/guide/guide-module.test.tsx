import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeShell, deferred } from '../test-utils';
import type { LegacyApi, LegacySession, LegacyState } from '../legacy-bridge';
import { createGuideUI, type GuideUI } from './guide-module';

const shell = fakeShell();

const author: LegacySession = { email: 'author@example.test', roles: ['AUTHOR', 'POLICY_AUTHORITY'] };

function supportInfo(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'qivvera.support-info/1', generatedAt: '2026-11-24T10:00:00.000Z', requestId: 'req-1',
    product: { name: 'Qivvera', version: '0.11.0', revision: 'b'.repeat(40) },
    workspace: { storage: 'postgres', schemaVersion: 8, requiredSchemaVersion: 8, maxSupportedSchemaVersion: 8, storageCheck: 'reachable', reviewMode: 'independent', secureSession: true },
    capabilities: { registry: true }, roles: ['AUTHOR'], actions: { createChange: true }, warnings: [],
    ...overrides
  };
}


let state: { session: LegacySession | null };
let ui: GuideUI;
let api: ReturnType<typeof vi.fn<LegacyApi>>;

function setup(apiImpl: LegacyApi) {
  api = vi.fn<LegacyApi>(apiImpl);
  ui = createGuideUI({ S: state as LegacyState, api, shell });
}

beforeEach(() => {
  state = { session: author };
  shell.mockClear();
});
afterEach(() => shell.reset());

describe('Guide', () => {
  it('is in the page when showGuide returns, like the legacy string screens', () => {
    setup(async () => ({}));
    location.hash = '#/guide';
    ui.showGuide();
    expect(shell).toHaveBeenCalledWith(expect.anything(), 'guide', 'Product guide');
    expect(screen.getByRole('heading', { level: 1, name: 'Your guide to Qivvera' })).toBeTruthy();
    expect(screen.getByText('Your role: Author and Policy Authority.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Supported scope' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open workspace support' }).getAttribute('href')).toBe('#/support');
  });

  it('does not draw over a different route or without a session', () => {
    setup(async () => ({}));
    location.hash = '#/changes';
    ui.showGuide();
    location.hash = '#/guide';
    state.session = null;
    ui.showGuide();
    expect(shell).not.toHaveBeenCalled();
  });
});

describe('Support', () => {
  it('reads the details before drawing and shows server values only as text', async () => {
    setup(async () => supportInfo({ requestId: '<img src=x onerror=alert(1)>' }));
    location.hash = '#/support';
    await ui.showSupport();
    expect(api).toHaveBeenCalledWith('/api/support-info');
    expect(shell).toHaveBeenCalledWith(expect.anything(), 'support', 'Support');
    expect(screen.getByRole('heading', { level: 1, name: 'Workspace support' })).toBeTruthy();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Reachable when checked')).toBeTruthy();
    expect(screen.getByText('PostgreSQL')).toBeTruthy();
  });

  it('ignores a late answer after navigation', async () => {
    const pending = deferred<unknown>();
    setup(() => pending.promise);
    location.hash = '#/support';
    const shown = ui.showSupport();
    location.hash = '#/guide';
    pending.resolve(supportInfo());
    await shown;
    expect(shell).not.toHaveBeenCalled();
  });

  it('ignores a late answer after the session changed', async () => {
    const pending = deferred<unknown>();
    setup(() => pending.promise);
    location.hash = '#/support';
    const shown = ui.showSupport();
    state.session = { email: 'viewer@example.test', roles: ['VIEWER'] };
    pending.resolve(supportInfo());
    await shown;
    expect(shell).not.toHaveBeenCalled();
  });

  it('passes a read failure or unknown format to the legacy router without drawing', async () => {
    setup(async () => supportInfo({ schema: 'other' }));
    location.hash = '#/support';
    await expect(ui.showSupport()).rejects.toThrow('Support details use an unrecognized format.');
    setup(async () => { throw new Error('Qivvera could not be reached.'); });
    await expect(ui.showSupport()).rejects.toThrow('Qivvera could not be reached.');
    expect(shell).not.toHaveBeenCalled();
  });

  it('refreshes in place, and keeps the last details with an explanation when refresh fails', async () => {
    const answers: (() => Promise<unknown>)[] = [
      async () => supportInfo(),
      async () => supportInfo({ generatedAt: '2026-11-24T11:00:00.000Z' }),
      async () => { throw new Error('Qivvera could not be reached. Check your connection.'); }
    ];
    setup(() => answers.shift()!());
    location.hash = '#/support';
    await ui.showSupport();
    const refresh = screen.getByRole('button', { name: 'Refresh support details' });

    fireEvent.click(refresh);
    await waitFor(() => expect(screen.getByText('2026-11-24T11:00:00.000Z')).toBeTruthy());
    expect(shell).toHaveBeenCalledTimes(1);

    fireEvent.click(refresh);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Qivvera could not be reached. Check your connection.');
    expect(screen.getByText('2026-11-24T11:00:00.000Z')).toBeTruthy();
    expect((refresh as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows no refresh error when the session ended, because sign-in is already shown', async () => {
    const ended = Object.assign(new Error('Your session ended. Please sign in again.'), { sessionExpired: true });
    const answers: (() => Promise<unknown>)[] = [async () => supportInfo(), async () => { throw ended; }];
    setup(() => answers.shift()!());
    location.hash = '#/support';
    await ui.showSupport();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh support details' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Refresh support details' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('downloads exactly the displayed allowlisted report', async () => {
    setup(async () => supportInfo({ csrfToken: 'secret-token', accounts: ['owner@example.test'] }));
    location.hash = '#/support';
    await ui.showSupport();
    let saved: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => { saved = blob; return 'blob:support'; });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Qivvera-support-details.json');
      expect(this.href).toBe('blob:support');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download support details' }));
    expect(click).toHaveBeenCalledTimes(1);
    const body = await saved!.text();
    expect(body.endsWith('\n')).toBe(true);
    const report = JSON.parse(body);
    expect(report.schema).toBe('qivvera.support-info/1');
    expect(report.roles).toEqual(['AUTHOR']);
    expect(body).not.toContain('secret-token');
    expect(body).not.toContain('owner@example.test');
    click.mockRestore();
  });

  it('lists warnings with their next steps', async () => {
    setup(async () => supportInfo({ warnings: [{ code: 'SCHEMA', message: 'Schema not observed', nextStep: 'Ask the operator' }] }));
    location.hash = '#/support';
    await ui.showSupport();
    const panel = screen.getByRole('heading', { name: 'Checks and next steps' }).closest('section')!;
    expect(within(panel).getByText('Schema not observed')).toBeTruthy();
    expect(within(panel).getByText('Ask the operator')).toBeTruthy();
  });
});
