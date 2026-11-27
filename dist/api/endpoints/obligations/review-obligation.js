import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** POST /api/obligations/:obligationId/review — submit, withdraw or decide a requirement review. */
export const reviewObligation = defineEndpoint({
    params: idParams('obligationId'),
    async handle({ services: { repository }, params, session, readBody }) {
        return reply(await repository.transitionObligation(params.obligationId, await readBody(), session));
    }
});
