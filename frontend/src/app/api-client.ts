import type { ApiOptions, Api } from '../shell-contract';

/** The session fields the client reads. The object's identity marks the session a request belongs to. */
export interface ClientSession {
  readonly csrfToken?: unknown;
}

/** Extra fields on the errors api() throws. */
export interface ApiError extends Error {
  status?: number;
  code?: unknown;
  requestId?: string | null;
  /** The response belongs to an earlier session; the caller must not show it. */
  staleSession?: true;
  /** The server ended the session; the sign-in view is already shown. */
  sessionExpired?: true;
}

const REQUEST_REFERENCE = /^[0-9a-f-]{36}$/i;

function failure(message: string, fields: Partial<ApiError> = {}): ApiError {
  return Object.assign(new Error(message), fields);
}

/**
 * Same-origin JSON client for the Qivvera API.
 *
 * - Writes carry the session's CSRF token.
 * - A response that arrives after the session changed is rejected (staleSession), so an earlier
 *   identity's data cannot appear in a newer view.
 * - A 401 for a signed-in session ends it: `onSessionEnded` shows the sign-in view.
 * - Error messages say whether a write may have been saved; nothing is retried automatically.
 */
export function createApiClient(state: { readonly session: ClientSession | null }, onSessionEnded: () => void): Api {
  return async function api(path: string, { method = 'GET', data }: ApiOptions = {}): Promise<unknown> {
    const requestSession = state.session;
    const assertSession = (): void => {
      if (requestSession !== state.session) throw failure('This response belongs to an earlier session.', { staleSession: true });
    };
    const recovery = method === 'GET'
      ? 'Check your connection and try loading this view again.'
      : 'Your action may have been saved. Reload the view and check the records before submitting it again.';
    const headers: Record<string, string> = {};
    if (data) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && requestSession) headers['X-CSRF-Token'] = String(requestSession.csrfToken);

    let response: Response;
    try {
      response = await fetch(path, { method, credentials: 'same-origin', headers, ...(data ? { body: JSON.stringify(data) } : {}) });
    } catch {
      assertSession();
      throw failure('Qivvera could not be reached. ' + recovery);
    }
    assertSession();
    if (response.status === 401 && !(path === '/api/session' && method === 'POST') && requestSession) {
      onSessionEnded();
      throw failure('Your session ended. Please sign in again.', { status: 401, sessionExpired: true });
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      assertSession();
      throw failure('Qivvera returned an unreadable response. ' + recovery, { status: response.status });
    }
    assertSession();
    if (!response.ok) {
      const fields = (body ?? {}) as { message?: unknown; requestId?: unknown; error?: unknown };
      let message = typeof fields.message === 'string' ? fields.message : 'This request could not be completed.';
      if (response.status === 403) message += ' Check your role and reload the view before trying again.';
      if (response.status >= 500) message += ' If this continues, contact your workspace operator using Support.';
      const reference = typeof fields.requestId === 'string' && REQUEST_REFERENCE.test(fields.requestId) ? fields.requestId : null;
      throw failure(message + (reference ? ' Request reference: ' + reference + '.' : ''), { status: response.status, code: fields.error, requestId: reference });
    }
    return body;
  };
}
