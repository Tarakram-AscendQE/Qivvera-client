import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/**
 * POST /api/applications/:applicationId/restore — makes an archived application visible again and allows new changes.
 * Authors and Policy Authorities only; recorded as one activity entry with an optional reason.
 */
export const restoreApplication = defineEndpoint({
  params: idParams('applicationId'),
  async handle({ services: { repository }, params, session, readBody }) {
    return reply(await repository.restoreApplication(params.applicationId, await readBody(), session));
  }
});
