import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { pullParams, requireApplication } from './params.js';
/**
 * POST /api/pr-assurance/applications/:applicationId/pulls/:pullNumber/runs — `{requestKey}` → starts
 * one run of the application's test automation workflow on GitHub Actions for the PR's imported head
 * commit (201), with the application's own token. The same request key returns the same run (200) and
 * never starts GitHub again. Author or Policy Authority.
 */
export const startRun = defineEndpoint({
    params: pullParams,
    async handle({ services: { repository, prAssurance }, params, session, readBody }) {
        if ((await requireApplication(repository, params.applicationId)).archived)
            throw new InputError('APPLICATION_ARCHIVED', 'This application is archived. Restore it before evaluating pull requests.', 409);
        const result = await prAssurance.startRun(params.applicationId, params.pullNumber, await readBody(), session);
        return reply(result, result.replayed ? 200 : 201);
    }
});
