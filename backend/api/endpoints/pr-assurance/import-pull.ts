import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { pullParams } from './params.js';

/**
 * POST /api/pr-assurance/pulls/:pullNumber/import — reads the pull request's metadata from GitHub and
 * saves it (title, branches, exact head and base commits). Only the demo PRs #6, #7 and #8; Author or
 * Policy Authority. Importing again moves the PR to its current head; earlier runs keep their commit.
 */
export const importPull = defineEndpoint({
  params: pullParams,
  async handle({ services: { prAssurance }, params, session }) {
    return reply(await prAssurance!.importPull(params.pullNumber, session));
  }
});
