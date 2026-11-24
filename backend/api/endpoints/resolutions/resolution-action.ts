import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** POST /api/resolutions/:resolutionId/actions — one recorded action (start, propose, link, verify, ...). */
export const resolutionAction = defineEndpoint({
  params: idParams('resolutionId'),
  async handle({ services: { resolution }, params, session, readBody }) {
    return reply(await resolution!.act(params.resolutionId, await readBody(), session));
  }
});
