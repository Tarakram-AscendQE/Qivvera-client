import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/** POST /api/verification-templates/:templateId/versions — adds a version; earlier versions stay unchanged. */
export const reviseTemplate = defineEndpoint({
    params: idParams('templateId'),
    async handle({ services: { assurance }, params, session, readBody }) {
        const record = await assurance.templates.revise(params.templateId, await readBody(32768), session);
        return reply(record, record.replayed ? 200 : 201);
    }
});
