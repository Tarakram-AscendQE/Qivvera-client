import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
/** POST /api/changes — declares a change for an application (the repository validates the fields). */
export const createChange = defineEndpoint({
    async handle({ services: { repository }, session, readBody }) {
        return reply(await repository.createChange(await readBody(), session), 201);
    }
});
