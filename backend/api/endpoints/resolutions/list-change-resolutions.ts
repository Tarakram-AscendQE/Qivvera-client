import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, readPage } from '../../common/validate.js';

/** GET /api/changes/:changeId/resolutions[?offset=&limit=] — resolution items for one change. */
export const listChangeResolutions = defineEndpoint({
  params: idParams('changeId'),
  query: search => readPage(search, 50),
  async handle({ services: { resolution }, params, query }) {
    return reply(await resolution!.list({ changeId: params.changeId, ...query }));
  }
});
