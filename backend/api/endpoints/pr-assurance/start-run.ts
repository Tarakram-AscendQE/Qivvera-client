import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { pullParams } from './params.js';

/**
 * POST /api/pr-assurance/pulls/:pullNumber/runs — `{requestKey}` → starts one run of Qivvera's checks on
 * GitHub Actions for the PR's imported head commit (201). The same request key returns the same run
 * (200) and never starts GitHub again. Author or Policy Authority.
 */
export const startRun = defineEndpoint({
  params: pullParams,
  async handle({ services: { prAssurance }, params, session, readBody }) {
    const result = await prAssurance!.startRun(params.pullNumber, await readBody(), session) as { replayed?: boolean };
    return reply(result, result.replayed ? 200 : 201);
  }
});
