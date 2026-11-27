import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
/** POST /api/source-imports — imports a reviewed preview as source context. 201 when new, 200 when replayed. */
export const importSource = defineEndpoint({
    async handle({ services: { intake }, session, readBody }) {
        const result = await intake.importPreview(await readBody(), session);
        return reply(result, result.replayed ? 200 : 201);
    }
});
