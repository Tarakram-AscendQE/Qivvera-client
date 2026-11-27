import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { readPage } from '../../common/validate.js';
/** GET /api/resolutions[?offset=&limit=] — the resolution inbox (50 per page by default). */
export const listResolutions = defineEndpoint({
    query: search => readPage(search, 50),
    async handle({ services: { resolution }, query }) {
        return reply(await resolution.list(query));
    }
});
