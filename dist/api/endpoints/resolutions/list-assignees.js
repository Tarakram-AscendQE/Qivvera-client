import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
/** GET /api/resolution-assignees — configured people who may own a resolution (not a permission grant). */
export const listAssignees = defineEndpoint({
    async handle({ services: { resolution } }) {
        return reply(await resolution.listAssignees());
    }
});
