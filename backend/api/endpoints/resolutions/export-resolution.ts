import { download } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** GET /api/resolutions/:resolutionId/export — the resolution case as a JSON download. */
export const exportResolution = defineEndpoint({
  params: idParams('resolutionId'),
  async handle({ services: { resolution }, params }) {
    return download(await resolution!.export(params.resolutionId), `qivvera-resolution-${params.resolutionId}.json`);
  }
});
