import type { IncomingMessage } from 'node:http';

/** Types for workspace-auth.mjs, used by the TypeScript API layer (backend/api). */
export interface WorkspaceSession {
  readonly email: string;
  readonly roles?: readonly string[];
  readonly csrfToken: string;
  readonly expiresAt: number;
}
export type LoginResult =
  | { readonly error: string; readonly status: number }
  | { readonly error?: undefined; readonly session: WorkspaceSession; readonly cookie: string };
export interface WorkspaceAuth {
  login(email: unknown, password: unknown, remoteAddress?: string): Promise<LoginResult>;
  session(req: IncomingMessage): Promise<WorkspaceSession | null>;
  logout(req: IncomingMessage): Promise<string>;
  validCsrf(req: IncomingMessage, session: WorkspaceSession): boolean;
}
export declare function createWorkspaceAuth(options: {
  accounts?: unknown;
  directory?: unknown;
  repository: unknown;
  secureCookies?: boolean;
}): WorkspaceAuth;
