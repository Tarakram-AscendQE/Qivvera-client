import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { readTemplateListQuery } from './template-query.js';
/** GET /api/verification-templates[?offset=&limit=&includeArchived=true] — saved templates, newest first. */
export const listTemplates = defineEndpoint({
    query: readTemplateListQuery,
    async handle({ services: { assurance }, query }) {
        return reply(await assurance.templates.list(query));
    }
});
