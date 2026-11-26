import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/**
 * POST /api/applications/:applicationId/archive — hides the application from lists and blocks new changes. Nothing is deleted: its changes, decisions and evidence stay in history.
 * Authors and Policy Authorities only; recorded as one activity entry with an optional reason.
 */
export const archiveApplication = defineEndpoint({
  params: idParams('applicationId'),
  async handle({ services: { repository }, params, session, readBody }) {
    return reply(await repository.archiveApplication(params.applicationId, await readBody(), session));
  }
});
