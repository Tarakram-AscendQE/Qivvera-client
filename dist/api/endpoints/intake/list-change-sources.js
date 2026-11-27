import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** GET /api/changes/:changeId/source-imports — source receipts recorded for one change. */
export const listChangeSources = defineEndpoint({
    params: idParams('changeId'),
    async handle({ services: { intake }, params }) {
        return reply(await intake.list(params.changeId));
    }
});
