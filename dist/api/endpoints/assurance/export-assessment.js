import { download } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** GET /api/assessments/:runId/export — the assessment as a JSON download. */
export const exportAssessment = defineEndpoint({
    params: idParams('runId'),
    async handle({ services: { assurance }, params }) {
        return download(await assurance.getRun(params.runId), `qivvera-assessment-${params.runId}.json`);
    }
});
