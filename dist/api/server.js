import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSupportReader } from '../../backend/server/support-info.mjs';
import { createWorkspaceAuth } from '../../backend/server/workspace-auth.mjs';
import { createExpressApp } from './app.js';
import { loadAssets } from './common/assets.js';
/**
 * Builds the HTTP server: the Express app (app.ts) inside Node's http.Server with the timeouts the
 * service has always used. Used by `npm start`, the Vercel function (api/index.mjs) and the tests.
 */
export function createApplicationServer(options) {
    const { repository, assurance = null, resolution = null, intake = null, prAssurance = null, accounts, accountDirectory = null, ownerEmail, passwordHash, publicOrigin, secureCookies = false, webRoot = fileURLToPath(new URL('../../frontend/public', import.meta.url)), releaseRevision = 'unrecorded' } = options;
    if (!publicOrigin || new URL(publicOrigin).origin !== publicOrigin)
        throw new Error('PUBLIC_ORIGIN must be an exact origin.');
    if (secureCookies && !publicOrigin.startsWith('https://'))
        throw new Error('HTTPS_REQUIRED');
    if (repository.workflow !== true)
        throw new Error('WORKFLOW_REPOSITORY_REQUIRED');
    const defaultOwner = [{ email: ownerEmail, passwordHash, roles: ['AUTHOR', 'POLICY_AUTHORITY'] }];
    const services = {
        repository, assurance, resolution, intake, prAssurance, publicOrigin, secureCookies, releaseRevision,
        auth: createWorkspaceAuth({ directory: accountDirectory ?? undefined, accounts: accountDirectory ? undefined : accounts ?? defaultOwner, repository, secureCookies }),
        readSupport: createSupportReader({ repository, assurance, resolution, intake, accountDirectory, accounts: accounts ?? [{ email: ownerEmail, roles: ['AUTHOR', 'POLICY_AUTHORITY'] }], releaseRevision, secureCookies }),
        assets: loadAssets(webRoot)
    };
    return http.createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 }, createExpressApp(services));
}
