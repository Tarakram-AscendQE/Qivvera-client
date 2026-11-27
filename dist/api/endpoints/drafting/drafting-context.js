import { z } from 'zod';
import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, optionalText, readPage, readQuery } from '../../common/validate.js';
/** GET /api/changes/:changeId/drafting[?revision=&offset=&limit=] — sources and saved drafting runs (20 per page). */
export const draftingContext = defineEndpoint({
    params: idParams('changeId'),
    query(search) {
        for (const key of search.keys())
            if (!['revision', 'offset', 'limit'].includes(key))
                throw new InputError('DRAFTING_QUERY_UNSUPPORTED', 'Use only revision and pagination parameters.');
        return { revision: readQuery(search, z.object({ revision: optionalText })).revision || undefined, page: readPage(search, 20) };
    },
    async handle({ services: { repository }, params, query }) {
        return reply(await repository.drafting.getContext(params.changeId, query.revision, query.page));
    }
});
