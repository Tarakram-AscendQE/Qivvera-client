import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** POST /api/changes/:changeId/revisions — records a new revision; earlier evidence becomes stale, not deleted. */
export const createRevision = defineEndpoint({
  params: idParams('changeId'),
  async handle({ services: { repository }, params, session, readBody }) {
    return reply(await repository.createRevision(params.changeId, await readBody(), session), 201);
  }
});
