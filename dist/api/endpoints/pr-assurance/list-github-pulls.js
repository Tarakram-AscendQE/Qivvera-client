import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { applicationParams, requireApplication } from './params.js';
/**
 * GET /api/pr-assurance/applications/:applicationId/github-pulls — the open pull requests in the
 * application's repository, read with the application's own token, to choose what to import. Nothing
 * is stored. Author or Policy Authority.
 */
export const listGitHubPulls = defineEndpoint({
    params: applicationParams,
    async handle({ services: { repository, prAssurance }, params, session }) {
        await requireApplication(repository, params.applicationId);
        return reply(await prAssurance.githubPulls(params.applicationId, session));
    }
});
