import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** POST /api/changes/:changeId/drafting-runs — drafts candidate requirements from a source (body up to 32 KB). */
export const generateDrafts = defineEndpoint({
  params: idParams('changeId'),
  async handle({ services: { repository }, params, session, readBody }) {
    const run = await repository.drafting!.generate(params.changeId, await readBody(32768), session);
    return reply(run, run.replayed ? 200 : 201);
  }
});
