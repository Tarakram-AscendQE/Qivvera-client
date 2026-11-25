import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
import { readTemplateVersion } from './template-query.js';

/** GET /api/verification-templates/:templateId[?version=<id>] — one template version and its history. */
export const getTemplate = defineEndpoint({
  params: idParams('templateId'),
  query: readTemplateVersion,
  async handle({ services: { assurance }, params, query }) {
    return reply(await assurance!.templates!.get(params.templateId, query));
  }
});
