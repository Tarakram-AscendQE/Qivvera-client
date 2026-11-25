import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/** POST /api/verification-templates — saves a template from a current approved plan (body up to 32 KB). */
export const createTemplate = defineEndpoint({
  async handle({ services: { assurance }, session, readBody }) {
    const record = await assurance!.templates!.create(await readBody(32768), session);
    return reply(record, record.replayed ? 200 : 201);
  }
});
