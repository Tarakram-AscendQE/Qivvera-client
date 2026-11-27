import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, readRevision } from '../../common/validate.js';
/** GET /api/changes/:changeId/assessments[?revision=<id>] — assessment runs, newest first. */
export const listAssessments = defineEndpoint({
    params: idParams('changeId'),
    query: readRevision,
    async handle({ services: { assurance }, params, query }) {
        return reply(await assurance.listRuns(params.changeId, query));
    }
});
