import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

const CORE = ['name', 'description', 'repositoryUrl'] as const;

/**
 * POST /api/applications — registers an application (the repository validates the fields).
 *
 * With PR assurance on, registration also connects the application to GitHub: its application, test
 * automation and profiles repositories and its own token are all required. They are checked with
 * GitHub first; then the application and its connection (token encrypted) are saved in one
 * transaction, so a failed check or save leaves nothing behind. The token is never returned.
 */
export const createApplication = defineEndpoint({
  async handle({ services: { repository, prAssurance }, session, readBody }) {
    const body = await readBody();
    if (!prAssurance) return reply(await repository.createApplication(body, session), 201);
    const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    const core = Object.fromEntries(Object.entries(input).filter(([key]) => (CORE as readonly string[]).includes(key)));
    const github = Object.fromEntries(Object.entries(input).filter(([key]) => !(CORE as readonly string[]).includes(key) || key === 'repositoryUrl'));
    const prepared = await prAssurance.prepareConnection(github, session, 'AUTHOR');
    const application = await repository.createApplication(core, session, { within: (client, app) => prepared.save(client, app.id) }) as Record<string, unknown>;
    return reply({ ...application, github: prepared.summary }, 201);
  }
});
