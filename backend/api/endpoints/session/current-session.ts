import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { publicSession } from '../../common/session.js';

/** GET /api/session — the signed-in person's email, roles, CSRF token and review mode. */
export const currentSession = defineEndpoint({
  async handle({ services: { repository }, session }) {
    return reply(publicSession(session, repository.reviewMode));
  }
});
