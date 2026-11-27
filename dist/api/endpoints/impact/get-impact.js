import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
import { readImpactRevision } from './impact-query.js';
/** GET /api/changes/:changeId/impact?revision=<id> — read-only comparison of a revision with its parent. */
export const getImpact = defineEndpoint({
    params: idParams('changeId'),
    query: readImpactRevision,
    async handle({ services: { repository }, params, query }) {
        return reply(await repository.impact.get(params.changeId, query));
    }
});
