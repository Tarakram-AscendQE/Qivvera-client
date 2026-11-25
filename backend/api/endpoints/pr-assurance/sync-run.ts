import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/**
 * POST /api/pr-assurance/runs/:runId/sync — brings an active run up to date with what GitHub reports
 * (progress, then verified evidence), and returns it as GET does. Safe to repeat or run in parallel.
 */
export const syncRun = defineEndpoint({
  params: idParams('runId'),
  async handle({ services: { prAssurance }, params, session }) {
    return reply(await prAssurance!.syncRun(params.runId, session));
  }
});
