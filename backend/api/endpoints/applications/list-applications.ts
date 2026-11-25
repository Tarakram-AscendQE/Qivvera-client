import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/** GET /api/applications — every registered application. */
export const listApplications = defineEndpoint({
  async handle({ services: { repository } }) {
    return reply(await repository.listApplications());
  }
});
