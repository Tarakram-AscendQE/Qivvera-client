import { download } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
import { noDraftingRunQuery } from './drafting-run-query.js';

/** GET /api/drafting-runs/:runId/export — the drafting run as a JSON download. */
export const exportDraftingRun = defineEndpoint({
  params: idParams('runId'),
  query: noDraftingRunQuery,
  async handle({ services: { repository }, params }) {
    return download(await repository.drafting!.get(params.runId), `qivvera-drafting-${params.runId}.json`);
  }
});
