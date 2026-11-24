import type { ReactNode } from 'react';

/**
 * Contract between the hand-written legacy shell (frontend/legacy/app.js) and React screens.
 * Until the shell itself is migrated, it owns routing, sign-in, the session and the page frame.
 * React screens receive these values from it and must not keep their own copies of session data.
 */

export type Role = 'AUTHOR' | 'POLICY_AUTHORITY' | 'VIEWER';

export interface LegacySession {
  readonly email: string;
  readonly roles?: readonly string[];
  readonly reviewMode?: string;
}

export interface LegacyApplication {
  readonly id: string;
  readonly name?: string;
}

export interface LegacyChange {
  readonly id: string;
  readonly title?: string;
  readonly applicationId?: string;
  readonly revision?: { readonly id?: string };
}

export interface LegacyWorkspace {
  readonly applications: readonly LegacyApplication[];
  readonly changes: readonly LegacyChange[];
}

/** The legacy app's mutable state object. Only the fields React screens read are declared. */
export interface LegacyState {
  readonly session: LegacySession | null;
  readonly workspace?: LegacyWorkspace | null;
  /** Which change tab opens next; screens set it when a link opens a change. */
  tab?: string;
}

/** The legacy h(): escapes text for inclusion in legacy HTML strings (only for legacy dialogs). */
export type LegacyEscape = (value: unknown) => string;

/** The legacy field(): HTML for one labelled form field in a legacy dialog. Label and hint are trusted. */
export type LegacyField = (id: string, label: string, type?: string, value?: string, hint?: string, required?: boolean) => string;

/**
 * The legacy openForm(): opens the shared dialog with trusted HTML content. On submit it passes the
 * form fields to `submit`, refreshes the workspace, and navigates to the hash `submit` returns.
 * It is bound to the visible view and never repeats an uncertain save.
 */
export type LegacyOpenForm = (
  title: string, description: string, contentHtml: string, saveLabel: string,
  submit: (data: Record<string, string>) => Promise<string | undefined>
) => void;

export type LegacyToast = (text: string) => void;

/** The legacy can(): true when the signed-in session holds the role. */
export type LegacyCan = (role: string) => boolean;

/** The legacy route(): re-reads and redraws the current route. */
export type LegacyRoute = () => Promise<void>;

/** The legacy refresh(): re-reads the workspace summary (counts in the navigation and overview). */
export type LegacyRefresh = () => Promise<void>;

export interface ApiOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly data?: unknown;
}

/**
 * The legacy api(): same-origin fetch with the CSRF header, session-expiry handling (it shows the
 * sign-in view itself) and rejection of responses that belong to an earlier session.
 */
export type LegacyApi = (path: string, options?: ApiOptions) => Promise<unknown>;

/**
 * Draws a screen inside the page frame (navigation, top bar, footer), replacing the previous page.
 * `active` marks the navigation entry and `label` is the breadcrumb. Synchronous: the screen is in
 * the DOM when this returns. A screen that fails to render throws, so the router shows its error page.
 */
export type LegacyShell = (screen: ReactNode, active?: string, label?: string) => void;

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
