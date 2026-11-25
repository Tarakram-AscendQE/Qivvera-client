import type { WorkspaceSession } from './workspace-auth.mjs';

/** Types for support-info.mjs, used by the TypeScript API layer (backend/api). */
export type SupportReader = (session: WorkspaceSession, requestId: string) => Promise<unknown>;
export declare function createSupportReader(options: {
  repository: unknown; assurance: unknown; resolution: unknown; intake: unknown;
  accountDirectory: unknown; accounts: unknown; releaseRevision: string; secureCookies: boolean;
}): SupportReader;
