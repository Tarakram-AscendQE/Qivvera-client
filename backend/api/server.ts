import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSupportReader } from '../../backend/server/support-info.mjs';
import { createWorkspaceAuth } from '../../backend/server/workspace-auth.mjs';
import { createExpressApp } from './app.js';
import { loadAssets } from './common/assets.js';
import type { AssuranceRepository, IntakeRepository, PrAssuranceService, ResolutionRepository, Services, WorkflowRepository } from './common/services.js';

export interface ApplicationServerOptions {
  readonly repository: WorkflowRepository;
  readonly assurance?: AssuranceRepository | null;
  readonly resolution?: ResolutionRepository | null;
  readonly intake?: IntakeRepository | null;
  readonly prAssurance?: PrAssuranceService | null;
  /** Static accounts (local review and tests) when no account directory is configured. */
  readonly accounts?: unknown;
  readonly accountDirectory?: unknown;
  readonly ownerEmail?: string;
  readonly passwordHash?: string;
  /** The exact origin the browser uses, for example https://qivvera.example.com. */
  readonly publicOrigin: string;
  readonly secureCookies?: boolean;
  /** Folder with the built web files; defaults to frontend/public. */
  readonly webRoot?: string;
  readonly releaseRevision?: string;
}

/**
 * Builds the HTTP server: the Express app (app.ts) inside Node's http.Server with the timeouts the
 * service has always used. Used by `npm start`, the Vercel function (api/index.mjs) and the tests.
 */
export function createApplicationServer(options: ApplicationServerOptions): http.Server {
  const { repository, assurance = null, resolution = null, intake = null, prAssurance = null, accounts, accountDirectory = null, ownerEmail, passwordHash, publicOrigin,
    secureCookies = false, webRoot = fileURLToPath(new URL('../../frontend/public', import.meta.url)), releaseRevision = 'unrecorded' } = options;
  if (!publicOrigin || new URL(publicOrigin).origin !== publicOrigin) throw new Error('PUBLIC_ORIGIN must be an exact origin.');
  if (secureCookies && !publicOrigin.startsWith('https://')) throw new Error('HTTPS_REQUIRED');
  if (repository.workflow !== true) throw new Error('WORKFLOW_REPOSITORY_REQUIRED');
  const defaultOwner = [{ email: ownerEmail, passwordHash, roles: ['AUTHOR', 'POLICY_AUTHORITY'] }];
  const services: Services = {
    repository, assurance, resolution, intake, prAssurance, publicOrigin, secureCookies, releaseRevision,
    auth: createWorkspaceAuth({ directory: accountDirectory ?? undefined, accounts: accountDirectory ? undefined : accounts ?? defaultOwner, repository, secureCookies }),
    readSupport: createSupportReader({ repository, assurance, resolution, intake, accountDirectory, accounts: accounts ?? [{ email: ownerEmail, roles: ['AUTHOR', 'POLICY_AUTHORITY'] }], releaseRevision, secureCookies }),
    assets: loadAssets(webRoot)
  };
  return http.createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, createExpressApp(services));
}
