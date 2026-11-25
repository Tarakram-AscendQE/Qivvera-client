import { download } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
import { readImpactRevision } from './impact-query.js';

/** GET /api/changes/:changeId/impact/export?revision=<id> — the impact report as a JSON download. */
export const exportImpact = defineEndpoint({
  params: idParams('changeId'),
  query: readImpactRevision,
  async handle({ services: { repository }, params, query }) {
    return download(await repository.impact!.get(params.changeId, query), `qivvera-impact-${params.changeId}.json`);
  }
});
