import type { ReactNode } from 'react';

/**
 * What the shell (frontend/src/app/main.tsx) gives the screen modules. The shell owns routing,
 * sign-in, the session and the page frame; screens read session data from it and never keep copies.
 */

export type Role = 'AUTHOR' | 'POLICY_AUTHORITY' | 'VIEWER';

export interface SessionInfo {
  readonly email: string;
  readonly roles?: readonly string[];
  readonly reviewMode?: string;
}

export interface SummaryApplication {
  readonly id: string;
  readonly name?: string;
}

export interface SummaryChange {
  readonly id: string;
  readonly title?: string;
  readonly applicationId?: string;
  readonly revision?: { readonly id?: string };
}

export interface WorkspaceInfo {
  readonly applications: readonly SummaryApplication[];
  readonly changes: readonly SummaryChange[];
}

/** The shell's mutable state object. Only the fields screens read are declared here. */
export interface ShellState {
  readonly session: SessionInfo | null;
  readonly workspace?: WorkspaceInfo | null;
  /** Which change tab opens next; screens set it when a link opens a change. */
  tab?: string;
}

export type Toast = (text: string) => void;

/** True when the signed-in session holds the role. */
export type Can = (role: string) => boolean;

/** Re-reads and redraws the current route. */
export type Reroute = () => Promise<void>;

/** Re-reads the workspace summary (counts in the navigation and overview). */
export type Refresh = () => Promise<void>;

export interface ApiOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly data?: unknown;
}

/**
 * Same-origin fetch with the CSRF header, session-expiry handling (it shows the sign-in view itself)
 * and rejection of responses that belong to an earlier session. See app/api-client.ts.
 */
export type Api = (path: string, options?: ApiOptions) => Promise<unknown>;

/**
 * Draws a screen inside the page frame (navigation, top bar, footer), replacing the previous page.
 * `active` marks the navigation entry and `label` is the breadcrumb. Synchronous: the screen is in
 * the DOM when this returns. A screen that fails to render throws, so the router shows its error page.
 */
export type Shell = (screen: ReactNode, active?: string, label?: string) => void;

export interface ScreenServices {
  readonly S: ShellState;
  readonly api: Api;
  readonly shell: Shell;
}

/** True when api() already handled the error by ending or replacing the session view. */
export function isSessionEnded(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const flags = error as Error & { sessionExpired?: unknown; staleSession?: unknown };
  return flags.sessionExpired === true || flags.staleSession === true;
}

/** Display text for a server value: null and undefined become ''. */
export function text(value: unknown): string {
  return String(value ?? '');
}
