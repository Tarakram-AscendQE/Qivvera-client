import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** GET /api/assessments/:runId — one assessment with its scope-bound case and evidence. */
export const getAssessment = defineEndpoint({
    params: idParams('runId'),
    async handle({ services: { assurance }, params }) {
        return reply(await assurance.getRun(params.runId));
    }
});
