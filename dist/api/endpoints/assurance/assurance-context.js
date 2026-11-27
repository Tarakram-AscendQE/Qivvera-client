import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, readRevision } from '../../common/validate.js';
/** GET /api/changes/:changeId/assurance-context[?revision=<id>] — targets, checks, profile and the current plan. */
export const assuranceContext = defineEndpoint({
    params: idParams('changeId'),
    query: readRevision,
    async handle({ services: { assurance }, params, query }) {
        return reply(await assurance.getContext(params.changeId, query));
    }
});
