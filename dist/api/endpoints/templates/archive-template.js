import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** POST /api/verification-templates/:templateId/archive — prevents new use; existing plans are not changed. */
export const archiveTemplate = defineEndpoint({
    params: idParams('templateId'),
    async handle({ services: { assurance }, params, session, readBody }) {
        return reply(await assurance.templates.archive(params.templateId, await readBody(32768), session));
    }
});
