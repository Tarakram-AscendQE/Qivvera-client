import { download } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/** GET /api/export — the whole workspace as a JSON download (qivvera-workspace.json). */
export const exportWorkspace = defineEndpoint({
  async handle({ services: { repository } }) {
    return download(await repository.exportWorkspace(), 'qivvera-workspace.json');
  }
});
