import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
/**
 * GET /api/pr-assurance — the applications that can be chosen (not archived), each with its GitHub
 * connection (repositories and rules, never the token) or null when it has none yet.
 */
export const getPrAssuranceOverview = defineEndpoint({
    async handle({ services: { repository, prAssurance }, session }) {
        const applications = await repository.listApplications();
        return reply(await prAssurance.overview(applications, session));
    }
});
