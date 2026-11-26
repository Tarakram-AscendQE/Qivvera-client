import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeShell } from '../test-utils';
import type { Api, SessionInfo, ShellState } from '../shell-contract';
import { createPrAssuranceUI, type PrAssuranceUI } from './pr-assurance-module';
import { SYNC_INTERVAL_MS } from './RunPanel';

const shell = fakeShell();
const RUN = '11111111-2222-4333-8444-555555555555';
const pull = { pullNumber: 6, title: 'VP-184 v1', headRef: 'feature/VP-184-v1-initial', headSha: 'af51c26b0b9f94894cccfaa5b0fb893221952c65', url: 'https://github.com/prcheck-live/vendorpay-app/pull/6' };
const scenario = (overrides: Record<string, unknown> = {}) => ({
  repository: 'prcheck-live/vendorpay-app', githubTokenConfigured: true, canEvaluate: true,
  pulls: [{ number: 6, pull, latestRun: null }, { number: 7, pull: null, latestRun: null }, { number: 8, pull: null, latestRun: null }], ...overrides
});
const run = (status: string, extra: Record<string, unknown> = {}) => ({ id: RUN, pullNumber: 6, headSha: pull.headSha, status, disposition: null, failure: null, createdAt: '2026-11-27T10:00:00Z', githubRunUrl: null, progress: null, ...extra });
const view = (status: string, extra: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({ run: run(status, extra), events: [{ seq: 1, stage: 'queued', message: 'Waiting for GitHub to start the run', recordedAt: '2026-11-27T10:00:00Z' }], report: null, githubNotice: null, ...more });
const checks = (n: number) => Array.from({ length: n }, (_, i) => ({ check: `V${i}/check`, outcome: i === 1 ? 'failed' : 'passed', durationMs: 5 }));

let state: { session: SessionInfo | null };
let ui: PrAssuranceUI;
let api: ReturnType<typeof vi.fn<Api>>;
let route: ReturnType<typeof vi.fn<() => Promise<void>>>;
let syncAnswers: unknown[];

function setup(answers: Record<string, unknown> = {}) {
  syncAnswers = [];
  api = vi.fn<Api>(async (path, options) => {
    if (path === '/api/pr-assurance') return answers['scenario'] ?? scenario();
    if (path === '/api/pr-assurance/pulls/6/runs' && !options?.method) return answers['history'] ?? [];
    if (path === '/api/pr-assurance/pulls/6/runs') {
      const start = answers['start'];
      if (start instanceof Error) throw start;
      return start ?? view('QUEUED', {}, { notice: null });
    }
    if (path === `/api/pr-assurance/runs/${RUN}`) return answers['run'];
    if (path === `/api/pr-assurance/runs/${RUN}/sync`) return syncAnswers.shift();
    throw new Error('unexpected ' + path);
  });
  route = vi.fn(async () => {});
  ui = createPrAssuranceUI({ S: state as ShellState, api, shell, toast: vi.fn(), route });
}
const evaluateButton = () => screen.getByRole('button', { name: /Evaluate|Starting|running/ });
const panel = () => document.querySelector<HTMLElement>('.pr-run')!;
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  state = { session: { email: 'author@example.test', roles: ['AUTHOR'] } };
  document.body.innerHTML = '<div id="root"></div>';
  shell.mockClear();
  location.hash = '#/pr-assurance/pulls/6';
});
afterEach(() => { shell.reset(); vi.useRealTimers(); });

describe('PR assurance: one pull request', () => {
  it('shows the imported PR, offers Evaluate and says it has not been evaluated', async () => {
    setup();
    await ui.showPull(6);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('VP-184 v1');
    expect(screen.getByText('Not evaluated yet')).toBeTruthy();
    // The PR number must not depend on the eyebrow line, which the redesigned theme hides.
    expect(document.querySelector('.sub')!.textContent).toMatch(/^PR #6 · feature\/VP-184-v1-initial/);
    expect((evaluateButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('Evaluate sends only a request key, then shows the run live until it ends', async () => {
    setup();
    await ui.showPull(6);
    await act(async () => { fireEvent.click(evaluateButton()); });
    const [, options] = api.mock.calls.find(([path, o]) => path === '/api/pr-assurance/pulls/6/runs' && o?.method === 'POST')!;
    expect(Object.keys(options!.data as object)).toEqual(['requestKey']);
    const stages = () => panel().querySelector<HTMLElement>('.pr-stages')!;
    expect(within(stages()).getByText('Waiting for GitHub').closest('li')!.getAttribute('aria-current')).toBe('step');

    syncAnswers.push(view('RUNNING', { progress: { stage: 'running-checks', message: 'Running', checksTotal: 14, checks: checks(5) } }));
    await tick();
    expect(within(panel()).getByText(/5 of 14 finished/)).toBeTruthy();
    expect(within(stages()).getByText('Running Qivvera’s checks').closest('li')!.className).toBe('current');

    syncAnswers.push(view('COMPLETED', { disposition: 'NOT_READY' }));
    await tick();
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('announces progress to screen readers from a region that exists before the first update', async () => {
    setup();
    await ui.showPull(6);
    await act(async () => { fireEvent.click(evaluateButton()); });
    const status = within(panel()).getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('Waiting for GitHub');
    syncAnswers.push(view('RUNNING', { progress: { stage: 'running-checks', message: 'Running', checksTotal: 14, checks: checks(5) } }));
    await tick();
    expect(within(panel()).getByRole('status')).toBe(status);
    expect(status.textContent).toBe('Running Qivvera’s checks · 5 of 14 checks finished');
  });

  it('stops asking once the visit has ended', async () => {
    setup();
    await ui.showPull(6);
    await act(async () => { fireEvent.click(evaluateButton()); });
    ui.invalidate();
    await tick();
    expect(api.mock.calls.some(([path]) => path.endsWith('/sync'))).toBe(false);
  });

  it('keeps the same request key after an answer was lost, so a retry cannot start a second run', async () => {
    setup({ start: new TypeError('Failed to fetch') });
    await ui.showPull(6);
    await act(async () => { fireEvent.click(evaluateButton()); });
    await act(async () => { fireEvent.click(evaluateButton()); });
    const keys = api.mock.calls.filter(([path, o]) => path === '/api/pr-assurance/pulls/6/runs' && o?.method === 'POST').map(([, o]) => (o!.data as { requestKey: string }).requestKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('a run already in progress elsewhere is explained and the page is redrawn', async () => {
    setup({ start: Object.assign(new Error('This pull request is already being evaluated.'), { status: 409, code: 'RUN_ALREADY_ACTIVE' }) });
    await ui.showPull(6);
    await act(async () => { fireEvent.click(evaluateButton()); });
    expect(screen.getByRole('alert').textContent).toMatch(/already being evaluated/);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('a viewer, or a workspace without a token, cannot evaluate', async () => {
    setup({ scenario: scenario({ canEvaluate: false }) });
    await ui.showPull(6);
    expect((evaluateButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('a run that ended without evidence says there is no result and no verdict', async () => {
    setup({ history: [run('FAILED')], run: view('FAILED', { failure: { code: 'GITHUB_RUN_FAILED', message: 'The GitHub run ended (failure) without evidence.' } }) });
    await ui.showPull(6);
    expect(within(panel()).getByText(/No result\./)).toBeTruthy();
    expect(within(panel()).getByText(/without evidence/)).toBeTruthy();
    expect(within(panel()).queryByText(/NOT READY|READY/)).toBeNull();
  });

  it('stored evidence that fails its check is reported instead of a result', async () => {
    setup({ history: [run('COMPLETED', { disposition: 'NOT_READY' })], run: view('COMPLETED', { disposition: 'NOT_READY' }, { report: { ok: false, reason: 'EVIDENCE_DIGEST_MISMATCH', message: 'The evidence does not match its published SHA-256.' } }) });
    await ui.showPull(6);
    expect(within(panel()).getByText('The stored evidence failed its integrity check.')).toBeTruthy();
  });

  it('opens one run from its link, and keeps syncing it while it runs', async () => {
    location.hash = `#/pr-assurance/runs/${RUN}`;
    setup({ run: view('RUNNING', { progress: { stage: 'starting-app', message: 'Starting', checksTotal: null, checks: [] } }) });
    await ui.showRun(RUN);
    expect(screen.getByRole('link', { name: '← PR #6' })).toBeTruthy();
    syncAnswers.push(view('RUNNING', { progress: { stage: 'running-checks', message: 'Running', checksTotal: 14, checks: checks(2) } }));
    await tick();
    expect(within(panel()).getByText(/2 of 14 finished/)).toBeTruthy();
  });
});
