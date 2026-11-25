import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** POST /api/drafting-runs/:runId/suggestions/:suggestionId/actions — a human decision on one drafted suggestion. */
export const draftSuggestionAction = defineEndpoint({
  params: idParams('runId', 'suggestionId'),
  async handle({ services: { repository }, params, session, readBody }) {
    return reply(await repository.drafting!.act(params.runId, params.suggestionId, await readBody(), session));
  }
});
