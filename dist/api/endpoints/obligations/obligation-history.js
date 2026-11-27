import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** GET /api/obligations/:obligationId/history — every recorded version and decision, oldest first. */
export const obligationHistory = defineEndpoint({
    params: idParams('obligationId'),
    async handle({ services: { repository }, params }) {
        return reply(await repository.getObligationHistory(params.obligationId));
    }
});
