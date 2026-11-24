import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** POST /api/changes/:changeId/assessments — queues an assessment of the approved plan (202: the worker runs it later). */
export const requestAssessment = defineEndpoint({
  params: idParams('changeId'),
  async handle({ services: { assurance }, params, session, readBody }) {
    return reply(await assurance!.requestRun(params.changeId, await readBody(), session), 202);
  }
});
