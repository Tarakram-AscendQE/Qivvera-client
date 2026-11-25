import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/** GET /api/source-repositories — the operator-configured GitHub repositories (no tokens). */
export const listSourceRepositories = defineEndpoint({
  async handle({ services: { intake } }) {
    return reply(await intake!.listRepositories());
  }
});
