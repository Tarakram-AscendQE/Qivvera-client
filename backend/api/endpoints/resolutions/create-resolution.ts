import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** POST /api/assessments/:runId/resolutions — tracks a finding. 201 when created, 200 when the request is replayed. */
export const createResolution = defineEndpoint({
  params: idParams('runId'),
  async handle({ services: { resolution }, params, session, readBody }) {
    const created = await resolution!.create(params.runId, await readBody(), session);
    return reply(created, created.replayed ? 200 : 201);
  }
});
