import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** PATCH /api/obligations/:obligationId — edits a requirement's text or source (version-checked). */
export const editObligation = defineEndpoint({
  params: idParams('obligationId'),
  async handle({ services: { repository }, params, session, readBody }) {
    return reply(await repository.editObligation(params.obligationId, await readBody(), session));
  }
});
