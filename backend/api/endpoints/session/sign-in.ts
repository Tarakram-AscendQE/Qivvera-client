import { fields } from '../../common/errors.js';
import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';
import { publicSession } from '../../common/session.js';

/**
 * POST /api/session — signs in with { email, password }. Sets the HttpOnly session cookie.
 * Wrong credentials and rate limiting share one message, so it never reveals which accounts exist.
 */
export const signIn = defineEndpoint<Record<string, never>, undefined, null>({
  async handle({ services: { auth, repository }, req, requestId, readBody }) {
    const body = await readBody();
    fields(body, ['email', 'password']);
    const result = await auth.login(body['email'], body['password'], req.socket?.remoteAddress);
    if (result.error !== undefined) {
      const message = result.status === 429 ? 'Too many sign-in attempts. Try again in 10 minutes.' : 'Email or password not recognized.';
      return reply({ error: result.error, message, requestId }, result.status);
    }
    return reply(publicSession(result.session, repository.reviewMode), 200, { 'Set-Cookie': result.cookie });
  }
});
