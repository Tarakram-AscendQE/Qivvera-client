import { download } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
import { readTemplateVersion } from './template-query.js';
/** GET /api/verification-templates/:templateId/export[?version=<id>] — the template as a JSON download. */
export const exportTemplate = defineEndpoint({
    params: idParams('templateId'),
    query: readTemplateVersion,
    async handle({ services: { assurance }, params, query }) {
        return download(await assurance.templates.get(params.templateId, query), `qivvera-verification-template-${params.templateId}.json`);
    }
});
