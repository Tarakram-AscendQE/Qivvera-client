import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/**
 * GET /api/pr-assurance — the demo scenario: the three pull requests (imported or not), each one's
 * latest run, the rules snapshot and whether a GitHub token is configured (never the token itself).
 */
export const getPrAssurance = defineEndpoint({
  async handle({ services: { prAssurance }, session }) {
    return reply(await prAssurance!.scenario(session));
  }
});
