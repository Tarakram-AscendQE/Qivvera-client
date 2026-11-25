import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeShell } from '../test-utils';
import type { Api } from '../shell-contract';
import { createDraftingUI, type DraftingUI } from './drafting-module';
import { problem, sizeProblem, sourceSize } from './labels';

const shell = fakeShell();

const change = { id: 'chg-1', title: 'Approvals', sourceRevision: 'abc', revision: { id: 'rev-1', number: 2 } };
const context = { changeId: 'chg-1', revisionId: 'rev-1', isCurrentRevision: true, methods: { openai: true }, runs: [], total: 0, offset: 0, limit: 10 };
const suggestion = { id: 'sug-1', version: 3, status: 'PROPOSED', statement: 'Requester must not approve', quote: 'must not approve', startLine: 1, endLine: 1, decision: null };
const run = { id: 'run-1', changeId: 'chg-1', revisionId: 'rev-1', status: 'COMPLETED', applicability: 'CURRENT', method: 'rules', createdBy: 'author@example.test', createdAt: '2026-11-20T10:00:00Z', source: { reference: 'POL-1', version: 'v1', digest: 'sha256:s', text: '<script>alert(1)</script>' }, suggestions: [suggestion] };

let S: { session: { email: string; roles: string[] } | null; tab?: string };
let ui: DraftingUI;
let api: ReturnType<typeof vi.fn<Api>>;
let refresh: ReturnType<typeof vi.fn<() => Promise<void>>>;

function setup(post: (path: string, data: unknown) => Promise<unknown>) {
  api = vi.fn<Api>(async (path, options) => {
    if (options?.method === 'POST') return post(path, options.data);
    if (path.includes('/drafting?')) return context;
    if (path.startsWith('/api/drafting-runs/')) return run;
    return change;
  });
  refresh = vi.fn(async () => {});
  ui = createDraftingUI({ S, api, shell, can: role => (S.session?.roles ?? []).includes(role), route: vi.fn(async () => {}), refresh });
}

function fillSource(text = 'The requester must not approve.') {
  fireEvent.change(screen.getByLabelText('Source reference *'), { target: { value: 'POL-9' } });
  fireEvent.change(screen.getByLabelText('Source version *'), { target: { value: 'v9' } });
  fireEvent.input(screen.getByLabelText('Source excerpt *'), { target: { value: text } });
}

beforeEach(() => {
  S = { session: { email: 'author@example.test', roles: ['AUTHOR'] }, tab: 'start' };
  shell.mockClear();
  location.hash = '#/drafting/chg-1/rev-1';
});
afterEach(() => shell.reset());

describe('drafting limits', () => {
  it('counts normalized characters, UTF-8 bytes and lines', () => {
    expect(sourceSize('a\r\nb\rc €')).toEqual({ text: 'a\nb\nc €', characters: 7, bytes: 9, lines: 3 });
    expect(sizeProblem(sourceSize('x\n'.repeat(200)))).toBe('Reduce the excerpt to at most 200 lines.');
    expect(sizeProblem(sourceSize('€'.repeat(4001)))).toBe('Reduce the excerpt to at most 12,000 UTF-8 bytes.');
    expect(problem(Object.assign(new Error('Changed.'), { status: 409 }))).toBe('Changed. Reload the saved run and reconcile its current state before trying again.');
  });
});

describe('source drafting', () => {
  it('reuses one request ID while the content is unchanged, so a retry cannot generate twice', async () => {
    const posts: unknown[] = [];
    setup(async (_path, data) => { posts.push(data); throw new Error('Connection lost.'); });
    await ui.show('chg-1', 'rev-1');
    fillSource();
    fireEvent.submit(screen.getByRole('button', { name: 'Propose drafts' }).closest('form')!);
    await waitFor(() => expect(screen.getAllByRole('alert')[0]!.textContent).toContain('Connection lost.'));
    fireEvent.submit(screen.getByRole('button', { name: 'Propose drafts' }).closest('form')!);
    await waitFor(() => expect(posts).toHaveLength(2));
    fillSource('Different wording must hold.');
    fireEvent.submit(screen.getByRole('button', { name: 'Propose drafts' }).closest('form')!);
    await waitFor(() => expect(posts).toHaveLength(3));
    const ids = posts.map(post => (post as { requestId: string }).requestId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('requires explicit consent before an excerpt can go to the AI service', async () => {
    setup(async () => ({ id: 'run-2' }));
    await ui.show('chg-1', 'rev-1');
    const consent = document.querySelector<HTMLInputElement>('[name=externalProcessingConfirmed]')!;
    expect([consent.disabled, consent.required]).toEqual([true, false]);
    fireEvent.change(screen.getByLabelText('Drafting method'), { target: { value: 'openai' } });
    await waitFor(() => expect([consent.disabled, consent.required]).toEqual([false, true]));
    fireEvent.click(consent);
    fireEvent.change(screen.getByLabelText('Drafting method'), { target: { value: 'rules' } });
    await waitFor(() => expect([consent.disabled, consent.checked]).toEqual([true, false]));
  });

  it('opens the saved run after a successful generation, but not after the visit ended', async () => {
    let answer!: (value: unknown) => void;
    setup(() => new Promise(resolve => { answer = resolve; }));
    await ui.show('chg-1', 'rev-1');
    fillSource();
    fireEvent.submit(screen.getByRole('button', { name: 'Propose drafts' }).closest('form')!);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Proposing drafts…' })).toBeTruthy());
    ui.invalidate();
    answer({ id: 'run-9' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(location.hash).toBe('#/drafting/chg-1/rev-1');
  });

  it('rejects records for another revision', async () => {
    setup(async () => ({}));
    api.mockImplementation(async path => (path.includes('/drafting?') ? { ...context, revisionId: 'rev-0' } : change));
    await expect(ui.show('chg-1', 'rev-1')).rejects.toThrow('The drafting view does not match the selected revision.');
  });
});

describe('saved drafting run', () => {
  it('shows source text as text and lets only the requesting Author decide', async () => {
    setup(async () => run);
    await ui.show('chg-1', 'rev-1', { runId: 'run-1' });
    expect(document.querySelector('pre')!.textContent).toBe('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Review and create a draft candidate')).toBeTruthy();
    shell.reset();
    S.session = { email: 'other@example.test', roles: ['AUTHOR'] };
    await ui.show('chg-1', 'rev-1', { runId: 'run-1' });
    expect(screen.queryByText('Review and create a draft candidate')).toBeNull();
    expect(screen.getByText('Only the requesting Author can create candidates or dismiss suggestions from this run.')).toBeTruthy();
  });

  it('saves a candidate decision, redraws the run and warns if the workspace summary cannot refresh', async () => {
    const decided = { ...run, suggestions: [{ ...suggestion, status: 'CANDIDATE_CREATED', decision: { action: 'CREATE_CANDIDATE', rationale: 'Applies here', statement: 'Edited', criticality: 'HIGH', actor: 'author@example.test', createdAt: '2026-11-21T10:00:00Z', obligationId: 'obl-1' } }] };
    setup(async () => decided);
    refresh.mockRejectedValueOnce(new Error('offline'));
    await ui.show('chg-1', 'rev-1', { runId: 'run-1' });
    const form = document.querySelector<HTMLFormElement>('form[data-drafting-action="CREATE_CANDIDATE"]')!;
    fireEvent.change(screen.getByLabelText('What must be true? *'), { target: { value: 'Edited' } });
    fireEvent.change(screen.getByLabelText('Criticality *'), { target: { value: 'HIGH' } });
    fireEvent.change(screen.getByLabelText('Why should this become a candidate? *'), { target: { value: 'Applies to this change.' } });
    fireEvent.submit(form);
    expect(await screen.findByText('Draft candidate saved. Open the change to request its separate authority review.')).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/api/drafting-runs/run-1/suggestions/sug-1/actions', { method: 'POST', data: { action: 'CREATE_CANDIDATE', version: 3, rationale: 'Applies to this change.', statement: 'Edited', criticality: 'HIGH' } });
    expect(await screen.findByText('The draft candidate was saved, but the workspace summary could not refresh. Reload the view to update its counts.')).toBeTruthy();
  });
});
