import { fields } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** POST /api/assessments/:runId/cancel — cancels a queued or running assessment. The body must be {}. */
export const cancelAssessment = defineEndpoint({
  params: idParams('runId'),
  async handle({ services: { assurance }, params, session, readBody }) {
    fields(await readBody(), []);
    return reply(await assurance!.cancel(params.runId, session));
  }
});
