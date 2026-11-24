/**
 * Contract between the hand-written legacy shell (frontend/legacy/app.js) and React screens.
 * Until the shell itself is migrated, it owns routing, sign-in, the session and the page frame.
 * React screens receive these values from it and must not keep their own copies of session data.
 */

export type Role = 'AUTHOR' | 'POLICY_AUTHORITY' | 'VIEWER';

export interface LegacySession {
  readonly email: string;
  readonly roles?: readonly string[];
}

/** The legacy app's mutable state object. Only the fields React screens read are declared. */
export interface LegacyState {
  readonly session: LegacySession | null;
}

export interface ApiOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly data?: unknown;
}

/**
 * The legacy api(): same-origin fetch with the CSRF header, session-expiry handling (it shows the
 * sign-in view itself) and rejection of responses that belong to an earlier session.
 */
export type LegacyApi = (path: string, options?: ApiOptions) => Promise<unknown>;

/** Replaces the whole page with the frame (navigation, top bar, footer) around trusted HTML. */
export type LegacyShell = (content: string, active?: string, label?: string) => void;

export interface LegacyBridge {
  readonly S: LegacyState;
  readonly api: LegacyApi;
  readonly shell: LegacyShell;
}

/** True when the legacy api() already handled the error by ending or replacing the session view. */
export function isSessionEnded(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const flags = error as Error & { sessionExpired?: unknown; staleSession?: unknown };
  return flags.sessionExpired === true || flags.staleSession === true;
}

/** Display text for a server value, matching the legacy h() conversion (null and undefined → ''). */
export function text(value: unknown): string {
  return String(value ?? '');
}
