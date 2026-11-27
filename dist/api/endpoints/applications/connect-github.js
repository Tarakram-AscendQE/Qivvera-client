import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';
/**
 * POST /api/applications/:applicationId/github — connects an existing application to GitHub, or
 * replaces its repositories and token (for example when the token expires). Same fields and checks as
 * registration; nothing is saved unless GitHub confirms access. Author or Policy Authority. The token
 * is stored encrypted and never returned.
 */
export const connectGitHub = defineEndpoint({
    params: idParams('applicationId'),
    async handle({ services: { repository, prAssurance }, params, session, readBody }) {
        const application = await repository.getApplication(params.applicationId);
        if (!application)
            throw new InputError('APPLICATION_NOT_FOUND', 'Application not found.', 404);
        if (application.archived)
            throw new InputError('APPLICATION_ARCHIVED', 'This application is archived. Restore it before changing its GitHub settings.', 409);
        return reply(await prAssurance.connect(params.applicationId, await readBody(), session));
    }
});
