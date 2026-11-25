import { z } from 'zod';
import { withAssessmentSummary } from '../../common/assessment-summary.js';
import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams, optionalText, readQuery } from '../../common/validate.js';

/**
 * GET /api/changes/:changeId[?revision=<id>] — one change on its current revision, or on the named
 * revision, with its latest assessment. 404 CHANGE_NOT_FOUND when it does not exist.
 */
export const getChange = defineEndpoint({
  params: idParams('changeId'),
  query: search => readQuery(search, z.object({ revision: optionalText })),
  async handle({ services: { repository, assurance }, params, query }) {
    const change = await repository.getChange(params.changeId, query.revision || undefined);
    if (!change) throw new InputError('CHANGE_NOT_FOUND', 'This change was not found.', 404);
    return reply(await withAssessmentSummary(change, assurance));
  }
});
