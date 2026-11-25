import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type ApiError } from './api-client';
import { deferred } from '../test-utils';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let state: { session: { csrfToken: string } | null };
let ended: ReturnType<typeof vi.fn<() => void>>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  state = { session: { csrfToken: 'csrf-1' } };
  ended = vi.fn<() => void>();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const api = () => createApiClient(state, ended);
const failureOf = async (promise: Promise<unknown>) => promise.then(() => { throw new Error('expected a failure'); }, (error: ApiError) => error);

describe('api client', () => {
  it('reads without a CSRF header and sends writes as JSON with the session token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: 1 })).mockResolvedValueOnce(json(200, { id: 'x' }));
    await expect(api()('/api/workspace')).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/workspace', { method: 'GET', credentials: 'same-origin', headers: {} });
    await api()('/api/changes', { method: 'POST', data: { title: 'T' } });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/changes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-1' }, body: '{"title":"T"}' });
  });

  it('signs in without a token and does not treat a rejected sign-in as an ended session', async () => {
    state.session = null;
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Email or password is incorrect.' }));
    const error = await failureOf(api()('/api/session', { method: 'POST', data: { email: 'a', password: 'b' } }));
    expect(fetchMock.mock.calls[0]![1]!.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(error.message).toBe('Email or password is incorrect.');
    expect(error.status).toBe(401);
    expect(ended).not.toHaveBeenCalled();
  });

  it('does not report an ended session for a 401 before anyone signed in (startup)', async () => {
    state.session = null;
    fetchMock.mockResolvedValueOnce(json(401, {}));
    const error = await failureOf(api()('/api/session'));
    expect(ended).not.toHaveBeenCalled();
    expect([error.status, error.sessionExpired]).toEqual([401, undefined]);
  });

  it('ends a signed-in session on 401 and says so', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {}));
    const error = await failureOf(api()('/api/workspace'));
    expect(ended).toHaveBeenCalledTimes(1);
    expect([error.message, error.status, error.sessionExpired]).toEqual(['Your session ended. Please sign in again.', 401, true]);
  });

  it('rejects a response that arrives after the session changed', async () => {
    const reply = deferred<Response>();
    fetchMock.mockReturnValueOnce(reply.promise);
    const pending = failureOf(api()('/api/workspace'));
    state.session = { csrfToken: 'csrf-2' };
    reply.resolve(json(200, { secret: 'old identity' }));
    const error = await pending;
    expect([error.message, error.staleSession]).toEqual(['This response belongs to an earlier session.', true]);
  });

  it('explains unreachable and unreadable replies, warning that a write may have been saved', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect((await failureOf(api()('/api/workspace'))).message).toBe('Qivvera could not be reached. Check your connection and try loading this view again.');
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502 }));
    const error = await failureOf(api()('/api/changes', { method: 'POST', data: {} }));
    expect([error.message, error.status]).toEqual(['Qivvera returned an unreadable response. Your action may have been saved. Reload the view and check the records before submitting it again.', 502]);
  });

  it('adds role and support guidance and only a well-formed request reference', async () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    fetchMock.mockResolvedValueOnce(json(403, { message: 'Policy Authority required.', error: 'FORBIDDEN', requestId: id }));
    const forbidden = await failureOf(api()('/api/x', { method: 'POST', data: {} }));
    expect(forbidden.message).toBe(`Policy Authority required. Check your role and reload the view before trying again. Request reference: ${id}.`);
    expect([forbidden.status, forbidden.code, forbidden.requestId]).toEqual([403, 'FORBIDDEN', id]);
    fetchMock.mockResolvedValueOnce(json(500, { requestId: '<script>' }));
    const broken = await failureOf(api()('/api/x'));
    expect([broken.message, broken.requestId]).toEqual(['This request could not be completed. If this continues, contact your workspace operator using Support.', null]);
    fetchMock.mockResolvedValueOnce(json(409, null));
    expect((await failureOf(api()('/api/x'))).message).toBe('This request could not be completed.');
  });
});
