import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, rejectQuery } from '../../common/validate.js';
/** GET /api/applications/:applicationId/pull-requests — open pull requests of the application's connected repositories (read-only). */
export const listPullRequests = defineEndpoint({
    params: idParams('applicationId'),
    query(_search, url) {
        rejectQuery(url, () => new InputError('PULL_LIST_QUERY_UNSUPPORTED', 'Pull-request listing does not accept query parameters.', 400));
    },
    async handle({ services: { intake }, params, session }) {
        return reply(await intake.listPulls(params.applicationId, session));
    }
});
