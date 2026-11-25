import { errorBody, InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, rejectQuery } from '../../common/validate.js';

/** GET /api/applications/:applicationId/source-events — pull-request activity received from GitHub webhooks. */
export const listSourceEvents = defineEndpoint({
  params: idParams('applicationId'),
  query(_search, url) {
    rejectQuery(url, () => new InputError('SOURCE_EVENTS_QUERY_UNSUPPORTED', 'Source activity does not accept query parameters.', 400));
  },
  async handle({ services: { intake }, params, session, requestId }) {
    if (!intake!.webhookEnabled) return reply(errorBody('NOT_FOUND', 'GitHub webhooks are not enabled.', requestId), 404);
    return reply(await intake!.listSourceEvents(params.applicationId, session));
  }
});
