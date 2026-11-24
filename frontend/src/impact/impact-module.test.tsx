import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LegacyApi, LegacyShell } from '../legacy-bridge';
import { createImpactUI, type ImpactBridge, type ImpactUI } from './impact-module';
import { display, parseImpactReport, reviewLabel, roleLabel } from './report';

const shell = vi.fn<LegacyShell>((content, active = '', label = '') => {
  document.body.innerHTML = `<nav data-active="${active}" data-label="${label}"></nav><main id="main">${content}</main>`;
});

function report(over: Record<string, unknown> = {}) {
  return {
    schema: 'qivvera.impact/1', generatedAt: '2026-11-20T09:30:00Z', snapshotDigest: 'sha256:abc',
    change: { id: 'chg-1', title: '<img src=x onerror=alert(1)>' },
    selectedRevision: { id: 'rev-2', number: 2, isCurrent: true }, baselineRevision: null,
    summary: { mandatory: 1 }, revisionDifferences: [], guidance: [], obligations: [], notCarriedForward: [],
    assurance: { available: false, checks: [], targetOptions: [] }, ...over
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

let S: ImpactBridge['S'];
let ui: ImpactUI;
let route: ReturnType<typeof vi.fn<() => Promise<void>>>;

function setup(answer: () => Promise<unknown>) {
  route = vi.fn(async () => {});
  ui = createImpactUI({ S, api: vi.fn<LegacyApi>(answer), shell, route });
}

beforeEach(() => {
  S = { session: { email: 'p@example.test', roles: ['POLICY_AUTHORITY'] }, tab: 'start' };
  shell.mockClear();
  location.hash = '#/impact/chg-1/rev-2';
});
afterEach(() => ui?.unmount());

describe('impact report contract', () => {
  it('accepts only the requested change and revision in the expected format', () => {
    expect(parseImpactReport(report(), 'chg-1', 'rev-2').change.id).toBe('chg-1');
    for (const bad of [report({ schema: 'qivvera.impact/2' }), report({ change: { id: 'other' } }), report({ selectedRevision: { id: 'rev-1' } }), report({ obligations: null }), report({ assurance: null }), null]) {
      expect(() => parseImpactReport(bad, 'chg-1', 'rev-2')).toThrow('This impact report does not match the selected revision or expected format.');
    }
  });

  it('labels known values and shows unknown ones as received', () => {
    expect([reviewLabel('ACCEPTED'), reviewLabel('NEW_STATE'), reviewLabel('constructor')]).toEqual(['Requirement accepted', 'NEW_STATE', 'constructor']);
    expect([roleLabel('OPERATOR'), roleLabel('SOME_ROLE'), roleLabel(null)]).toEqual(['Workspace operator', 'SOME ROLE', 'Everyone']);
    expect([display(null), display(''), display(0), display({ a: 1 })]).toEqual(['Not supplied', 'Not supplied', '0', '{\n  "a": 1\n}']);
  });
});

describe('impact screen', () => {
  it('shows a loading view at once, then the report with server text as text', async () => {
    const answer = deferred<unknown>();
    setup(() => answer.promise);
    const shown = ui.show('chg-1', 'rev-2');
    expect(screen.getByRole('status').textContent).toBe('Loading the saved revision context…');
    answer.resolve(report());
    await shown;
    expect(screen.getByRole('heading', { level: 1, name: 'Impact & next checks' })).toBeTruthy();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('does not draw a late report after navigation or a session change', async () => {
    for (const leave of [() => { location.hash = '#/guide'; }, () => { S.session = { email: 'other@example.test' }; }]) {
      const answer = deferred<unknown>();
      setup(() => answer.promise);
      location.hash = '#/impact/chg-1/rev-2';
      S.session = { email: 'p@example.test' };
      const shown = ui.show('chg-1', 'rev-2');
      leave();
      answer.resolve(report());
      await shown;
      expect(screen.queryByRole('heading', { name: 'Impact & next checks', level: 1 })?.closest('#impact-report')).toBeFalsy();
      ui.unmount();
    }
  });

  it('remembers the chosen change tab, refreshes and downloads only while the view is current', async () => {
    setup(async () => report());
    await ui.show('chg-1', 'rev-2');
    fireEvent.click(screen.getByRole('link', { name: 'Open obligations' }));
    expect(S.tab).toBe('obligations');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh impact report' }));
    expect(route).toHaveBeenCalledTimes(1);

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:impact'), revokeObjectURL: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Download impact report' }));
    expect(click).toHaveBeenCalledTimes(1);

    ui.invalidate();
    fireEvent.click(screen.getByRole('link', { name: '← Back to change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh impact report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download impact report' }));
    expect(S.tab).toBe('obligations');
    expect(route).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('rejects a report for a different revision so the legacy router shows its error page', async () => {
    setup(async () => report({ selectedRevision: { id: 'rev-1', number: 1 } }));
    await expect(ui.show('chg-1', 'rev-2')).rejects.toThrow('does not match the selected revision');
  });
});
