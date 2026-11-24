import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/** POST /api/applications — registers an application (the repository validates the fields). */
export const createApplication = defineEndpoint({
  async handle({ services: { repository }, session, readBody }) {
    return reply(await repository.createApplication(await readBody(), session), 201);
  }
});
