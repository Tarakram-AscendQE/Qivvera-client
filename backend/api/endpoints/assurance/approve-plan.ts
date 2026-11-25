import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, rejectQuery } from '../../common/validate.js';

/**
 * POST /api/changes/:changeId/assurance-plan — a Policy Authority approves the verification plan
 * (body up to 32 KB, no query). 201 for a new plan, 200 when the same request is replayed.
 */
export const approvePlan = defineEndpoint({
  params: idParams('changeId'),
  query(_search, url) {
    rejectQuery(url, () => new InputError('ASSURANCE_PLAN_QUERY_UNSUPPORTED', 'Plan approval does not accept query parameters.', 400));
    return undefined;
  },
  async handle({ services: { assurance }, params, session, readBody }) {
    const plan = await assurance!.approvePlan(params.changeId, await readBody(32768), session);
    return reply(plan, plan.replayed ? 200 : 201);
  }
});
