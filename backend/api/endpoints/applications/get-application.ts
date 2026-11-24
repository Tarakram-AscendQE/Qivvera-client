import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { idParams } from '../../common/validate.js';

/** GET /api/applications/:applicationId — one application, or 404 APPLICATION_NOT_FOUND. */
export const getApplication = defineEndpoint({
  params: idParams('applicationId'),
  async handle({ services: { repository }, params }) {
    const application = await repository.getApplication(params.applicationId);
    if (!application) throw new InputError('APPLICATION_NOT_FOUND', 'Application not found.', 404);
    return reply(application);
  }
});
