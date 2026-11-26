import { InputError } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { pullParams, requireApplication } from './params.js';

/**
 * POST /api/pr-assurance/applications/:applicationId/pulls/:pullNumber/import — reads the pull
 * request's metadata from the application's own repository, with the application's own token, and
 * saves it (title, branches, exact head and base commits). Author or Policy Authority. Importing again
 * moves the PR to its current head; earlier runs keep their commit.
 */
export const importPull = defineEndpoint({
  params: pullParams,
  async handle({ services: { repository, prAssurance }, params, session }) {
    if ((await requireApplication(repository, params.applicationId)).archived) throw new InputError('APPLICATION_ARCHIVED', 'This application is archived. Restore it before importing pull requests.', 409);
    return reply(await prAssurance!.importPull(params.applicationId, params.pullNumber, session));
  }
});
