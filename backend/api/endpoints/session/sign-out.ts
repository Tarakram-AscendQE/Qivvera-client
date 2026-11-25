import { reply } from '../../common/respond.js';
import { defineEndpoint } from '../../common/routing.js';

/** DELETE /api/session — ends the session and clears the cookie. */
export const signOut = defineEndpoint({
  async handle({ services: { auth }, req }) {
    return reply({ signedOut: true }, 200, { 'Set-Cookie': await auth.logout(req) });
  }
});
