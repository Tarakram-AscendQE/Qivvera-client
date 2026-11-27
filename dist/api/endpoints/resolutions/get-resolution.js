import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** GET /api/resolutions/:resolutionId — one resolution item with its history and comparison. */
export const getResolution = defineEndpoint({
    params: idParams('resolutionId'),
    async handle({ services: { resolution }, params }) {
        return reply(await resolution.get(params.resolutionId));
    }
});
