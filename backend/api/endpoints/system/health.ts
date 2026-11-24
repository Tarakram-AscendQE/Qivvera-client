import { PRODUCT_VERSION } from '../../../../backend/server/release.mjs';
import { defineEndpoint } from '../../common/routing.js';
import { reply } from '../../common/respond.js';

/**
 * GET /healthz and GET /readyz — no sign-in. 200 when the database answers, 503 when it does not.
 * Reports only the service, release and storage kind; never configuration or records.
 */
export const health = defineEndpoint<Record<string, never>, undefined, null>({
  async handle({ services: { repository, releaseRevision } }) {
    let healthy = false;
    try {
      healthy = await repository.healthy();
    } catch {
      // An unreachable database is reported as not ready, not as a server error.
    }
    return reply({ service: 'qivvera-registry', version: PRODUCT_VERSION, process: 'running', storage: repository.driver ?? 'local-review', ready: healthy, revision: releaseRevision, assuranceExecution: false }, healthy ? 200 : 503);
  }
});
