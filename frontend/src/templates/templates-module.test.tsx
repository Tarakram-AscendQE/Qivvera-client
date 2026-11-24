import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LegacyApi, LegacyShell } from '../legacy-bridge';
import { createTemplatesUI, type TemplatesUI } from './templates-module';

const shell = vi.fn<LegacyShell>((content, active = '', label = '') => {
  document.body.innerHTML = `<nav data-active="${active}" data-label="${label}"></nav><main id="main">${content}</main>`;
});

const T = 'aaaaaaaa-0000-4000-8000-000000000001', V = 'bbbbbbbb-0000-4000-8000-000000000002', C = 'cccccccc-0000-4000-8000-000000000001', R = 'dddddddd-0000-4000-8000-000000000001';
const entry = (id: string) => ({ check: { id, title: id, rule: 'Rule ' + id, version: '1' }, mappingRationale: 'why', requirement: { statement: 'Req ' + id, criticality: 'HIGH', version: 1 } });
const report = (state = 'ACTIVE') => ({
  schema: 'qivvera.verification-template/1', family: { id: T, state, stateVersion: 4 },
  version: { id: V, number: 2, digest: 'sha256:v', snapshot: { name: '<b>Maker</b>', purpose: 'p', adapterId: 'approval-v1', entries: [entry('separation'), entry('finality')], createdBy: 'pa', createdAt: '2026-11-20T10:00:00Z', rationale: 'r', source: { planVersion: 1, approvedBy: 'pa', planRationale: 'x', changeId: C, revisionId: R, sourceRevision: 's', planId: 'p', planDigest: 'd', scopeDigest: 'sd' }, profile: { id: 'approval-controls', version: '2.0.0' } } },
  history: [{ id: V, number: 2, name: 'n', createdBy: 'pa', createdAt: '2026-11-20T10:00:00Z' }]
});
const obligations = [{ id: 'o1', statement: 'First', reviewStatus: 'ACCEPTED' }, { id: 'o2', statement: 'Second', reviewStatus: 'ACCEPTED' }];
const change = { id: C, title: 'Change', isCurrentRevision: true, revision: { id: R, number: 4 } };
const context = { isCurrent: true, scopeDigest: 'scope', scope: { changeId: C, revisionId: R, obligations }, plan: null, checks: [{ id: 'separation', title: 's', version: '1', rule: 'Rule separation' }, { id: 'finality', title: 'f', version: '1', rule: 'Rule finality' }], targets: [{ id: 't1', name: 'Target', adapterId: null }] };

let S: { session: { email: string; roles: string[] } | null; tab?: string; workspace: { applications: never[]; changes: { id: string; title: string }[] } };
let ui: TemplatesUI;
let api: ReturnType<typeof vi.fn<LegacyApi>>;
let route: ReturnType<typeof vi.fn<() => Promise<void>>>;

function setup(get: (path: string) => unknown, post: (path: string, data: unknown) => Promise<unknown> = async () => ({})) {
  api = vi.fn<LegacyApi>(async (path, options) => (options?.method === 'POST' ? post(path, options.data) : get(path)));
  route = vi.fn(async () => {});
  ui = createTemplatesUI({ S, api, shell, route, refresh: vi.fn(async () => {}), can: role => (S.session?.roles ?? []).includes(role) });
}

beforeEach(() => {
  S = { session: { email: 'pa@example.test', roles: ['POLICY_AUTHORITY'] }, tab: 'start', workspace: { applications: [], changes: [{ id: C, title: 'Change' }] } };
  shell.mockClear();
});
afterEach(() => ui?.unmount());

describe('verification templates', () => {
  it('asks for a smaller page when the saved history exceeds the read limit', async () => {
    location.hash = '#/verification-templates';
    setup(path => {
      if (path.includes('limit=20')) throw Object.assign(new Error('too large'), { code: 'TEMPLATE_READ_LIMIT' });
      return { items: [], total: 0, offset: 0, limit: 5, hasMore: false };
    });
    await ui.showList();
    expect(api.mock.calls.map(([path]) => path)).toEqual(['/api/verification-templates?offset=0&limit=20&includeArchived=false', '/api/verification-templates?offset=0&limit=5&includeArchived=false']);
    expect(screen.getByText('Large saved histories: showing a smaller page. Use Next to inspect the remaining templates.')).toBeTruthy();
  });

  it('rejects a template that does not match its link', async () => {
    location.hash = `#/verification-templates/${T}`;
    setup(() => ({ ...report(), family: { id: 'other', state: 'ACTIVE' } }));
    await expect(ui.showDetail(T)).rejects.toThrow('The saved template does not match this link.');
  });

  it('archives at most once per reason, reusing the request key after a lost response', async () => {
    location.hash = `#/verification-templates/${T}`;
    const keys: unknown[] = [];
    let attempts = 0;
    setup(() => report(), async (_path, data) => { keys.push((data as { requestKey: unknown }).requestKey); if (++attempts === 1) throw new Error('Connection lost.'); return {}; });
    await ui.showDetail(T);
    fireEvent.click(screen.getByRole('button', { name: 'Archive template' }));
    expect(document.activeElement?.id).toBe('archiveRationale');
    fireEvent.change(screen.getByLabelText('Reason for archiving *'), { target: { value: 'Superseded by policy v2.' } });
    fireEvent.submit(document.querySelector('#template-archive-form')!);
    await waitFor(() => expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('Connection lost.'))).toBe(true));
    fireEvent.submit(document.querySelector('#template-archive-form')!);
    await waitFor(() => expect(route).toHaveBeenCalled());
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('requires a distinct accepted obligation for each check before a new plan can be approved', async () => {
    location.hash = `#/template-plan/${C}/${R}/${T}/${V}`;
    setup(path => (path.startsWith('/api/verification-templates') ? report() : path.includes('assurance-context') ? context : change));
    await ui.showPlan(C, R, T, V);
    const first = screen.getByLabelText('New accepted obligation for separation') as HTMLSelectElement;
    const second = screen.getByLabelText('New accepted obligation for finality') as HTMLSelectElement;
    fireEvent.change(first, { target: { value: 'o1' } });
    fireEvent.change(second, { target: { value: 'o1' } });
    expect(second.validationMessage).toBe('Choose a different accepted obligation for each check.');
    fireEvent.change(second, { target: { value: 'o2' } });
    expect([first.validationMessage, second.validationMessage]).toEqual(['', '']);
    await waitFor(() => expect(document.querySelector('[data-template-selected="finality"]')?.textContent).toContain('Selected new requirement: Second'));
  });

  it('explains every reason a template cannot be approved, and offers no form', async () => {
    S.session = { email: 'viewer@example.test', roles: ['VIEWER'] };
    location.hash = `#/template-plan/${C}/${R}/${T}/${V}`;
    setup(path => (path.startsWith('/api/verification-templates') ? report('ARCHIVED') : path.includes('assurance-context') ? { ...context, targets: [] } : change));
    await ui.showPlan(C, R, T, V);
    expect(screen.getByRole('heading', { name: 'This template cannot be approved for these inputs' })).toBeTruthy();
    for (const reason of ['A Policy Authority must make this decision.', 'The template is archived and cannot be reused.', 'No current target uses the template’s reviewed adapter for this application and revision.']) {
      expect(screen.getByText(reason)).toBeTruthy();
    }
    expect(document.querySelector('#template-plan-form')).toBeNull();
  });

  it('does not draw a late answer over a newer route', async () => {
    location.hash = `#/verification-templates/${T}`;
    let answer!: (value: unknown) => void;
    setup(() => new Promise(resolve => { answer = resolve; }));
    const shown = ui.showDetail(T);
    location.hash = '#/guide';
    answer(report());
    await shown;
    expect(shell).not.toHaveBeenCalled();
  });
});
