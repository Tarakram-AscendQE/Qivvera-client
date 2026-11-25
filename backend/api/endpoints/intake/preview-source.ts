import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/** POST /api/source-previews — reads one pull request's metadata for review; nothing is imported yet. */
export const previewSource = defineEndpoint({
  async handle({ services: { intake }, session, readBody }) {
    return reply(await intake!.preview(await readBody(), session), 201);
  }
});
