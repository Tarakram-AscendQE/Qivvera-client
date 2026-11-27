import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** GET /api/pr-assurance/runs/:runId — the stored run, its progress events and, once complete, its report. Never contacts GitHub. */
export const getRun = defineEndpoint({
    params: idParams('runId'),
    async handle({ services: { prAssurance }, params, session }) {
        return reply(await prAssurance.getRun(params.runId, session));
    }
});
