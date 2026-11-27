import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { applicationParams, requireApplication } from './params.js';
/**
 * GET /api/pr-assurance/applications/:applicationId — one application's imported pull requests, each
 * one's latest run and result, its rules snapshot and its GitHub connection (never the token).
 * Never contacts GitHub.
 */
export const getPrAssurance = defineEndpoint({
    params: applicationParams,
    async handle({ services: { repository, prAssurance }, params, session }) {
        return reply(await prAssurance.scenario(await requireApplication(repository, params.applicationId), session));
    }
});
