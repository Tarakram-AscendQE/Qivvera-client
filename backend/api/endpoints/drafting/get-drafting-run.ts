import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
import { noDraftingRunQuery } from './drafting-run-query.js';

/** GET /api/drafting-runs/:runId — one drafting run with its suggestions and decisions. */
export const getDraftingRun = defineEndpoint({
  params: idParams('runId'),
  query: noDraftingRunQuery,
  async handle({ services: { repository }, params }) {
    return reply(await repository.drafting!.get(params.runId));
  }
});
