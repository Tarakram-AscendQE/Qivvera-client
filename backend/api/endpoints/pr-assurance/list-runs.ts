import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { pullParams } from './params.js';

/** GET /api/pr-assurance/applications/:applicationId/pulls/:pullNumber/runs — every run of the PR, newest first, without evidence. */
export const listRuns = defineEndpoint({
  params: pullParams,
  async handle({ services: { prAssurance }, params, session }) {
    return reply(await prAssurance!.listRuns(params.applicationId, params.pullNumber, session));
  }
});
