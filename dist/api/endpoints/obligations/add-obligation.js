import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** POST /api/changes/:changeId/obligations — proposes a requirement (a candidate until it is reviewed). */
export const addObligation = defineEndpoint({
    params: idParams('changeId'),
    async handle({ services: { repository }, params, session, readBody }) {
        return reply(await repository.addObligation(params.changeId, await readBody(), session), 201);
    }
});
