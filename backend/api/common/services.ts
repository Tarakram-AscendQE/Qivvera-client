/**
 * What an endpoint can use. The server builds one `Services` object at start-up and every endpoint
 * receives it in its context, so endpoints never create repositories or read configuration themselves.
 *
 * The repositories are the existing JavaScript modules in backend/server. Their methods validate input
 * and throw InputError with the exact messages clients see, so the types here describe only the calls
 * endpoints make; results are passed to the client unchanged (`unknown`).
 */
import type { SupportReader } from '../../../backend/server/support-info.mjs';
import type { WorkspaceAuth, WorkspaceSession } from '../../../backend/server/workspace-auth.mjs';
import type { AssetMap } from './assets.js';

export type Session = WorkspaceSession;

/** The workflow repository (backend/server/workflow-repository.mjs). */
export interface WorkflowRepository {
  readonly workflow: true;
  readonly driver?: string;
  readonly reviewMode?: string;
  healthy(): Promise<boolean>;
}

export interface Services {
  readonly repository: WorkflowRepository;
  readonly auth: WorkspaceAuth;
  readonly readSupport: SupportReader;
  readonly assets: AssetMap;
  /** The only origin allowed to send writes (exact, from configuration). */
  readonly publicOrigin: string;
  /** True when hosted over HTTPS: adds Strict-Transport-Security and secure cookies. */
  readonly secureCookies: boolean;
  /** The deployed Git commit, or 'unrecorded'. */
  readonly releaseRevision: string;
}
